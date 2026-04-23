const BetterSqlite3 = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class Database {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  initialize() {
    this.db = new BetterSqlite3(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._migrate();
  }

  close() {
    if (this.db) {
      this.optimizeStorage();
      this.db.close();
    }
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

  // ── Schema Migrations ──────────────────────────────────

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    const version = this._getMetaInt('schema_version', 0);

    if (version < 1) {
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
          sort_order    INTEGER NOT NULL DEFAULT 0,
          created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE tasks (
          id            TEXT PRIMARY KEY,
          project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
          assigned_to   TEXT REFERENCES users(id) ON DELETE SET NULL,
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
          completed     INTEGER NOT NULL DEFAULT 0,
          assigned_to   TEXT REFERENCES users(id) ON DELETE SET NULL,
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

      this._setMeta('schema_version', '1');
    }

    if (version < 2) {
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
      const cols = this.db.pragma('table_info(users)').map(c => c.name);
      if (!cols.includes('first_name')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''`);
      }
      if (!cols.includes('last_name')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''`);
      }
      if (!cols.includes('business_role_id')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN business_role_id TEXT REFERENCES business_roles(id) ON DELETE SET NULL`);
      }
      if (!cols.includes('is_admin')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
      }
      if (!cols.includes('windows_username')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN windows_username TEXT`);
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

      this._setMeta('schema_version', '2');
    }

    if (version < 3) {
      // Add confirmed flag and partner_id to tasks for weekly rollover and partner assignment
      const taskCols = this.db.pragma('table_info(tasks)').map(c => c.name);
      if (!taskCols.includes('confirmed')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 1`);
      }
      if (!taskCols.includes('partner_id')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN partner_id TEXT REFERENCES users(id) ON DELETE SET NULL`);
      }
      this._setMeta('schema_version', '3');
    }

    if (version < 4) {
      // Add priority_label column for custom priority display text (e.g. "cp:OG")
      const taskCols = this.db.pragma('table_info(tasks)').map(c => c.name);
      if (!taskCols.includes('priority_label')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN priority_label TEXT`);
      }

      // Add category column to projects: 'current' or 'future' (which tab it appears in)
      const projCols = this.db.pragma('table_info(projects)').map(c => c.name);
      if (!projCols.includes('category')) {
        this.db.exec(`ALTER TABLE projects ADD COLUMN category TEXT NOT NULL DEFAULT 'current'`);
        // Migrate existing "future" status projects: set category=future, status=active
        this.db.exec(`UPDATE projects SET category = 'future', status = 'active' WHERE status = 'future'`);
      }

      this._setMeta('schema_version', '4');
    }

    if (version < 5) {
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
      this._setMeta('schema_version', '5');
    }

    if (version < 6) {
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
      this._setMeta('schema_version', '6');
    }

    if (version < 7) {
      // Add category column to tasks: 'current' or 'last_week'
      const taskCols7 = this.db.pragma('table_info(tasks)').map(c => c.name);
      if (!taskCols7.includes('category')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'current'`);
      }
      this._setMeta('schema_version', '7');
    }

    if (version < 8) {
      this.db.exec(`
        PRAGMA foreign_keys = OFF;

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

        PRAGMA foreign_keys = ON;
      `);

      this._setMeta('schema_version', '8');
    }

    if (version < 9) {
      const projectCols = this.db.pragma('table_info(projects)').map(c => c.name);
      if (!projectCols.includes('partner_ids')) {
        this.db.exec(`ALTER TABLE projects ADD COLUMN partner_ids TEXT NOT NULL DEFAULT '[]'`);
      }
      if (!projectCols.includes('partner_initials')) {
        this.db.exec(`ALTER TABLE projects ADD COLUMN partner_initials TEXT NOT NULL DEFAULT ''`);
      }
      this._setMeta('schema_version', '9');
    }

    if (version < 10) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sync_processed_events (
          filename     TEXT PRIMARY KEY,
          processed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      this._setMeta('schema_version', '10');
    }

    if (version < 11) {
      const userCols = this.db.pragma('table_info(users)').map(c => c.name);
      if (!userCols.includes('can_self_assign')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN can_self_assign INTEGER NOT NULL DEFAULT 0`);
      }
      this._setMeta('schema_version', '11');
    }

    if (version < 12) {
      const projectCols = this.db.pragma('table_info(projects)').map(c => c.name);
      if (!projectCols.includes('folder_link')) {
        this.db.exec(`ALTER TABLE projects ADD COLUMN folder_link TEXT NOT NULL DEFAULT ''`);
      }

      const taskCols = this.db.pragma('table_info(tasks)').map(c => c.name);
      if (!taskCols.includes('status')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'not_started'`);
        this.db.exec(`UPDATE tasks SET status = CASE WHEN completed = 1 THEN 'complete' ELSE 'not_started' END WHERE status IS NULL OR TRIM(status) = ''`);
      }

      this._setMeta('schema_version', '12');
    }

    if (version < 13) {
      const projectNoteCols = this.db.pragma('table_info(project_notes)').map(c => c.name);
      if (!projectNoteCols.includes('title')) {
        this.db.exec(`ALTER TABLE project_notes ADD COLUMN title TEXT NOT NULL DEFAULT 'General'`);
      }
      if (!projectNoteCols.includes('created_by')) {
        this.db.exec(`ALTER TABLE project_notes ADD COLUMN created_by TEXT`);
      }
      if (!projectNoteCols.includes('created_at')) {
        this.db.exec(`ALTER TABLE project_notes ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))`);
      }

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
      this._setMeta('schema_version', '13');
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
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
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

  cleanupProcessedSyncFiles(cutoffStr) {
    this.db.prepare('DELETE FROM sync_processed_events WHERE filename < ?').run(cutoffStr);
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
          WHERE priority = -2 AND priority_label = ?
        `).run(`cp:${nextLabel}`, `cp:${existing.label}`);
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
        SET priority = 0,
            priority_label = NULL,
            updated_at = datetime('now')
        WHERE priority = -2 AND priority_label = ?
      `).run(`cp:${existing.label}`);

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
    const avatarColors = ['#5856A6', '#3D8A6E', '#A8803F', '#5478A3', '#A65C5C', '#7E5FA6', '#3D8A9E'];
    const color = data.avatar_color || avatarColors[Math.floor(Math.random() * avatarColors.length)];
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
      INSERT INTO users (id, username, display_name, role, avatar_color, sort_order, first_name, last_name, business_role_id, is_admin, windows_username, can_self_assign)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, username, displayName, data.role, color, data.sort_order ?? maxOrder + 1,
      firstName, lastName, data.business_role_id || null, isAdmin, windowsUsername, data.can_self_assign ? 1 : 0
    );

    return this.getUserById(id);
  }

  updateUser(data) {
    const fields = [];
    const values = [];
    for (const key of ['display_name', 'role', 'avatar_color', 'sort_order', 'active', 'username', 'first_name', 'last_name', 'business_role_id', 'is_admin', 'windows_username', 'can_self_assign']) {
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

  createTask(data) {
    const id = data.id || uuidv4();
    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) as m FROM tasks WHERE assigned_to = ?'
    ).get(data.assigned_to || null)?.m || 0;

    this.db.prepare(`
      INSERT INTO tasks (id, project_id, assigned_to, created_by, title, notes, priority, priority_label, due_date, sort_order, confirmed, partner_id, category, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.project_id || null,
      data.assigned_to || null,
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
      data.status || (data.completed ? 'complete' : 'not_started')
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
    if (fields.length === 0) return this.getTaskById(data.id);
    fields.push("updated_at = datetime('now')");
    values.push(data.id);
    this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getTaskById(data.id);
  }

  deleteTask(id) {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
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
    const id = data.id || uuidv4();
    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) as m FROM sub_tasks WHERE task_id = ?'
    ).get(data.task_id).m;

    this.db.prepare(`
      INSERT INTO sub_tasks (id, task_id, title, assigned_to, created_by, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.task_id, data.title || '', data.assigned_to || null, data.created_by || null, maxOrder + 1);

    return this.getSubTaskById(id);
  }

  updateSubTask(data) {
    const fields = [];
    const values = [];
    for (const key of ['title', 'completed', 'assigned_to', 'sort_order']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
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

  createProject(data) {
    const id = data.id || uuidv4();
    const maxOrder = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM projects').get().m;
    const partnerData = this._normalizeProjectPartnerFields(data);

    this.db.prepare(`
      INSERT INTO projects (id, client, name, status, category, notes, partner_id, partner_ids, partner_initials, folder_link, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.folder_link || '',
      data.sort_order ?? maxOrder + 1
    );

    return this.getProjectById(id);
  }

  updateProject(data) {
    const fields = [];
    const values = [];
    const partnerData = this._normalizeProjectPartnerFields(data);
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
      // Move all tasks into carry-over review state for the new week.
      // Keep due dates only if they land in the new week or later.
      this.db.prepare(`
        UPDATE tasks
        SET category = 'last_week',
            confirmed = 0,
            priority = CASE
              WHEN priority = -2 THEN priority
              ELSE 0
            END,
            priority_label = CASE
              WHEN priority = -2 THEN priority_label
              ELSE NULL
            END,
            due_date = CASE
              WHEN ? IS NOT NULL AND due_date IS NOT NULL AND date(due_date) >= date(?) THEN due_date
              WHEN ? IS NULL THEN due_date
              ELSE NULL
            END
      `).run(weekStr, weekStr, weekStr);
      // Clear all PTO dates
      this.db.exec(`DELETE FROM staff_pto_dates`);
    });
    transaction();
  }

  confirmTask(taskId) {
    this.db.prepare(`
      UPDATE tasks
      SET confirmed = 1,
          completed = 0,
          priority = CASE
            WHEN priority = -2 THEN priority
            ELSE 0
          END,
          priority_label = CASE
            WHEN priority = -2 THEN priority_label
            ELSE NULL
          END,
          category = 'current',
          created_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(taskId);
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
      case 'task-created':    return this._upsertTask(event.data);
      case 'task-updated':    return this._upsertTask(event.data);
      case 'task-deleted':    return this.deleteTask(event.data.id);
      case 'tasks-reordered': return this.reorderTasks(event.data);
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
      case 'pto-cleared':     return this.clearPTO(event.data.user_id);
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
      case 'task-confirmed':    return this.confirmTask(event.data.id);
      default:
        console.warn('Unknown event type:', event.type);
    }
  }

  _upsertUser(data) {
    const existing = this.getUserById(data.id);
    if (existing) {
      return this.updateUser(data);
    } else {
      return this.createUser(data);
    }
  }

  _upsertTask(data) {
    const existing = this.getTaskById(data.id);
    if (existing) {
      return this.updateTask(data);
    } else {
      return this.createTask(data);
    }
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
    const existing = this.getProjectById(data.id);
    if (existing) {
      return this.updateProject(data);
    } else {
      return this.createProject(data);
    }
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
}

module.exports = Database;
