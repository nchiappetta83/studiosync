const { app, BrowserWindow, ipcMain, dialog, Menu, Notification, Tray, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('./database');
const SyncEngine = require('./sync');
const Auth = require('./auth');
const UpdateManager = require('./updateManager');
const { createLogger } = require('./logger');
const { getExternalTargetAction } = require('./linkSecurity');
const { isPartner, canMutateTask, canCreateTask, canMutateSubtask } = require('./services/authorizationService');
const { createTaskCommand, updateTaskCommand, deleteTaskCommand } = require('./services/taskCommandService');

let mainWindow = null;
const projectNotesWindows = new Map();
const projectActivityWindows = new Map();
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
  // 775px is the narrowest comfortable split-pane workspace: it preserves a
  // readable project list beside the Work Cards panel without forcing either
  // side into its compact layout.
  width: 775,
  height: 800,
  minWidth: 775,
  minHeight: 600,
};

const PROJECT_NOTES_WINDOW_BOUNDS = {
  width: 940,
  height: 680,
  minWidth: 720,
  minHeight: 520,
};

const ENV_APP_DATA_DIR = 'SD_APP_DATA_DIR';
const ENV_SHARED_DRIVE_PATH = 'SD_SHARED_DRIVE_PATH';
const APP_USER_MODEL_ID = 'com.studiosync.mytasks';
const OFFICE_CAPACITY_FILE = 'studiosync-office-settings.json';
const DEFAULT_OFFICE_CAPACITY = Object.freeze({ dailyHours: 8, weeklyHours: 40 });

function getCurrentWeekStartString(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  local.setDate(local.getDate() + mondayOffset);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
}

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

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
const DIAGNOSTICS_DIR = path.join(APP_DATA_DIR, 'diagnostics');
const INPUT_DIAGNOSTICS_PATH = path.join(DIAGNOSTICS_DIR, 'mytasks-diagnostics.log');

function getDiagnosticsPath() {
  fs.mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
  return INPUT_DIAGNOSTICS_PATH;
}

function appendDiagnostics(entry = {}) {
  try {
    const targetPath = getDiagnosticsPath();
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 2 * 1024 * 1024) fs.writeFileSync(targetPath, '');
    fs.appendFileSync(targetPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`, 'utf-8');
  } catch (_) {}
}

// ── Config ─────────────────────────────────────────────

function getConfigPath() {
  return path.join(APP_DATA_DIR, 'config.json');
}

function pathsReferToSameLocation(left, right) {
  if (!left || !right) return false;
  try {
    return path.resolve(left).replace(/\//g, '\\').toLowerCase()
      === path.resolve(right).replace(/\//g, '\\').toLowerCase();
  } catch (_) {
    return String(left).replace(/\//g, '\\').toLowerCase()
      === String(right).replace(/\//g, '\\').toLowerCase();
  }
}

function loadConfig() {
  const configPath = getConfigPath();
  let config = null;

  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    }
  } catch (error) {
    logger?.warn('Configuration file could not be read; using safe defaults', {
      configPath,
      error: error.message,
    });
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
  const configPath = getConfigPath();
  const temporaryPath = `${configPath}.${process.pid}-${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(normalizedConfig, null, 2), 'utf8');
    fs.renameSync(temporaryPath, configPath);
  } catch (error) {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (_) {}
    logger?.error('Configuration file could not be saved', { configPath, error: error.message });
    throw error;
  }
}

function normalizeOfficeCapacity(value = {}) {
  const dailyHours = Number(value.dailyHours);
  const weeklyHours = Number(value.weeklyHours);
  return {
    dailyHours: Number.isFinite(dailyHours) && dailyHours > 0 ? dailyHours : DEFAULT_OFFICE_CAPACITY.dailyHours,
    weeklyHours: Number.isFinite(weeklyHours) && weeklyHours > 0 ? weeklyHours : DEFAULT_OFFICE_CAPACITY.weeklyHours,
  };
}

function getOfficeCapacityPath() {
  const sharedDrivePath = loadConfig()?.sharedDrivePath;
  return sharedDrivePath ? path.join(sharedDrivePath, OFFICE_CAPACITY_FILE) : null;
}

function getOfficeCapacity() {
  const capacityPath = getOfficeCapacityPath();
  if (!capacityPath || !fs.existsSync(capacityPath)) return { ...DEFAULT_OFFICE_CAPACITY };
  try {
    return normalizeOfficeCapacity(JSON.parse(fs.readFileSync(capacityPath, 'utf8')));
  } catch (error) {
    logger?.warn('Office capacity settings could not be read; using defaults', { capacityPath, error: error.message });
    return { ...DEFAULT_OFFICE_CAPACITY };
  }
}

function saveOfficeCapacity(value) {
  const capacityPath = getOfficeCapacityPath();
  if (!capacityPath) throw new Error('Choose the shared office folder before editing capacity.');
  const normalized = normalizeOfficeCapacity(value);
  fs.mkdirSync(path.dirname(capacityPath), { recursive: true });
  const temporaryPath = `${capacityPath}.${process.pid}-${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(normalized, null, 2), 'utf8');
    fs.renameSync(temporaryPath, capacityPath);
    return normalized;
  } catch (error) {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (_) {}
    logger?.error('Office capacity settings could not be saved', { capacityPath, error: error.message });
    throw error;
  }
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
  const startedAt = Date.now();
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
  appendDiagnostics({ scope: 'main', type: 'runtime-closed', durationMs: Date.now() - startedAt });
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
  for (const activityWindow of projectActivityWindows.values()) {
    if (!activityWindow.isDestroyed()) activityWindow.webContents.send('data-updated');
  }
  emitRuntimeStatus();
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
    const syncState = sync?.getFailureSummary?.();
    const failure = syncState?.failures?.[0]?.error || syncState?.bootstrapFailure;
    return {
      screen: 'connect',
      title: 'Connect',
      subtitle: 'Select the StudioSync folder or its data folder to connect.',
      error: failure
        ? `MyTasks could not restore users from the shared folder: ${failure}`
        : 'No users were found in the configured shared folder yet. Open Dashboard to publish a recovery snapshot, then try again.',
      reason: failure ? 'bootstrap-failed' : 'no-users',
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
    syncOutbox: sync?.getOutboxSummary?.() || { pending: 0, attempts: 0, lastError: null, oldestQueuedAt: null },
    syncFailures: sync?.getFailureSummary?.() || { count: 0, totalAttempts: 0, nextRetryAt: null },
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
  const targetAction = getExternalTargetAction(rawValue);
  if (!targetAction.success) return targetAction;

  try {
    if (targetAction.action === 'openExternal') {
      await shell.openExternal(targetAction.target);
    } else {
      const result = await shell.openPath(targetAction.target);
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

function getAppIconPath() {
  const externalIconPath = path.join(process.resourcesPath || '', 'assets', 'studiosync-mytasks.ico');
  if (app.isPackaged && fs.existsSync(externalIconPath)) return externalIconPath;

  return path.join(__dirname, '..', 'assets', 'studiosync-mytasks.ico');
}

function repairWindowsShortcutIdentity() {
  if (process.platform !== 'win32' || !app.isPackaged) return;

  const executablePath = app.getPath('exe');
  const shortcutPaths = [
    path.join(app.getPath('desktop'), 'StudioSync MyTasks.lnk'),
    process.env.APPDATA
      ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StudioSync MyTasks.lnk')
      : null,
    process.env.PROGRAMDATA
      ? path.join(process.env.PROGRAMDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StudioSync MyTasks.lnk')
      : null,
  ].filter(Boolean);

  for (const shortcutPath of shortcutPaths) {
    if (!fs.existsSync(shortcutPath)) continue;

    try {
      const shortcut = shell.readShortcutLink(shortcutPath);
      if (path.resolve(shortcut.target).toLowerCase() !== path.resolve(executablePath).toLowerCase()) continue;

      shell.writeShortcutLink(shortcutPath, 'update', {
        ...shortcut,
        appUserModelId: APP_USER_MODEL_ID,
        icon: getAppIconPath(),
        iconIndex: 0,
      });
    } catch (error) {
      logger?.warn('shortcut-identity-repair-failed', { shortcutPath, error: error.message });
    }
  }
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
  // Dashboard-origin changes normally do not need a second notification in
  // MyTasks. Deletions are the exception: the task is no longer in the local
  // database, so make the removal visible to its assignee.
  if (event.source === 'scheduling' && event.type !== 'task-deleted') return;

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

function getProjectLeadIds(projectId) {
  if (!db || !projectId) return [];
  return [...new Set(db.getTasks({ project_id: projectId })
    .map((task) => task.lead_id)
    .filter(Boolean))];
}

function notifyForWorkCardCompletion(event) {
  const currentUserId = getCurrentUserId();
  const completion = event?.data;
  if (!currentUserId || !completion?.project_id) return;
  if (completion.completed_by === currentUserId) return;
  if (!getProjectLeadIds(completion.project_id).includes(currentUserId)) return;

  const card = completion.id ? db.getWorkCardById(completion.id) : null;
  const project = db.getProjectById(completion.project_id);
  const completedBy = getDisplayName(completion.completed_by) || event.author || 'A team member';
  const projectName = project ? (project.client ? `${project.client} | ${project.name}` : project.name) : 'the project';
  showWindowsNotification(
    `Work Card Completed: ${card?.title || completion.title || 'Untitled work card'}`,
    `${completedBy} completed work on ${projectName}.`
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
      case 'task-deleted':
        notifyForTaskEvent(event, 'Task Removed');
        break;
      case 'comment-added':
        notifyForCommentEvent(event);
        break;
      case 'work-card-completed':
        notifyForWorkCardCompletion(event);
        break;
      default:
        break;
    }
  }
}

async function handlePulledSyncEvents(events = []) {
  if (!Array.isArray(events) || events.length === 0) return [];

  // Permission checks use the cached signed-in user.  A role, active or
  // self-assign change made in the Dashboard arrives as a user-* event, so drop
  // the cache and let the next check read the updated row.
  if (auth && events.some((event) => typeof event?.type === 'string' && event.type.startsWith('user-'))) {
    auth.clearCache();
  }

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

  tray = new Tray(getAppIconPath());
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
    icon: getAppIconPath(),
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
    icon: getAppIconPath(),
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

function openProjectActivityWindow(projectId) {
  const id = String(projectId || '').trim();
  if (!id) return false;
  const existing = projectActivityWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return true;
  }
  const activityWindow = new BrowserWindow({
    width: 760, height: 680, minWidth: 560, minHeight: 440,
    title: 'Project Activity', autoHideMenuBar: true, icon: getAppIconPath(),
    parent: mainWindow || undefined,
    backgroundColor: '#F7F9FB',
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  projectActivityWindows.set(id, activityWindow);
  activityWindow.loadFile(path.join(__dirname, '..', 'renderer', 'project-activity.html'), { query: { projectId: id } });
  activityWindow.on('closed', () => projectActivityWindows.delete(id));
  return true;
}

// ── IPC Handlers ───────────────────────────────────────

function registerIPC() {
  const currentActor = () => auth?.getCurrentUser() || null;
  const isRolloverReviewActive = () => {
    const state = db?.getRolloverReviewState?.();
    return Boolean(state?.active && state.week === getCurrentWeekStartString());
  };

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
  ipcMain.handle('get-diagnostics-path', () => getDiagnosticsPath());
  ipcMain.handle('log-diagnostics', (_e, entry) => {
    appendDiagnostics({ scope: 'renderer', ...(entry && typeof entry === 'object' ? entry : { message: String(entry || '') }) });
    return true;
  });

  // Config
  ipcMain.handle('get-config', () => loadConfig());
  ipcMain.handle('save-config', (_e, config) => {
    saveConfig(config);
    return true;
  });
  ipcMain.handle('get-office-capacity', () => getOfficeCapacity());
  ipcMain.handle('save-office-capacity', (_e, capacity) => {
    const actor = currentActor();
    if (!actor || !isPartner(actor)) return null;
    return saveOfficeCapacity(capacity);
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
  ipcMain.handle('open-project-notes-window', (_e, projectId) => openProjectNotesWindow(projectId));
  ipcMain.handle('open-project-activity-window', (_e, projectId) => openProjectActivityWindow(projectId));

  ipcMain.handle('initialize-app', async (_e, sharedPath) => {
    try {
      const inspection = inspectSharedDrivePath(sharedPath);
      if (!inspection.valid) {
        return { success: false, error: inspection.reason };
      }

      const resolvedSharedPath = inspection.resolvedPath;
      const config = loadConfig() || {};
      const isSameSharedDrive = pathsReferToSameLocation(config.sharedDrivePath, resolvedSharedPath);

      // A reconnect to the same workspace must retain private tasks and any
      // queued local events. A genuinely different workspace starts cleanly.
      if (isSameSharedDrive) {
        closeRuntime();
      } else {
        resetLocalCache();
        delete config.loggedInUsername;
      }

      config.sharedDrivePath = resolvedSharedPath;
      saveConfig(config);

      const localDbPath = getLocalDbPath();
      db = new Database(localDbPath, logger);
      db.initialize();

      auth = new Auth(db);
      sync = new SyncEngine(db, resolvedSharedPath, 'unknown', 'companion', logger, { appDataDir: APP_DATA_DIR });
      const initialEvents = sync.initialize();
      markSyncActivity();
      await handlePulledSyncEvents(initialEvents);
      sync.startPolling((events) => {
        if (!events.length) {
          markSyncActivity();
          return;
        }
        handlePulledSyncEvents(events).catch((err) => {
          console.error('Sync event handling failed:', err.message);
        });
      }, () => emitRuntimeStatus());

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
    const user = auth.getCurrentUser();
    if (user) {
      if (sync) sync.setActor(user);
      const config = loadConfig() || {};
      config.loggedInUsername = user.username;
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
  ipcMain.handle('get-staff-overview-assignments', () => {
    if (!db) return [];
    return db.getStaffOverviewAssignments();
  });
  ipcMain.handle('get-task-activity', (_e, taskId) => {
    const task = db?.getTaskById(taskId);
    return db && task && canMutateTask(currentActor(), task) ? db.getTaskActivity(taskId) : [];
  });
  ipcMain.handle('get-project-activity', (_e, projectId) => {
    const project = db?.getProjectById(projectId);
    return db && project && isPartner(currentActor()) ? db.getProjectActivity(projectId) : [];
  });
  ipcMain.handle('get-rollover-review-state', () => {
    if (!db) return { active: false, week: null, startedAt: null };
    const state = db.getRolloverReviewState();
    return { ...state, active: state.active && state.week === getCurrentWeekStartString() };
  });

  ipcMain.handle('create-task', (_e, data) => {
    const actor = currentActor();
    if (!db || isRolloverReviewActive() || !canCreateTask(actor, data || {})) return null;
    const normalizedData = { ...data };
    if (!isPartner(actor)) {
      normalizedData.assigned_to = actor.id;
      normalizedData.created_by = actor.id;
    }
    if (normalizedData.completed !== undefined && normalizedData.status === undefined) {
      normalizedData.status = normalizedData.completed ? 'complete' : 'not_started';
    }
    const { task } = sync
      ? createTaskCommand({ db, sync, actor, data: normalizedData })
      : { task: db.createTask(normalizedData) };
    notifyDataChanged();
    return task;
  });

  ipcMain.handle('update-task', (_e, data) => {
    const existing = db?.getTaskById(data?.id);
    if (!db || isRolloverReviewActive() || !canMutateTask(currentActor(), existing)) return null;
    const normalizedData = { ...data };
    if (normalizedData.completed !== undefined && normalizedData.status === undefined) {
      normalizedData.status = normalizedData.completed ? 'complete' : 'not_started';
    }
    const { task } = sync
      ? updateTaskCommand({ db, sync, actor: currentActor(), data: normalizedData, existing })
      : { task: db.updateTask(normalizedData) };
    notifyDataChanged();
    return task;
  });

  ipcMain.handle('delete-task', (_e, taskId) => {
    const task = db?.getTaskById(taskId);
    if (!db || isRolloverReviewActive() || !canMutateTask(currentActor(), task)) return false;
    if (sync) deleteTaskCommand({ db, sync, actor: currentActor(), task });
    else db.deleteTask(taskId);
    notifyDataChanged();
    return true;
  });

  // Work cards (V1.3): a shared, project-level layer beneath the existing
  // scheduled project assignments.  Existing V1 "tasks" remain untouched.
  const canViewWorkCardsForProject = (actor, projectId) => {
    if (!actor || !projectId) return false;
    if (isPartner(actor)) return true;
    return db.getProjectParticipants(projectId).some((participant) => participant.id === actor.id);
  };

  ipcMain.handle('get-project-work-cards', (_e, projectId, weekOf) => {
    const actor = currentActor();
    if (!db || !canViewWorkCardsForProject(actor, projectId)) return { cards: [], focus: null, participants: [] };
    return {
      cards: db.getWorkCards({ project_id: projectId, ...(weekOf ? { week_of: weekOf } : {}) }),
      focus: db.getWorkCardFocus(actor.id),
      participants: db.getProjectParticipants(projectId),
    };
  });

  // The left project list needs a lightweight status summary for each project
  // the signed-in user can already open. Keep this authorization identical to
  // the project-detail endpoint rather than exposing an office-wide card list.
  ipcMain.handle('get-my-project-work-cards', () => {
    const actor = currentActor();
    if (!db || !actor) return [];
    if (isPartner(actor)) return db.getWorkCards();
    const visibleProjectIds = new Set(db.getProjectIdsForParticipant(actor.id));
    return db.getWorkCards().filter((card) => visibleProjectIds.has(card.project_id));
  });

  ipcMain.handle('get-my-week-work-cards', (_e, weekOf) => {
    const actor = currentActor();
    if (!db || !actor) return { cards: [], focus: null };
    return {
      cards: db.getWorkCards({ assignee_id: actor.id, ...(weekOf ? { week_of: weekOf } : {}) }),
      focus: db.getWorkCardFocus(actor.id),
    };
  });

  // The Team Calendar is intentionally office-wide. Category visibility is
  // controlled by Dashboard Settings so only the types the office agrees are
  // useful for shared scheduling are exposed here.
  ipcMain.handle('get-team-calendar-work-cards', () => {
    const actor = currentActor();
    if (!db || !actor) return [];
    const visibleCategoryIds = new Set(
      db.getWorkCardCategories()
        .filter((category) => category.show_on_team_calendar !== 0)
        .map((category) => category.id),
    );
    return db.getWorkCards().filter((card) => {
      const project = db.getProjectById(card.project_id);
      return !card.completed
        && project
        && project.status !== 'inactive'
        && visibleCategoryIds.has(card.category_id)
        && (card.start_date || card.end_date);
    });
  });

  ipcMain.handle('create-work-card', (_e, data) => {
    const actor = currentActor();
    if (!db || isRolloverReviewActive() || !isPartner(actor) || !data?.project_id) return null;
    const card = db.createWorkCard({ ...data, created_by: actor.id, updated_by: actor.id });
    if (sync) sync.pushEvent('work-card-created', card);
    notifyDataChanged();
    return card;
  });

  ipcMain.handle('update-work-card', (_e, data) => {
    const actor = currentActor();
    const existing = db?.getWorkCardById(data?.id);
    const isAssignee = Boolean(actor && existing?.assignee_ids?.includes(actor.id));
    const isStatusOnly = data && Object.keys(data).every((key) => ['id', 'status', 'paused', 'paused_at', 'completed'].includes(key));
    // Starting, pausing, stopping, completing, and reopening are personal
    // work actions. Partners may still edit card details, but cannot run a
    // workflow action for a card they are not assigned to.
    if (!db || isRolloverReviewActive() || !existing || (isStatusOnly ? !isAssignee : !isPartner(actor))) return null;
    const card = db.updateWorkCard({ ...data, updated_by: actor.id });
    if (sync && card) sync.pushEvent('work-card-updated', card);
    const wasDone = existing.status === 'done' || Boolean(existing.completed);
    const isDone = card?.status === 'done' || Boolean(card?.completed);
    if (sync && card && !wasDone && isDone) {
      sync.pushEvent('work-card-completed', {
        id: card.id,
        project_id: card.project_id,
        title: card.title,
        completed_by: actor.id,
        completed_at: card.updated_at,
      });
    }
    notifyDataChanged();
    return card;
  });

  ipcMain.handle('delete-work-card', (_e, id) => {
    const actor = currentActor();
    const existing = db?.getWorkCardById(id);
    if (!db || isRolloverReviewActive() || !existing || !isPartner(actor)) return false;
    db.deleteWorkCard(id);
    if (sync) sync.pushEvent('work-card-deleted', { id, updated_at: new Date().toISOString() });
    notifyDataChanged();
    return true;
  });

  ipcMain.handle('set-work-card-focus', (_e, workCardId) => {
    const actor = currentActor();
    if (!db || !actor) return null;
    const focus = db.setWorkCardFocus(actor.id, workCardId || null);
    if (sync) sync.pushEvent('work-card-focus-set', {
      user_id: actor.id,
      work_card_id: workCardId || null,
      updated_at: new Date().toISOString(),
    });
    notifyDataChanged();
    return focus;
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
    // Private project/task entries are a senior/partner planning feature.
    // Enforce this here as well as in the renderer so a regular staff member
    // cannot create one by invoking the IPC channel directly.
    if (!user || !isPartner(user) || !(user.can_self_assign === 1 || user.can_self_assign === true)) return null;
    return db.createPrivateTask({ ...data, owner_id: user.id });
  });

  ipcMain.handle('update-private-task', (_e, data) => {
    const actor = currentActor();
    const existing = db?.getPrivateTaskById?.(data?.id);
    if (!db || !actor || !existing || existing.owner_id !== actor.id) return null;
    return db.updatePrivateTask(data);
  });

  ipcMain.handle('delete-private-task', (_e, id) => {
    const actor = currentActor();
    const existing = db?.getPrivateTaskById?.(id);
    if (!db || !actor || !existing || existing.owner_id !== actor.id) return false;
    db.deletePrivateTask(id);
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
    if (!db || isRolloverReviewActive() || !canMutateTask(currentActor(), db.getTaskById(data?.task_id))) return null;
    const sub = db.createSubTask(data);
    if (sync) sync.pushEvent('subtask-created', sub);
    notifyDataChanged();
    return sub;
  });

  ipcMain.handle('update-subtask', (_e, data) => {
    if (!db || isRolloverReviewActive() || !canMutateSubtask(currentActor(), db.getSubTaskById(data?.id), (id) => db.getTaskById(id))) return null;
    const sub = db.updateSubTask(data);
    if (sync) sync.pushEvent('subtask-updated', sub);
    notifyDataChanged();
    return sub;
  });

  ipcMain.handle('delete-subtask', (_e, subId) => {
    if (!db || isRolloverReviewActive() || !canMutateSubtask(currentActor(), db.getSubTaskById(subId), (id) => db.getTaskById(id))) return false;
    db.deleteSubTask(subId);
    if (sync) sync.pushEvent('subtask-deleted', { id: subId });
    notifyDataChanged();
    return true;
  });

  ipcMain.handle('toggle-subtask', (_e, subId) => {
    if (!db || isRolloverReviewActive() || !canMutateSubtask(currentActor(), db.getSubTaskById(subId), (id) => db.getTaskById(id))) return null;
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
    const actor = currentActor();
    if (!db || isRolloverReviewActive() || !actor || !canMutateTask(actor, db.getTaskById(data?.task_id))) return null;
    const comment = db.addComment({ ...data, author_id: actor.id });
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
    if (!db || !isPartner(currentActor())) return null;
    const project = db.createProject(data);
    if (sync) sync.pushEvent('project-created', project);
    notifyDataChanged();
    return project;
  });

  ipcMain.handle('update-project', (_e, data) => {
    if (!db || !isPartner(currentActor())) return null;
    const project = db.updateProject(data);
    if (sync) sync.pushEvent('project-updated', project);
    notifyDataChanged();
    return project;
  });

  ipcMain.handle('delete-project', (_e, id) => {
    if (!db || !isPartner(currentActor())) return null;
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
    if (!db || !isPartner(currentActor())) return null;
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
    if (!db || !isPartner(currentActor())) return null;
    const result = db.createProjectSharedNote(data);
    if (sync) sync.pushEvent('project-shared-note-created', result);
    notifyDataChanged();
    return result;
  });

  ipcMain.handle('update-project-shared-note', (_e, data) => {
    if (!db || !isPartner(currentActor())) return null;
    const result = db.updateProjectSharedNote(data);
    if (result && sync) sync.pushEvent('project-shared-note-updated', result);
    notifyDataChanged();
    return result;
  });

  ipcMain.handle('delete-project-shared-note', (_e, id) => {
    if (!db || !isPartner(currentActor())) return false;
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
  ipcMain.handle('get-work-card-categories', () => db?.getWorkCardCategories() || []);
  ipcMain.handle('get-priority-menu-order', () => getPriorityMenuOrder());
  ipcMain.handle('get-priority-display-styles', () => getPriorityDisplayStyles());

  // Sync
  ipcMain.handle('force-sync', async () => {
    if (!sync) return false;
    sync.flushOutbox();
    const snapshotRefreshed = sync.refreshSharedSnapshot?.() === true;
    const events = sync.retryFailedFiles();
    if (events.length === 0 && !snapshotRefreshed) {
      markSyncActivity();
    }
    await handlePulledSyncEvents(events);
    if (snapshotRefreshed && events.length === 0) {
      markSyncActivity();
      // Snapshot-only repairs do not have a new event to trigger the normal
      // renderer refresh. Notify it explicitly so Staff Overview redraws at
      // once with the repaired assignment set.
      notifyDataChanged();
    }
    emitRuntimeStatus();
    return { success: true, snapshotRefreshed };
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
    appendDiagnostics({ scope: 'main', type: 'app-ready-start' });
    logger?.info('app-ready', { pid: process.pid });
    app.setAppUserModelId(APP_USER_MODEL_ID);
    repairWindowsShortcutIdentity();
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
        db = new Database(localDbPath, logger);
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

        sync = new SyncEngine(db, resolvedSharedPath, config.loggedInUsername || 'unknown', 'companion', logger, { appDataDir: APP_DATA_DIR });
        if (auth.getCurrentUser()) sync.setActor(auth.getCurrentUser());
        const initialEvents = sync.initialize();
        markSyncActivity();
        await handlePulledSyncEvents(initialEvents);
        sync.startPolling((events) => {
          if (!events.length) {
            markSyncActivity();
            return;
          }
          handlePulledSyncEvents(events).catch((err) => {
            console.error('Sync event handling failed:', err.message);
          });
        }, () => emitRuntimeStatus());
        if (updateManager) {
          updateManager.start();
          await updateManager.checkForUpdates({ promptIfAvailable: true });
        }
        emitRuntimeStatus();
        appendDiagnostics({ scope: 'main', type: 'runtime-initialized', mode: 'saved-config' });
      } catch (err) {
        closeRuntime();
        runtimeStatus.startupIssue = {
          type: 'shared-drive-invalid',
          reason: err.message,
        };
        emitRuntimeStatus();
        console.error('Failed to initialize:', err.message);
        appendDiagnostics({ scope: 'main', type: 'runtime-initialize-failed', message: err.message });
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
    appendDiagnostics({ scope: 'main', type: 'before-quit' });
    isQuitting = true;
  });
}
