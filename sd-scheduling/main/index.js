const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const Database = require('./database');
const SyncEngine = require('./sync');
const Auth = require('./auth');
const ExportEngine = require('./export');
const ExcelImport = require('./excelImport');
const ExcelSync = require('./excelSync');
const UpdateManager = require('./updateManager');
const { createLogger } = require('./logger');

let mainWindow = null;
const projectActivityWindows = new Map();
let db = null;
let sync = null;
let auth = null;
let autoExportTimer = null;
let lockFilePath = null;
let lockTimer = null;
let lockToken = null;
let updateManager = null;
let excelSync = null;
let excelWriteQueue = Promise.resolve();
let startupInitPromise = null;
let startupInitPath = null;
let pendingStartupRolloverNotice = null;
let workCardCarryOverCheckedWeek = null;
let logger = null;
let allowWindowClose = false;
let rolloverClosePromptOpen = false;
let backupCloseInProgress = false;
let backupCloseComplete = false;
let runtimeStatus = {
  lastSyncAt: null,
  lastExcelWriteAt: null,
  lastExcelWriteError: null,
  startupIssue: null,
};

const ENV_APP_DATA_DIR = 'SD_APP_DATA_DIR';
const ENV_SHARED_DRIVE_PATH = 'SD_SHARED_DRIVE_PATH';
const ROLLOVER_PUBLISH_STATE_KEY = 'rollover_publish_state';
// How long an unfinished weekly review is honoured before other Dashboards may
// start the rollover themselves.
const ROLLOVER_REVIEW_STALE_MS = 12 * 60 * 60 * 1000;

const WINDOW_MODES = {
  auth: { width: 500, height: 600, minWidth: 500, minHeight: 560 },
  // minWidth must cover sidebar (240px) + tasks-panel min-width (500px) + panel-resizer
  // (1px) + projects-panel min-width (380px) = 1121px, or the projects panel gets
  // silently clipped by the shell's overflow:hidden at the window's minimum size.
  main: { width: 1400, height: 900, minWidth: 1140, minHeight: 700 }
};

// ── Runtime Data Directory ───────────────────────────────
// Dev and win-unpacked builds keep data inside the app folder for convenience.
// Installed NSIS builds use a sibling "<Install Folder> Data" directory so
// app settings survive in-place upgrades that replace the install directory.

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
    : 'StudioSync Portable';
  return path.join(portableDir, `${baseName} Data`);
}

function getConfiguredSharedDrivePath() {
  const envPath = process.env[ENV_SHARED_DRIVE_PATH];
  if (envPath && String(envPath).trim()) {
    return path.resolve(String(envPath).trim());
  }

  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return null;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config?.sharedDrivePath && String(config.sharedDrivePath).trim()) {
      return path.resolve(String(config.sharedDrivePath).trim());
    }
  } catch (_) {}

  return null;
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
logger = createLogger({ appDataDir: APP_DATA_DIR, appName: 'sd-scheduling' });
logger.attachConsole();
logger.attachProcessHandlers();
const DIAGNOSTICS_DIR = path.join(APP_DATA_DIR, 'diagnostics');
const INPUT_DIAGNOSTICS_PATH = path.join(DIAGNOSTICS_DIR, 'dashboard-input-diagnostics.log');

function getInputDiagnosticsPath() {
  fs.mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
  return INPUT_DIAGNOSTICS_PATH;
}

function appendInputDiagnostics(entry = {}) {
  try {
    const targetPath = getInputDiagnosticsPath();
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 2 * 1024 * 1024) {
      fs.writeFileSync(targetPath, '');
    }

    const payload = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    fs.appendFileSync(targetPath, `${JSON.stringify(payload)}\n`, 'utf-8');
  } catch (_) {}
}

// ── Lock File ────────────────────────────────────────────
// Prevents two people from running an authorized Dashboard scheduling session
// simultaneously. Merely opening the sign-in window must not lock MyTasks.

function getLockFilePath(sharedDrivePath = getConfiguredSharedDrivePath()) {
  const lockDir = sharedDrivePath || APP_DATA_DIR;
  const lockFileName = sharedDrivePath ? '.dashboard.lock' : '.lock';
  return path.join(lockDir, lockFileName);
}

function readLockFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_) {
    return null;
  }
}

function buildLockData() {
  const config = loadConfig() || {};
  const windowsUser = os.userInfo().username;
  const appUser = config.loggedInUsername || null;

  if (!lockToken) {
    lockToken = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex');
  }

  return {
    token: lockToken,
    user: appUser || windowsUser,
    windowsUser,
    appUser,
    machine: os.hostname(),
    pid: process.pid,
    timestamp: Date.now()
  };
}

function showLockConflict(filePath, lockData) {
  const owner = lockData?.appUser || lockData?.windowsUser || lockData?.user || 'another user';
  const machine = lockData?.machine ? ` on ${lockData.machine}` : '';
  dialog.showErrorBox(
    'StudioSync',
    `The app is already in use by ${owner}${machine}.\n\nIf this is incorrect, wait 2 minutes or delete:\n${filePath}`
  );
}

function writeLockHeartbeat() {
  if (!lockFilePath || !lockToken) return;

  const lockData = buildLockData();
  const existing = readLockFile(lockFilePath);
  if (existing?.token && existing.token !== lockToken) return;

  try {
    fs.writeFileSync(lockFilePath, JSON.stringify(lockData, null, 2));
  } catch (_) {}
}

function startLockHeartbeat() {
  if (lockTimer) {
    clearInterval(lockTimer);
  }
  lockTimer = setInterval(() => writeLockHeartbeat(), 30000);
}

function acquireLock(sharedDrivePath = getConfiguredSharedDrivePath(), options = {}) {
  const { exitOnFailure = true } = options;
  const nextLockFilePath = getLockFilePath(sharedDrivePath);

  if (lockFilePath && path.resolve(lockFilePath) === path.resolve(nextLockFilePath)) {
    writeLockHeartbeat();
    return true;
  }

  fs.mkdirSync(path.dirname(nextLockFilePath), { recursive: true });

  while (true) {
    try {
      const handle = fs.openSync(nextLockFilePath, 'wx');
      fs.writeFileSync(handle, JSON.stringify(buildLockData(), null, 2), 'utf-8');
      fs.closeSync(handle);
      lockFilePath = nextLockFilePath;
      startLockHeartbeat();
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }

      const existingLock = readLockFile(nextLockFilePath);
      const age = Date.now() - (existingLock?.timestamp || 0);
      if (!existingLock || age >= 120000) {
        try {
          fs.unlinkSync(nextLockFilePath);
          continue;
        } catch (_) {}
      }

      showLockConflict(nextLockFilePath, existingLock);
      if (exitOnFailure) {
        app.exit(0);
      }
      return false;
    }
  }
}

function releaseLockFile(filePath) {
  if (!filePath) return;

  const existing = readLockFile(filePath);
  if (existing?.token && lockToken && existing.token !== lockToken) return;

  try {
    fs.unlinkSync(filePath);
  } catch (_) {}
}

function switchToSharedLock(sharedDrivePath) {
  const previousLockPath = lockFilePath;
  if (!acquireLock(sharedDrivePath, { exitOnFailure: false })) {
    return false;
  }

  if (previousLockPath && previousLockPath !== lockFilePath) {
    releaseLockFile(previousLockPath);
  }

  return true;
}

function refreshLockMetadata() {
  writeLockHeartbeat();
}

function releaseLock() {
  if (lockTimer) {
    clearInterval(lockTimer);
    lockTimer = null;
  }

  releaseLockFile(lockFilePath);
  lockFilePath = null;
}

function normalizeFsPath(targetPath) {
  if (!targetPath) return '';
  try {
    return path.resolve(targetPath).replace(/\//g, '\\').toLowerCase();
  } catch (_) {
    return String(targetPath).replace(/\//g, '\\').toLowerCase();
  }
}

// ── Config ───────────────────────────────────────────────

function getConfigPath() {
  return path.join(APP_DATA_DIR, 'config.json');
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
  if (envSharedDrivePath && String(envSharedDrivePath).trim()) {
    return {
      ...(config || {}),
      sharedDrivePath: path.resolve(String(envSharedDrivePath).trim()),
    };
  }

  return config;
}

function saveConfig(config) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  const configPath = getConfigPath();
  const temporaryPath = `${configPath}.${process.pid}-${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(config || {}, null, 2), 'utf8');
    fs.renameSync(temporaryPath, configPath);
  } catch (error) {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (_) {}
    logger?.error('Configuration file could not be saved', { configPath, error: error.message });
    throw error;
  }
}

function inspectSharedDrivePath(selectedPath, { allowEmpty = false } = {}) {
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

  try {
    const entries = fs.readdirSync(selectedPath);
    if (allowEmpty && entries.length === 0) {
      return { valid: true, resolvedPath: selectedPath };
    }
  } catch (err) {
    return { valid: false, resolvedPath: null, reason: err.message };
  }

  return {
    valid: false,
    resolvedPath: null,
    reason: 'Select the StudioSync folder, its data folder, or an empty folder for a new shared setup.'
  };
}

function getLocalDbPath() {
  return path.join(APP_DATA_DIR, 'local.db');
}

function getBackupFolderPath() {
  return loadConfig()?.backupFolderPath || null;
}

function copyBackupDirectory(source, destination, copied) {
  if (!source || !fs.existsSync(source)) return;
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyBackupDirectory(sourcePath, destinationPath, copied);
    else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
      copied.push(destinationPath);
    }
  }
}

async function createDashboardBackup({ includeSyncHistory = true } = {}) {
  const backupFolderPath = getBackupFolderPath();
  if (!backupFolderPath) throw new Error('Choose a backup folder in Settings first.');
  fs.mkdirSync(backupFolderPath, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupFolderPath, `StudioSync-backup-${stamp}`);
  fs.mkdirSync(target, { recursive: true });
  const copied = [];
  if (db) {
    const databasePath = path.join(target, 'dashboard.sqlite');
    await db.backupTo(databasePath);
    copied.push(databasePath);
  }
  // The local SQLite database is the Dashboard's authoritative working copy.
  // A manual backup also preserves the shared event/snapshot history, but the
  // close-time safety snapshot must not copy an ever-growing shared folder.
  for (const [name, source] of [['projects.xlsx', getExcelPath()], ['config.json', getConfigPath()], ['device-identity.json', path.join(APP_DATA_DIR, 'device-identity.json')]]) {
    if (source && fs.existsSync(source)) {
      const destination = path.join(target, name);
      fs.copyFileSync(source, destination);
      copied.push(destination);
    }
  }
  if (includeSyncHistory && sync?.sharedDrivePath) {
    copyBackupDirectory(path.join(sync.sharedDrivePath, 'events'), path.join(target, 'sync-events'), copied);
    copyBackupDirectory(path.join(sync.sharedDrivePath, 'snapshots'), path.join(target, 'sync-snapshots'), copied);
  }
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({
    createdAt: new Date().toISOString(),
    contents: {
      database: fs.existsSync(path.join(target, 'dashboard.sqlite')),
      excel: fs.existsSync(path.join(target, 'projects.xlsx')),
      syncEvents: includeSyncHistory && fs.existsSync(path.join(target, 'sync-events')),
      syncSnapshots: includeSyncHistory && fs.existsSync(path.join(target, 'sync-snapshots')),
      deviceIdentity: fs.existsSync(path.join(target, 'device-identity.json')),
    },
    files: copied.map((file) => path.relative(target, file)),
  }, null, 2));
  return { folder: target, files: copied, includesSyncHistory: includeSyncHistory };
}

function inspectBackupFolder(backupPath) {
  const resolvedPath = path.resolve(String(backupPath || ''));
  const manifestPath = path.join(resolvedPath, 'manifest.json');
  const databasePath = path.join(resolvedPath, 'dashboard.sqlite');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(databasePath)) throw new Error('Select a StudioSync project-data backup folder.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return { folder: resolvedPath, manifest, hasExcel: fs.existsSync(path.join(resolvedPath, 'projects.xlsx')) };
}

async function restoreDashboardBackup(backupPath) {
  const backup = inspectBackupFolder(backupPath);
  // Never replace the current data without first preserving it.
  await createDashboardBackup();
  const config = loadConfig() || {};
  const excelTarget = config.excelPath || path.join(APP_DATA_DIR, 'projects.xlsx');
  closeRuntime();
  fs.copyFileSync(path.join(backup.folder, 'dashboard.sqlite'), getLocalDbPath());
  if (backup.hasExcel) {
    fs.copyFileSync(path.join(backup.folder, 'projects.xlsx'), excelTarget);
    saveConfig({ ...config, excelPath: excelTarget });
  }
  const deviceIdentityBackup = path.join(backup.folder, 'device-identity.json');
  if (fs.existsSync(deviceIdentityBackup)) {
    fs.copyFileSync(deviceIdentityBackup, path.join(APP_DATA_DIR, 'device-identity.json'));
  }
  app.relaunch();
  app.exit(0);
  return { restored: true };
}

function closeRuntime() {
  const startedAt = Date.now();
  // A shared Dashboard lock belongs to the active scheduling session, not to
  // the local connection/setup screen. Releasing it here also makes switching
  // offices or signing out safe for everyone using MyTasks.
  releaseLock();
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
  excelSync = null;
  appendInputDiagnostics({ scope: 'main', type: 'runtime-closed', durationMs: Date.now() - startedAt });
  excelWriteQueue = Promise.resolve();
  auth = null;
  runtimeStatus.lastSyncAt = null;
  runtimeStatus.lastExcelWriteAt = null;
  runtimeStatus.lastExcelWriteError = null;
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

/**
 * Debounced auto-export: writes Weekly List.html to the configured export path.
 * Called whenever data changes. Debounces to 2 seconds to avoid excessive writes.
 */
function scheduleAutoExport() {
  if (autoExportTimer) clearTimeout(autoExportTimer);
  autoExportTimer = setTimeout(() => {
    autoExportTimer = null;
    if (!db) return;
    const config = loadConfig();
    if (!config?.exportPath) return;

    try {
      fs.mkdirSync(config.exportPath, { recursive: true });
      const exportFile = path.join(config.exportPath, 'Weekly List.html');
      const engine = new ExportEngine(db);
      engine.exportHTML(exportFile, { reloadInterval: config.htmlReloadInterval || 60 });
      logger?.info('Auto-export updated', { exportFile });
    } catch (err) {
      console.error('Auto-export failed:', err.message);
    }
  }, 2000);
}

/**
 * Notify the renderer that data changed and trigger auto-export.
 */
function notifyDataChanged(reason = 'unknown', meta = {}) {
  appendInputDiagnostics({
    scope: 'main',
    type: 'data-updated',
    reason,
    ...meta,
  });

  if (mainWindow) {
    mainWindow.webContents.send('data-updated', {
      reason,
      at: Date.now(),
      ...meta,
    });
  }
  for (const activityWindow of projectActivityWindows.values()) {
    if (!activityWindow.isDestroyed()) {
      activityWindow.webContents.send('data-updated', { reason, at: Date.now(), ...meta });
    }
  }
  scheduleAutoExport();
}

function isNoteOnlyTaskUpdate(taskData = {}) {
  const changedFields = [
    'project_id',
    'assigned_to',
    'title',
    'notes',
    'priority',
    'priority_label',
    'due_date',
    'completed',
    'sort_order',
    'confirmed',
    'partner_id',
    'category',
  ].filter((key) => taskData[key] !== undefined);

  return changedFields.length === 1 && changedFields[0] === 'notes';
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

function setPriorityMenuOrder(order = []) {
  if (!db) return [];

  const normalized = Array.isArray(order)
    ? order.filter((item) => typeof item === 'string' && item.trim())
    : [];

  db.setGlobalSetting('priority_menu_order', JSON.stringify(normalized));
  return normalized;
}

function getPriorityCarryoverTokens() {
  if (!db) return [];

  const rawValue = db.getGlobalSetting('priority_carryover_tokens');
  if (!rawValue) {
    return db.getCustomPriorities().map((priority) => `custom:${priority.id}`);
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.trim()) : [];
  } catch (_) {
    return [];
  }
}

function setPriorityCarryoverTokens(tokens = []) {
  if (!db) return [];

  const normalized = Array.isArray(tokens)
    ? tokens.filter((item) => typeof item === 'string' && item.trim())
    : [];

  db.setGlobalSetting('priority_carryover_tokens', JSON.stringify(normalized));
  return normalized;
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

function setPriorityDisplayStyles(styles = {}) {
  if (!db) return {};

  const normalized = styles && typeof styles === 'object' && !Array.isArray(styles)
    ? styles
    : {};

  db.setGlobalSetting('priority_display_styles', JSON.stringify(normalized));
  return normalized;
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

  const inspection = inspectSharedDrivePath(sharedDrivePath, { allowEmpty: true });
  if (!inspection.valid || runtimeStatus.startupIssue?.type === 'shared-drive-invalid') {
    return {
      screen: 'connect',
      title: 'Connect',
      subtitle: 'Select the StudioSync folder or its data folder to connect.',
      error: runtimeStatus.startupIssue?.reason || inspection.reason || 'Could not connect to shared drive. Please re-select the folder.',
      reason: 'shared-drive-invalid',
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
      screen: 'register',
      title: 'Welcome',
      subtitle: 'You\'re not registered yet. Ask a partner to add your account, or set up as the first user.',
      error: '',
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

function getRuntimeStatus() {
  const config = loadConfig() || {};
  const sharedDrivePath = config.sharedDrivePath || null;
  const inspection = sharedDrivePath
    ? inspectSharedDrivePath(sharedDrivePath, { allowEmpty: true })
    : { valid: false, resolvedPath: null };
  const excelPath = getExcelPath();
  const exportPath = config.exportPath || null;
  const updateFolderPath = db?.getUpdateFolderPath?.() || null;
  const pendingUpdate = updateManager?.getPendingPrompt?.() || null;
  const lastUpdateResult = updateManager?.getLastResult?.() || null;
  const authEntry = getAuthEntryState();

  return {
    appVersion: app.getVersion(),
    sharedDrivePath,
    sharedDriveReachable: Boolean(sharedDrivePath && inspection.valid && fs.existsSync(inspection.resolvedPath || sharedDrivePath)),
    sharedDriveValid: Boolean(sharedDrivePath && inspection.valid),
    excelPath,
    excelReachable: excelPath ? fs.existsSync(excelPath) : false,
    exportPath,
    exportReachable: exportPath ? fs.existsSync(exportPath) : false,
    updateFolderPath,
    updateFolderReachable: updateFolderPath ? fs.existsSync(updateFolderPath) : false,
    lastSyncAt: runtimeStatus.lastSyncAt,
    syncOutbox: sync?.getOutboxSummary?.() || { pending: 0, attempts: 0, lastError: null, oldestQueuedAt: null },
    syncFailures: sync?.getFailureSummary?.() || { count: 0, totalAttempts: 0, nextRetryAt: null, failures: [] },
    lastExcelWriteAt: runtimeStatus.lastExcelWriteAt,
    lastExcelWriteError: runtimeStatus.lastExcelWriteError,
    updateAvailable: Boolean(pendingUpdate || lastUpdateResult?.updateAvailable),
    latestVersion: pendingUpdate?.latestVersion || lastUpdateResult?.latestVersion || null,
    startupIssue: runtimeStatus.startupIssue || null,
    authEntry,
  };
}

function emitRuntimeStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('runtime-status-changed', getRuntimeStatus());
  }
}

function markSyncActivity() {
  runtimeStatus.lastSyncAt = new Date().toISOString();
  emitRuntimeStatus();
}

function getExcelPath() {
  const config = loadConfig() || {};
  if (config.excelPath && fs.existsSync(config.excelPath)) {
    return config.excelPath;
  }

  const candidateDirs = [];
  if (config.sharedDrivePath) {
    candidateDirs.push(config.sharedDrivePath);
    candidateDirs.push(path.dirname(config.sharedDrivePath));
  }

  const exeDir = path.dirname(app.getPath('exe'));
  candidateDirs.push(exeDir);
  candidateDirs.push(path.dirname(exeDir));
  candidateDirs.push(process.cwd());

  const seen = new Set();
  for (const dir of candidateDirs) {
    if (!dir) continue;
    const normalizedDir = path.resolve(dir);
    if (seen.has(normalizedDir)) continue;
    seen.add(normalizedDir);

    const candidate = path.join(normalizedDir, 'SD_Schedule.xlsx');
    if (fs.existsSync(candidate)) {
      if (config.excelPath !== candidate) {
        config.excelPath = candidate;
        saveConfig(config);
      }
      return candidate;
    }
  }

  return null;
}

function getCurrentWeekStartString(date = new Date()) {
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);

  const day = current.getDay();
  const diff = current.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(current.getFullYear(), current.getMonth(), diff);
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

function getPreviousWeekStartString(weekStr = getCurrentWeekStartString()) {
  const currentWeek = new Date(`${weekStr}T00:00:00`);
  currentWeek.setDate(currentWeek.getDate() - 7);
  return getCurrentWeekStartString(currentWeek);
}

function getRolloverPublishState() {
  if (!db) return null;
  const raw = db.getGlobalSetting(ROLLOVER_PUBLISH_STATE_KEY);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw);
    return state && typeof state === 'object' ? state : null;
  } catch (_) {
    return null;
  }
}

function saveRolloverPublishState(state) {
  if (!db) return null;
  return db.setGlobalSetting(ROLLOVER_PUBLISH_STATE_KEY, state ? JSON.stringify(state) : null);
}

function getRolloverPublicationSummary() {
  const state = getRolloverPublishState();
  const currentWeek = getCurrentWeekStartString();
  const active = Boolean(state && state.week === currentWeek);
  const notReviewedCount = active
    ? db.getTasks().filter((task) => (task.confirmed ?? 1) === 0).length
    : 0;
  return {
    active,
    week: active ? state.week : null,
    published: active && state.published === true,
    hasUnpublishedChanges: active && state.hasUnpublishedChanges === true,
    pendingCount: active ? new Set(state.pendingTaskIds || []).size + new Set(state.deletedTaskIds || []).size : 0,
    notReviewedCount,
  };
}

function stageRolloverTaskChange(taskId, { deleted = false } = {}) {
  const state = getRolloverPublishState();
  if (!state || state.week !== getCurrentWeekStartString()) return false;

  const pendingTaskIds = new Set(state.pendingTaskIds || []);
  const deletedTaskIds = new Set(state.deletedTaskIds || []);
  if (deleted) {
    pendingTaskIds.delete(taskId);
    deletedTaskIds.add(taskId);
  } else {
    deletedTaskIds.delete(taskId);
    pendingTaskIds.add(taskId);
  }

  saveRolloverPublishState({
    ...state,
    // A later edit is a distinct publication.  Never reuse the ID of an
    // already applied batch for different task contents.
    publicationId: state.published === true ? null : state.publicationId,
    pendingTaskIds: [...pendingTaskIds],
    deletedTaskIds: [...deletedTaskIds],
    hasUnpublishedChanges: true,
  });
  return true;
}

function shouldStageRolloverTask(task, { created = false } = {}) {
  const state = getRolloverPublishState();
  if (!state || state.week !== getCurrentWeekStartString()) return false;
  if (state.published !== true) return true;
  if (created) return false;
  return (task?.confirmed ?? 1) === 0;
}

function publishRolloverChanges() {
  const state = getRolloverPublishState();
  if (!db || !sync || !state || state.week !== getCurrentWeekStartString() || (!state.hasUnpublishedChanges && !state.compatibilityPending)) {
    return { published: false, ...getRolloverPublicationSummary() };
  }

  const initial = state.published !== true;
  const currentTasks = db.getTasks();
  const currentTaskIds = new Set(currentTasks.map((task) => task.id));
  const deletedTaskIds = new Set(state.deletedTaskIds || []);
  if (initial) {
    for (const taskId of state.originalTaskIds || []) {
      if (!currentTaskIds.has(taskId)) deletedTaskIds.add(taskId);
    }
  }

  const pendingTaskIds = new Set(state.pendingTaskIds || []);
  // A receiver must never infer its own rollover scope; the publication
  // names every task it carries.  The initial publication covers the IDs
  // captured before the local rollover began plus every task staged since
  // (including tasks created during the meeting), because staged changes are
  // withheld from MyTasks until this batch is written.
  const originalTaskIds = new Set(state.originalTaskIds || []);
  const tasks = initial
    ? currentTasks.filter((task) => originalTaskIds.has(task.id) || pendingTaskIds.has(task.id))
    : currentTasks.filter((task) => pendingTaskIds.has(task.id));

  const publicationId = state.publicationId || crypto.randomUUID();
  // Preserve this timestamp across retries so compatibility events cannot
  // accidentally win over a task edited after the original publication.
  const publishedAt = state.publishedAt || new Date().toISOString();
  // Persist the intent first. If the process dies after the shared-folder
  // write, the same ID is retried and receivers safely de-duplicate it.
  saveRolloverPublishState({ ...state, publicationId, publishedAt });

  const publicationWritten = state.compatibilityPending || sync.pushEvent('rollover-published', {
    protocolVersion: 2,
    publicationId,
    week: state.week,
    tasks,
    deletedTaskIds: [...deletedTaskIds],
    baseTaskUpdatedAt: state.baseTaskUpdatedAt || {},
    publishedAt,
    clearPTO: initial,
  });
  if (!publicationWritten) {
    return {
      published: false,
      error: 'The scheduling changes could not be written to the shared folder.',
      ...getRolloverPublicationSummary(),
    };
  }

  const publishedState = {
    ...state,
    publicationId,
    publishedAt,
    published: true,
    hasUnpublishedChanges: false,
    pendingTaskIds: [],
    deletedTaskIds: [],
    lastPublishedAt: new Date().toISOString(),
    compatibilityPending: true,
  };
  // Compatibility delivery is intentionally best effort: it must not make a
  // successfully written authoritative batch retryable.
  const compatibilityWritten = [
    ...tasks.map((task) => sync.pushEvent('task-updated', { ...task, rolloverPublicationId: publicationId })),
    ...[...deletedTaskIds].map((id) => sync.pushEvent('task-deleted', {
      id,
      deleted_at: publishedAt,
      rolloverPublicationId: publicationId,
    })),
    ...(initial ? (state.originalPtoUserIds || []).map((userId) => sync.pushEvent('pto-cleared', { user_id: userId, rolloverPublicationId: publicationId })) : []),
  ].every(Boolean);
  saveRolloverPublishState({ ...publishedState, compatibilityPending: !compatibilityWritten });
  markSyncActivity();
  // The Dashboard mutex protects the scheduling meeting itself. Once the
  // authoritative weekly publication has been written, other Dashboard users
  // are free to open the app again and MyTasks receives the unlocked state.
  releaseLock();

  return {
    published: true,
    initial,
    taskCount: tasks.length,
    deletedCount: deletedTaskIds.size,
    compatibilityPending: !compatibilityWritten,
    ...getRolloverPublicationSummary(),
  };
}

function getSharedWeeklyRolloverStatus(weekStr) {
  const status = { published: false, reviewActive: false };
  if (!sync?.eventsDir || !weekStr || !fs.existsSync(sync.eventsDir)) {
    return status;
  }

  try {
    const files = fs.readdirSync(sync.eventsDir)
      .filter((file) => file.endsWith('.json') && (
        file.includes('_weekly-rollover_')
        || file.includes('_rollover-published_')
        || file.includes('_rollover-review-started_')
        || file.includes('_rollover-review-ended_')
      ))
      .sort();

    for (const file of files) {
      const filePath = path.join(sync.eventsDir, file);
      const event = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (event?.data?.week !== weekStr) continue;
      if (event.type === 'weekly-rollover' || event.type === 'rollover-published') {
        status.published = true;
        status.reviewActive = false;
      } else if (event.type === 'rollover-review-started') {
        // A review whose Dashboard never published or closed it (crash, power
        // loss) must not block the weekly rollover forever.
        const startedAt = Date.parse(event.data?.startedAt || event.timestamp || '');
        status.reviewActive = !Number.isFinite(startedAt) || Date.now() - startedAt < ROLLOVER_REVIEW_STALE_MS;
      } else if (event.type === 'rollover-review-ended') {
        status.reviewActive = false;
      }
    }
  } catch (err) {
    console.error('Failed to inspect weekly rollover events:', err.message);
  }

  return status;
}

function getWeeklyRolloverState() {
  if (!db) {
    return {
      needed: false,
      currentWeek: null,
      lastWeek: null,
      initialized: false,
      inferredFromExistingTasks: false,
      recoveryNeeded: false,
    };
  }

  const currentWeek = getCurrentWeekStartString();
  let lastWeek = db.getLastRolloverWeek();
  let initialized = false;
  let inferredFromExistingTasks = false;

  if (!lastWeek) {
    initialized = true;
    inferredFromExistingTasks = db.getTaskCount() > 0;
    lastWeek = inferredFromExistingTasks ? getPreviousWeekStartString(currentWeek) : currentWeek;
    db.setLastRolloverWeek(lastWeek);
  }

  const sharedRollover = getSharedWeeklyRolloverStatus(currentWeek);
  const localRolloverStaged = getRolloverPublishState()?.week === currentWeek;
  // A published shared schedule is authoritative for every Dashboard copy.
  // A newly connected machine may not yet have its local rollover marker, so
  // align it before deciding whether a new rollover is needed.
  if (sharedRollover.published && lastWeek !== currentWeek) {
    db.setLastRolloverWeek(currentWeek);
    lastWeek = currentWeek;
  }
  const recoveryNeeded = (
    lastWeek === currentWeek
    && !sharedRollover.published
    && !sharedRollover.reviewActive
    && !localRolloverStaged
    && db.hasTasksOlderThanWeek(currentWeek)
  );

  return {
    needed: !sharedRollover.published && !sharedRollover.reviewActive && (lastWeek !== currentWeek || recoveryNeeded),
    currentWeek,
    lastWeek,
    initialized,
    inferredFromExistingTasks,
    recoveryNeeded,
    sharedRolloverPublished: sharedRollover.published,
    reviewInProgressElsewhere: sharedRollover.reviewActive,
  };
}

// Unfinished work cards follow the schedule into the new week. The moved cards
// are published as ordinary work-card updates, which every MyTasks and
// Dashboard version already understands, so no app needs to be updated first.
// Publishes tasks whose Project Lead was changed by the project-wide rule, the
// same way an ordinary edit would be (staged during a rollover review).
function publishLeadChangedTasks(tasks) {
  for (const sibling of tasks) {
    if (shouldStageRolloverTask(sibling)) stageRolloverTaskChange(sibling.id);
    else if (sync) sync.pushEvent('task-updated', sibling);
  }
}

// The Project Lead is one person per project. Copy it to every other assignment
// on the project so it never has to be set staff member by staff member.
function shareProjectLead(task) {
  if (!db || !task?.project_id) return [];
  try {
    const changed = db.applyProjectLead(task.project_id, task.lead_id || null, { exceptTaskId: task.id });
    publishLeadChangedTasks(changed);
    return changed;
  } catch (err) {
    console.error('Sharing the Project Lead failed:', err.message);
    return [];
  }
}

let projectLeadsReconciled = false;

function carryOverWorkCards(weekStr) {
  if (!db || !weekStr) return 0;
  let moved = [];
  try {
    moved = db.carryOverUnfinishedWorkCards(weekStr);
  } catch (err) {
    console.error('Work card carry-over failed:', err.message);
    return 0;
  }
  if (sync) {
    for (const card of moved) sync.pushEvent('work-card-updated', card);
  }
  if (moved.length) appendInputDiagnostics({ scope: 'main', type: 'work-cards-carried-over', week: weekStr, count: moved.length });
  return moved.length;
}

function performWeeklyRollover({ force = false, source = 'manual' } = {}) {
  const state = getWeeklyRolloverState();
  if (!db) return { applied: false, source, ...state };
  if (!force && !state.needed) return { applied: false, source, ...state };

  // A Dashboard sign-in is harmless. Reserve the shared scheduling session
  // only when an administrator actually begins the weekly rollover.
  const config = loadConfig() || {};
  if (!acquireLock(config.sharedDrivePath, { exitOnFailure: false })) {
    return {
      applied: false,
      source,
      error: 'Another Dashboard scheduling session is already active.',
      ...state,
    };
  }

  const originalTasks = db.getTasks();
  const originalTaskIds = originalTasks.map((task) => task.id);
  const baseTaskUpdatedAt = Object.fromEntries(originalTasks.map((task) => [task.id, task.updated_at]));
  const originalPtoUserIds = db.getPTO().map((pto) => pto.user_id);
  db.performWeeklyRollover(state.currentWeek);
  db.setLastRolloverWeek(state.currentWeek);
  carryOverWorkCards(state.currentWeek);
  workCardCarryOverCheckedWeek = state.currentWeek;
  saveRolloverPublishState({
    week: state.currentWeek,
    published: false,
    hasUnpublishedChanges: true,
    originalTaskIds,
    baseTaskUpdatedAt,
    originalPtoUserIds,
    publicationId: null,
    pendingTaskIds: originalTaskIds,
    deletedTaskIds: [],
    startedAt: new Date().toISOString(),
  });
  // Let MyTasks know that the scheduling meeting is in progress before any
  // task rows are published.  It will keep the prior schedule read-only until
  // the authoritative publication closes the review.
  if (sync) {
    sync.pushEvent('rollover-review-started', {
      week: state.currentWeek,
      startedAt: new Date().toISOString(),
    });
  }
  db.optimizeStorage({ vacuum: true });

  const result = {
    applied: true,
    source,
    currentWeek: state.currentWeek,
    previousWeek: state.lastWeek,
    initialized: state.initialized,
    inferredFromExistingTasks: state.inferredFromExistingTasks,
  };

  if (source === 'startup') {
    pendingStartupRolloverNotice = result;
  }

  return result;
}

function releaseRolloverReviewWithoutPublishing() {
  const state = getRolloverPublishState();
  if (!state || state.week !== getCurrentWeekStartString() || !state.hasUnpublishedChanges) {
    return { released: true, skipped: true };
  }
  if (!sync) {
    return { released: false, error: 'Dashboard is not connected to the shared folder.' };
  }

  const released = sync.pushEvent('rollover-review-ended', {
    week: state.week,
    endedAt: new Date().toISOString(),
    reason: 'closed-without-publishing',
  });
  if (!released) {
    return { released: false, error: 'MyTasks could not be unlocked because the shared folder is unavailable.' };
  }

  saveRolloverPublishState({
    ...state,
    reviewLockReleasedAt: new Date().toISOString(),
  });
  return { released: true, skipped: false };
}

async function applyProjectEventsToExcel(events = []) {
  const excelPath = getExcelPath();
  if (!excelSync || !excelPath || !fs.existsSync(excelPath)) return false;

  const relevantEvents = events.filter((event) =>
    ['project-created', 'project-updated', 'project-deleted'].includes(event?.type)
  );
  if (relevantEvents.length === 0) return false;

  const runWrite = async () => {
    try {
      await excelSync.applyEvents(excelPath, relevantEvents);
      runtimeStatus.lastExcelWriteAt = new Date().toISOString();
      runtimeStatus.lastExcelWriteError = null;
      emitRuntimeStatus();
      return true;
    } catch (err) {
      console.error('Excel write-back failed:', err.message);
      runtimeStatus.lastExcelWriteError = err.message;
      emitRuntimeStatus();
      return false;
    }
  };

  excelWriteQueue = excelWriteQueue.then(runWrite, runWrite);
  return excelWriteQueue;
}

async function handlePulledSyncEvents(events = [], options = {}) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const {
    skipProjectExcelSync = false,
    skipUpdateSyncHandling = false,
  } = options;

  markSyncActivity();
  if (!skipProjectExcelSync) {
    await applyProjectEventsToExcel(events);
  }
  if (updateManager && !skipUpdateSyncHandling) {
    try {
      await updateManager.handleSyncEvents(events);
    } catch (err) {
      console.error('Update sync handling failed:', err.message);
    }
  }
  notifyDataChanged('sync-pull', {
    eventCount: events.length,
    eventTypes: [...new Set(events.map((event) => event?.type).filter(Boolean))],
  });
  return events;
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

function applyWindowMode(modeName = 'main') {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  const mode = WINDOW_MODES[modeName] || WINDOW_MODES.main;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }

  mainWindow.setMinimumSize(mode.minWidth, mode.minHeight);
  mainWindow.setSize(mode.width, mode.height);
  mainWindow.center();
  emitWindowState();
  return true;
}

function scheduleStartupUpdateCheck() {
  if (!updateManager) return;
  setTimeout(() => {
    updateManager.checkForUpdates({ promptIfAvailable: true }).catch((err) => {
      console.error('Startup update check failed:', err.message);
    });
  }, 0);
}

async function runStartupExcelRefresh(config) {
  if (!config?.excelPath || !fs.existsSync(config.excelPath) || !db) return;

  try {
    const importer = new ExcelImport(db);
    const result = await importer.import(config.excelPath);
    if (result.imported > 0 || result.updated > 0) {
      if (sync) {
        for (const project of result.createdProjects || []) sync.pushEvent('project-created', project);
        for (const project of result.updatedProjects || []) sync.pushEvent('project-updated', project);
      }
      logger?.info('Excel auto-refresh completed', {
        imported: result.imported,
        updated: result.updated,
      });
      notifyDataChanged('startup-excel-refresh', {
        imported: result.imported || 0,
        updated: result.updated || 0,
      });
    }
  } catch (excelErr) {
    console.error('Excel auto-refresh failed:', excelErr.message);
  }
}

async function initializeSharedRuntime(resolvedSharedPath, { runExcelRefresh = false } = {}) {
  const startedAt = Date.now();
  const normalizedPath = normalizeFsPath(resolvedSharedPath);

  if (db && auth && sync && normalizeFsPath(sync.sharedDrivePath) === normalizedPath) {
    runtimeStatus.startupIssue = null;
    if (runExcelRefresh) {
      const config = loadConfig() || {};
      await runStartupExcelRefresh(config);
    }
    return { user: auth.getCurrentUser() || null };
  }

  if (startupInitPromise && startupInitPath === normalizedPath) {
    return startupInitPromise;
  }

  startupInitPath = normalizedPath;
  startupInitPromise = (async () => {
    pendingStartupRolloverNotice = null;

    if (sync) sync.stopPolling();
    if (db) {
      try {
        db.close();
      } catch (_) {}
    }

    const localDbPath = getLocalDbPath();
    db = new Database(localDbPath, logger);
    db.initialize();
    excelSync = new ExcelSync(db);
    auth = new Auth(db);

    sync = new SyncEngine(db, resolvedSharedPath, 'unknown', 'scheduling', logger, { appDataDir: APP_DATA_DIR });
    const originalPushEvent = sync.pushEvent.bind(sync);
    sync.pushEvent = (type, data) => {
      const result = originalPushEvent(type, data);
      if (result) markSyncActivity();
      else emitRuntimeStatus();
      return result;
    };
    const initialEvents = sync.initialize();
    markSyncActivity();
    await handlePulledSyncEvents(initialEvents, {
      skipProjectExcelSync: true,
      skipUpdateSyncHandling: true,
    });

    // Weekly review begins only after an authenticated scheduling
    // administrator enters Dashboard. Opening the app to connect or test it
    // must never change the shared weekly schedule.

    sync.startPolling(async (events) => {
      if (!events.length) {
        markSyncActivity();
        return;
      }
      await handlePulledSyncEvents(events);
    }, () => emitRuntimeStatus());

    if (updateManager) {
      updateManager.start();
      scheduleStartupUpdateCheck();
    }

    runtimeStatus.startupIssue = null;
    emitRuntimeStatus();

    if (runExcelRefresh) {
      const config = loadConfig() || {};
      await runStartupExcelRefresh(config);
    }

    appendInputDiagnostics({ scope: 'main', type: 'runtime-initialized', durationMs: Date.now() - startedAt, runExcelRefresh });
    return { user: null };
  })();

  try {
    return await startupInitPromise;
  } finally {
    startupInitPromise = null;
    startupInitPath = null;
  }
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
    title: 'Project Activity', autoHideMenuBar: true,
    parent: mainWindow || undefined,
    icon: path.join(__dirname, '..', 'assets', 'studiosync-main.ico'),
    backgroundColor: '#F7F9FB',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  projectActivityWindows.set(id, activityWindow);
  activityWindow.loadFile(path.join(__dirname, '..', 'renderer', 'project-activity.html'), { query: { projectId: id } });
  activityWindow.on('closed', () => projectActivityWindows.delete(id));
  return true;
}

function createWindow() {
  const initialMode = WINDOW_MODES.auth;
  mainWindow = new BrowserWindow({
    width: initialMode.width,
    height: initialMode.height,
    minWidth: initialMode.minWidth,
    minHeight: initialMode.minHeight,
    icon: path.join(__dirname, '..', 'assets', 'studiosync-main.ico'),
    title: 'StudioSync',
    show: false,
    backgroundColor: '#F7F9FB',
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  let hasShownWindow = false;
  const showWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed() || hasShownWindow) return;
    hasShownWindow = true;
    mainWindow.show();
    emitWindowState();
  };

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

  mainWindow.webContents.once('dom-ready', () => {
    showWindow();
  });

  mainWindow.once('ready-to-show', () => {
    showWindow();
  });

  setTimeout(() => {
    showWindow();
  }, 1500);

  mainWindow.on('close', async (event) => {
    const publication = getRolloverPublicationSummary();
    if (allowWindowClose || !publication.hasUnpublishedChanges) return;

    event.preventDefault();
    if (rolloverClosePromptOpen) return;
    rolloverClosePromptOpen = true;

    try {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: 'Unpublished scheduling changes',
        message: 'Publish scheduling changes before closing?',
        detail: publication.notReviewedCount > 0
          ? `${publication.notReviewedCount} task${publication.notReviewedCount === 1 ? '' : 's'} will remain marked Not Reviewed. Closing without publishing keeps changes only on this Dashboard and unlocks MyTasks.`
          : 'MyTasks will receive the finalized scheduling changes in one update. Closing without publishing keeps changes only on this Dashboard and unlocks MyTasks.',
        buttons: ['Publish Changes & Close', 'Close & Unlock MyTasks', 'Continue Editing'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });

      const publicationResult = result.response === 0 ? publishRolloverChanges() : null;
      const releaseResult = result.response === 1 ? releaseRolloverReviewWithoutPublishing() : null;
      if (result.response === 1 && !releaseResult?.released) {
        await dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'MyTasks remains locked',
          message: releaseResult?.error || 'Dashboard could not unlock MyTasks.',
          detail: 'Reconnect to the shared folder, then close Dashboard again or publish the schedule.',
        });
        return;
      }
      if ((result.response === 0 && publicationResult?.published) || (result.response === 1 && releaseResult?.released)) {
        allowWindowClose = true;
        mainWindow?.close();
      }
    } finally {
      rolloverClosePromptOpen = false;
    }
  });

  mainWindow.on('close', async (event) => {
    const config = loadConfig() || {};
    if (event.defaultPrevented || !config.backupOnClose || backupCloseComplete) return;
    event.preventDefault();
    if (backupCloseInProgress) return;
    backupCloseInProgress = true;
    const backupStartedAt = Date.now();
    appendInputDiagnostics({ scope: 'main', type: 'backup-on-close-started' });
    try {
      await createDashboardBackup({ includeSyncHistory: false });
      appendInputDiagnostics({ scope: 'main', type: 'backup-on-close-completed', durationMs: Date.now() - backupStartedAt });
      backupCloseComplete = true;
      mainWindow?.close();
    } catch (error) {
      appendInputDiagnostics({ scope: 'main', type: 'backup-on-close-failed', durationMs: Date.now() - backupStartedAt, message: error.message });
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Dashboard backup failed',
        message: 'The Dashboard could not be backed up before closing.',
        detail: error.message,
        buttons: ['Close Without Backup', 'Keep App Open'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (result.response === 0) {
        backupCloseComplete = true;
        mainWindow?.close();
      }
    } finally {
      backupCloseInProgress = false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => emitWindowState());
  mainWindow.on('unmaximize', () => emitWindowState());
  mainWindow.on('enter-full-screen', () => emitWindowState());
  mainWindow.on('leave-full-screen', () => emitWindowState());
}

// ── IPC Handlers ──────────────────────────────────────────

function registerIPC() {
  const recordTaskActivity = (taskOrId, action, details = {}) => {
    const task = typeof taskOrId === 'object' ? taskOrId : db?.getTaskById(taskOrId);
    const taskId = task?.id || taskOrId;
    if (!db || !taskId) return null;
    const activity = db.addTaskActivity({
      task_id: taskId, project_id: task?.project_id || null,
      action,
      actor_id: auth?.getCurrentUser()?.id || null,
      details,
    });
    if (activity && sync) sync.pushEvent('task-activity-added', activity);
    if (activity) {
      for (const activityWindow of projectActivityWindows.values()) {
        if (!activityWindow.isDestroyed()) activityWindow.webContents.send('data-updated', { reason: 'task-activity-added', at: Date.now() });
      }
    }
    return activity;
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

  ipcMain.handle('get-diagnostics-path', () => getInputDiagnosticsPath());
  ipcMain.handle('log-diagnostics', (_e, entry) => {
    appendInputDiagnostics({
      scope: 'renderer',
      ...(entry && typeof entry === 'object' ? entry : { message: String(entry || '') }),
    });
    return true;
  });
  ipcMain.handle('open-project-activity-window', (_e, projectId) => openProjectActivityWindow(projectId));
  ipcMain.handle('get-device-trust-status', () => sync?.getDeviceTrustStatus?.() || null);
  ipcMain.handle('get-pending-device-enrollments', () => {
    if (!auth?.isAdmin?.()) return [];
    return sync?.deviceTrust?.getPendingEnrollments?.() || [];
  });
  ipcMain.handle('get-trusted-devices', () => auth?.isAdmin?.() ? (sync?.deviceTrust?.getTrustedDevices?.() || []) : []);
  ipcMain.handle('approve-device-enrollment', (_e, deviceId) => {
    if (!auth?.isAdmin?.()) throw new Error('Only a partner can approve trusted devices.');
    const request = (sync?.deviceTrust?.getPendingEnrollments?.() || []).find((item) => item.deviceId === deviceId);
    if (!request || !db.getUserById(request.userId)) throw new Error('The enrollment request is no longer valid.');
    return sync.deviceTrust.approveEnrollment(deviceId);
  });
  ipcMain.handle('revoke-trusted-device', (_e, deviceId) => {
    if (!auth?.isAdmin?.()) throw new Error('Only a partner can revoke trusted devices.');
    return sync?.deviceTrust?.revokeDevice(deviceId) || false;
  });
  ipcMain.handle('set-signed-event-enforcement', (_e, enabled) => {
    if (!auth?.isAdmin?.()) throw new Error('Only a partner can change the trusted-device policy.');
    return sync?.deviceTrust?.setEnforcement(enabled) || false;
  });

  // Config
  ipcMain.handle('get-config', () => loadConfig());
  ipcMain.handle('save-config', (_e, config) => {
    saveConfig(config);
    return true;
  });
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('get-update-folder-path', () => {
    if (!db) return null;
    return db.getUpdateFolderPath();
  });

  ipcMain.handle('set-update-folder-path', async (_e, folderPath) => {
    if (!db) return null;

    const value = folderPath ? String(folderPath).trim() : null;
    const savedPath = db.setUpdateFolderPath(value);
    if (sync) {
      sync.pushEvent('setting-updated', {
        key: 'update_folder_path',
        value: savedPath,
      });
    }
    if (updateManager) {
      updateManager.clearDismissedVersion();
      await updateManager.checkForUpdates({ promptIfAvailable: true, forcePrompt: true });
    }
    notifyDataChanged();
    emitRuntimeStatus();
    return savedPath;
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
      title: 'Select Shared Drive Folder'
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('get-backup-folder-path', () => getBackupFolderPath());
  ipcMain.handle('set-backup-folder-path', (_e, backupFolderPath) => {
    const config = loadConfig() || {};
    if (backupFolderPath) config.backupFolderPath = String(backupFolderPath);
    else delete config.backupFolderPath;
    saveConfig(config);
    return getBackupFolderPath();
  });
  ipcMain.handle('create-dashboard-backup', async () => createDashboardBackup());
  ipcMain.handle('inspect-dashboard-backup', (_e, backupPath) => inspectBackupFolder(backupPath));
  ipcMain.handle('restore-dashboard-backup', async (_e, backupPath) => restoreDashboardBackup(backupPath));

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

  ipcMain.handle('window-focus', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.focus();
    return true;
  });

  ipcMain.handle('get-window-state', () => {
    if (!mainWindow) return { isMaximized: false };
    return { isMaximized: mainWindow.isMaximized() };
  });

  ipcMain.handle('get-runtime-status', () => getRuntimeStatus());

  ipcMain.handle('set-window-mode', (_e, modeName) => {
    return applyWindowMode(modeName);
  });

  ipcMain.handle('initialize-app', async (_e, sharedPath) => {
    try {
      const inspection = inspectSharedDrivePath(sharedPath, { allowEmpty: true });
      if (!inspection.valid) {
        return { success: false, error: inspection.reason };
      }

      const resolvedSharedPath = inspection.resolvedPath;

      const existingConfig = loadConfig() || {};
      const isSameSharedDrive = normalizeFsPath(existingConfig.sharedDrivePath) === normalizeFsPath(resolvedSharedPath);

      // Retain the local cache for an intentional reconnect to the same
      // workspace. Clearing it here can discard queued writes; changing to a
      // different workspace still starts with a clean local cache.
      if (isSameSharedDrive) {
        closeRuntime();
      } else {
        resetLocalCache();
        delete existingConfig.loggedInUsername;
      }

      // Save config
      const config = { ...existingConfig, sharedDrivePath: resolvedSharedPath };
      saveConfig(config);

      const { user } = await initializeSharedRuntime(resolvedSharedPath);

      return { success: true, user };
    } catch (err) {
      closeRuntime();
      runtimeStatus.startupIssue = {
        type: 'shared-drive-invalid',
        reason: err.message,
      };
      emitRuntimeStatus();
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('resume-app', async (_e, sharedPath) => {
    try {
      const inspection = inspectSharedDrivePath(sharedPath, { allowEmpty: true });
      if (!inspection.valid) {
        return { success: false, error: inspection.reason };
      }

      const resolvedSharedPath = inspection.resolvedPath;
      const existingConfig = loadConfig() || {};
      if (existingConfig.sharedDrivePath !== resolvedSharedPath) {
        saveConfig({ ...existingConfig, sharedDrivePath: resolvedSharedPath });
      }

      const { user } = await initializeSharedRuntime(resolvedSharedPath, { runExcelRefresh: true });
      return { success: true, user };
    } catch (err) {
      closeRuntime();
      runtimeStatus.startupIssue = {
        type: 'shared-drive-invalid',
        reason: err.message,
      };
      emitRuntimeStatus();
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
    releaseLock();
    runtimeStatus.startupIssue = null;
    emitRuntimeStatus();
    return true;
  });

  // Users
  ipcMain.handle('get-users', () => {
    if (!db) return [];
    return db.getUsers();
  });

  ipcMain.handle('create-user', (_e, userData) => {
    if (!db) return null;
    const user = db.createUser(userData);
    if (sync) sync.pushEvent('user-created', user);
    if (auth) auth.clearCache();
    return user;
  });

  ipcMain.handle('update-user', (_e, userData) => {
    if (!db) return null;
    const user = db.updateUser(userData);
    if (sync) sync.pushEvent('user-updated', user);
    if (auth) auth.clearCache();
    return user;
  });

  ipcMain.handle('delete-user', (_e, userId) => {
    if (!db) return { success: false, error: 'Database is not ready.' };
    const payload = (userId && typeof userId === 'object') ? userId : { userId };
    const targetUserId = payload.userId;
    const taskAction = payload.taskAction || 'block';
    const reassignTo = payload.reassignTo || null;

    if (!targetUserId) {
      return { success: false, error: 'Missing user id.' };
    }

    const openTasks = db.getTasks({ assigned_to: targetUserId, completed: false });
    const openTaskCount = openTasks.length;

    if (openTaskCount > 0) {
      if (taskAction === 'reassign') {
        if (!reassignTo || reassignTo === targetUserId) {
          return { success: false, error: 'Choose someone else to reassign these tasks to.', openTaskCount };
        }
        const replacementUser = db.getUserById(reassignTo);
        if (!replacementUser || replacementUser.active === 0) {
          return { success: false, error: 'The selected reassignment person is not available.', openTaskCount };
        }
        for (const task of openTasks) {
          const updatedTask = db.updateTask({ id: task.id, assigned_to: reassignTo });
          if (shouldStageRolloverTask(task)) stageRolloverTaskChange(task.id);
          else if (sync) sync.pushEvent('task-updated', updatedTask);
        }
      } else if (taskAction === 'delete') {
        for (const task of openTasks) {
          const tombstone = db.recordTaskDeletion(task.id);
          db.deleteTask(task.id);
          if (shouldStageRolloverTask(task)) stageRolloverTaskChange(task.id, { deleted: true });
          else if (sync) sync.pushEvent('task-deleted', {
            id: task.id,
            deleted_at: tombstone.deleted_at,
            title: task.title || '',
            assigned_to: task.assigned_to || null,
            project_id: task.project_id || null,
          });
        }
      } else {
        return {
          success: false,
          error: openTaskCount === 1
            ? 'This person still has 1 open task that must be reassigned or deleted first.'
            : `This person still has ${openTaskCount} open tasks that must be reassigned or deleted first.`,
          openTaskCount,
          requiresTaskAction: true,
        };
      }
    }

    db.deleteUser(targetUserId);
    if (sync) sync.pushEvent('user-deleted', { id: targetUserId });
    if (auth) auth.clearCache();
    notifyDataChanged('user-deleted', {
      userId: targetUserId,
      openTaskCount,
      taskAction: openTaskCount > 0 ? taskAction : 'none',
    });
    return {
      success: true,
      openTaskCount,
      taskAction: openTaskCount > 0 ? taskAction : 'none',
    };
  });

  ipcMain.handle('get-user-delete-impact', (_e, userId) => {
    if (!db) return { openTaskCount: 0 };
    return {
      openTaskCount: db.getAssignedOpenTaskCount(userId),
    };
  });

  // Business Roles
  ipcMain.handle('get-business-roles', () => {
    if (!db) return [];
    return db.getBusinessRoles();
  });

  ipcMain.handle('create-business-role', (_e, data) => {
    if (!db) return null;
    const role = db.createBusinessRole(data);
    if (sync) sync.pushEvent('role-created', role);
    notifyDataChanged();
    return role;
  });

  ipcMain.handle('update-business-role', (_e, data) => {
    if (!db) return null;
    const role = db.updateBusinessRole(data);
    if (sync) sync.pushEvent('role-updated', role);
    notifyDataChanged();
    return role;
  });

  ipcMain.handle('delete-business-role', (_e, id) => {
    if (!db) return false;
    db.deleteBusinessRole(id);
    if (sync) sync.pushEvent('role-deleted', { id });
    notifyDataChanged();
    return true;
  });

  ipcMain.handle('reorder-business-roles', (_e, orders) => {
    if (!db) return false;
    db.reorderBusinessRoles(orders);
    if (sync) sync.pushEvent('roles-reordered', orders);
    notifyDataChanged();
    return true;
  });

  // Custom Priorities
  ipcMain.handle('get-custom-priorities', () => {
    if (!db) return [];
    return db.getCustomPriorities();
  });

  ipcMain.handle('get-priority-menu-order', () => getPriorityMenuOrder());
  ipcMain.handle('get-priority-carryover-tokens', () => getPriorityCarryoverTokens());
  ipcMain.handle('get-priority-display-styles', () => getPriorityDisplayStyles());

  ipcMain.handle('set-priority-menu-order', (_e, order) => {
    const nextOrder = setPriorityMenuOrder(order);
    if (sync) {
      sync.pushEvent('setting-updated', {
        key: 'priority_menu_order',
        value: JSON.stringify(nextOrder),
      });
    }
    notifyDataChanged();
    return nextOrder;
  });

  ipcMain.handle('set-priority-carryover-tokens', (_e, tokens) => {
    const nextTokens = setPriorityCarryoverTokens(tokens);
    if (sync) {
      sync.pushEvent('setting-updated', {
        key: 'priority_carryover_tokens',
        value: JSON.stringify(nextTokens),
      });
    }
    notifyDataChanged('priority-carryover-updated');
    return nextTokens;
  });

  ipcMain.handle('set-priority-display-styles', (_e, styles) => {
    const nextStyles = setPriorityDisplayStyles(styles);
    if (sync) {
      sync.pushEvent('setting-updated', {
        key: 'priority_display_styles',
        value: JSON.stringify(nextStyles),
      });
    }
    notifyDataChanged('priority-display-styles-updated');
    return nextStyles;
  });

  ipcMain.handle('create-custom-priority', (_e, data) => {
    if (!db) return null;
    const priority = db.createCustomPriority(data);
    if (sync) sync.pushEvent('priority-created', priority);
    notifyDataChanged();
    return priority;
  });

  ipcMain.handle('update-custom-priority', (_e, data) => {
    if (!db) return null;
    const priority = db.updateCustomPriority(data);
    if (sync) sync.pushEvent('priority-updated', priority);
    notifyDataChanged();
    return priority;
  });

  ipcMain.handle('delete-custom-priority', (_e, id) => {
    if (!db) return false;
    db.deleteCustomPriority(id);
    if (sync) sync.pushEvent('priority-deleted', { id });
    notifyDataChanged();
    return true;
  });

  // Work-card categories are managed in Dashboard Settings and shared with
  // MyTasks through the same event stream as priorities and staff roles.
  ipcMain.handle('get-work-card-categories', () => db?.getWorkCardCategories() || []);
  ipcMain.handle('create-work-card-category', (_e, data) => {
    if (!db || !auth?.isAdmin?.()) return null;
    const category = db.createWorkCardCategory(data);
    sync?.pushEvent('work-card-category-created', category);
    notifyDataChanged('work-card-categories-updated');
    return category;
  });
  ipcMain.handle('update-work-card-category', (_e, data) => {
    if (!db || !auth?.isAdmin?.()) return null;
    const category = db.updateWorkCardCategory(data);
    if (category) sync?.pushEvent('work-card-category-updated', category);
    notifyDataChanged('work-card-categories-updated');
    return category;
  });
  ipcMain.handle('delete-work-card-category', (_e, id) => {
    if (!db || !auth?.isAdmin?.()) return false;
    db.deleteWorkCardCategory(id);
    sync?.pushEvent('work-card-category-deleted', { id });
    notifyDataChanged('work-card-categories-updated');
    return true;
  });
  ipcMain.handle('reorder-work-card-categories', (_e, orders) => {
    if (!db || !auth?.isAdmin?.()) return [];
    const categories = db.reorderWorkCardCategories(orders);
    sync?.pushEvent('work-card-categories-reordered', orders);
    notifyDataChanged('work-card-categories-updated');
    return categories;
  });

  ipcMain.handle('reorder-custom-priorities', (_e, orders) => {
    if (!db) return false;
    db.reorderCustomPriorities(orders);
    if (sync) sync.pushEvent('priorities-reordered', orders);
    notifyDataChanged();
    return true;
  });

  // Tasks
  ipcMain.handle('get-tasks', (_e, filters) => {
    if (!db) return [];
    return db.getTasks(filters);
  });
  ipcMain.handle('get-task-activity', (_e, taskId) => db?.getTaskActivity(taskId) || []);
  ipcMain.handle('get-project-activity', (_e, projectId) => db?.getProjectActivity(projectId) || []);

  ipcMain.handle('create-task', (_e, taskData) => {
    if (!db) return null;
    const normalizedTaskData = { ...taskData };
    if (!normalizedTaskData.due_date) {
      const sharedDueDate = db.getSharedTaskDueDate(normalizedTaskData.project_id, normalizedTaskData.title);
      if (sharedDueDate) normalizedTaskData.due_date = sharedDueDate;
    }
    if (normalizedTaskData.completed !== undefined && normalizedTaskData.status === undefined) {
      normalizedTaskData.status = normalizedTaskData.completed ? 'complete' : 'not_started';
    }
    // A new assignment on a project takes the project's Lead automatically.
    if (normalizedTaskData.project_id && !normalizedTaskData.lead_id) {
      const projectLeadId = db.getProjectLeadId(normalizedTaskData.project_id);
      if (projectLeadId) normalizedTaskData.lead_id = projectLeadId;
    }
    const task = db.createTask(normalizedTaskData);
    recordTaskActivity(task, 'created', { title: task.title, assignedTo: task.assigned_to || null });
    if (shouldStageRolloverTask(task, { created: true })) stageRolloverTaskChange(task.id);
    else if (sync) sync.pushEvent('task-created', task);
    // A Lead chosen while adding the assignment applies to the whole project.
    if (task.project_id && task.lead_id) shareProjectLead(task);
    notifyDataChanged('task-created', { taskId: task.id });
    return task;
  });

  ipcMain.handle('update-task', (_e, taskData) => {
    if (!db) return null;
    const previousTask = db.getTaskById(taskData.id);
    const normalizedTaskData = { ...taskData };
    if (normalizedTaskData.completed !== undefined && normalizedTaskData.status === undefined) {
      normalizedTaskData.status = normalizedTaskData.completed ? 'complete' : 'not_started';
    }
    // Moving an assignment to another project gives it that project's Lead.
    if (previousTask && normalizedTaskData.project_id !== undefined && normalizedTaskData.lead_id === undefined
      && (normalizedTaskData.project_id || null) !== (previousTask.project_id || null)) {
      normalizedTaskData.lead_id = db.getProjectLeadId(normalizedTaskData.project_id, { excludeTaskId: previousTask.id });
    }
    const task = db.updateTask(normalizedTaskData);
    const changedFields = Object.keys(normalizedTaskData).filter((key) => key !== 'id' && previousTask?.[key] !== task?.[key]);
    if (changedFields.length > 0) {
      recordTaskActivity(task, task.completed && !previousTask?.completed ? 'completed' : (!task.completed && previousTask?.completed ? 'reopened' : 'updated'), {
        fields: changedFields,
        before: Object.fromEntries(changedFields.map((key) => [key, previousTask?.[key] ?? null])),
        after: Object.fromEntries(changedFields.map((key) => [key, task?.[key] ?? null])),
      });
    }
    if (shouldStageRolloverTask(previousTask)) stageRolloverTaskChange(task.id);
    else if (sync) sync.pushEvent('task-updated', task);
    // Setting or clearing the Lead on one assignment sets it for the project.
    if (task?.project_id && (previousTask?.lead_id || null) !== (task.lead_id || null)) shareProjectLead(task);
    if (isNoteOnlyTaskUpdate(normalizedTaskData)) {
      appendInputDiagnostics({
        scope: 'main',
        type: 'task-note-save',
        taskId: task.id,
      });
      scheduleAutoExport();
    } else {
      notifyDataChanged('task-updated', { taskId: task.id });
    }
    return task;
  });

  ipcMain.handle('delete-task', (_e, taskId) => {
    if (!db) return false;
    const previousTask = db.getTaskById(taskId);
    recordTaskActivity(previousTask || taskId, 'deleted', { title: previousTask?.title || '' });
    const tombstone = db.recordTaskDeletion(taskId);
    db.deleteTask(taskId);
    if (shouldStageRolloverTask(previousTask)) stageRolloverTaskChange(taskId, { deleted: true });
    else if (sync) sync.pushEvent('task-deleted', {
      id: taskId,
      deleted_at: tombstone.deleted_at,
      title: previousTask?.title || '',
      assigned_to: previousTask?.assigned_to || null,
      project_id: previousTask?.project_id || null,
    });
    notifyDataChanged('task-deleted', { taskId });
    return true;
  });

  // V1.3 work cards stay out of the scheduling flow. Dashboard only exposes a
  // compact, on-demand disclosure beneath an assigned project card so Monday
  // scheduling remains as fast as V1.2.
  ipcMain.handle('get-project-work-cards', (_e, projectId, weekOf) => {
    if (!db || !projectId) return [];
    return db.getWorkCards({ project_id: projectId, week_of: weekOf || getCurrentWeekStartString() });
  });

  ipcMain.handle('reorder-tasks', (_e, taskOrders) => {
    if (!db) return false;
    const shouldStage = taskOrders.some((item) => shouldStageRolloverTask(db.getTaskById(item.id)));
    db.reorderTasks(taskOrders);
    if (shouldStage) taskOrders.forEach((item) => stageRolloverTaskChange(item.id));
    else if (sync) sync.pushEvent('tasks-reordered', taskOrders);
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

  ipcMain.handle('delete-comment', (_e, commentId) => {
    if (!db) return false;
    db.deleteComment(commentId);
    if (sync) sync.pushEvent('comment-deleted', { id: commentId });
    notifyDataChanged();
    return true;
  });

  // Projects
  ipcMain.handle('get-projects', () => {
    if (!db) return [];
    return db.getProjects();
  });

  ipcMain.handle('create-project', async (_e, data) => {
    if (!db) return null;
    const project = db.createProject(data);
    if (sync) sync.pushEvent('project-created', project);
    await applyProjectEventsToExcel([{ type: 'project-created', data: project }]);
    notifyDataChanged('project-created', { projectId: project.id });
    return project;
  });

  ipcMain.handle('update-project', async (_e, data) => {
    if (!db) return null;
    const previousProject = db.getProjectById(data.id);
    const project = db.updateProject(data);
    if (sync) sync.pushEvent('project-updated', project);
    const excelPayload = previousProject
      ? {
          ...project,
          previous_client: previousProject.client,
          previous_name: previousProject.name,
          previous_category: previousProject.category,
        }
      : project;
    await applyProjectEventsToExcel([{ type: 'project-updated', data: excelPayload }]);
    notifyDataChanged('project-updated', {
      projectId: project.id,
      fields: Object.keys(data).filter((key) => key !== 'id'),
    });
    return project;
  });

  ipcMain.handle('delete-project', async (_e, projectId) => {
    if (!db) return false;
    const project = db.getProjectById(projectId);
    db.deleteProject(projectId);
    const payload = project
      ? { id: projectId, client: project.client, name: project.name, category: project.category }
      : { id: projectId };
    if (sync) sync.pushEvent('project-deleted', payload);
    await applyProjectEventsToExcel([{ type: 'project-deleted', data: payload }]);
    notifyDataChanged('project-deleted', { projectId });
    return true;
  });

  // Project Notes (partner-authored)
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
    notifyDataChanged('project-notes-updated', { projectId: data.project_id });
    return result;
  });

  // PTO (date-based)
  ipcMain.handle('get-pto', () => {
    if (!db) return [];
    return db.getPTO();
  });

  ipcMain.handle('get-pto-for-user', (_e, userId) => {
    if (!db) return null;
    return db.getPTOForUser(userId);
  });

  ipcMain.handle('set-pto-dates', (_e, data) => {
    if (!db) return null;
    const pto = db.setPTODates(data);
    if (sync) sync.pushEvent('pto-set', data);
    notifyDataChanged();
    return pto;
  });

  ipcMain.handle('clear-pto', (_e, userId) => {
    if (!db) return false;
    db.clearPTO(userId);
    if (sync) sync.pushEvent('pto-cleared', { user_id: userId });
    notifyDataChanged();
    return true;
  });

  // Export
  ipcMain.handle('export-pdf', async () => {
    if (!db) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export PDF',
      defaultPath: 'SD_Schedule.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled) return null;

    // Generate HTML, load in hidden window, print to PDF
    const config = loadConfig() || {};
    const exp = new ExportEngine(db);
    const tmpHtml = path.join(APP_DATA_DIR, '_export_tmp.html');
    exp.exportHTML(tmpHtml, { reloadInterval: config.htmlReloadInterval || 60 });

    const printWin = new BrowserWindow({ show: false, width: 1056, height: 1632 });
    await printWin.loadFile(tmpHtml);

    // Wait for fonts/styles to settle
    await new Promise(r => setTimeout(r, 500));

    const pdfData = await printWin.webContents.printToPDF({
      landscape: false,
      pageSize: 'Tabloid',  // 11x17
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      printBackground: true
    });

    fs.writeFileSync(result.filePath, pdfData);
    printWin.close();

    // Clean up temp file
    try { fs.unlinkSync(tmpHtml); } catch (_) {}

    return result.filePath;
  });

  ipcMain.handle('export-html', async () => {
    if (!db) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export HTML',
      defaultPath: 'SD_Schedule.html',
      filters: [{ name: 'HTML', extensions: ['html'] }]
    });
    if (result.canceled) return null;
    const cfg = loadConfig() || {};
    const exp = new ExportEngine(db);
    return exp.exportHTML(result.filePath, { reloadInterval: cfg.htmlReloadInterval || 60 });
  });

  // Excel import
  ipcMain.handle('import-excel', async () => {
    if (!db) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Projects from Excel',
      filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const importer = new ExcelImport(db);
    const importResult = await importer.import(result.filePaths[0]);

    // Save the excel path so we can re-import later
    const config = loadConfig() || {};
    config.excelPath = result.filePaths[0];
    saveConfig(config);

    // Sync the new projects to other users
    if (sync) {
      const projects = db.getProjects();
      for (const p of projects) {
        sync.pushEvent('project-created', p);
      }
    }

    notifyDataChanged();
    return importResult;
  });

  ipcMain.handle('refresh-excel', async () => {
    if (!db) return null;
    const config = loadConfig();
    if (!config || !config.excelPath) return { error: 'No Excel file configured. Use Import first.' };

    try {
      const importer = new ExcelImport(db);
      const result = await importer.import(config.excelPath);

      if (sync) {
        const projects = db.getProjects();
        for (const p of projects) {
          sync.pushEvent('project-updated', p);
        }
      }

      notifyDataChanged('manual-excel-refresh', {
        imported: result.imported || 0,
        updated: result.updated || 0,
      });
      return result;
    } catch (err) {
      return { error: err.message };
    }
  });

  // Export path settings
  ipcMain.handle('get-export-path', () => {
    const config = loadConfig();
    return config?.exportPath || null;
  });

  ipcMain.handle('set-export-path', async (_e, exportPath) => {
    const config = loadConfig() || {};
    if (exportPath) {
      config.exportPath = exportPath;
    } else {
      delete config.exportPath;
    }
    saveConfig(config);
    // Trigger an immediate export if path was set
    if (exportPath) scheduleAutoExport();
    emitRuntimeStatus();
    return true;
  });

  ipcMain.handle('select-export-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Export Folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('get-excel-path', () => {
    const config = loadConfig();
    return config?.excelPath || null;
  });

  // Weekly rollover
  ipcMain.handle('check-rollover', () => {
    const state = getWeeklyRolloverState();
    // Repair, once per session: a Lead that was set on only some of a
    // project's assignments is copied to the rest.
    if (db && auth?.isAdmin?.() && !projectLeadsReconciled) {
      projectLeadsReconciled = true;
      try {
        const repaired = db.reconcileProjectLeads();
        if (repaired.length) {
          publishLeadChangedTasks(repaired);
          appendInputDiagnostics({ scope: 'main', type: 'project-leads-reconciled', count: repaired.length });
          notifyDataChanged('project-leads-reconciled', { count: repaired.length });
        }
      } catch (err) {
        console.error('Project Lead reconcile failed:', err.message);
      }
    }
    // Catch-up, once per week and session: if this week's rollover already
    // happened (here or on another computer) but unfinished cards were left in
    // an earlier week, bring them forward now. Never before the rollover itself.
    if (db && auth?.isAdmin?.() && !state.needed && !state.reviewInProgressElsewhere && state.currentWeek && workCardCarryOverCheckedWeek !== state.currentWeek) {
      workCardCarryOverCheckedWeek = state.currentWeek;
      if (carryOverWorkCards(state.currentWeek) > 0) notifyDataChanged('work-cards-carried-over', { source: 'catch-up' });
    }
    return state;
  });

  ipcMain.handle('perform-rollover', () => {
    if (!db || !auth?.isAdmin?.()) return false;
    const result = performWeeklyRollover({ force: true, source: 'manual' });
    notifyDataChanged('manual-rollover', { source: 'manual' });
    return result.applied;
  });

  ipcMain.handle('init-rollover-week', () => {
    if (!db) return false;
    return getWeeklyRolloverState().initialized;
  });

  ipcMain.handle('consume-rollover-notice', () => {
    const notice = pendingStartupRolloverNotice;
    pendingStartupRolloverNotice = null;
    return notice;
  });

  ipcMain.handle('get-rollover-publication-state', () => {
    return getRolloverPublicationSummary();
  });

  ipcMain.handle('publish-rollover-changes', () => {
    const result = publishRolloverChanges();
    if (result.published) notifyDataChanged('rollover-published', result);
    return result;
  });

  ipcMain.handle('confirm-task', (_e, taskId) => {
    if (!db) return null;
    const previousTask = db.getTaskById(taskId);
    const task = db.confirmTask(taskId);
    if (shouldStageRolloverTask(previousTask)) stageRolloverTaskChange(taskId);
    else if (sync) sync.pushEvent('task-confirmed', { id: taskId });
    notifyDataChanged('task-confirmed', { taskId });
    return task;
  });

  // Manual sync trigger
  ipcMain.handle('force-sync', async () => {
    if (!sync) return true;
    sync.flushOutbox();
    const events = sync.retryFailedFiles();
    markSyncActivity();
    await handlePulledSyncEvents(events);
    // The Dashboard owns the full office assignment set. A manual sync is
    // also the intentional recovery action for a partial MyTasks cache, so
    // always publish a fresh complete snapshot even when there were no new
    // event files to process.
    const snapshotWritten = sync.writeSharedSnapshot();
    if (!snapshotWritten) {
      logger?.warn('Manual sync completed but the Dashboard snapshot could not be republished.');
    }
    emitRuntimeStatus();
    return { success: true, snapshotWritten };
  });
}

// ── App Lifecycle ─────────────────────────────��───────────

app.whenReady().then(async () => {
  logger?.info('app-ready', { pid: process.pid });
  app.setAppUserModelId('com.studiosync.dashboard');
  registerIPC();
  createWindow();
  updateManager = new UpdateManager({
    app,
    dialog,
    loadConfig,
    saveConfig,
    getDb: () => db,
    getMainWindow: () => mainWindow,
    appKey: 'scheduling',
    productName: 'StudioSync',
    installerBaseName: 'StudioSync Setup',
    onPrompt: (result) => emitUpdatePrompt(result),
  });

});

app.on('window-all-closed', () => {
  appendInputDiagnostics({ scope: 'main', type: 'window-all-closed' });
  logger?.info('window-all-closed');
  if (updateManager) updateManager.stop();
  if (sync) sync.stopPolling();
  if (db) db.close();
  releaseLock();
  app.quit();
});

app.on('before-quit', () => {
  logger?.info('before-quit');
  releaseLock();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
