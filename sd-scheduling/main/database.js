const fs = require('fs');
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const {
  PRIORITY_NONE,
  PRIORITY_WAIT,
  PRIORITY_CUSTOM,
  buildCustomPriorityLabel,
} = require('./priority');
const DB_SCHEMA_VERSION = 31;
const AVATAR_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/;
// Keep person badges visually distinct from each other and from the work-card
// category palette. The list is deliberately muted so overlapping initials
// remain readable without competing with project or status colors.
const AVATAR_COLOR_PALETTE = [
  '#586F91', '#8B6678', '#4E8172', '#96764D', '#766D9B', '#A15F5F',
  '#3F8097', '#8A6E4E', '#5B7B59', '#936C96', '#6A7397', '#945C70',
  '#4E7B8A', '#997451', '#637F9B', '#9B6976', '#4F8877', '#7E6E96',
  '#A06E54', '#637D72', '#4D7192', '#81657D', '#668256', '#956C5D',
  '#4B8490', '#8C7559', '#706E92', '#9A6178', '#59816D', '#7D7892',
  '#557990', '#8D6370', '#597E62', '#92715A', '#6B6E8A', '#9A665C',
];

function normalizeSharedTaskTitle(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s*[|\u2013\u2014]\s*/g, '|');
}

function normalizeAvatarColor(value, fallback = '#5856A6') {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !AVATAR_COLOR_PATTERN.test(value)) {
    throw new Error('Avatar color must be a #RRGGBB or #RRGGBBAA value.');
  }
  return value.toUpperCase();
}

function getNextAvailableAvatarColor(usedColors) {
  const available = AVATAR_COLOR_PALETTE.find((color) => !usedColors.has(color));
  if (available) return available;

  // Offices normally have far fewer people than the curated palette. Keep a
  // deterministic fallback for unusually large offices without reusing a hue.
  for (let index = 0; index < 360; index += 1) {
    const hue = (index * 137.508) % 360;
    const color = hslToHex(hue, 32, 43);
    if (!usedColors.has(color)) return color;
  }
  return '#5856A6';
}

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs((2 * l) - 1)) * s;
  const segment = hue / 60;
  const match = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] = segment < 1 ? [chroma, match, 0]
    : segment < 2 ? [match, chroma, 0]
      : segment < 3 ? [0, chroma, match]
        : segment < 4 ? [0, match, chroma]
          : segment < 5 ? [match, 0, chroma]
            : [chroma, 0, match];
  const offset = l - (chroma / 2);
  return `#${[red, green, blue].map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

class Database {
  constructor(dbPath, logger = null) {
    this.dbPath = dbPath;
    this.db = null;
    this.logger = logger;
  }

  initialize() {
    this.db = new BetterSqlite3(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this._migrate();
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  runInTransaction(operation) {
    if (!this.db) throw new Error('Database is not open.');
    return this.db.transaction(operation)();
  }

  async backupTo(filePath) {
    if (!this.db) throw new Error('Database is not open.');
    return this.db.backup(filePath);
  }

  optimizeStorage(options = {}) {
    if (!this.db) return;

    try {
      this.db.pragma('optimize');
    } catch (_) {}

    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (_) {}

    if (options.vacuum) {
      try {
        this.db.exec('VACUUM');
      } catch (_) {}
    }
  }

  exportSharedSnapshot() {
    if (!this.db) throw new Error('Database is not open.');

    const tables = [
      'business_roles', 'custom_priorities', 'users', 'projects', 'tasks',
      'work_cards', 'work_card_assignees', 'work_card_focus', 'sub_tasks',
      'comments', 'staff_pto', 'staff_pto_dates', 'project_notes',
      'task_activity', 'task_tombstones', 'applied_rollover_publications',
    ];

    const exported = {};
    for (const table of tables) {
      try {
        exported[table] = this.db.prepare(`SELECT * FROM ${table}`).all();
      } catch (_) {
        // A newly introduced table may not exist in an older peer yet.
      }
    }

    return exported;
  }

  importSharedSnapshot(snapshot) {
    if (!this.db) throw new Error('Database is not open.');
    const tables = snapshot?.tables;
    const requiredTables = ['users', 'projects', 'tasks'];
    if (
      snapshot?.schemaVersion !== 1
      || snapshot?.source !== 'scheduling'
      || !Number.isFinite(Date.parse(snapshot?.generatedAt || ''))
      || !tables
      || typeof tables !== 'object'
      || Array.isArray(tables)
      || requiredTables.some((table) => !Array.isArray(tables[table]))
    ) {
      throw new Error('The shared recovery snapshot is invalid.');
    }

    const importOrder = [
      'business_roles', 'custom_priorities', 'users', 'projects', 'tasks',
      'work_cards', 'work_card_assignees', 'work_card_focus', 'sub_tasks',
      'comments', 'staff_pto', 'staff_pto_dates', 'project_notes',
      'task_activity', 'task_tombstones', 'applied_rollover_publications',
    ];

    const tableColumns = new Map();
    for (const table of importOrder) {
      try {
        tableColumns.set(table, this.db.pragma(`table_info(${table})`).map((column) => column.name));
      } catch (_) {}
    }

    const imported = this.db.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM users LIMIT 1').get()) return 0;

      let rowCount = 0;
      for (const table of importOrder) {
        const columns = tableColumns.get(table);
        const rows = Array.isArray(tables[table]) ? tables[table] : [];
        if (!columns?.length || rows.length === 0) continue;

        // Only columns the snapshot row carries are written, so a column the
        // snapshot's schema lacks keeps its SQLite default instead of being
        // forced to NULL (which would violate NOT NULL and abort the import).
        const insertCache = new Map();
        for (const row of rows) {
          const rowColumns = columns.filter((column) => Object.hasOwn(row, column));
          if (rowColumns.length === 0) continue;
          const key = rowColumns.join(',');
          if (!insertCache.has(key)) {
            insertCache.set(key, this.db.prepare(
              `INSERT OR REPLACE INTO ${table} (${rowColumns.join(', ')}) VALUES (${rowColumns.map(() => '?').join(', ')})`,
            ));
          }
          insertCache.get(key).run(...rowColumns.map((column) => row[column] ?? null));
          rowCount += 1;
        }
      }
      return rowCount;
    })();

    if (imported) this._ensureDistinctAvatarColors();
    return imported;
  }

  _createMigrationBackup(label) {
    if (!this.dbPath || !this.db || !fs.existsSync(this.dbPath)) return null;

    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (_) {}

    const dir = path.dirname(this.dbPath);
    const base = path.basename(this.dbPath, path.extname(this.dbPath));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(dir, `${base}.${label}.${stamp}.bak`);
    fs.copyFileSync(this.dbPath, backupPath);
    return backupPath;
  }

  _rebuildUsersTableForVersion8() {
    const backupPath = this._createMigrationBackup('pre-v8-users-rebuild');
    if (backupPath) {
      this.logger?.info('Database backup created before v8 migration', { backupPath });
    }

    this.db.pragma('foreign_keys = OFF');
    try {
      this.db.exec(`
        CREATE TABLE users_new (
          id                TEXT PRIMARY KEY,
          username          TEXT UNIQUE NOT NULL,
          display_name      TEXT NOT NULL,
          role              TEXT NOT NULL CHECK(role IN ('partner', 'staff', 'bootstrap')),
          avatar_color      TEXT NOT NULL DEFAULT '#5856A6',
          sort_order        INTEGER NOT NULL DEFAULT 0,
          active            INTEGER NOT NULL DEFAULT 1,
          created_at        TEXT NOT NULL DEFAULT (datetime('now')),
          first_name        TEXT NOT NULL DEFAULT '',
          last_name         TEXT NOT NULL DEFAULT '',
          business_role_id  TEXT REFERENCES business_roles(id) ON DELETE SET NULL,
          is_admin          INTEGER NOT NULL DEFAULT 0,
          windows_username  TEXT
        );

        INSERT INTO users_new (
          id, username, display_name, role, avatar_color, sort_order, active, created_at,
          first_name, last_name, business_role_id, is_admin, windows_username
        )
        SELECT
          id, username, display_name, role, avatar_color, sort_order, active, created_at,
          COALESCE(first_name, ''), COALESCE(last_name, ''), business_role_id,
          COALESCE(is_admin, 0), windows_username
        FROM users;

        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;

        CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
        CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
        CREATE INDEX IF NOT EXISTS idx_subtasks_task ON sub_tasks(task_id);
        CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
        CREATE INDEX IF NOT EXISTS idx_pto_user_week ON staff_pto(user_id, week_of);
        CREATE INDEX IF NOT EXISTS idx_pto_dates_user ON staff_pto_dates(user_id);
      `);
    } finally {
      this.db.pragma('foreign_keys = ON');
    }
  }

  _runMigrationIfNeeded(currentVersion, targetVersion, handler, options = {}) {
    if (currentVersion >= targetVersion) return;
    const { transactional = true } = options;
    if (transactional) {
      this.db.transaction(() => handler.call(this))();
    } else {
      handler.call(this);
    }
    this._setMeta('schema_version', String(targetVersion));
  }

  _getTableColumns(tableName) {
    return this.db.pragma(`table_info(${tableName})`).map((column) => column.name);
  }

  _addColumnIfMissing(tableName, columnName, columnDefinition) {
    if (this._getTableColumns(tableName).includes(columnName)) return false;
    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    return true;
  }

  // ── Schema Migrations ──────────────────────────────────

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    const version = this._getMetaInt('schema_version', 0);

    this._runMigrationIfNeeded(version, 1, function migrateV1() {
      this.db.exec(`
        CREATE TABLE users (
          id            TEXT PRIMARY KEY,
          username      TEXT UNIQUE NOT NULL,
          display_name  TEXT NOT NULL,
          role          TEXT NOT NULL CHECK(role IN ('partner', 'staff', 'bootstrap')),
          avatar_color  TEXT NOT NULL DEFAULT '#5856A6',
          sort_order    INTEGER NOT NULL DEFAULT 0,
          active        INTEGER NOT NULL DEFAULT 1,
          created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE projects (
          id            TEXT PRIMARY KEY,
          client        TEXT NOT NULL DEFAULT '',
          name          TEXT NOT NULL DEFAULT '',
          status        TEXT NOT NULL DEFAULT 'active',
          notes         TEXT NOT NULL DEFAULT '',
          partner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
          partner_ids   TEXT NOT NULL DEFAULT '[]',
          partner_initials TEXT NOT NULL DEFAULT '',
          project_lead_ids TEXT DEFAULT '[]',
          sort_order    INTEGER NOT NULL DEFAULT 0,
          created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE tasks (
          id            TEXT PRIMARY KEY,
          project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
          assigned_to   TEXT REFERENCES users(id) ON DELETE SET NULL,
          lead_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
          title         TEXT NOT NULL DEFAULT '',
          notes         TEXT NOT NULL DEFAULT '',
          priority      INTEGER NOT NULL DEFAULT 0,
          due_date      TEXT,
          completed     INTEGER NOT NULL DEFAULT 0,
          sort_order    INTEGER NOT NULL DEFAULT 0,
          created_at    TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE sub_tasks (
          id            TEXT PRIMARY KEY,
          task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          title         TEXT NOT NULL DEFAULT '',
          notes         TEXT NOT NULL DEFAULT '',
          due_date      TEXT,
          completed     INTEGER NOT NULL DEFAULT 0,
          assigned_to   TEXT REFERENCES users(id) ON DELETE SET NULL,
          assigned_to_ids TEXT NOT NULL DEFAULT '[]',
          created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
          sort_order    INTEGER NOT NULL DEFAULT 0,
          created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE comments (
          id            TEXT PRIMARY KEY,
          task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          author_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body          TEXT NOT NULL DEFAULT '',
          created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE staff_pto (
          id            TEXT PRIMARY KEY,
          user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          week_of       TEXT NOT NULL,
          label         TEXT NOT NULL DEFAULT '',
          UNIQUE(user_id, week_of)
        );

        CREATE TABLE sync_meta (
          key   TEXT PRIMARY KEY,
          value TEXT
        );

        CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
        CREATE INDEX idx_tasks_project ON tasks(project_id);
        CREATE INDEX idx_subtasks_task ON sub_tasks(task_id);
        CREATE INDEX idx_comments_task ON comments(task_id);
        CREATE INDEX idx_pto_user_week ON staff_pto(user_id, week_of);
      `);
    });

    this._runMigrationIfNeeded(version, 2, function migrateV2() {
      // Add business roles table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS business_roles (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          sort_order  INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS custom_priorities (
          id          TEXT PRIMARY KEY,
          label       TEXT NOT NULL,
          color       TEXT NOT NULL DEFAULT '#888888',
          sort_order  INTEGER NOT NULL DEFAULT 0
        );
      `);

      // Add new columns to users table
      this._addColumnIfMissing('users', 'first_name', `TEXT NOT NULL DEFAULT ''`);
      this._addColumnIfMissing('users', 'last_name', `TEXT NOT NULL DEFAULT ''`);
      this._addColumnIfMissing('users', 'business_role_id', `TEXT REFERENCES business_roles(id) ON DELETE SET NULL`);
      this._addColumnIfMissing('users', 'is_admin', `INTEGER NOT NULL DEFAULT 0`);
      if (this._addColumnIfMissing('users', 'windows_username', 'TEXT')) {
        // Copy existing username to windows_username for existing users
        this.db.exec(`UPDATE users SET windows_username = username WHERE windows_username IS NULL`);
      }

      // Migrate existing users: split display_name into first/last, set partners as admin
      const users = this.db.prepare('SELECT id, display_name, role FROM users').all();
      const updateStmt = this.db.prepare('UPDATE users SET first_name = ?, last_name = ?, is_admin = ? WHERE id = ?');
      for (const u of users) {
        const parts = u.display_name.trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        const isAdmin = u.role === 'partner' ? 1 : 0;
        updateStmt.run(firstName, lastName, isAdmin, u.id);
      }

      // Also regenerate usernames from first_name/last_name
      const users2 = this.db.prepare('SELECT id, first_name, last_name FROM users').all();
      const updateUsername = this.db.prepare('UPDATE users SET username = ? WHERE id = ?');
      for (const u of users2) {
        if (u.first_name && u.last_name) {
          const generated = (u.first_name[0] + u.last_name).toLowerCase().replace(/\s+/g, '');
          updateUsername.run(generated, u.id);
        }
      }
    });

    this._runMigrationIfNeeded(version, 3, function migrateV3() {
      // Add confirmed flag and partner_id to tasks for weekly rollover and partner assignment
      this._addColumnIfMissing('tasks', 'confirmed', `INTEGER NOT NULL DEFAULT 1`);
      this._addColumnIfMissing('tasks', 'partner_id', `TEXT REFERENCES users(id) ON DELETE SET NULL`);
    });

    this._runMigrationIfNeeded(version, 4, function migrateV4() {
      // Add priority_label column for custom priority display text (e.g. "cp:OG")
      this._addColumnIfMissing('tasks', 'priority_label', 'TEXT');

      // Add category column to projects: 'current' or 'future' (which tab it appears in)
      if (this._addColumnIfMissing('projects', 'category', `TEXT NOT NULL DEFAULT 'current'`)) {
        // Migrate existing "future" status projects: set category=future, status=active
        this.db.exec(`UPDATE projects SET category = 'future', status = 'active' WHERE status = 'future'`);
      }
    });

    this._runMigrationIfNeeded(version, 5, function migrateV5() {
      // New date-based PTO system: individual date rows per user
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS staff_pto_dates (
          id        TEXT PRIMARY KEY,
          user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          pto_date  TEXT NOT NULL,
          UNIQUE(user_id, pto_date)
        );
        CREATE INDEX IF NOT EXISTS idx_pto_dates_user ON staff_pto_dates(user_id);
      `);

      // Migrate old staff_pto labels into dates where possible (best-effort)
      // Old data is free-text so we just drop it — dates weren't stored before
    });

    this._runMigrationIfNeeded(version, 6, function migrateV6() {
      // Partner-authored project notes (separate from Excel-imported project.notes)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS project_notes (
          id          TEXT PRIMARY KEY,
          project_id  TEXT NOT NULL,
          notes       TEXT NOT NULL DEFAULT '',
          updated_by  TEXT,
          updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_project_notes_project ON project_notes(project_id);
      `);
    });

    this._runMigrationIfNeeded(version, 7, function migrateV7() {
      // Add category column to tasks: 'current' or 'last_week'
      this._addColumnIfMissing('tasks', 'category', `TEXT NOT NULL DEFAULT 'current'`);
    });

    this._runMigrationIfNeeded(version, 8, function migrateV8() {
      this._rebuildUsersTableForVersion8();
    }, { transactional: false });

    this._runMigrationIfNeeded(version, 9, function migrateV9() {
      this._addColumnIfMissing('projects', 'partner_ids', `TEXT NOT NULL DEFAULT '[]'`);
      this._addColumnIfMissing('projects', 'partner_initials', `TEXT NOT NULL DEFAULT ''`);
    });

    this._runMigrationIfNeeded(version, 10, function migrateV10() {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sync_processed_events (
          filename     TEXT PRIMARY KEY,
          processed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    });

    this._runMigrationIfNeeded(version, 11, function migrateV11() {
      this._addColumnIfMissing('users', 'can_self_assign', `INTEGER NOT NULL DEFAULT 0`);
    });

    this._runMigrationIfNeeded(version, 12, function migrateV12() {
      this._addColumnIfMissing('projects', 'folder_link', `TEXT NOT NULL DEFAULT ''`);

      if (this._addColumnIfMissing('tasks', 'status', `TEXT NOT NULL DEFAULT 'not_started'`)) {
        this.db.exec(`UPDATE tasks SET status = CASE WHEN completed = 1 THEN 'complete' ELSE 'not_started' END WHERE status IS NULL OR TRIM(status) = ''`);
      }
    });

    this._runMigrationIfNeeded(version, 13, function migrateV13() {
      this._addColumnIfMissing('project_notes', 'title', `TEXT NOT NULL DEFAULT 'General'`);
      this._addColumnIfMissing('project_notes', 'created_by', 'TEXT');
      this._addColumnIfMissing('project_notes', 'created_at', `TEXT NOT NULL DEFAULT (datetime('now'))`);

      this.db.exec(`
        UPDATE project_notes
        SET
          title = CASE
            WHEN title IS NULL OR TRIM(title) = '' THEN 'General'
            ELSE title
          END,
          created_by = COALESCE(created_by, updated_by),
          created_at = CASE
            WHEN created_at IS NULL OR TRIM(created_at) = '' THEN COALESCE(updated_at, datetime('now'))
            ELSE created_at
          END
      `);

      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_project_notes_project_updated ON project_notes(project_id, updated_at DESC)`);
    });

    this._runMigrationIfNeeded(version, 14, function migrateV14() {
      // A rollover publication may be delivered more than once by the shared
      // folder.  Keep the publication ID durably so application is idempotent.
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS applied_rollover_publications (
          publication_id TEXT PRIMARY KEY,
          applied_at     TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    });

    this._runMigrationIfNeeded(version, 15, function migrateV15() {
      const users = this.db.prepare('SELECT id, avatar_color FROM users').all();
      const resetColor = this.db.prepare("UPDATE users SET avatar_color = '#5856A6' WHERE id = ?");
      for (const user of users) {
        if (!AVATAR_COLOR_PATTERN.test(String(user.avatar_color || ''))) resetColor.run(user.id);
      }
    });

    this._runMigrationIfNeeded(version, 16, function migrateV16() {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS task_activity (
          id         TEXT PRIMARY KEY,
          task_id    TEXT NOT NULL,
          action     TEXT NOT NULL,
          actor_id   TEXT,
          details    TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_task_activity_task_created ON task_activity(task_id, created_at DESC);
      `);
    });

    this._runMigrationIfNeeded(version, 17, function migrateV17() {
      this._addColumnIfMissing('task_activity', 'project_id', 'TEXT');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_task_activity_project_created ON task_activity(project_id, created_at DESC)');
    });

    this._runMigrationIfNeeded(version, 18, function migrateV18() {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sync_outbox (
          event_id     TEXT PRIMARY KEY,
          event_json   TEXT NOT NULL,
          status       TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'published')),
          attempts     INTEGER NOT NULL DEFAULT 0,
          last_error   TEXT,
          created_at   TEXT NOT NULL DEFAULT (datetime('now')),
          published_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_created ON sync_outbox(status, created_at);
      `);
    });

    this._runMigrationIfNeeded(version, 19, function migrateV19() {
      if (this._addColumnIfMissing('sub_tasks', 'assigned_to_ids', "TEXT NOT NULL DEFAULT '[]'")) {
        this.db.exec(`
          UPDATE sub_tasks
          SET assigned_to_ids = CASE
            WHEN assigned_to IS NULL OR TRIM(assigned_to) = '' THEN '[]'
            ELSE json_array(assigned_to)
          END
        `);
      }
      this._addColumnIfMissing('sub_tasks', 'notes', "TEXT NOT NULL DEFAULT ''");
      this._addColumnIfMissing('sub_tasks', 'due_date', 'TEXT');
    });

    this._runMigrationIfNeeded(version, 20, function migrateV20() {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS task_tombstones (
          task_id    TEXT PRIMARY KEY,
          deleted_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    });

    this._runMigrationIfNeeded(version, 21, function migrateV21() {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS work_cards (
          id              TEXT PRIMARY KEY,
          project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          week_of         TEXT NOT NULL,
          title           TEXT NOT NULL DEFAULT '',
          description     TEXT NOT NULL DEFAULT '',
          planned_minutes INTEGER,
          start_date      TEXT,
          end_date        TEXT,
          completed       INTEGER NOT NULL DEFAULT 0,
          sort_order      INTEGER NOT NULL DEFAULT 0,
          created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
          updated_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS work_card_assignees (
          work_card_id TEXT NOT NULL REFERENCES work_cards(id) ON DELETE CASCADE,
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          PRIMARY KEY (work_card_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS work_card_focus (
          user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          work_card_id TEXT NOT NULL REFERENCES work_cards(id) ON DELETE CASCADE,
          updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_work_cards_project_week ON work_cards(project_id, week_of, sort_order);
        CREATE INDEX IF NOT EXISTS idx_work_card_assignees_user ON work_card_assignees(user_id, work_card_id);
      `);
    });

    this._runMigrationIfNeeded(version, 22, function migrateV22() {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS work_card_categories (
          id         TEXT PRIMARY KEY,
          label      TEXT NOT NULL,
          color      TEXT NOT NULL DEFAULT '#5964A8',
          sort_order INTEGER NOT NULL DEFAULT 0
        );
      `);
      this._addColumnIfMissing('work_cards', 'category_id', 'TEXT REFERENCES work_card_categories(id) ON DELETE SET NULL');
    });

    this._runMigrationIfNeeded(version, 23, function migrateV23() {
      this._addColumnIfMissing('work_cards', 'status', "TEXT NOT NULL DEFAULT 'todo'");
      this._addColumnIfMissing('work_cards', 'paused', 'INTEGER NOT NULL DEFAULT 0');
      this._addColumnIfMissing('work_cards', 'paused_at', 'TEXT');
      this._addColumnIfMissing('work_cards', 'logged_hours', 'REAL NOT NULL DEFAULT 0');
      this._addColumnIfMissing('work_card_categories', 'show_on_team_calendar', 'INTEGER NOT NULL DEFAULT 1');
      this._seedWorkCardCategories();
      this.db.prepare("UPDATE work_cards SET status = CASE WHEN completed = 1 THEN 'done' ELSE 'todo' END WHERE status IS NULL OR status NOT IN ('todo', 'in_progress', 'done')").run();
      this.db.prepare("UPDATE work_cards SET category_id = 'work-card-planning'").run();
    });

    this._runMigrationIfNeeded(version, 24, function migrateV24() {
      this._addColumnIfMissing('users', 'is_senior_staff', 'INTEGER NOT NULL DEFAULT 0');
      // Preserve the prior project-lead convention while making the
      // designation explicit and editable from staff management.
      this.db.exec("UPDATE users SET is_senior_staff = 1 WHERE role = 'staff' AND COALESCE(is_admin, 0) = 1");
    });

    this._runMigrationIfNeeded(version, 27, function migrateV27() {
      this._ensureDistinctAvatarColors();
    });

    this._runMigrationIfNeeded(version, 28, function migrateV28() {
      this._addColumnIfMissing('work_card_categories', 'show_on_team_calendar', 'INTEGER NOT NULL DEFAULT 1');
    });

    this._runMigrationIfNeeded(version, 29, function migrateV29() {
      this._addColumnIfMissing('work_cards', 'lead_id', 'TEXT REFERENCES users(id) ON DELETE SET NULL');
    });

    this._runMigrationIfNeeded(version, 30, function migrateV30() {
      this._addColumnIfMissing('projects', 'project_lead_ids', "TEXT DEFAULT '[]'");
    });

    this._runMigrationIfNeeded(version, 31, function migrateV31() {
      // Leads belong to scheduled assignments (the legacy Dashboard task),
      // rather than to the project-wide partner record.
      this._addColumnIfMissing('tasks', 'lead_id', 'TEXT REFERENCES users(id) ON DELETE SET NULL');
    });
  }

  _getDistinctAvatarColor(candidate, excludedUserId = null) {
    const query = excludedUserId
      ? this.db.prepare('SELECT avatar_color FROM users WHERE id != ?')
      : this.db.prepare('SELECT avatar_color FROM users');
    const rows = excludedUserId ? query.all(excludedUserId) : query.all();
    const usedColors = new Set(rows
      .map((user) => String(user.avatar_color || '').toUpperCase())
      .filter((color) => AVATAR_COLOR_PATTERN.test(color)));
    const normalized = AVATAR_COLOR_PATTERN.test(String(candidate || ''))
      ? String(candidate).toUpperCase()
      : null;
    return normalized && !usedColors.has(normalized)
      ? normalized
      : getNextAvailableAvatarColor(usedColors);
  }

  // A colour published by another Dashboard is stored as received so every app
  // shows the same badge; only a colour created on this machine is made
  // distinct from the people already known here.
  _resolveAvatarColor(candidate, excludedUserId = null) {
    if (this._replayingSyncEvent && AVATAR_COLOR_PATTERN.test(String(candidate || ''))) {
      return String(candidate).toUpperCase();
    }
    return this._getDistinctAvatarColor(candidate, excludedUserId);
  }

  _ensureDistinctAvatarColors() {
    const users = this.db.prepare(`
      SELECT id, avatar_color
      FROM users
      ORDER BY CASE WHEN active = 1 THEN 0 ELSE 1 END, sort_order, display_name COLLATE NOCASE, id
    `).all();
    const usedColors = new Set();
    const updateColor = this.db.prepare('UPDATE users SET avatar_color = ? WHERE id = ?');

    for (const user of users) {
      const current = String(user.avatar_color || '').toUpperCase();
      if (AVATAR_COLOR_PATTERN.test(current) && !usedColors.has(current)) {
        usedColors.add(current);
        continue;
      }
      const replacement = getNextAvailableAvatarColor(usedColors);
      updateColor.run(replacement, user.id);
      usedColors.add(replacement);
    }
  }

  _getMetaInt(key, defaultVal) {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? parseInt(row.value, 10) : defaultVal;
  }

  _setMeta(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, String(value));
  }

  _getCurrentTimestamp() {
    return new Date().toISOString();
  }

  _timestampMillis(value) {
    if (!value) return 0;
    const text = String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`;
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  _compareTimestamps(left, right) {
    return this._timestampMillis(left) - this._timestampMillis(right);
  }

  // Stamp a local task edit so it always sorts after the version it replaces,
  // even when this PC's clock is behind the machine that wrote that version.
  // Receivers keep the newest updated_at, so a plain clock reading would let an
  // older-stamped later edit be silently discarded.
  _getNextTaskTimestamp(taskId) {
    const previous = this.db.prepare('SELECT updated_at FROM tasks WHERE id = ?').get(taskId)?.updated_at;
    return new Date(Math.max(Date.now(), this._timestampMillis(previous) + 1)).toISOString();
  }

  // Work Cards follow the same newest-update-wins rule as assigned projects.
  _getNextWorkCardTimestamp(cardId) {
    const previous = this.db.prepare('SELECT updated_at FROM work_cards WHERE id = ?').get(cardId)?.updated_at;
    return new Date(Math.max(Date.now(), this._timestampMillis(previous) + 1)).toISOString();
  }

  _normalizeAssignedUserIds(value, fallback = null) {
    const raw = Array.isArray(value)
      ? value
      : (() => {
          if (typeof value !== 'string' || !value.trim()) return [];
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch (_) {
            return [];
          }
        })();
    const uniqueIds = [...new Set(raw
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean))];
    if (!uniqueIds.length && fallback && typeof fallback === 'string' && fallback.trim()) {
      uniqueIds.push(fallback.trim());
    }
    return uniqueIds;
  }

  _normalizeSubTaskPayload(data = {}) {
    const assignedToIds = this._normalizeAssignedUserIds(data.assigned_to_ids, data.assigned_to || null);
    return {
      ...data,
      assigned_to: assignedToIds[0] || null,
      assigned_to_ids: JSON.stringify(assignedToIds),
    };
  }

  _normalizeProjectNotePayload(data = {}) {
    const now = this._getCurrentTimestamp();
    return {
      id: data.id || uuidv4(),
      project_id: data.project_id,
      title: String(data.title || '').trim() || 'Untitled Note',
      notes: data.notes || '',
      created_by: data.created_by || data.updated_by || null,
      updated_by: data.updated_by || data.created_by || null,
      created_at: String(data.created_at || now).trim() || now,
      updated_at: String(data.updated_at || data.created_at || now).trim() || now,
    };
  }

  _getLegacyProjectNote(projectId) {
    return this.db.prepare(`
      SELECT *
      FROM project_notes
      WHERE project_id = ?
      ORDER BY
        CASE WHEN lower(COALESCE(title, '')) = 'general' THEN 0 ELSE 1 END,
        datetime(updated_at) DESC,
        datetime(created_at) DESC
      LIMIT 1
    `).get(projectId) || null;
  }

  // ── Sync Meta ──────────────────────────────────────────

  getLastSyncTimestamp() {
    const row = this.db.prepare("SELECT value FROM sync_meta WHERE key = 'last_sync'").get();
    return row ? row.value : '';
  }

  setLastSyncTimestamp(ts) {
    this.db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync', ?)").run(ts);
  }

  getProcessedSyncFiles() {
    return this.db.prepare('SELECT filename FROM sync_processed_events').all().map((row) => row.filename);
  }

  markSyncFileProcessed(filename) {
    this.db.prepare(`
      INSERT OR REPLACE INTO sync_processed_events (filename, processed_at)
      VALUES (?, datetime('now'))
    `).run(filename);
  }

  applyEventAndMarkProcessed(event, filename) {
    if (!filename) throw new Error('A sync event filename is required.');
    return this.runInTransaction(() => {
      this.applyEvent(event);
      this.markSyncFileProcessed(filename);
      this.setLastSyncTimestamp(filename);
    });
  }

  cleanupProcessedSyncFiles(cutoffStr) {
    this.db.prepare('DELETE FROM sync_processed_events WHERE filename < ?').run(cutoffStr);
  }

  queueSyncEvent(event) {
    if (!event?.eventId) throw new Error('Sync event must have an eventId.');
    this.db.prepare(`
      INSERT OR IGNORE INTO sync_outbox (event_id, event_json, status, created_at)
      VALUES (?, ?, 'queued', ?)
    `).run(event.eventId, JSON.stringify(event), event.timestamp || this._getCurrentTimestamp());
  }

  getQueuedSyncEvents(limit = 100) {
    return this.db.prepare(`
      SELECT event_id, event_json, attempts, last_error, created_at
      FROM sync_outbox WHERE status = 'queued'
      ORDER BY julianday(created_at), rowid LIMIT ?
    `).all(Math.max(1, Math.min(Number(limit) || 100, 500))).map((row) => ({
      ...row,
      event: JSON.parse(row.event_json),
    }));
  }

  markSyncEventPublished(eventId) {
    this.db.prepare(`UPDATE sync_outbox SET status = 'published', published_at = datetime('now'), last_error = NULL WHERE event_id = ?`).run(eventId);
  }

  recordSyncEventFailure(eventId, error) {
    this.db.prepare(`UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE event_id = ?`).run(String(error || 'Unknown sync write error'), eventId);
  }

  getSyncOutboxSummary() {
    return this.db.prepare(`
      SELECT COUNT(*) AS pending, COALESCE(SUM(attempts), 0) AS attempts,
        MAX(last_error) AS lastError, MIN(created_at) AS oldestQueuedAt
      FROM sync_outbox WHERE status = 'queued'
    `).get();
  }

  _globalSettingKey(key) {
    return `setting:${key}`;
  }

  getGlobalSetting(key) {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(this._globalSettingKey(key));
    return row ? row.value : null;
  }

  setGlobalSetting(key, value) {
    const storageKey = this._globalSettingKey(key);
    if (value === null || value === undefined || value === '') {
      this.db.prepare('DELETE FROM meta WHERE key = ?').run(storageKey);
      return null;
    }

    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(storageKey, String(value));
    return String(value);
  }

  getUpdateFolderPath() {
    return this.getGlobalSetting('update_folder_path');
  }

  setUpdateFolderPath(folderPath) {
    return this.setGlobalSetting('update_folder_path', folderPath);
  }

  getPriorityCarryoverTokens() {
    const rawValue = this.getGlobalSetting('priority_carryover_tokens');
    if (!rawValue) return null;

    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed)
        ? parsed.filter((item) => typeof item === 'string' && item.trim())
        : [];
    } catch (_) {
      return [];
    }
  }

  _getCustomPriorityCarryoverLabels(tokenSet) {
    if (!tokenSet) return null;

    const labels = new Set();
    const priorities = this.getCustomPriorities();
    for (const priority of priorities) {
      if (tokenSet.has(`custom:${priority.id}`)) {
        labels.add(buildCustomPriorityLabel(priority.label));
      }
    }
    return labels;
  }

  _shouldCarryTaskPriority(task, tokenSet, customPriorityLabels) {
    if (!task) return false;
    const priority = Number(task.priority);

    if (!tokenSet) {
      return priority === PRIORITY_CUSTOM;
    }

    if (priority >= 1) return tokenSet.has('numbered');
    if (priority === PRIORITY_WAIT) return tokenSet.has('wait');
    if (priority === PRIORITY_CUSTOM) {
      return customPriorityLabels?.has(task.priority_label) || false;
    }
    return false;
  }

  // ── Business Roles ────────────────────────────────────

  getBusinessRoles() {
    return this.db.prepare('SELECT * FROM business_roles ORDER BY sort_order, name').all();
  }

  getBusinessRoleById(id) {
    return this.db.prepare('SELECT * FROM business_roles WHERE id = ?').get(id);
  }

  createBusinessRole(data) {
    const id = data.id || uuidv4();
    const maxOrder = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM business_roles').get().m;
    this.db.prepare('INSERT INTO business_roles (id, name, sort_order) VALUES (?, ?, ?)')
      .run(id, data.name, data.sort_order ?? maxOrder + 1);
    return this.getBusinessRoleById(id);
  }

  updateBusinessRole(data) {
    const fields = [];
    const values = [];
    for (const key of ['name', 'sort_order']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) return this.getBusinessRoleById(data.id);
    values.push(data.id);
    this.db.prepare(`UPDATE business_roles SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getBusinessRoleById(data.id);
  }

  deleteBusinessRole(id) {
    // Clear references from users
    this.db.prepare('UPDATE users SET business_role_id = NULL WHERE business_role_id = ?').run(id);
    this.db.prepare('DELETE FROM business_roles WHERE id = ?').run(id);
  }

  reorderBusinessRoles(orders) {
    const stmt = this.db.prepare('UPDATE business_roles SET sort_order = ? WHERE id = ?');
    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.sort_order, item.id);
      }
    });
    transaction(orders);
  }

  // ── Custom Priorities ────────────────────────────────

  getCustomPriorities() {
    return this.db.prepare('SELECT * FROM custom_priorities ORDER BY sort_order').all();
  }

  getCustomPriorityById(id) {
    return this.db.prepare('SELECT * FROM custom_priorities WHERE id = ?').get(id);
  }

  createCustomPriority(data) {
    const id = data.id || uuidv4();
    const maxOrder = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM custom_priorities').get().m;
    this.db.prepare('INSERT INTO custom_priorities (id, label, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(id, data.label, data.color || '#888888', data.sort_order ?? maxOrder + 1);
    return this.getCustomPriorityById(id);
  }

  updateCustomPriority(data) {
    const existing = this.getCustomPriorityById(data.id);
    if (!existing) return null;

    const fields = [];
    const values = [];
    for (const key of ['label', 'color', 'sort_order']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) return existing;

    const nextLabel = data.label !== undefined ? data.label : existing.label;
    const transaction = this.db.transaction(() => {
      values.push(data.id);
      this.db.prepare(`UPDATE custom_priorities SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      if (nextLabel && existing.label && nextLabel !== existing.label) {
        this.db.prepare(`
          UPDATE tasks
          SET priority_label = ?
          WHERE priority = ? AND priority_label = ?
        `).run(buildCustomPriorityLabel(nextLabel), PRIORITY_CUSTOM, buildCustomPriorityLabel(existing.label));
      }
    });

    transaction();
    return this.getCustomPriorityById(data.id);
  }

  deleteCustomPriority(id) {
    const existing = this.getCustomPriorityById(id);
    if (!existing) return;

    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE tasks
        SET priority = ?,
            priority_label = NULL,
            updated_at = datetime('now')
        WHERE priority = ? AND priority_label = ?
      `).run(PRIORITY_NONE, PRIORITY_CUSTOM, buildCustomPriorityLabel(existing.label));

      this.db.prepare('DELETE FROM custom_priorities WHERE id = ?').run(id);
    });

    transaction();
  }

  reorderCustomPriorities(orders) {
    const stmt = this.db.prepare('UPDATE custom_priorities SET sort_order = ? WHERE id = ?');
    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.sort_order, item.id);
      }
    });
    transaction(orders);
  }

  // ── Users ──────────────────────────────────────────────

  getUsers() {
    return this.db.prepare(`
      SELECT * FROM users
      WHERE role != 'bootstrap'
        AND (
          active = 1
          OR EXISTS (
            SELECT 1
            FROM tasks
            WHERE tasks.assigned_to = users.id
               OR tasks.partner_id = users.id
          )
        )
      ORDER BY sort_order, display_name
    `).all();
  }

  getAllUsers() {
    return this.db.prepare('SELECT * FROM users ORDER BY sort_order, display_name').all();
  }

  getUserByUsername(username) {
    // First try windows_username (used for auth), then fall back to username
    return this.db.prepare('SELECT * FROM users WHERE active = 1 AND windows_username = ? COLLATE NOCASE').get(username)
      || this.db.prepare('SELECT * FROM users WHERE active = 1 AND username = ? COLLATE NOCASE').get(username);
  }

  getUserById(id) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  createUser(data) {
    const id = data.id || uuidv4();
    const color = this._resolveAvatarColor(data.avatar_color);
    const maxOrder = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM users').get().m;

    const firstName = data.first_name || '';
    const lastName = data.last_name || '';
    const displayName = data.display_name || `${firstName} ${lastName}`.trim();
    const username = data.username || (firstName && lastName
      ? (firstName[0] + lastName).toLowerCase().replace(/\s+/g, '')
      : displayName.toLowerCase().replace(/\s+/g, ''));
    const isAdmin = data.is_admin ?? (data.role === 'partner' ? 1 : 0);

    const windowsUsername = data.windows_username || null;

    this.db.prepare(`
      INSERT INTO users (id, username, display_name, role, avatar_color, sort_order, first_name, last_name, business_role_id, is_admin, windows_username, can_self_assign, is_senior_staff)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, username, displayName, data.role, color, data.sort_order ?? maxOrder + 1,
      firstName, lastName, data.business_role_id || null, isAdmin, windowsUsername, data.can_self_assign ? 1 : 0,
      data.role === 'staff' && data.is_senior_staff ? 1 : 0
    );

    return this.getUserById(id);
  }

  updateUser(data) {
    const fields = [];
    const values = [];
    if (data.avatar_color !== undefined) data = {
      ...data,
      avatar_color: this._resolveAvatarColor(normalizeAvatarColor(data.avatar_color), data.id),
    };
    for (const key of ['display_name', 'role', 'avatar_color', 'sort_order', 'active', 'username', 'first_name', 'last_name', 'business_role_id', 'is_admin', 'windows_username', 'can_self_assign', 'is_senior_staff']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) return this.getUserById(data.id);
    values.push(data.id);
    this.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getUserById(data.id);
  }

  getAssignedTaskCount(userId) {
    return this.db.prepare('SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ?').get(userId)?.count || 0;
  }

  getAssignedOpenTaskCount(userId) {
    return this.db.prepare('SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND completed = 0').get(userId)?.count || 0;
  }

  getTaskCount(filters = {}) {
    let sql = 'SELECT COUNT(*) as count FROM tasks WHERE 1=1';
    const params = [];

    if (filters.assigned_to) {
      sql += ' AND assigned_to = ?';
      params.push(filters.assigned_to);
    }
    if (filters.project_id) {
      sql += ' AND project_id = ?';
      params.push(filters.project_id);
    }
    if (filters.completed !== undefined) {
      sql += ' AND completed = ?';
      params.push(filters.completed ? 1 : 0);
    }

    return this.db.prepare(sql).get(...params)?.count || 0;
  }

  hasTasksOlderThanWeek(weekStr) {
    if (!weekStr) return false;

    const row = this.db.prepare(`
      SELECT 1
      FROM tasks
      WHERE date(created_at) < date(?)
         OR date(updated_at) < date(?)
         OR (due_date IS NOT NULL AND date(due_date) < date(?))
      LIMIT 1
    `).get(weekStr, weekStr, weekStr);

    return Boolean(row);
  }

  deleteUser(id) {
    this.db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
  }

  // ── Tasks ──────────────────────────────────────────────

  getTasks(filters = {}) {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (filters.assigned_to) {
      sql += ' AND assigned_to = ?';
      params.push(filters.assigned_to);
    }
    if (filters.project_id) {
      sql += ' AND project_id = ?';
      params.push(filters.project_id);
    }
    if (filters.completed !== undefined) {
      sql += ' AND completed = ?';
      params.push(filters.completed ? 1 : 0);
    }

    sql += ' ORDER BY sort_order, created_at';
    return this.db.prepare(sql).all(...params);
  }

  getTaskById(id) {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  }

  getSharedTaskDueDate(projectId, title) {
    const normalizedTitle = normalizeSharedTaskTitle(title);
    if (!projectId || !normalizedTitle) return null;

    const matches = this.db.prepare(`
      SELECT title, due_date
      FROM tasks
      WHERE project_id = ?
        AND due_date IS NOT NULL
        AND trim(due_date) <> ''
      ORDER BY datetime(updated_at) DESC, rowid DESC
    `).all(projectId);
    const match = matches.find((task) => normalizeSharedTaskTitle(task.title) === normalizedTitle);

    return match?.due_date || null;
  }

  addTaskActivity(data = {}) {
    if (!data.task_id || !data.action) return null;
    const activity = {
      id: data.id || uuidv4(),
      task_id: data.task_id,
      project_id: data.project_id || null,
      action: data.action,
      actor_id: data.actor_id || null,
      details: typeof data.details === 'string' ? data.details : JSON.stringify(data.details || {}),
      created_at: data.created_at || this._getCurrentTimestamp(),
    };
    this.db.prepare(`INSERT OR IGNORE INTO task_activity (id, task_id, project_id, action, actor_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(activity.id, activity.task_id, activity.project_id, activity.action, activity.actor_id, activity.details, activity.created_at);
    return this.db.prepare('SELECT * FROM task_activity WHERE id = ?').get(activity.id);
  }

  getTaskActivity(taskId, limit = 40) {
    return this.db.prepare(`
      SELECT activity.*, users.display_name AS actor_name
      FROM task_activity activity
      LEFT JOIN users ON users.id = activity.actor_id
      WHERE activity.task_id = ?
      ORDER BY datetime(activity.created_at) DESC, activity.id DESC
      LIMIT ?
    `).all(taskId, Math.max(1, Math.min(Number(limit) || 40, 100)));
  }

  getProjectActivity(projectId, limit = 100) {
    return this.db.prepare(`
      SELECT activity.*, users.display_name AS actor_name, tasks.title AS task_title
      FROM task_activity activity
      LEFT JOIN users ON users.id = activity.actor_id
      LEFT JOIN tasks ON tasks.id = activity.task_id
      WHERE activity.project_id = ? OR (activity.project_id IS NULL AND tasks.project_id = ?)
      ORDER BY datetime(activity.created_at) DESC, activity.id DESC
      LIMIT ?
    `).all(projectId, projectId, Math.max(1, Math.min(Number(limit) || 100, 250)));
  }

  createTask(data) {
    const id = data.id || uuidv4();
    const leadId = this._normalizeTaskLeadId(data.lead_id);
    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) as m FROM tasks WHERE assigned_to = ?'
    ).get(data.assigned_to || null)?.m || 0;

    this.db.prepare(`
      INSERT INTO tasks (id, project_id, assigned_to, lead_id, created_by, title, notes, priority, priority_label, due_date, sort_order, confirmed, partner_id, category, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.project_id || null,
      data.assigned_to || null,
      leadId,
      data.created_by || null,
      data.title || '',
      data.notes || '',
      data.priority ?? 0,
      data.priority_label || null,
      data.due_date || null,
      data.sort_order ?? maxOrder + 1,
      data.confirmed ?? 1,
      data.partner_id || null,
      data.category || 'current',
      data.status || (data.completed ? 'complete' : 'not_started'),
      data.updated_at || this._getCurrentTimestamp()
    );

    return this.getTaskById(id);
  }

  updateTask(data) {
    const fields = [];
    const values = [];
    for (const key of ['project_id', 'assigned_to', 'title', 'notes', 'priority', 'priority_label', 'due_date', 'completed', 'sort_order', 'confirmed', 'partner_id', 'category', 'status']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (data.lead_id !== undefined) {
      fields.push('lead_id = ?');
      values.push(this._normalizeTaskLeadId(data.lead_id, this.getTaskById(data.id)?.lead_id || null));
    }
    if (fields.length === 0) return this.getTaskById(data.id);
    fields.push('updated_at = ?');
    values.push(data.updated_at || this._getNextTaskTimestamp(data.id));
    values.push(data.id);
    this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getTaskById(data.id);
  }

  // A Project Lead belongs to the project, not to one person's assignment. The
  // lead is still stored on each task row (every MyTasks and Dashboard version
  // already reads it from there), so these helpers keep every row of a project
  // in step instead of changing the stored format.
  getProjectLeadId(projectId, { excludeTaskId = null } = {}) {
    if (!projectId) return null;
    const row = this.db.prepare(`
      SELECT lead_id FROM tasks
      WHERE project_id = ? AND lead_id IS NOT NULL AND lead_id != '' AND id != ?
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT 1
    `).get(projectId, excludeTaskId || '');
    return row?.lead_id || null;
  }

  // Sets the lead on every other task of the project and returns the rows that
  // actually changed so the caller can publish them.
  applyProjectLead(projectId, leadId, { exceptTaskId = null } = {}) {
    if (!projectId) return [];
    const normalizedLeadId = this._normalizeTaskLeadId(leadId);
    const rows = this.db.prepare(`
      SELECT id FROM tasks
      WHERE project_id = ? AND id != ? AND COALESCE(lead_id, '') != ?
    `).all(projectId, exceptTaskId || '', normalizedLeadId || '');
    const update = this.db.prepare('UPDATE tasks SET lead_id = ?, updated_at = ? WHERE id = ?');
    const changed = [];
    for (const row of rows) {
      update.run(normalizedLeadId, this._getNextTaskTimestamp(row.id), row.id);
      changed.push(this.getTaskById(row.id));
    }
    return changed;
  }

  // One-time repair for projects whose lead was only set on some assignments:
  // when a project has exactly one lead, every task of that project gets it.
  // Projects with two different leads are left alone for the user to settle.
  reconcileProjectLeads() {
    const projects = this.db.prepare(`
      SELECT project_id FROM tasks
      WHERE project_id IS NOT NULL AND project_id != ''
      GROUP BY project_id
      HAVING SUM(CASE WHEN lead_id IS NULL OR lead_id = '' THEN 1 ELSE 0 END) > 0
         AND COUNT(DISTINCT CASE WHEN lead_id IS NOT NULL AND lead_id != '' THEN lead_id END) = 1
    `).all();
    const changed = [];
    for (const { project_id: projectId } of projects) {
      const leadId = this.getProjectLeadId(projectId);
      if (!leadId) continue;
      try {
        changed.push(...this.applyProjectLead(projectId, leadId));
      } catch (_) {
        // A lead who is no longer senior staff is left as it was.
      }
    }
    return changed;
  }

  // Runs `apply` with lead-designation checks relaxed. Those checks guard local
  // edits; a synced event records something another machine already accepted,
  // and rejecting it would make that event fail and retry forever.
  _asSyncReplay(apply) {
    const previous = this._replayingSyncEvent;
    this._replayingSyncEvent = true;
    try {
      return apply();
    } finally {
      this._replayingSyncEvent = previous;
    }
  }

  _normalizeTaskLeadId(leadId, currentLeadId = null) {
    if (!leadId) return null;
    const lead = this.getUserById(leadId);
    if (lead && (leadId === currentLeadId || this._replayingSyncEvent)) return lead.id;
    if (!lead || lead.role !== 'staff' || !(lead.is_senior_staff === 1 || lead.is_senior_staff === true)) {
      throw new Error('Project Lead must be designated senior staff.');
    }
    return lead.id;
  }

  deleteTask(id) {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  // ── Shared Work Cards (V1.3) ───────────────────────────

  // ── Work Card Categories ───────────────────────────────

  _seedWorkCardCategories() {
    const seeds = [
      ['work-card-planning', 'Planning', '#4A5FE0'],
      ['work-card-elevations', 'Elevations', '#0B8A78'],
      ['work-card-submission', 'Submission', '#C4601A'],
      ['work-card-zoning', 'Zoning', '#7D4CC9'],
      ['work-card-details', 'Details', '#B0386B'],
      ['work-card-coordination', 'Coordination', '#5B6B7F'],
    ];
    const insert = this.db.prepare('INSERT OR IGNORE INTO work_card_categories (id, label, color, sort_order, show_on_team_calendar) VALUES (?, ?, ?, ?, 1)');
    seeds.forEach(([id, label, color], sortOrder) => insert.run(id, label, color, sortOrder));
  }

  getWorkCardCategories() {
    return this.db.prepare('SELECT * FROM work_card_categories ORDER BY sort_order, label COLLATE NOCASE').all();
  }

  getWorkCardCategoryById(id) {
    return this.db.prepare('SELECT * FROM work_card_categories WHERE id = ?').get(id);
  }

  createWorkCardCategory(data = {}) {
    const id = data.id || uuidv4();
    const label = String(data.label || '').trim();
    if (!label) throw new Error('A category needs a name.');
    const maxOrder = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM work_card_categories').get().value;
    this.db.prepare('INSERT INTO work_card_categories (id, label, color, sort_order, show_on_team_calendar) VALUES (?, ?, ?, ?, ?)')
      .run(id, label, String(data.color || '#5964A8'), data.sort_order ?? maxOrder + 1, data.show_on_team_calendar === false || data.show_on_team_calendar === 0 ? 0 : 1);
    return this.getWorkCardCategoryById(id);
  }

  updateWorkCardCategory(data = {}) {
    const existing = this.getWorkCardCategoryById(data.id);
    if (!existing) return null;
    const label = data.label === undefined ? existing.label : String(data.label || '').trim();
    if (!label) throw new Error('A category needs a name.');
    const showOnTeamCalendar = data.show_on_team_calendar === undefined
      ? existing.show_on_team_calendar
      : (data.show_on_team_calendar ? 1 : 0);
    this.db.prepare('UPDATE work_card_categories SET label = ?, color = ?, sort_order = ?, show_on_team_calendar = ? WHERE id = ?')
      .run(label, String(data.color || existing.color), data.sort_order ?? existing.sort_order, showOnTeamCalendar, data.id);
    return this.getWorkCardCategoryById(data.id);
  }

  // Default categories are seeded once by the migration. They must not be
  // re-created here or on every card save, or a deleted type would return.
  _getFallbackWorkCardCategoryId() {
    return this.getWorkCardCategoryById('work-card-planning') ? 'work-card-planning' : null;
  }

  deleteWorkCardCategory(id) {
    this.db.prepare('DELETE FROM work_card_categories WHERE id = ?').run(id);
    const fallbackId = this._getFallbackWorkCardCategoryId();
    if (fallbackId) {
      this.db.prepare('UPDATE work_cards SET category_id = ? WHERE category_id IS NULL OR category_id = ?').run(fallbackId, id);
    }
    return true;
  }

  reorderWorkCardCategories(orders = []) {
    const update = this.db.prepare('UPDATE work_card_categories SET sort_order = ? WHERE id = ?');
    this.runInTransaction(() => orders.forEach((item, index) => update.run(item.sort_order ?? index, item.id)));
    return this.getWorkCardCategories();
  }

  _normalizeWorkCardAssignees(value) {
    const raw = Array.isArray(value) ? value : [];
    return [...new Set(raw.filter((id) => typeof id === 'string').map((id) => id.trim()).filter(Boolean))];
  }

  _normalizeWorkCardPayload(data = {}, existing = null) {
    const now = this._getCurrentTimestamp();
    const assigneeIds = Object.hasOwn(data, 'assignee_ids')
      ? this._normalizeWorkCardAssignees(data.assignee_ids)
      : (existing?.assignee_ids || []);
    const minutes = data.planned_minutes === undefined ? existing?.planned_minutes : data.planned_minutes;
    if (minutes !== null && minutes !== undefined && (!Number.isFinite(Number(minutes)) || Number(minutes) < 0)) {
      throw new Error('Planned work-card time must be zero or greater.');
    }
    const startDate = data.start_date === undefined ? existing?.start_date : (data.start_date || null);
    const endDate = data.end_date === undefined ? existing?.end_date : (data.end_date || null);
    if (startDate && endDate && String(startDate) > String(endDate)) throw new Error('A work-card end date cannot be before its start date.');
    const title = data.title === undefined ? existing?.title : String(data.title || '').trim();
    if (!title) throw new Error('A work card needs a title.');
    const requestedCategoryId = data.category_id === undefined ? existing?.category_id : data.category_id;
    const categoryId = requestedCategoryId && this.getWorkCardCategoryById(requestedCategoryId)
      ? requestedCategoryId
      : this._getFallbackWorkCardCategoryId();
    const requestedStatus = data.status !== undefined
      ? data.status
      : (data.completed !== undefined ? (data.completed ? 'done' : 'todo') : (existing?.status || (existing?.completed ? 'done' : 'todo')));
    const status = ['todo', 'in_progress', 'done'].includes(requestedStatus) ? requestedStatus : 'todo';
    const statusChanged = Boolean(existing && status !== (existing.status || (existing.completed ? 'done' : 'todo')));
    const paused = status !== 'in_progress' || statusChanged ? 0 : (data.paused === undefined ? (existing?.paused ? 1 : 0) : (data.paused ? 1 : 0));
    const pausedAt = paused ? (data.paused_at || existing?.paused_at || now) : null;
    const loggedHours = data.logged_hours === undefined ? Number(existing?.logged_hours || 0) : Number(data.logged_hours || 0);
    if (!Number.isFinite(loggedHours) || loggedHours < 0) throw new Error('Logged hours must be zero or greater.');
    const leadId = data.lead_id === undefined ? (existing?.lead_id || null) : (data.lead_id || null);
    // An unchanged lead, or one arriving from sync, is never re-validated: the
    // person may have lost senior status since being assigned.
    if (leadId && leadId !== (existing?.lead_id || null) && !this._replayingSyncEvent) {
      const lead = this.getUserById(leadId);
      if (!lead || lead.role !== 'staff' || !(lead.is_senior_staff === 1 || lead.is_senior_staff === true)) {
        throw new Error('A work-card team lead must be designated senior staff.');
      }
    }
    return {
      id: data.id || existing?.id || uuidv4(),
      project_id: data.project_id || existing?.project_id || null,
      week_of: data.week_of || existing?.week_of || null,
      title,
      description: data.description === undefined ? (existing?.description || '') : String(data.description || '').trim(),
      category_id: categoryId,
      status,
      paused,
      paused_at: pausedAt,
      logged_hours: Math.round(loggedHours * 100) / 100,
      lead_id: leadId,
      planned_minutes: minutes === null || minutes === undefined || minutes === '' ? null : Math.round(Number(minutes)),
      start_date: startDate,
      end_date: endDate,
      completed: status === 'done' ? 1 : 0,
      sort_order: data.sort_order === undefined ? (existing?.sort_order || 0) : Number(data.sort_order) || 0,
      created_by: existing?.created_by || data.created_by || null,
      updated_by: data.updated_by === undefined ? (existing?.updated_by || data.created_by || null) : (data.updated_by || null),
      created_at: existing?.created_at || data.created_at || now,
      updated_at: data.updated_at || (existing ? this._getNextWorkCardTimestamp(existing.id) : now),
      assignee_ids: assigneeIds,
    };
  }

  _workCardWithAssignees(row) {
    if (!row) return null;
    const assignees = this.db.prepare(`
      SELECT users.id, users.display_name, users.avatar_color
      FROM work_card_assignees
      JOIN users ON users.id = work_card_assignees.user_id
      WHERE work_card_assignees.work_card_id = ?
      ORDER BY users.display_name COLLATE NOCASE
    `).all(row.id);
    return { ...row, completed: Boolean(row.completed), assignee_ids: assignees.map((assignee) => assignee.id), assignees };
  }

  getWorkCardById(id) {
    return this._workCardWithAssignees(this.db.prepare('SELECT * FROM work_cards WHERE id = ?').get(id));
  }

  getWorkCards(filters = {}) {
    let sql = 'SELECT * FROM work_cards WHERE 1=1';
    const params = [];
    if (filters.project_id) { sql += ' AND project_id = ?'; params.push(filters.project_id); }
    if (filters.week_of) { sql += ' AND week_of = ?'; params.push(filters.week_of); }
    if (filters.completed !== undefined) { sql += ' AND completed = ?'; params.push(filters.completed ? 1 : 0); }
    if (filters.assignee_id) { sql += ' AND EXISTS (SELECT 1 FROM work_card_assignees WHERE work_card_assignees.work_card_id = work_cards.id AND work_card_assignees.user_id = ?)'; params.push(filters.assignee_id); }
    sql += ' ORDER BY completed ASC, sort_order ASC, created_at ASC';
    return this.db.prepare(sql).all(...params).map((row) => this._workCardWithAssignees(row));
  }

  getProjectParticipants(projectId) {
    return this.db.prepare(`
      SELECT DISTINCT users.id, users.display_name, users.avatar_color
      FROM tasks
      JOIN users ON users.id = tasks.assigned_to
      WHERE tasks.project_id = ? AND tasks.category = 'current' AND tasks.completed = 0 AND users.active = 1
      ORDER BY users.display_name COLLATE NOCASE
    `).all(projectId);
  }

  _replaceWorkCardAssignees(workCardId, assigneeIds) {
    const remove = this.db.prepare('DELETE FROM work_card_assignees WHERE work_card_id = ?');
    const add = this.db.prepare('INSERT OR IGNORE INTO work_card_assignees (work_card_id, user_id) VALUES (?, ?)');
    remove.run(workCardId);
    for (const userId of assigneeIds) add.run(workCardId, userId);
    if (assigneeIds.length) {
      this.db.prepare(`DELETE FROM work_card_focus WHERE work_card_id = ? AND user_id NOT IN (${assigneeIds.map(() => '?').join(', ')})`).run(workCardId, ...assigneeIds);
    } else {
      this.db.prepare('DELETE FROM work_card_focus WHERE work_card_id = ?').run(workCardId);
    }
  }

  createWorkCard(data = {}) {
    const card = this._normalizeWorkCardPayload(data);
    if (!card.project_id || !this.getProjectById(card.project_id)) throw new Error('Choose an existing project for this work card.');
    if (!card.week_of) throw new Error('A work card needs a scheduling week.');
    const maxOrder = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM work_cards WHERE project_id = ? AND week_of = ?').get(card.project_id, card.week_of).value;
    card.sort_order = data.sort_order === undefined ? maxOrder + 1 : card.sort_order;
    this.runInTransaction(() => {
      this.db.prepare(`
        INSERT INTO work_cards (id, project_id, week_of, title, description, category_id, status, paused, paused_at, logged_hours, lead_id, planned_minutes, start_date, end_date, completed, sort_order, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(card.id, card.project_id, card.week_of, card.title, card.description, card.category_id, card.status, card.paused, card.paused_at, card.logged_hours, card.lead_id, card.planned_minutes, card.start_date, card.end_date, card.completed, card.sort_order, card.created_by, card.updated_by, card.created_at, card.updated_at);
      this._replaceWorkCardAssignees(card.id, card.assignee_ids);
    });
    return this.getWorkCardById(card.id);
  }

  updateWorkCard(data = {}) {
    const existing = this.getWorkCardById(data.id);
    if (!existing) return null;
    const card = this._normalizeWorkCardPayload(data, existing);
    this.runInTransaction(() => {
      this.db.prepare(`
        UPDATE work_cards
        SET project_id = ?, week_of = ?, title = ?, description = ?, category_id = ?, status = ?, paused = ?, paused_at = ?, logged_hours = ?, lead_id = ?, planned_minutes = ?, start_date = ?, end_date = ?, completed = ?, sort_order = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(card.project_id, card.week_of, card.title, card.description, card.category_id, card.status, card.paused, card.paused_at, card.logged_hours, card.lead_id, card.planned_minutes, card.start_date, card.end_date, card.completed, card.sort_order, card.updated_by, card.updated_at, card.id);
      if (Object.hasOwn(data, 'assignee_ids')) this._replaceWorkCardAssignees(card.id, card.assignee_ids);
    });
    return this.getWorkCardById(card.id);
  }

  deleteWorkCard(id) {
    this.db.prepare('DELETE FROM work_cards WHERE id = ?').run(id);
    return true;
  }

  // Weekly rollover: work that is not finished follows the schedule into the
  // new week instead of being left behind in a week that is over. Done cards
  // stay in the week they were completed. Only the week, the card's dates
  // (shifted by the same number of days so the weekdays are kept) and its place
  // in the list change; status, pause state, assignees, lead and hours do not.
  // Returns the cards that moved, so the caller can publish them. Running it
  // again is a no-op, which lets it double as a catch-up.
  carryOverUnfinishedWorkCards(weekStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStr || ''))) return [];
    const dayNumber = (value) => Math.round(Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`) / 86400000);
    const shiftDate = (value, days) => {
      if (!value) return null;
      const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) return value;
      parsed.setUTCDate(parsed.getUTCDate() + days);
      return parsed.toISOString().slice(0, 10);
    };

    const candidates = this.db.prepare(`
      SELECT id FROM work_cards
      WHERE completed = 0 AND status != 'done' AND week_of < ?
      ORDER BY week_of ASC, sort_order ASC, created_at ASC
    `).all(weekStr);
    if (candidates.length === 0) return [];

    const lastOrder = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM work_cards WHERE project_id = ? AND week_of = ?');
    const nextOrderByProject = new Map();
    const moved = [];
    this.runInTransaction(() => {
      for (const { id } of candidates) {
        const card = this.getWorkCardById(id);
        if (!card) continue;
        if (!nextOrderByProject.has(card.project_id)) {
          nextOrderByProject.set(card.project_id, lastOrder.get(card.project_id, weekStr).value);
        }
        const sortOrder = nextOrderByProject.get(card.project_id) + 1;
        const days = dayNumber(weekStr) - dayNumber(card.week_of);
        try {
          moved.push(this.updateWorkCard({
            id,
            week_of: weekStr,
            start_date: shiftDate(card.start_date, days),
            end_date: shiftDate(card.end_date, days),
            sort_order: sortOrder,
          }));
          nextOrderByProject.set(card.project_id, sortOrder);
        } catch (error) {
          // One card that no longer validates (for example a lead who is no
          // longer designated) must not stop the rest from carrying over.
          console.warn(`Work card ${id} could not be carried over: ${error.message}`);
        }
      }
    });
    return moved;
  }

  getWorkCardFocus(userId) {
    const row = this.db.prepare('SELECT work_card_id FROM work_card_focus WHERE user_id = ?').get(userId);
    return row ? this.getWorkCardById(row.work_card_id) : null;
  }

  setWorkCardFocus(userId, workCardId, updatedAt = this._getCurrentTimestamp(), options = {}) {
    if (!workCardId) {
      this.db.prepare('DELETE FROM work_card_focus WHERE user_id = ?').run(userId);
      return null;
    }
    const card = this.getWorkCardById(workCardId);
    if (!card) throw new Error('The selected work card no longer exists.');
    if (!card.assignee_ids.includes(userId)) {
      // A delayed focus event may arrive after an assignment change. It is not
      // a sync failure and must not recreate focus for someone removed from a card.
      if (options.allowUnassigned) return null;
      throw new Error('Only a work-card assignee can activate this card.');
    }
    this.db.prepare(`
      INSERT INTO work_card_focus (user_id, work_card_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET work_card_id = excluded.work_card_id, updated_at = excluded.updated_at
    `).run(userId, workCardId, updatedAt);
    return this.getWorkCardFocus(userId);
  }

  getTaskTombstone(taskId) {
    return this.db.prepare('SELECT * FROM task_tombstones WHERE task_id = ?').get(taskId) || null;
  }

  recordTaskDeletion(taskId, deletedAt = this._getCurrentTimestamp()) {
    const existing = this.getTaskTombstone(taskId);
    if (existing && this._compareTimestamps(existing.deleted_at, deletedAt) >= 0) return existing;
    this.db.prepare(`
      INSERT INTO task_tombstones (task_id, deleted_at)
      VALUES (?, ?)
      ON CONFLICT(task_id) DO UPDATE SET deleted_at = excluded.deleted_at
    `).run(taskId, deletedAt);
    return this.getTaskTombstone(taskId);
  }

  reorderTasks(orders) {
    const stmt = this.db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?');
    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.sort_order, item.id);
      }
    });
    transaction(orders);
  }

  // ── Sub-tasks ──────────────────────────────────────────

  getSubTasks(taskId) {
    return this.db.prepare(
      'SELECT * FROM sub_tasks WHERE task_id = ? ORDER BY sort_order, created_at'
    ).all(taskId);
  }

  getSubTaskById(id) {
    return this.db.prepare('SELECT * FROM sub_tasks WHERE id = ?').get(id);
  }

  createSubTask(data) {
    const normalized = this._normalizeSubTaskPayload(data);
    const id = data.id || uuidv4();
    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) as m FROM sub_tasks WHERE task_id = ?'
    ).get(data.task_id).m;

    this.db.prepare(`
      INSERT INTO sub_tasks (id, task_id, title, notes, due_date, assigned_to, assigned_to_ids, created_by, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.task_id, data.title || '', data.notes || '', data.due_date || null, normalized.assigned_to, normalized.assigned_to_ids, data.created_by || null, maxOrder + 1);

    return this.getSubTaskById(id);
  }

  updateSubTask(data) {
    const normalized = this._normalizeSubTaskPayload(data);
    const fields = [];
    const values = [];
    for (const key of ['title', 'notes', 'due_date', 'completed', 'assigned_to', 'assigned_to_ids', 'sort_order']) {
      const source = Object.prototype.hasOwnProperty.call(normalized, key) ? normalized : data;
      if (source[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(source[key]);
      }
    }
    if (fields.length === 0) return this.getSubTaskById(data.id);
    values.push(data.id);
    this.db.prepare(`UPDATE sub_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getSubTaskById(data.id);
  }

  deleteSubTask(id) {
    this.db.prepare('DELETE FROM sub_tasks WHERE id = ?').run(id);
  }

  toggleSubTask(id) {
    this.db.prepare('UPDATE sub_tasks SET completed = CASE WHEN completed = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
    return this.getSubTaskById(id);
  }

  // ── Comments ───────────────────────────────────────────

  getComments(taskId) {
    return this.db.prepare(`
      SELECT c.*, u.display_name as author_name, u.avatar_color as author_color
      FROM comments c
      LEFT JOIN users u ON c.author_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `).all(taskId);
  }

  addComment(data) {
    const id = data.id || uuidv4();
    this.db.prepare(`
      INSERT INTO comments (id, task_id, author_id, body)
      VALUES (?, ?, ?, ?)
    `).run(id, data.task_id, data.author_id, data.body || '');

    return this.db.prepare(`
      SELECT c.*, u.display_name as author_name, u.avatar_color as author_color
      FROM comments c
      LEFT JOIN users u ON c.author_id = u.id
      WHERE c.id = ?
    `).get(id);
  }

  deleteComment(id) {
    this.db.prepare('DELETE FROM comments WHERE id = ?').run(id);
  }

  // ── Projects ───────────────────────────────────────────

  getProjects() {
    return this.db.prepare(`
      SELECT * FROM projects
      ORDER BY
        COALESCE(NULLIF(TRIM(client), ''), '') COLLATE NOCASE,
        COALESCE(NULLIF(TRIM(name), ''), '') COLLATE NOCASE,
        id
    `).all();
  }

  getProjectById(id) {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  }

  _normalizeProjectPartnerFields(data) {
    const normalized = {};

    if (data.partner_id !== undefined) {
      normalized.partner_id = data.partner_id || null;
    }

    if (data.partner_ids !== undefined) {
      if (Array.isArray(data.partner_ids)) {
        normalized.partner_ids = JSON.stringify([...new Set(data.partner_ids.filter(Boolean))]);
      } else if (typeof data.partner_ids === 'string') {
        normalized.partner_ids = data.partner_ids || '[]';
      } else {
        normalized.partner_ids = '[]';
      }
    }

    if (data.partner_initials !== undefined) {
      normalized.partner_initials = String(data.partner_initials || '').trim();
    }

    return normalized;
  }

  _normalizeProjectLeadFields(data) {
    if (data.project_lead_ids === undefined) return {};
    let rawIds = [];
    if (Array.isArray(data.project_lead_ids)) {
      rawIds = data.project_lead_ids;
    } else if (typeof data.project_lead_ids === 'string' && data.project_lead_ids.trim()) {
      try {
        const parsed = JSON.parse(data.project_lead_ids);
        rawIds = Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        rawIds = [];
      }
    }
    const leadIds = [...new Set((Array.isArray(rawIds) ? rawIds : []).filter(Boolean))];
    for (const id of leadIds) {
      if (this._replayingSyncEvent) break;
      const user = this.getUserById(id);
      if (!user || user.role !== 'staff' || !(user.is_senior_staff === 1 || user.is_senior_staff === true)) {
        throw new Error('Project leads must be designated senior staff.');
      }
    }
    return { project_lead_ids: JSON.stringify(leadIds) };
  }

  createProject(data) {
    const id = data.id || uuidv4();
    const maxOrder = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM projects').get().m;
    const partnerData = this._normalizeProjectPartnerFields(data);
    const leadData = this._normalizeProjectLeadFields(data);

    this.db.prepare(`
      INSERT INTO projects (id, client, name, status, category, notes, partner_id, partner_ids, partner_initials, project_lead_ids, folder_link, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.client || '',
      data.name || '',
      data.status || 'active',
      data.category || 'current',
      data.notes || '',
      partnerData.partner_id ?? null,
      partnerData.partner_ids ?? '[]',
      partnerData.partner_initials ?? '',
      leadData.project_lead_ids ?? '[]',
      data.folder_link || '',
      data.sort_order ?? maxOrder + 1
    );

    return this.getProjectById(id);
  }

  updateProject(data) {
    const fields = [];
    const values = [];
    const partnerData = this._normalizeProjectPartnerFields(data);
    const leadData = this._normalizeProjectLeadFields(data);
    for (const key of ['client', 'name', 'status', 'category', 'notes', 'folder_link', 'sort_order']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    for (const key of ['partner_id', 'partner_ids', 'partner_initials']) {
      if (partnerData[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(partnerData[key]);
      }
    }
    if (leadData.project_lead_ids !== undefined) {
      fields.push('project_lead_ids = ?');
      values.push(leadData.project_lead_ids);
    }
    if (fields.length === 0) return this.getProjectById(data.id);
    values.push(data.id);
    this.db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getProjectById(data.id);
  }

  deleteProject(id) {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  // ── PTO (date-based) ──────────────────────────────────

  /**
   * Get PTO dates for all users (or one user).
   * Returns array of { user_id, dates: ['YYYY-MM-DD', ...], label: 'auto' }
   */
  getPTO() {
    const rows = this.db.prepare('SELECT user_id, pto_date FROM staff_pto_dates ORDER BY pto_date').all();
    const byUser = {};
    for (const r of rows) {
      if (!byUser[r.user_id]) byUser[r.user_id] = [];
      byUser[r.user_id].push(r.pto_date);
    }
    return Object.entries(byUser).map(([user_id, dates]) => ({
      user_id,
      dates,
      label: this._generatePTOLabel(dates)
    }));
  }

  /**
   * Get PTO for a specific user.
   * Returns { user_id, dates: [...], label } or null.
   */
  getPTOForUser(userId) {
    const rows = this.db.prepare('SELECT pto_date FROM staff_pto_dates WHERE user_id = ? ORDER BY pto_date').all(userId);
    if (rows.length === 0) return null;
    const dates = rows.map(r => r.pto_date);
    return { user_id: userId, dates, label: this._generatePTOLabel(dates) };
  }

  /**
   * Set PTO dates for a user (replaces all existing dates).
   * @param {{ user_id: string, dates: string[] }} data
   */
  setPTODates(data) {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM staff_pto_dates WHERE user_id = ?').run(data.user_id);
      const insert = this.db.prepare('INSERT INTO staff_pto_dates (id, user_id, pto_date) VALUES (?, ?, ?)');
      for (const date of data.dates) {
        insert.run(uuidv4(), data.user_id, date);
      }
    });
    transaction();
    return this.getPTOForUser(data.user_id);
  }

  clearPTO(userId) {
    this.db.prepare('DELETE FROM staff_pto_dates WHERE user_id = ?').run(userId);
  }

  /**
   * Auto-generate a display label from PTO dates.
   * Examples: "3/27", "3/27-3/30", "3/27, 3/31"
   */
  _generatePTOLabel(dates) {
    if (!dates || dates.length === 0) return '';
    const sorted = [...dates].sort();
    const fmt = (d) => {
      const [y, m, day] = d.split('-');
      return `${parseInt(m)}/${parseInt(day)}`;
    };

    // Group into consecutive ranges
    const ranges = [];
    let rangeStart = sorted[0];
    let rangeEnd = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(rangeEnd + 'T00:00:00');
      const curr = new Date(sorted[i] + 'T00:00:00');
      const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) {
        rangeEnd = sorted[i];
      } else {
        ranges.push([rangeStart, rangeEnd]);
        rangeStart = sorted[i];
        rangeEnd = sorted[i];
      }
    }
    ranges.push([rangeStart, rangeEnd]);

    return ranges.map(([s, e]) => s === e ? fmt(s) : `${fmt(s)}-${fmt(e)}`).join(', ');
  }

  // ── Weekly Rollover ──────────────────────────────────────

  getLastRolloverWeek() {
    return this.getGlobalSetting('rollover_week')
      || this.db.prepare("SELECT value FROM meta WHERE key = 'last_rollover_week'").get()?.value
      || null;
  }

  setLastRolloverWeek(weekStr) {
    this._setMeta('last_rollover_week', weekStr);
    this.setGlobalSetting('rollover_week', weekStr);
  }

  performWeeklyRollover(weekStr = null) {
    const transaction = this.db.transaction(() => {
      const carryoverTokens = this.getPriorityCarryoverTokens();
      const carryoverTokenSet = carryoverTokens ? new Set(carryoverTokens) : null;
      const customCarryoverLabels = this._getCustomPriorityCarryoverLabels(carryoverTokenSet);
      const tasks = this.db.prepare('SELECT id, priority, priority_label FROM tasks').all();
      const updateTask = this.db.prepare(`
        UPDATE tasks
        SET category = 'last_week',
            confirmed = 0,
            priority = ?,
            priority_label = ?,
            completed = 0,
            status = 'not_started',
            due_date = CASE
              WHEN ? IS NOT NULL AND due_date IS NOT NULL AND date(due_date) >= date(?) THEN due_date
              WHEN ? IS NULL THEN due_date
              ELSE NULL
            END
        WHERE id = ?
      `);

      // Move every task, including completed work, into carry-over review for the new week.
      // Keep due dates only if they land in the new week or later.
      for (const task of tasks) {
        const shouldCarryPriority = this._shouldCarryTaskPriority(task, carryoverTokenSet, customCarryoverLabels);
        updateTask.run(
          shouldCarryPriority ? task.priority : PRIORITY_NONE,
          shouldCarryPriority ? task.priority_label : null,
          weekStr,
          weekStr,
          weekStr,
          task.id
        );
      }

      // Clear all PTO dates
      this.db.exec(`DELETE FROM staff_pto_dates`);
    });
    transaction();
  }

  confirmTask(taskId) {
    const task = this.getTaskById(taskId);
    if (!task) return null;
    const carryoverTokens = this.getPriorityCarryoverTokens();
    const carryoverTokenSet = carryoverTokens ? new Set(carryoverTokens) : null;
    const customCarryoverLabels = this._getCustomPriorityCarryoverLabels(carryoverTokenSet);
    const shouldCarryPriority = this._shouldCarryTaskPriority(task, carryoverTokenSet, customCarryoverLabels);

    this.db.prepare(`
      UPDATE tasks
      SET confirmed = 1,
          completed = 0,
          priority = ?,
          priority_label = ?,
          category = 'current',
          created_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      shouldCarryPriority ? task.priority : PRIORITY_NONE,
      shouldCarryPriority ? task.priority_label : null,
      taskId
    );
    return this.getTaskById(taskId);
  }

  // ── Project Notes (partner-authored, separate from Excel notes) ──

  getProjectNotes(projectId) {
    return this._getLegacyProjectNote(projectId);
  }

  getAllProjectNotes() {
    const projectIds = this.db.prepare('SELECT DISTINCT project_id FROM project_notes').all();
    return projectIds
      .map(({ project_id }) => this._getLegacyProjectNote(project_id))
      .filter(Boolean);
  }

  upsertProjectNotes(data) {
    if (!data?.project_id) return null;

    const existing = this.db.prepare(`
      SELECT *
      FROM project_notes
      WHERE project_id = ? AND lower(COALESCE(title, '')) = 'general'
      ORDER BY datetime(updated_at) DESC
      LIMIT 1
    `).get(data.project_id);

    if (existing) {
      return this.updateProjectSharedNote({
        id: existing.id,
        title: existing.title || 'General',
        notes: data.notes || '',
        updated_by: data.updated_by || null,
        updated_at: data.updated_at,
      });
    }

    return this.createProjectSharedNote({
      id: data.id,
      project_id: data.project_id,
      title: data.title || 'General',
      notes: data.notes || '',
      created_by: data.created_by || data.updated_by || null,
      updated_by: data.updated_by || null,
      created_at: data.created_at,
      updated_at: data.updated_at,
    });
  }

  getProjectSharedNotes(projectId) {
    return this.db.prepare(`
      SELECT *
      FROM project_notes
      WHERE project_id = ?
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, lower(title) ASC
    `).all(projectId);
  }

  getAllProjectSharedNotes() {
    return this.db.prepare(`
      SELECT *
      FROM project_notes
      ORDER BY project_id ASC, datetime(updated_at) DESC, datetime(created_at) DESC, lower(title) ASC
    `).all();
  }

  getProjectSharedNoteById(id) {
    return this.db.prepare('SELECT * FROM project_notes WHERE id = ?').get(id) || null;
  }

  createProjectSharedNote(data) {
    const note = this._normalizeProjectNotePayload(data);
    this.db.prepare(`
      INSERT INTO project_notes (
        id, project_id, title, notes, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      note.id,
      note.project_id,
      note.title,
      note.notes,
      note.created_by,
      note.updated_by,
      note.created_at,
      note.updated_at
    );
    return this.getProjectSharedNoteById(note.id);
  }

  updateProjectSharedNote(data) {
    if (!data?.id) return null;
    const existing = this.getProjectSharedNoteById(data.id);
    if (!existing) return null;

    const note = this._normalizeProjectNotePayload({
      ...existing,
      ...data,
      project_id: existing.project_id,
      created_by: existing.created_by,
      created_at: existing.created_at,
    });

    this.db.prepare(`
      UPDATE project_notes
      SET title = ?, notes = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
    `).run(note.title, note.notes, note.updated_by, note.updated_at, note.id);

    return this.getProjectSharedNoteById(note.id);
  }

  deleteProjectSharedNote(id) {
    this.db.prepare('DELETE FROM project_notes WHERE id = ?').run(id);
    return true;
  }

  _upsertProjectSharedNote(data) {
    const existing = data?.id ? this.getProjectSharedNoteById(data.id) : null;
    if (existing) {
      return this.updateProjectSharedNote(data);
    }
    return this.createProjectSharedNote(data);
  }

  // ── Bulk operations for sync ───────────────────────────

  applyEvent(event) {
    switch (event.type) {
      case 'user-created':    return this._upsertUser(event.data);
      case 'user-updated':    return this._upsertUser(event.data);
      case 'user-deleted':    return this.deleteUser(event.data.id);
      case 'task-created':    return this._upsertTask({ ...event.data, updated_at: event.data.updated_at || event.timestamp });
      case 'task-updated':    return this._applyCompatibilityEvent(event.data, () => this._upsertTask({ ...event.data, updated_at: event.data.updated_at || event.timestamp }));
      case 'task-deleted':    return this._applyCompatibilityEvent(event.data, () => this._applyTaskDeletion(event.data, event.timestamp));
      case 'tasks-reordered': return this.reorderTasks(event.data);
      case 'work-card-created': return this._upsertWorkCard(event.data);
      case 'work-card-updated': return this._upsertWorkCard(event.data);
      case 'work-card-completed': return null;
      case 'work-card-deleted': return this.deleteWorkCard(event.data.id);
      case 'work-card-focus-set': return this.setWorkCardFocus(event.data.user_id, event.data.work_card_id || null, event.data.updated_at || event.timestamp, { allowUnassigned: true });
      case 'work-card-category-created': return this._upsertWorkCardCategory(event.data);
      case 'work-card-category-updated': return this._upsertWorkCardCategory(event.data);
      case 'work-card-category-deleted': return this.deleteWorkCardCategory(event.data.id);
      case 'work-card-categories-reordered': return this.reorderWorkCardCategories(event.data);
      case 'subtask-created': return this._upsertSubTask(event.data);
      case 'subtask-updated': return this._upsertSubTask(event.data);
      case 'subtask-toggled': return this._upsertSubTask(event.data);
      case 'subtask-deleted': return this.deleteSubTask(event.data.id);
      case 'comment-added':   return this._upsertComment(event.data);
      case 'comment-deleted': return this.deleteComment(event.data.id);
      case 'project-created': return this._upsertProject(event.data);
      case 'project-updated': return this._upsertProject(event.data);
      case 'project-deleted': return this.deleteProject(event.data.id);
      case 'pto-set':         return this._upsertPTO(event.data);
      case 'pto-cleared':     return this._applyCompatibilityEvent(event.data, () => this.clearPTO(event.data.user_id));
      case 'project-notes-updated': return this.upsertProjectNotes(event.data);
      case 'project-shared-note-created': return this._upsertProjectSharedNote(event.data);
      case 'project-shared-note-updated': return this._upsertProjectSharedNote(event.data);
      case 'project-shared-note-deleted': return this.deleteProjectSharedNote(event.data.id);
      case 'role-created':    return this._upsertBusinessRole(event.data);
      case 'role-updated':    return this._upsertBusinessRole(event.data);
      case 'role-deleted':    return this.deleteBusinessRole(event.data.id);
      case 'roles-reordered': return this.reorderBusinessRoles(event.data);
      case 'priority-created':  return this._upsertCustomPriority(event.data);
      case 'priority-updated':  return this._upsertCustomPriority(event.data);
      case 'priority-deleted':    return this.deleteCustomPriority(event.data.id);
      case 'priorities-reordered': return this.reorderCustomPriorities(event.data);
      case 'setting-updated':   return this._applyGlobalSetting(event.data);
      case 'weekly-rollover':   return this._applyRollover(event.data);
      case 'rollover-review-started': return null;
      case 'rollover-review-ended': return null;
      case 'rollover-published': return this.applyRolloverPublication(event.data);
      case 'task-confirmed':    return this.confirmTask(event.data.id);
      case 'task-activity-added': return this.addTaskActivity(event.data);
      default:
        console.warn('Unknown event type:', event.type);
    }
  }

  _upsertUser(data) {
    return this._asSyncReplay(() => {
      const existing = this.getUserById(data.id);
      return existing ? this.updateUser(data) : this.createUser(data);
    });
  }

  _applyCompatibilityEvent(data, apply) {
    const publicationId = data?.rolloverPublicationId;
    if (publicationId && this.db.prepare('SELECT 1 FROM applied_rollover_publications WHERE publication_id = ?').get(publicationId)) {
      return null;
    }
    return apply();
  }

  _upsertTask(data) {
    const incomingUpdatedAt = data.updated_at || this._getCurrentTimestamp();
    const tombstone = this.getTaskTombstone(data.id);
    if (tombstone && this._compareTimestamps(tombstone.deleted_at, incomingUpdatedAt) >= 0) return null;
    const existing = this.getTaskById(data.id);
    if (existing && this._compareTimestamps(existing.updated_at, incomingUpdatedAt) > 0) return existing;
    if (tombstone) this.db.prepare('DELETE FROM task_tombstones WHERE task_id = ?').run(data.id);
    return this._asSyncReplay(() => existing
      ? this.updateTask({ ...data, updated_at: incomingUpdatedAt })
      : this.createTask({ ...data, updated_at: incomingUpdatedAt }));
  }

  _upsertWorkCard(data) {
    const incomingUpdatedAt = data.updated_at || this._getCurrentTimestamp();
    const existing = this.getWorkCardById(data.id);
    if (existing && this._compareTimestamps(existing.updated_at, incomingUpdatedAt) > 0) return existing;
    return this._asSyncReplay(() => existing
      ? this.updateWorkCard({ ...data, updated_at: incomingUpdatedAt })
      : this.createWorkCard({ ...data, updated_at: incomingUpdatedAt }));
  }

  _upsertWorkCardCategory(data) {
    return this.getWorkCardCategoryById(data.id) ? this.updateWorkCardCategory(data) : this.createWorkCardCategory(data);
  }

  _applyTaskDeletion(data = {}, eventTimestamp = null) {
    const deletedAt = data.deleted_at || eventTimestamp || this._getCurrentTimestamp();
    const existing = this.getTaskById(data.id);
    if (existing && this._compareTimestamps(existing.updated_at, deletedAt) > 0) return existing;
    const tombstone = this.recordTaskDeletion(data.id, deletedAt);
    this.deleteTask(data.id);
    return tombstone;
  }

  _upsertSubTask(data) {
    const existing = this.getSubTaskById(data.id);
    if (existing) {
      return this.updateSubTask(data);
    } else {
      return this.createSubTask(data);
    }
  }

  _upsertComment(data) {
    const existing = this.db.prepare('SELECT id FROM comments WHERE id = ?').get(data.id);
    if (!existing) {
      // Strip joined fields before inserting
      this.db.prepare(`
        INSERT INTO comments (id, task_id, author_id, body, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(data.id, data.task_id, data.author_id, data.body, data.created_at);
    }
  }

  _upsertProject(data) {
    return this._asSyncReplay(() => {
      const existing = this.getProjectById(data.id);
      return existing ? this.updateProject(data) : this.createProject(data);
    });
  }

  _upsertPTO(data) {
    return this.setPTODates(data);
  }

  _upsertBusinessRole(data) {
    const existing = this.getBusinessRoleById(data.id);
    if (existing) {
      return this.updateBusinessRole(data);
    } else {
      return this.createBusinessRole(data);
    }
  }

  _upsertCustomPriority(data) {
    const existing = this.getCustomPriorityById(data.id);
    if (existing) {
      return this.updateCustomPriority(data);
    } else {
      return this.createCustomPriority(data);
    }
  }

  _applyGlobalSetting(data) {
    if (!data || !data.key) return null;
    return this.setGlobalSetting(data.key, data.value);
  }

  _applyRollover(data) {
    this.performWeeklyRollover(data?.week || null);
    if (data.week) this.setLastRolloverWeek(data.week);
  }

  applyRolloverPublication(data = {}) {
    const transaction = this.db.transaction(() => {
      if (!data.publicationId) throw new Error('Rollover publication is missing its publication ID');
      const applied = this.db.prepare('SELECT 1 FROM applied_rollover_publications WHERE publication_id = ?').get(data.publicationId);
      if (applied) return { applied: false, duplicate: true, conflicts: [] };

      const conflicts = [];
      for (const taskId of data.deletedTaskIds || []) {
        const existing = this.getTaskById(taskId);
        const baseUpdatedAt = data.baseTaskUpdatedAt?.[taskId];
        if (existing && baseUpdatedAt && this._compareTimestamps(existing.updated_at, baseUpdatedAt) > 0) {
          conflicts.push(taskId);
          continue;
        }
        this.recordTaskDeletion(taskId, data.publishedAt || this._getCurrentTimestamp());
        this.deleteTask(taskId);
      }
      for (const task of data.tasks || []) {
        const existing = this.getTaskById(task.id);
        const baseUpdatedAt = data.baseTaskUpdatedAt?.[task.id];
        if (existing && baseUpdatedAt && this._compareTimestamps(existing.updated_at, baseUpdatedAt) > 0) {
          conflicts.push(task.id);
          continue;
        }
        this._upsertTask(task);
      }
      if (data.clearPTO === true) this.db.exec('DELETE FROM staff_pto_dates');
      if (data.week) this.setLastRolloverWeek(data.week);
      this.db.prepare('INSERT INTO applied_rollover_publications (publication_id) VALUES (?)').run(data.publicationId);
      return { applied: true, duplicate: false, conflicts };
    });
    return transaction();
  }
}

module.exports = Database;
