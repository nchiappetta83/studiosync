const { app, BrowserWindow, ipcMain, dialog, Menu, Notification, Tray, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('./database');
const SyncEngine = require('./sync');
const Auth = require('./auth');
const UpdateManager = require('./updateManager');
const { createLogger } = require('./logger');

let mainWindow = null;
let db = null;
let sync = null;
let auth = null;
let tray = null;
let isQuitting = false;
let hasShownTrayHint = false;
let updateManager = null;
let currentWindowMode = 'login';
let saveWindowBoundsTimer = null;
let logger = null;
let runtimeStatus = {
  lastSyncAt: null,
  startupIssue: null,
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

const ENV_APP_DATA_DIR = 'SD_APP_DATA_DIR';
const ENV_SHARED_DRIVE_PATH = 'SD_SHARED_DRIVE_PATH';

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
    : 'StudioSync MyTasks Portable';
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
logger = createLogger({ appDataDir: APP_DATA_DIR, appName: 'sd-companion' });
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

  const envSharedDrivePath = process.env[ENV_SHARED_DRIVE_PATH];
  const normalizedConfig = {
    ...(config || {}),
    launchOnStartup: config?.launchOnStartup !== false,
  };

  if (envSharedDrivePath && String(envSharedDrivePath).trim()) {
    return {
      ...normalizedConfig,
      sharedDrivePath: path.resolve(String(envSharedDrivePath).trim()),
    };
  }

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

function closeRuntime() {
  if (updateManager) {
    updateManager.stop();
  }
  if (sync) {
    sync.stopPolling();
    sync = null;
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
}

function getAuthEntryState() {
  const config = loadConfig() || {};
  const sharedDrivePath = config.sharedDrivePath || null;

  if (!sharedDrivePath) {
    return {
      screen: 'connect',
      title: 'Connect',
      subtitle: 'Select the StudioSync folder or its data folder to connect.',
      error: '',
      reason: 'missing-shared-path',
    };
  }

  const inspection = inspectSharedDrivePath(sharedDrivePath);
  if (!inspection.valid || runtimeStatus.startupIssue?.type === 'shared-drive-invalid') {
    return {
      screen: 'connect',
      title: 'Connect',
      subtitle: 'Could not reconnect to the saved shared folder.',
      error: runtimeStatus.startupIssue?.reason || inspection.reason || 'Saved shared drive is unavailable. Please re-select the StudioSync folder.',
      reason: 'shared-drive-invalid',
    };
  }

  if (runtimeStatus.startupIssue?.type === 'remembered-user-missing') {
    return {
      screen: 'connect',
      title: 'Connect',
      subtitle: 'Could not verify the saved MyTasks connection.',
      error: `Saved user "${runtimeStatus.startupIssue.username}" was not found in the connected shared folder. Please re-select the StudioSync folder.`,
      reason: 'remembered-user-missing',
    };
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

  const users = db ? db.getUsers() : [];
  if (users.length === 0) {
    return {
      screen: 'connect',
      title: 'Connect',
      subtitle: 'Select the StudioSync folder or its data folder to connect.',
      error: 'No users were found in the configured shared folder yet.',
      reason: 'no-users',
    };
  }

  return {
    screen: 'login',
    title: 'Sign In',
    subtitle: 'Enter your username to continue.',
    error: '',
    reason: 'ready-for-login',
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
  const config = loadConfig() || {};
  const sharedDrivePath = config.sharedDrivePath || null;
  const inspection = sharedDrivePath ? inspectSharedDrivePath(sharedDrivePath) : { valid: false, resolvedPath: null, reason: null };
  const pendingUpdate = updateManager?.getPendingPrompt?.() || null;
  const lastUpdateResult = updateManager?.getLastResult?.() || null;
  const authEntry = getAuthEntryState();

  return {
    appVersion: app.getVersion(),
    sharedDrivePath,
    sharedDriveReachable: Boolean(sharedDrivePath && inspection.valid && fs.existsSync(inspection.resolvedPath || sharedDrivePath)),
    sharedDriveValid: Boolean(sharedDrivePath && inspection.valid),
    lastSyncAt: runtimeStatus.lastSyncAt,
    updateAvailable: Boolean(pendingUpdate || lastUpdateResult?.updateAvailable),
    latestVersion: pendingUpdate?.latestVersion || lastUpdateResult?.latestVersion || null,
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
  const currentUser = auth?.getCurrentUser?.() || null;
  return currentUser?.role === 'staff' ? 'staff' : 'partner';
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
      'StudioSync MyTasks is still running',
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
  if (updateManager) {
    try {
      await updateManager.handleSyncEvents(events);
    } catch (err) {
      console.error('Update sync handling failed:', err.message);
    }
  }
  notifyDataChanged();
  return events;
}

function createTray() {
  if (tray) return;

  tray = new Tray(getTrayIconPath());
  tray.setToolTip('StudioSync MyTasks');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open StudioSync MyTasks',
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
    title: 'StudioSync MyTasks',
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
    if (!updateManager) return null;
    return updateManager.checkForUpdates({ manual: true, promptIfAvailable: true });
  });

  ipcMain.handle('get-pending-update', () => {
    if (!updateManager) return null;
    return updateManager.getPendingPrompt();
  });

  ipcMain.handle('dismiss-update', (_e, version) => {
    if (!updateManager) return false;
    return updateManager.dismissVersion(version);
  });

  ipcMain.handle('install-update', async () => {
    if (!updateManager) return { success: false, error: 'Updater is not available.' };
    return updateManager.installUpdate();
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Shared Drive Folder',
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

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

  ipcMain.handle('initialize-app', async (_e, sharedPath) => {
    try {
      const inspection = inspectSharedDrivePath(sharedPath);
      if (!inspection.valid) {
        return { success: false, error: inspection.reason };
      }

      // Explicit folder selection should behave like a fresh connection so we
      // don't carry stale cached data or a remembered login into a new setup.
      resetLocalCache();

      const resolvedSharedPath = inspection.resolvedPath;

      const config = loadConfig() || {};
      delete config.loggedInUsername;
      config.sharedDrivePath = resolvedSharedPath;
      saveConfig(config);

      const localDbPath = getLocalDbPath();
      db = new Database(localDbPath);
      db.initialize();

      auth = new Auth(db);
      sync = new SyncEngine(db, resolvedSharedPath, 'unknown', 'companion');
      sync.initialize();
      markSyncActivity();
      sync.startPolling((events) => {
        if (!events.length) {
          markSyncActivity();
          return;
        }
        handlePulledSyncEvents(events).catch((err) => {
          console.error('Sync event handling failed:', err.message);
        });
      });

      if (updateManager) {
        updateManager.start();
        await updateManager.checkForUpdates({ promptIfAvailable: true });
      }

      runtimeStatus.startupIssue = null;
      emitRuntimeStatus();

      return { success: true, user: null };
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
    auth.setUsername(username);
    if (sync) sync.setUsername(username);
    const user = auth.getCurrentUser();
    if (user) {
      const config = loadConfig() || {};
      config.loggedInUsername = username;
      saveConfig(config);
      runtimeStatus.startupIssue = null;
      emitRuntimeStatus();
      return user;
    }
    return null;
  });

  ipcMain.handle('logout', () => {
    if (auth) auth.setUsername(null);
    if (sync) sync.setUsername('unknown');
    const config = loadConfig() || {};
    delete config.loggedInUsername;
    saveConfig(config);
    runtimeStatus.startupIssue = null;
    setWindowMode('login');
    emitRuntimeStatus();
    return true;
  });

  ipcMain.handle('set-window-mode', (_e, mode) => setWindowMode(mode));

  // Users
  ipcMain.handle('get-users', () => {
    if (!db) return [];
    return db.getUsers();
  });

  // Tasks (shared, synced)
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

  // Private Tasks (local only, not synced)
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
    return db.createPrivateTask({ ...data, owner_id: user.id });
  });

  ipcMain.handle('update-private-task', (_e, data) => {
    if (!db) return null;
    return db.updatePrivateTask(data);
  });

  ipcMain.handle('delete-private-task', (_e, id) => {
    if (!db) return false;
    db.deletePrivateTask(id);
    return true;
  });

  // Sub-tasks
  ipcMain.handle('get-subtasks', (_e, taskId) => {
    if (!db) return [];
    return db.getSubTasks(taskId);
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

  // Project Notes (partner-authored, separate from Excel notes)
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
  ipcMain.handle('get-priority-display-styles', () => getPriorityDisplayStyles());

  // Sync
  ipcMain.handle('force-sync', async () => {
    if (!sync) return false;
    const events = sync.pull();
    if (events.length === 0) {
      markSyncActivity();
    }
    await handlePulledSyncEvents(events);
    return true;
  });
}

// ── App Lifecycle ──────────────────────────────────────

app.whenReady().then(async () => {
  logger?.info('app-ready', { pid: process.pid });
  app.setAppUserModelId('com.studiosync.mytasks');
  applyLaunchOnStartupPreference(getLaunchOnStartupPreference(), { persist: false });
  registerIPC();
  createTray();
  createWindow();
  updateManager = new UpdateManager({
    app,
    dialog,
    loadConfig,
    saveConfig,
    getDb: () => db,
    getMainWindow: () => mainWindow,
    appKey: 'companion',
    productName: 'StudioSync MyTasks',
    installerBaseName: 'StudioSync MyTasks Setup',
    onPrompt: (result) => emitUpdatePrompt(result),
  });

  // Try to auto-initialize from saved config
  const config = loadConfig();
  if (config && config.sharedDrivePath) {
    try {
      const inspection = inspectSharedDrivePath(config.sharedDrivePath);
      if (!inspection.valid) throw new Error(inspection.reason);

      const resolvedSharedPath = inspection.resolvedPath;
      if (resolvedSharedPath !== config.sharedDrivePath) {
        config.sharedDrivePath = resolvedSharedPath;
        saveConfig(config);
      }

      const localDbPath = getLocalDbPath();
      db = new Database(localDbPath);
      db.initialize();

      auth = new Auth(db);
      if (config.loggedInUsername) {
        auth.setUsername(config.loggedInUsername);
        if (!auth.getCurrentUser()) {
          runtimeStatus.startupIssue = {
            type: 'remembered-user-missing',
            username: config.loggedInUsername,
          };
          auth.setUsername(null);
          if (sync) sync.setUsername('unknown');
        } else {
          runtimeStatus.startupIssue = null;
        }
      } else {
        runtimeStatus.startupIssue = null;
      }

      sync = new SyncEngine(db, resolvedSharedPath, config.loggedInUsername || 'unknown', 'companion');
      sync.initialize();
      markSyncActivity();
      sync.startPolling((events) => {
        if (!events.length) {
          markSyncActivity();
          return;
        }
        handlePulledSyncEvents(events).catch((err) => {
          console.error('Sync event handling failed:', err.message);
        });
      });
      if (updateManager) {
        updateManager.start();
        await updateManager.checkForUpdates({ promptIfAvailable: true });
      }
      emitRuntimeStatus();
    } catch (err) {
      closeRuntime();
      runtimeStatus.startupIssue = {
        type: 'shared-drive-invalid',
        reason: err.message,
      };
      emitRuntimeStatus();
      console.error('Failed to initialize:', err.message);
    }
  }
});

app.on('window-all-closed', () => {
  logger?.info('window-all-closed');
  if (!isQuitting) return;
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
