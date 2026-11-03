const { app, BrowserWindow, ipcMain, dialog, Menu, Notification, Tray, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('./database');
const Auth = require('./auth');
const { createLogger } = require('./logger');

let mainWindow = null;
const projectNotesWindows = new Map();
let db = null;
let sync = null;
let auth = null;
let tray = null;
let isQuitting = false;
let hasShownTrayHint = false;
let updateManager = null;
let currentWindowMode = 'login';
let saveWindowBoundsTimer = null;
let saveProjectNotesWindowBoundsTimer = null;
let mobileSyncTimer = null;
let mobileSnapshotTimer = null;
let logger = null;
let runtimeStatus = {
  lastSyncAt: null,
  startupIssue: null,
  mobileSync: {
    lastSnapshotAt: null,
    lastImportAt: null,
    lastError: null,
  },
};

const LOGIN_WINDOW_BOUNDS = {
  width: 500,
  height: 600,
  minWidth: 500,
  minHeight: 560,
};

const PARTNER_APP_WINDOW_BOUNDS = {
  width: 1000,
  height: 800,
  minWidth: 900,
  minHeight: 600,
};

const STAFF_APP_WINDOW_BOUNDS = {
  width: 700,
  height: 800,
  minWidth: 700,
  minHeight: 600,
};

const PROJECT_NOTES_WINDOW_BOUNDS = {
  width: 940,
  height: 680,
  minWidth: 720,
  minHeight: 520,
};

const APP_ID = 'com.studiosync.personal';
const APP_NAME = 'StudioSync Personal';
const PERSONAL_USERNAME = 'personal';
const PERSONAL_USER_ID = 'personal-user';
const ENV_APP_DATA_DIR = 'STUDIOSYNC_PERSONAL_DATA_DIR';
const MOBILE_SYNC_SNAPSHOT_FILE = 'snapshot.json';
const MOBILE_SYNC_EVENTS_DIR = 'mobile-events';
const MOBILE_SYNC_PROCESSED_DIR = 'mobile-events-processed';
const MOBILE_SYNC_POLL_MS = 15000;

function getPortableExecutablePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || null;
}

function getPortableExecutableDir() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) return portableDir;

  const portablePath = getPortableExecutablePath();
  return portablePath ? path.dirname(portablePath) : null;
}

function isPortableBuild() {
  return Boolean(getPortableExecutableDir());
}

function getExecutableDir() {
  return getPortableExecutableDir() || path.dirname(app.getPath('exe'));
}

function getPortableDataDir() {
  const portablePath = getPortableExecutablePath();
  const portableDir = getPortableExecutableDir();
  if (!portableDir) return null;

  const baseName = portablePath
    ? path.basename(portablePath, path.extname(portablePath))
    : `${APP_NAME} Portable`;
  return path.join(portableDir, `${baseName} Data`);
}

function isWinUnpackedBuild() {
  return app.isPackaged && path.basename(getExecutableDir()).toLowerCase() === 'win-unpacked';
}

function getLegacyPackagedDataDir() {
  return path.join(getExecutableDir(), 'data');
}

function getAppDataDir() {
  const overrideDir = process.env[ENV_APP_DATA_DIR];
  if (overrideDir && String(overrideDir).trim()) {
    return path.resolve(String(overrideDir).trim());
  }

  if (!app.isPackaged) {
    return path.join(__dirname, '..', 'data');
  }

  if (isPortableBuild()) {
    return getPortableDataDir();
  }

  if (isWinUnpackedBuild()) {
    return getLegacyPackagedDataDir();
  }

  const installDir = getExecutableDir();
  const installParent = path.dirname(installDir);
  return path.join(installParent, `${path.basename(installDir)} Data`);
}

function copyDirRecursive(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function ensureAppDataDir() {
  const appDataDir = getAppDataDir();
  fs.mkdirSync(appDataDir, { recursive: true });

  if (app.isPackaged && !isWinUnpackedBuild() && !isPortableBuild()) {
    const legacyDir = getLegacyPackagedDataDir();
    const hasLegacyData = fs.existsSync(legacyDir);
    const hasCurrentData =
      fs.existsSync(path.join(appDataDir, 'config.json')) ||
      fs.existsSync(path.join(appDataDir, 'local.db'));

    if (hasLegacyData && !hasCurrentData) {
      try {
        fs.renameSync(legacyDir, appDataDir);
      } catch (_) {
        copyDirRecursive(legacyDir, appDataDir);
      }
    }
  }

  return appDataDir;
}

const APP_DATA_DIR = ensureAppDataDir();
logger = createLogger({ appDataDir: APP_DATA_DIR, appName: 'sd-personal' });
logger.attachConsole();
logger.attachProcessHandlers();

// ── Config ─────────────────────────────────────────────

function getConfigPath() {
  return path.join(APP_DATA_DIR, 'config.json');
}

function loadConfig() {
  const configPath = getConfigPath();
  let config = null;

  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  const normalizedConfig = {
    ...(config || {}),
    launchOnStartup: config?.launchOnStartup !== false,
  };

  return normalizedConfig;
}

function saveConfig(config) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  const normalizedConfig = {
    ...(config || {}),
    launchOnStartup: config?.launchOnStartup !== false,
  };
  fs.writeFileSync(getConfigPath(), JSON.stringify(normalizedConfig, null, 2));
}

function getLaunchOnStartupPreference(config = null) {
  const resolvedConfig = config || loadConfig() || {};
  return resolvedConfig.launchOnStartup !== false;
}

function applyLaunchOnStartupPreference(enabled, options = {}) {
  const nextEnabled = Boolean(enabled);
  const { persist = true } = options;

  if (persist) {
    const config = loadConfig() || {};
    config.launchOnStartup = nextEnabled;
    saveConfig(config);
  }

  const supported = process.platform === 'win32';
  if (supported && app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: nextEnabled,
      path: process.execPath,
    });
  }

  return getLaunchOnStartupState();
}

function getLaunchOnStartupState() {
  const config = loadConfig() || {};
  const configured = getLaunchOnStartupPreference(config);
  const supported = process.platform === 'win32';
  let enabled = configured;

  if (supported && app.isPackaged) {
    try {
      enabled = Boolean(app.getLoginItemSettings({ path: process.execPath }).openAtLogin);
    } catch (_) {
      enabled = configured;
    }
  }

  return {
    supported,
    configured,
    enabled,
    manageable: supported,
  };
}

function inspectSharedDrivePath(selectedPath) {
  if (!selectedPath) {
    return { valid: false, resolvedPath: null, reason: 'No folder selected.' };
  }

  const directEvents = path.join(selectedPath, 'events');
  const directSnapshots = path.join(selectedPath, 'snapshots');
  const directDb = path.join(selectedPath, 'local.db');
  if (fs.existsSync(directEvents) || fs.existsSync(directSnapshots) || fs.existsSync(directDb)) {
    return { valid: true, resolvedPath: selectedPath };
  }

  const nestedDataPath = path.join(selectedPath, 'data');
  const nestedEvents = path.join(nestedDataPath, 'events');
  const nestedSnapshots = path.join(nestedDataPath, 'snapshots');
  const nestedDb = path.join(nestedDataPath, 'local.db');
  if (fs.existsSync(nestedEvents) || fs.existsSync(nestedSnapshots) || fs.existsSync(nestedDb)) {
    return { valid: true, resolvedPath: nestedDataPath };
  }

  return {
    valid: false,
    resolvedPath: null,
    reason: 'Select the StudioSync folder or its data folder.'
  };
}

function getLocalDbPath() {
  return path.join(APP_DATA_DIR, 'local.db');
}

function getOrCreateDeviceId(config = null) {
  const resolvedConfig = config || loadConfig() || {};
  if (resolvedConfig.deviceId) return resolvedConfig.deviceId;
  resolvedConfig.deviceId = `desktop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  saveConfig(resolvedConfig);
  return resolvedConfig.deviceId;
}

function getMobileSyncFolderPath(config = null) {
  const resolvedConfig = config || loadConfig() || {};
  const folderPath = String(resolvedConfig.mobileSyncFolderPath || '').trim();
  return folderPath ? path.resolve(folderPath) : null;
}

function getMobileSyncPaths(config = null) {
  const folderPath = getMobileSyncFolderPath(config);
  if (!folderPath) return null;
  return {
    folderPath,
    snapshotPath: path.join(folderPath, MOBILE_SYNC_SNAPSHOT_FILE),
    eventsPath: path.join(folderPath, MOBILE_SYNC_EVENTS_DIR),
    processedPath: path.join(folderPath, MOBILE_SYNC_PROCESSED_DIR),
  };
}

function ensureMobileSyncDirectories(paths) {
  if (!paths) return false;
  fs.mkdirSync(paths.folderPath, { recursive: true });
  fs.mkdirSync(paths.eventsPath, { recursive: true });
  fs.mkdirSync(paths.processedPath, { recursive: true });
  return true;
}

function buildMobileSnapshot() {
  if (!db || !auth) return null;
  const user = auth.getCurrentUser();
  if (!user) return null;

  const tasks = db.getPrivateTasks(user.id);
  const projects = db.getProjects();
  const projectNotes = db.getAllProjectSharedNotes();
  const generatedAt = new Date().toISOString();
  const config = loadConfig() || {};

  return {
    schemaVersion: 1,
    app: APP_NAME,
    generatedAt,
    deviceId: getOrCreateDeviceId(config),
    user: {
      id: user.id,
      displayName: user.display_name,
      avatarColor: user.avatar_color,
    },
    counts: {
      tasks: tasks.length,
      pending: tasks.filter((task) => !task.completed).length,
      completed: tasks.filter((task) => task.completed).length,
      projects: projects.length,
    },
    tasks: tasks.map((task) => ({
      id: task.id,
      projectId: task.project_id || null,
      title: task.title || '',
      notes: task.notes || '',
      priority: Number(task.priority) || 0,
      dueDate: task.due_date || null,
      completed: task.completed ? 1 : 0,
      sortOrder: Number(task.sort_order) || 0,
      createdAt: task.created_at || null,
    })),
    projects: projects.map((project) => ({
      id: project.id,
      client: project.client || '',
      name: project.name || '',
      status: project.status || 'active',
      category: project.category || 'current',
      notes: project.notes || '',
      folderLink: project.folder_link || '',
    })),
    projectNotes: projectNotes.map((note) => ({
      id: note.id,
      projectId: note.project_id,
      title: note.title || 'Untitled Note',
      notes: note.notes || '',
      updatedAt: note.updated_at || null,
    })),
    mobileEventsPath: MOBILE_SYNC_EVENTS_DIR,
  };
}

function writeMobileSnapshotNow() {
  const paths = getMobileSyncPaths();
  if (!paths || !db || !auth) return { enabled: false };

  try {
    ensureMobileSyncDirectories(paths);
    const snapshot = buildMobileSnapshot();
    if (!snapshot) return { enabled: true, written: false };

    const tempPath = `${paths.snapshotPath}.tmp-${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2), 'utf-8');
    fs.renameSync(tempPath, paths.snapshotPath);

    runtimeStatus.mobileSync.lastSnapshotAt = snapshot.generatedAt;
    runtimeStatus.mobileSync.lastError = null;
    emitRuntimeStatus();
    return { enabled: true, written: true, snapshotPath: paths.snapshotPath };
  } catch (err) {
    runtimeStatus.mobileSync.lastError = err.message;
    emitRuntimeStatus();
    logger?.warn('mobile-sync-snapshot-failed', { error: err.message });
    return { enabled: true, written: false, error: err.message };
  }
}

function scheduleMobileSnapshotWrite() {
  if (!getMobileSyncFolderPath()) return;
  clearTimeout(mobileSnapshotTimer);
  mobileSnapshotTimer = setTimeout(() => {
    mobileSnapshotTimer = null;
    writeMobileSnapshotNow();
  }, 250);
}

function archiveMobileEvent(paths, filename, status) {
  const sourcePath = path.join(paths.eventsPath, filename);
  const safeStatus = status === 'invalid' ? 'invalid' : 'processed';
  const targetPath = path.join(paths.processedPath, `${filename}.${safeStatus}`);
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (_) {
    try {
      fs.unlinkSync(sourcePath);
    } catch (_) {}
  }
}

function applyMobileEvent(event) {
  if (!event || typeof event !== 'object') return false;
  const type = String(event.type || '').trim();
  if (!['task-completed', 'task-completion-updated'].includes(type)) return false;

  const taskId = String(event.taskId || event.task_id || '').trim();
  if (!taskId) return false;

  const completed = event.completed === undefined ? true : Boolean(event.completed);
  const existing = db.getPrivateTaskById(taskId);
  if (!existing) return false;

  db.updatePrivateTask({ id: taskId, completed: completed ? 1 : 0 });
  return true;
}

function importMobileEventsNow() {
  const paths = getMobileSyncPaths();
  if (!paths || !db || !auth) return { enabled: false, applied: 0 };

  try {
    ensureMobileSyncDirectories(paths);
    const files = fs.readdirSync(paths.eventsPath)
      .filter((file) => file.toLowerCase().endsWith('.json'))
      .sort((left, right) => left.localeCompare(right));

    let applied = 0;
    for (const file of files) {
      const filePath = path.join(paths.eventsPath, file);
      try {
        const event = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (applyMobileEvent(event)) applied += 1;
        archiveMobileEvent(paths, file, 'processed');
      } catch (err) {
        archiveMobileEvent(paths, file, 'invalid');
        logger?.warn('mobile-sync-event-invalid', { file, error: err.message });
      }
    }

    if (applied > 0) {
      runtimeStatus.mobileSync.lastImportAt = new Date().toISOString();
      runtimeStatus.mobileSync.lastError = null;
      notifyDataChanged();
      writeMobileSnapshotNow();
    }

    emitRuntimeStatus();
    return { enabled: true, applied };
  } catch (err) {
    runtimeStatus.mobileSync.lastError = err.message;
    emitRuntimeStatus();
    logger?.warn('mobile-sync-import-failed', { error: err.message });
    return { enabled: true, applied: 0, error: err.message };
  }
}

function startMobileSyncPolling() {
  if (mobileSyncTimer) {
    clearInterval(mobileSyncTimer);
    mobileSyncTimer = null;
  }

  if (!getMobileSyncFolderPath()) {
    emitRuntimeStatus();
    return;
  }

  writeMobileSnapshotNow();
  importMobileEventsNow();
  mobileSyncTimer = setInterval(() => importMobileEventsNow(), MOBILE_SYNC_POLL_MS);
  emitRuntimeStatus();
}

function ensurePersonalRuntime() {
  if (!db) {
    db = new Database(getLocalDbPath());
    db.initialize();
  }

  const existingPersonalUser = db.getUserByUsername(PERSONAL_USERNAME);
  let personalUser = existingPersonalUser || db.getUsers()[0] || null;

  if (!personalUser) {
    personalUser = db.createUser({
      id: PERSONAL_USER_ID,
      username: PERSONAL_USERNAME,
      windows_username: PERSONAL_USERNAME,
      display_name: 'Personal',
      first_name: 'Personal',
      last_name: '',
      role: 'partner',
      is_admin: 1,
      can_self_assign: 1,
      avatar_color: '#3D8A6E',
    });
  }

  if (!auth) auth = new Auth(db);
  auth.setUsername(personalUser.username || PERSONAL_USERNAME);

  const config = loadConfig() || {};
  config.loggedInUsername = personalUser.username || PERSONAL_USERNAME;
  saveConfig(config);

  runtimeStatus.startupIssue = null;
  markSyncActivity();
  return personalUser;
}

function closeRuntime() {
  if (mobileSyncTimer) {
    clearInterval(mobileSyncTimer);
    mobileSyncTimer = null;
  }
  if (mobileSnapshotTimer) {
    clearTimeout(mobileSnapshotTimer);
    mobileSnapshotTimer = null;
  }
  if (db) {
    db.close();
    db = null;
  }
  auth = null;
  runtimeStatus.lastSyncAt = null;
}

function resetLocalCache() {
  closeRuntime();

  for (const suffix of ['', '-wal', '-shm']) {
    const filePath = getLocalDbPath() + suffix;
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {}
  }
}


// ── Data Change Notification ───────────────────────────

function notifyDataChanged() {
  if (mainWindow) mainWindow.webContents.send('data-updated');
  for (const notesWindow of projectNotesWindows.values()) {
    if (!notesWindow.isDestroyed()) notesWindow.webContents.send('data-updated');
  }
  scheduleMobileSnapshotWrite();
}

function getAuthEntryState() {
  if (!auth?.getCurrentUser?.()) {
    ensurePersonalRuntime();
  }

  if (auth?.getCurrentUser?.()) {
    return {
      screen: 'app',
      title: '',
      subtitle: '',
      error: '',
      reason: 'user-signed-in',
    };
  }

  return {
    screen: 'login',
    title: 'Starting',
    subtitle: 'Preparing your personal workspace.',
    error: runtimeStatus.startupIssue?.reason || '',
    reason: 'personal-runtime-unavailable',
  };
}

function getPriorityDisplayStyles() {
  if (!db) return {};

  const rawValue = db.getGlobalSetting('priority_display_styles');
  if (!rawValue) return {};

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function getPriorityMenuOrder() {
  if (!db) return [];

  const rawValue = db.getGlobalSetting('priority_menu_order');
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.trim()) : [];
  } catch (_) {
    return [];
  }
}

function emitUpdatePrompt(result) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-available', result);
  }
}

function emitWindowState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window-state-changed', {
      isMaximized: mainWindow.isMaximized(),
    });
  }
}

function getRuntimeStatus() {
  const authEntry = getAuthEntryState();
  const mobilePaths = getMobileSyncPaths();

  return {
    appVersion: app.getVersion(),
    localMode: true,
    dataPath: APP_DATA_DIR,
    sharedDrivePath: null,
    sharedDriveReachable: false,
    sharedDriveValid: false,
    lastSyncAt: runtimeStatus.lastSyncAt,
    updateAvailable: false,
    latestVersion: null,
    mobileSync: {
      enabled: Boolean(mobilePaths),
      folderPath: mobilePaths?.folderPath || null,
      snapshotPath: mobilePaths?.snapshotPath || null,
      eventsPath: mobilePaths?.eventsPath || null,
      processedPath: mobilePaths?.processedPath || null,
      lastSnapshotAt: runtimeStatus.mobileSync.lastSnapshotAt,
      lastImportAt: runtimeStatus.mobileSync.lastImportAt,
      lastError: runtimeStatus.mobileSync.lastError,
    },
    launchOnStartup: getLaunchOnStartupState(),
    startupIssue: runtimeStatus.startupIssue || null,
    authEntry,
  };
}

function emitRuntimeStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('runtime-status-changed', getRuntimeStatus());
  }
}

async function openExternalTarget(rawValue) {
  const target = String(rawValue || '').trim();
  if (!target) return { success: false, error: 'No link provided.' };

  const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(target) || /^\\\\/.test(target);
  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(target);

  try {
    if (!isWindowsPath && hasProtocol) {
      await shell.openExternal(target);
    } else {
      const result = await shell.openPath(target);
      if (result) return { success: false, error: result };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function markSyncActivity() {
  runtimeStatus.lastSyncAt = new Date().toISOString();
  emitRuntimeStatus();
}

function getTrayIconPath() {
  return path.join(__dirname, '..', 'assets', 'studiosync-mytasks.ico');
}

function getCurrentAppWindowRole() {
  return 'personal';
}

function getSavedAppWindowBounds(role, defaults) {
  const config = loadConfig() || {};
  const savedBounds = config.appWindowBoundsByRole?.[role];
  if (!savedBounds) return null;

  const x = Math.round(Number(savedBounds.x));
  const y = Math.round(Number(savedBounds.y));
  const width = Math.max(defaults.minWidth, Math.round(Number(savedBounds.width)));
  const height = Math.max(defaults.minHeight, Math.round(Number(savedBounds.height)));

  if (![x, y, width, height].every(Number.isFinite)) return null;

  const targetBounds = { x, y, width, height };
  const display = screen.getDisplayMatching(targetBounds);
  const workArea = display?.workArea;
  if (!workArea) return null;

  const visibleWidth = Math.min(x + width, workArea.x + workArea.width) - Math.max(x, workArea.x);
  const visibleHeight = Math.min(y + height, workArea.y + workArea.height) - Math.max(y, workArea.y);
  if (visibleWidth < 120 || visibleHeight < 120) return null;

  return {
    ...targetBounds,
    minWidth: defaults.minWidth,
    minHeight: defaults.minHeight,
  };
}

function scheduleSaveCurrentAppWindowBounds() {
  if (currentWindowMode !== 'app') return;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;

  clearTimeout(saveWindowBoundsTimer);
  saveWindowBoundsTimer = setTimeout(() => {
    saveWindowBoundsTimer = null;
    saveCurrentAppWindowBounds();
  }, 200);
}

function saveCurrentAppWindowBounds() {
  if (currentWindowMode !== 'app') return;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;

  const role = getCurrentAppWindowRole();
  const bounds = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds();
  const config = loadConfig() || {};
  config.appWindowBoundsByRole = config.appWindowBoundsByRole || {};
  config.appWindowBoundsByRole[role] = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
  saveConfig(config);
}

function isWindowBoundsVisible(bounds, minVisibleSize = 120) {
  if (!bounds) return false;
  const x = Math.round(Number(bounds.x));
  const y = Math.round(Number(bounds.y));
  const width = Math.round(Number(bounds.width));
  const height = Math.round(Number(bounds.height));
  if (![x, y, width, height].every(Number.isFinite)) return false;

  const targetBounds = { x, y, width, height };
  const display = screen.getDisplayMatching(targetBounds);
  const workArea = display?.workArea;
  if (!workArea) return false;

  const visibleWidth = Math.min(x + width, workArea.x + workArea.width) - Math.max(x, workArea.x);
  const visibleHeight = Math.min(y + height, workArea.y + workArea.height) - Math.max(y, workArea.y);
  return visibleWidth >= minVisibleSize && visibleHeight >= minVisibleSize;
}

function clampBoundsToWorkArea(bounds, workArea, defaults) {
  const width = Math.min(Math.max(Math.round(Number(bounds.width)) || defaults.width, defaults.minWidth), workArea.width);
  const height = Math.min(Math.max(Math.round(Number(bounds.height)) || defaults.height, defaults.minHeight), workArea.height);
  const x = Math.min(
    Math.max(Math.round(Number(bounds.x)) || workArea.x, workArea.x),
    workArea.x + workArea.width - width
  );
  const y = Math.min(
    Math.max(Math.round(Number(bounds.y)) || workArea.y, workArea.y),
    workArea.y + workArea.height - height
  );

  return { x, y, width, height };
}

function getDefaultProjectNotesWindowBounds() {
  const sourceBounds = mainWindow && !mainWindow.isDestroyed()
    ? (mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds())
    : null;
  const display = sourceBounds
    ? screen.getDisplayMatching(sourceBounds)
    : screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const width = Math.min(PROJECT_NOTES_WINDOW_BOUNDS.width, workArea.width);
  const height = Math.min(PROJECT_NOTES_WINDOW_BOUNDS.height, workArea.height);
  const sourceCenterX = sourceBounds ? sourceBounds.x + (sourceBounds.width / 2) : workArea.x + (workArea.width / 2);
  const sourceCenterY = sourceBounds ? sourceBounds.y + (sourceBounds.height / 2) : workArea.y + (workArea.height / 2);

  return clampBoundsToWorkArea({
    x: Math.round(sourceCenterX - (width / 2) + 32),
    y: Math.round(sourceCenterY - (height / 2) + 32),
    width,
    height,
  }, workArea, PROJECT_NOTES_WINDOW_BOUNDS);
}

function getSavedProjectNotesWindowBounds() {
  const config = loadConfig() || {};
  const savedBounds = config.projectNotesWindowBounds;
  if (!savedBounds || !isWindowBoundsVisible(savedBounds, 160)) return null;

  const display = screen.getDisplayMatching(savedBounds);
  return clampBoundsToWorkArea(savedBounds, display.workArea, PROJECT_NOTES_WINDOW_BOUNDS);
}

function getProjectNotesWindowBounds() {
  return getSavedProjectNotesWindowBounds() || getDefaultProjectNotesWindowBounds();
}

function scheduleSaveProjectNotesWindowBounds(notesWindow) {
  if (!notesWindow || notesWindow.isDestroyed() || notesWindow.isMinimized() || notesWindow.isFullScreen()) return;

  clearTimeout(saveProjectNotesWindowBoundsTimer);
  saveProjectNotesWindowBoundsTimer = setTimeout(() => {
    saveProjectNotesWindowBoundsTimer = null;
    saveProjectNotesWindowBounds(notesWindow);
  }, 200);
}

function saveProjectNotesWindowBounds(notesWindow) {
  if (!notesWindow || notesWindow.isDestroyed() || notesWindow.isMinimized() || notesWindow.isFullScreen()) return;

  const bounds = notesWindow.isMaximized() ? notesWindow.getNormalBounds() : notesWindow.getBounds();
  if (!isWindowBoundsVisible(bounds, 160)) return;

  const config = loadConfig() || {};
  config.projectNotesWindowBounds = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
  saveConfig(config);
}

function applyWindowBounds(bounds) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }

  mainWindow.setMinimumSize(bounds.minWidth, bounds.minHeight);
  if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
    mainWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }, true);
  } else {
    mainWindow.setSize(bounds.width, bounds.height, true);
    mainWindow.center();
  }
  emitWindowState();
}

function getAppWindowBounds() {
  if (getCurrentAppWindowRole() === 'personal') return STAFF_APP_WINDOW_BOUNDS;
  return getCurrentAppWindowRole() === 'staff'
    ? STAFF_APP_WINDOW_BOUNDS
    : PARTNER_APP_WINDOW_BOUNDS;
}

function setWindowMode(mode) {
  if (mode === 'login') {
    currentWindowMode = 'login';
    applyWindowBounds(LOGIN_WINDOW_BOUNDS);
    return { mode: 'login' };
  }

  currentWindowMode = 'app';
  const defaults = getAppWindowBounds();
  const role = getCurrentAppWindowRole();
  applyWindowBounds(getSavedAppWindowBounds(role, defaults) || defaults);
  return { mode: 'app' };
}

function restoreMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function hideToTray() {
  if (!mainWindow) return;
  mainWindow.hide();

  if (!hasShownTrayHint) {
    hasShownTrayHint = true;
    showWindowsNotification(
      `${APP_NAME} is still running`,
      'The app was closed to the system tray so notifications can keep working.'
    );
  }
}

function showWindowsNotification(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({
    title,
    body,
    silent: false,
  }).show();
}

function getCurrentUserId() {
  if (!auth) return null;
  return auth.getCurrentUser()?.id || null;
}

function getDisplayName(userId) {
  if (!db || !userId) return null;
  return db.getUserById(userId)?.display_name || null;
}

function isTaskRelevantToCurrentUser(task, currentUserId) {
  if (!task || !currentUserId) return false;
  if (task.assigned_to === currentUserId) return true;
  if (!task.project_id || !db) return false;

  return db.getTasks({ project_id: task.project_id }).some((candidate) => candidate.assigned_to === currentUserId);
}

function notifyForTaskEvent(event, actionLabel) {
  const currentUserId = getCurrentUserId();
  if (!currentUserId || !event?.data) return;
  if (event.source === 'scheduling') return;

  const task = db.getTaskById(event.data.id) || event.data;
  if (!task || task.assigned_to !== currentUserId) return;

  showWindowsNotification(
    `${actionLabel}: ${task.title || 'Untitled Task'}`,
    'A task assigned to you was updated.'
  );
}

function notifyForCommentEvent(event) {
  const currentUserId = getCurrentUserId();
  if (!currentUserId || !event?.data) return;

  const comment = event.data;
  const task = db.getTaskById(comment.task_id);
  if (!isTaskRelevantToCurrentUser(task, currentUserId)) return;

  const authorName = getDisplayName(comment.author_id) || event.author || 'Someone';
  const commentPreview = (comment.body || '').replace(/\s+/g, ' ').trim();
  const body = commentPreview
    ? `${authorName}: ${commentPreview.slice(0, 100)}`
    : `${authorName} added a comment.`;

  showWindowsNotification(
    `New Comment: ${task.title || 'Untitled Task'}`,
    body
  );
}

function processIncomingEvents(events = []) {
  for (const event of events) {
    switch (event.type) {
      case 'task-created':
        notifyForTaskEvent(event, 'New Task');
        break;
      case 'task-updated':
        notifyForTaskEvent(event, 'Task Updated');
        break;
      case 'comment-added':
        notifyForCommentEvent(event);
        break;
      default:
        break;
    }
  }
}

async function handlePulledSyncEvents(events = []) {
  if (!Array.isArray(events) || events.length === 0) return [];

  processIncomingEvents(events);
  markSyncActivity();
  notifyDataChanged();
  return events;
}

function createTray() {
  if (tray) return;

  tray = new Tray(getTrayIconPath());
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: `Open ${APP_NAME}`,
      click: () => restoreMainWindow(),
    },
    {
      type: 'separator',
    },
    {
      label: 'Exit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));

  tray.on('double-click', () => restoreMainWindow());
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      restoreMainWindow();
    }
  });
}

// ── Window ─────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: LOGIN_WINDOW_BOUNDS.width,
    height: LOGIN_WINDOW_BOUNDS.height,
    minWidth: LOGIN_WINDOW_BOUNDS.minWidth,
    minHeight: LOGIN_WINDOW_BOUNDS.minHeight,
    title: APP_NAME,
    autoHideMenuBar: true,
    icon: getTrayIconPath(),
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger?.error('renderer-process-gone', details);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    logger?.error('renderer-did-fail-load', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    });
  });

  mainWindow.on('unresponsive', () => {
    logger?.warn('window-unresponsive');
  });

  mainWindow.once('ready-to-show', () => {
    emitWindowState();
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideToTray();
  });

  mainWindow.on('closed', () => {
    clearTimeout(saveWindowBoundsTimer);
    saveWindowBoundsTimer = null;
    mainWindow = null;
  });

  mainWindow.on('maximize', () => emitWindowState());
  mainWindow.on('unmaximize', () => emitWindowState());
  mainWindow.on('enter-full-screen', () => emitWindowState());
  mainWindow.on('leave-full-screen', () => emitWindowState());
  mainWindow.on('move', () => scheduleSaveCurrentAppWindowBounds());
  mainWindow.on('resize', () => scheduleSaveCurrentAppWindowBounds());
}

function openProjectNotesWindow(projectId) {
  const id = String(projectId || '').trim();
  if (!id) return false;

  const existing = projectNotesWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return true;
  }

  const notesBounds = getProjectNotesWindowBounds();
  const notesWindow = new BrowserWindow({
    x: notesBounds.x,
    y: notesBounds.y,
    width: notesBounds.width,
    height: notesBounds.height,
    minWidth: PROJECT_NOTES_WINDOW_BOUNDS.minWidth,
    minHeight: PROJECT_NOTES_WINDOW_BOUNDS.minHeight,
    title: 'Project Notes',
    autoHideMenuBar: true,
    icon: getTrayIconPath(),
    frame: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  projectNotesWindows.set(id, notesWindow);
  notesWindow.loadFile(path.join(__dirname, '..', 'renderer', 'project-notes.html'), {
    query: { projectId: id },
  });

  notesWindow.on('move', () => scheduleSaveProjectNotesWindowBounds(notesWindow));
  notesWindow.on('resize', () => scheduleSaveProjectNotesWindowBounds(notesWindow));

  let isClosingNotesWindow = false;
  notesWindow.on('close', (event) => {
    if (isClosingNotesWindow || notesWindow.webContents.isDestroyed()) return;
    event.preventDefault();
    saveProjectNotesWindowBounds(notesWindow);
    notesWindow.webContents.executeJavaScript('window.ProjectNotesWindow?.flushBeforeClose?.()')
      .catch(() => null)
      .finally(() => {
        isClosingNotesWindow = true;
        notesWindow.close();
      });
  });

  notesWindow.on('closed', () => {
    clearTimeout(saveProjectNotesWindowBoundsTimer);
    saveProjectNotesWindowBoundsTimer = null;
    projectNotesWindows.delete(id);
  });

  return true;
}

// ── IPC Handlers ───────────────────────────────────────

function registerIPC() {
  ipcMain.handle('get-log-paths', () => logger?.getLogPaths() || null);
  ipcMain.handle('write-log', (_e, entry) => {
    const level = String(entry?.level || 'info').toLowerCase();
    const message = entry?.message || entry?.type || 'renderer-log';
    const meta = entry?.meta || entry;

    if (level === 'error') logger?.error(message, meta);
    else if (level === 'warn') logger?.warn(message, meta);
    else if (level === 'debug') logger?.debug(message, meta);
    else logger?.info(message, meta);
    return true;
  });

  // Config
  ipcMain.handle('get-config', () => loadConfig());
  ipcMain.handle('save-config', (_e, config) => {
    saveConfig(config);
    return true;
  });
  ipcMain.handle('get-launch-on-startup', () => getLaunchOnStartupState());
  ipcMain.handle('set-launch-on-startup', (_e, enabled) => {
    const state = applyLaunchOnStartupPreference(enabled);
    emitRuntimeStatus();
    return state;
  });

  ipcMain.handle('check-for-updates', async () => {
    return { updateAvailable: false, error: null };
  });

  ipcMain.handle('get-pending-update', () => {
    return null;
  });

  ipcMain.handle('dismiss-update', (_e, version) => {
    return Boolean(version);
  });

  ipcMain.handle('install-update', async () => {
    return { success: false, error: 'Updates are not configured for personal mode yet.' };
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Shared Drive Folder',
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('select-mobile-sync-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Mobile Sync Folder',
    });
    if (result.canceled || !result.filePaths[0]) return getRuntimeStatus().mobileSync;

    const config = loadConfig() || {};
    config.mobileSyncFolderPath = result.filePaths[0];
    saveConfig(config);
    startMobileSyncPolling();
    return getRuntimeStatus().mobileSync;
  });

  ipcMain.handle('clear-mobile-sync-folder', () => {
    const config = loadConfig() || {};
    delete config.mobileSyncFolderPath;
    saveConfig(config);
    startMobileSyncPolling();
    return getRuntimeStatus().mobileSync;
  });

  ipcMain.handle('open-mobile-sync-folder', async () => {
    const folderPath = getMobileSyncFolderPath();
    if (!folderPath) return { success: false, error: 'No mobile sync folder is configured.' };
    return openExternalTarget(folderPath);
  });

  ipcMain.handle('write-mobile-snapshot', () => writeMobileSnapshotNow());

  ipcMain.handle('import-mobile-events', () => importMobileEventsNow());

  ipcMain.handle('window-minimize', () => {
    if (!mainWindow) return false;
    mainWindow.minimize();
    return true;
  });

  ipcMain.handle('window-toggle-maximize', () => {
    if (!mainWindow) return { isMaximized: false };
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return { isMaximized: mainWindow.isMaximized() };
  });

  ipcMain.handle('window-close', () => {
    if (!mainWindow) return false;
    mainWindow.close();
    return true;
  });

  ipcMain.handle('get-window-state', () => {
    if (!mainWindow) return { isMaximized: false };
    return { isMaximized: mainWindow.isMaximized() };
  });

  ipcMain.handle('get-runtime-status', () => getRuntimeStatus());
  ipcMain.handle('open-link', (_e, value) => openExternalTarget(value));
  ipcMain.handle('open-project-notes-window', (_e, projectId) => openProjectNotesWindow(projectId));

  ipcMain.handle('initialize-app', async (_e, sharedPath) => {
    try {
      ensurePersonalRuntime();
      emitRuntimeStatus();

      return { success: true, user: auth.getCurrentUser() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Auth
  ipcMain.handle('get-current-user', () => {
    if (!auth) return null;
    auth.clearCache();
    return auth.getCurrentUser();
  });

  ipcMain.handle('login', (_e, username) => {
    if (!auth || !db) return null;
    auth.setUsername(PERSONAL_USERNAME);
    const user = auth.getCurrentUser();
    if (user) {
      const config = loadConfig() || {};
      config.loggedInUsername = PERSONAL_USERNAME;
      saveConfig(config);
      runtimeStatus.startupIssue = null;
      emitRuntimeStatus();
      return user;
    }
    return null;
  });

  ipcMain.handle('logout', () => {
    ensurePersonalRuntime();
    runtimeStatus.startupIssue = null;
    setWindowMode('app');
    emitRuntimeStatus();
    return true;
  });

  ipcMain.handle('set-window-mode', (_e, mode) => setWindowMode(mode));

  // Users
  ipcMain.handle('get-users', () => {
    if (!db) return [];
    return db.getUsers();
  });

  // Tasks
  ipcMain.handle('get-tasks', (_e, filters) => {
    if (!db) return [];
    return db.getTasks(filters);
  });

  ipcMain.handle('create-task', (_e, data) => {
    if (!db) return null;
    const normalizedData = { ...data };
    if (normalizedData.completed !== undefined && normalizedData.status === undefined) {
      normalizedData.status = normalizedData.completed ? 'complete' : 'not_started';
    }
    const task = db.createTask(normalizedData);
    if (sync) sync.pushEvent('task-created', task);
    notifyDataChanged();
    return task;
  });

  ipcMain.handle('update-task', (_e, data) => {
    if (!db) return null;
    const normalizedData = { ...data };
    if (normalizedData.completed !== undefined && normalizedData.status === undefined) {
      normalizedData.status = normalizedData.completed ? 'complete' : 'not_started';
    }
    const task = db.updateTask(normalizedData);
    if (sync) sync.pushEvent('task-updated', task);
    notifyDataChanged();
    return task;
  });

  ipcMain.handle('delete-task', (_e, taskId) => {
    if (!db) return false;
    db.deleteTask(taskId);
    if (sync) sync.pushEvent('task-deleted', { id: taskId });
    notifyDataChanged();
    return true;
  });

  // Personal Tasks
  ipcMain.handle('get-private-tasks', () => {
    if (!db || !auth) return [];
    const user = auth.getCurrentUser();
    if (!user) return [];
    return db.getPrivateTasks(user.id);
  });

  ipcMain.handle('create-private-task', (_e, data) => {
    if (!db || !auth) return null;
    const user = auth.getCurrentUser();
    if (!user) return null;
    const task = db.createPrivateTask({ ...data, owner_id: user.id });
    notifyDataChanged();
    return task;
  });

  ipcMain.handle('update-private-task', (_e, data) => {
    if (!db) return null;
    const task = db.updatePrivateTask(data);
    notifyDataChanged();
    return task;
  });

  ipcMain.handle('delete-private-task', (_e, id) => {
    if (!db) return false;
    db.deletePrivateTask(id);
    notifyDataChanged();
    return true;
  });

  // Sub-tasks
  ipcMain.handle('get-subtasks', (_e, taskId) => {
    if (!db) return [];
    return db.getSubTasks(taskId);
  });

  ipcMain.handle('get-task-support-data', (_e, taskIds) => {
    if (!db) return { subtasksByTaskId: {}, commentsByTaskId: {} };
    return {
      subtasksByTaskId: db.getSubTasksByTaskIds(taskIds),
      commentsByTaskId: db.getCommentsByTaskIds(taskIds),
    };
  });

  ipcMain.handle('create-subtask', (_e, data) => {
    if (!db) return null;
    const sub = db.createSubTask(data);
    if (sync) sync.pushEvent('subtask-created', sub);
    notifyDataChanged();
    return sub;
  });

  ipcMain.handle('update-subtask', (_e, data) => {
    if (!db) return null;
    const sub = db.updateSubTask(data);
    if (sync) sync.pushEvent('subtask-updated', sub);
    notifyDataChanged();
    return sub;
  });

  ipcMain.handle('delete-subtask', (_e, subId) => {
    if (!db) return false;
    db.deleteSubTask(subId);
    if (sync) sync.pushEvent('subtask-deleted', { id: subId });
    notifyDataChanged();
    return true;
  });

  ipcMain.handle('toggle-subtask', (_e, subId) => {
    if (!db) return null;
    const sub = db.toggleSubTask(subId);
    if (sync) sync.pushEvent('subtask-toggled', sub);
    notifyDataChanged();
    return sub;
  });

  // Comments
  ipcMain.handle('get-comments', (_e, taskId) => {
    if (!db) return [];
    return db.getComments(taskId);
  });

  ipcMain.handle('add-comment', (_e, data) => {
    if (!db) return null;
    const comment = db.addComment(data);
    if (sync) sync.pushEvent('comment-added', comment);
    notifyDataChanged();
    return comment;
  });

  // Projects
  ipcMain.handle('get-projects', () => {
    if (!db) return [];
    return db.getProjects();
  });

  ipcMain.handle('create-project', (_e, data) => {
    if (!db) return null;
    const project = db.createProject(data);
    if (sync) sync.pushEvent('project-created', project);
    notifyDataChanged();
    return project;
  });

  ipcMain.handle('update-project', (_e, data) => {
    if (!db) return null;
    const project = db.updateProject(data);
    if (sync) sync.pushEvent('project-updated', project);
    notifyDataChanged();
    return project;
  });

  ipcMain.handle('delete-project', (_e, id) => {
    if (!db) return null;
    db.deleteProject(id);
    if (sync) sync.pushEvent('project-deleted', { id });
    notifyDataChanged();
    return true;
  });

  // Project Notes
  ipcMain.handle('get-project-notes', (_e, projectId) => {
    if (!db) return null;
    return db.getProjectNotes(projectId);
  });

  ipcMain.handle('get-all-project-notes', () => {
    if (!db) return [];
    return db.getAllProjectNotes();
  });

  ipcMain.handle('update-project-notes', (_e, data) => {
    if (!db) return null;
    const result = db.upsertProjectNotes(data);
    if (sync) sync.pushEvent('project-notes-updated', data);
    notifyDataChanged();
    return result;
  });

  ipcMain.handle('get-project-shared-notes', (_e, projectId) => {
    if (!db) return [];
    return db.getProjectSharedNotes(projectId);
  });

  ipcMain.handle('get-all-project-shared-notes', () => {
    if (!db) return [];
    return db.getAllProjectSharedNotes();
  });

  ipcMain.handle('create-project-shared-note', (_e, data) => {
    if (!db) return null;
    const result = db.createProjectSharedNote(data);
    if (sync) sync.pushEvent('project-shared-note-created', result);
    notifyDataChanged();
    return result;
  });

  ipcMain.handle('update-project-shared-note', (_e, data) => {
    if (!db) return null;
    const result = db.updateProjectSharedNote(data);
    if (result && sync) sync.pushEvent('project-shared-note-updated', result);
    notifyDataChanged();
    return result;
  });

  ipcMain.handle('delete-project-shared-note', (_e, id) => {
    if (!db) return false;
    db.deleteProjectSharedNote(id);
    if (sync) sync.pushEvent('project-shared-note-deleted', { id });
    notifyDataChanged();
    return true;
  });

  // PTO
  ipcMain.handle('get-pto', () => {
    if (!db) return [];
    return db.getPTO();
  });

  ipcMain.handle('get-custom-priorities', () => {
    if (!db) return [];
    return db.getCustomPriorities();
  });
  ipcMain.handle('get-priority-menu-order', () => getPriorityMenuOrder());
  ipcMain.handle('get-priority-display-styles', () => getPriorityDisplayStyles());

  // Sync
  ipcMain.handle('force-sync', async () => {
    importMobileEventsNow();
    writeMobileSnapshotNow();
    markSyncActivity();
    return true;
  });
}

// ── App Lifecycle ──────────────────────────────────────

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    restoreMainWindow();
  });

  app.whenReady().then(async () => {
    logger?.info('app-ready', { pid: process.pid });
    app.setAppUserModelId(APP_ID);
    applyLaunchOnStartupPreference(getLaunchOnStartupPreference(), { persist: false });
    registerIPC();
    ensurePersonalRuntime();
    startMobileSyncPolling();
    createTray();
    createWindow();
    emitRuntimeStatus();
  });

  app.on('window-all-closed', () => {
    logger?.info('window-all-closed');
    if (!isQuitting) return;
    if (mobileSyncTimer) clearInterval(mobileSyncTimer);
    if (mobileSnapshotTimer) clearTimeout(mobileSnapshotTimer);
    if (updateManager) updateManager.stop();
    if (sync) sync.stopPolling();
    if (db) db.close();
    app.quit();
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      restoreMainWindow();
    }
  });

  app.on('before-quit', () => {
    logger?.info('before-quit');
    isQuitting = true;
  });
}
