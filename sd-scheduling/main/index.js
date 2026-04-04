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

let mainWindow = null;
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

const ENV_APP_DATA_DIR = 'SD_APP_DATA_DIR';
const ENV_SHARED_DRIVE_PATH = 'SD_SHARED_DRIVE_PATH';

const WINDOW_MODES = {
  auth: { width: 760, height: 620, minWidth: 700, minHeight: 560 },
  main: { width: 1400, height: 900, minWidth: 1100, minHeight: 700 }
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

// ── Lock File ────────────────────────────────────────────
// Prevents two people from opening the main app simultaneously.

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

// ── Config ───────────────────────────────────────────────

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
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
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
  excelSync = null;
  excelWriteQueue = Promise.resolve();
  auth = null;
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
      console.log('Auto-export: Updated', exportFile);
    } catch (err) {
      console.error('Auto-export failed:', err.message);
    }
  }, 2000);
}

/**
 * Notify the renderer that data changed and trigger auto-export.
 */
function notifyDataChanged() {
  if (mainWindow) mainWindow.webContents.send('data-updated');
  scheduleAutoExport();
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
      return true;
    } catch (err) {
      console.error('Excel write-back failed:', err.message);
      return false;
    }
  };

  excelWriteQueue = excelWriteQueue.then(runWrite, runWrite);
  return excelWriteQueue;
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

  mainWindow.webContents.once('dom-ready', () => {
    showWindow();
  });

  mainWindow.once('ready-to-show', () => {
    showWindow();
  });

  setTimeout(() => {
    showWindow();
  }, 1500);

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
    mainWindow.focus();
    return true;
  });

  ipcMain.handle('get-window-state', () => {
    if (!mainWindow) return { isMaximized: false };
    return { isMaximized: mainWindow.isMaximized() };
  });

  ipcMain.handle('set-window-mode', (_e, modeName) => {
    return applyWindowMode(modeName);
  });

  ipcMain.handle('initialize-app', async (_e, sharedPath) => {
    try {
      const inspection = inspectSharedDrivePath(sharedPath, { allowEmpty: true });
      if (!inspection.valid) {
        return { success: false, error: inspection.reason };
      }

      // Explicit folder selection should reset the local cache so first-time
      // setup does not inherit stale local state from a previous environment.
      resetLocalCache();

      const resolvedSharedPath = inspection.resolvedPath;

      // Save config
      const existingConfig = loadConfig() || {};
      delete existingConfig.loggedInUsername;
      const config = { ...existingConfig, sharedDrivePath: resolvedSharedPath };
      saveConfig(config);

      if (!switchToSharedLock(resolvedSharedPath)) {
        return { success: false, error: 'StudioSync is already open for this shared folder on another machine.' };
      }

      // Initialize database
      const localDbPath = getLocalDbPath();
      db = new Database(localDbPath);
      db.initialize();
      excelSync = new ExcelSync(db);

      // Initialize auth
      auth = new Auth(db);
      const user = null;

      // Initialize sync
      sync = new SyncEngine(db, resolvedSharedPath, 'unknown', 'scheduling');
      sync.initialize();

      // Start polling
      sync.startPolling(async (events) => {
        await applyProjectEventsToExcel(events);
        if (updateManager) {
          updateManager.handleSyncEvents(events).catch((err) => {
            console.error('Update sync handling failed:', err.message);
          });
        }
        notifyDataChanged();
      });

      if (updateManager) {
        updateManager.start();
        await updateManager.checkForUpdates({ promptIfAvailable: true });
      }

      return { success: true, user };
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
      refreshLockMetadata();
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
    refreshLockMetadata();
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
    const assignedTaskCount = db.getAssignedTaskCount(userId);
    if (assignedTaskCount > 0) {
      return {
        success: false,
        error: assignedTaskCount === 1
          ? 'Reassign or clear the remaining task before removing this person.'
          : `Reassign or clear the ${assignedTaskCount} remaining tasks before removing this person.`,
        assignedTaskCount,
      };
    }
    db.deleteUser(userId);
    if (sync) sync.pushEvent('user-deleted', { id: userId });
    if (auth) auth.clearCache();
    return { success: true };
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

  ipcMain.handle('create-task', (_e, taskData) => {
    if (!db) return null;
    const task = db.createTask(taskData);
    if (sync) sync.pushEvent('task-created', task);
    notifyDataChanged();
    return task;
  });

  ipcMain.handle('update-task', (_e, taskData) => {
    if (!db) return null;
    const task = db.updateTask(taskData);
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

  ipcMain.handle('reorder-tasks', (_e, taskOrders) => {
    if (!db) return false;
    db.reorderTasks(taskOrders);
    if (sync) sync.pushEvent('tasks-reordered', taskOrders);
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
    notifyDataChanged();
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
    notifyDataChanged();
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
    notifyDataChanged();
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
    notifyDataChanged();
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

      notifyDataChanged();
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
    if (!db) return { needed: false };
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(now.getFullYear(), now.getMonth(), diff);
    const weekStr = monday.toISOString().split('T')[0];
    const lastRollover = db.getLastRolloverWeek();
    return { needed: lastRollover !== null && lastRollover !== weekStr, currentWeek: weekStr, lastWeek: lastRollover };
  });

  ipcMain.handle('perform-rollover', () => {
    if (!db) return false;
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.getFullYear(), now.getMonth(), diff);
    const weekStr = monday.toISOString().split('T')[0];

    db.performWeeklyRollover();
    db.setLastRolloverWeek(weekStr);
    db.optimizeStorage({ vacuum: true });

    if (sync) sync.pushEvent('weekly-rollover', { week: weekStr });
    notifyDataChanged();
    return true;
  });

  ipcMain.handle('init-rollover-week', () => {
    if (!db) return false;
    const lastWeek = db.getLastRolloverWeek();
    if (lastWeek) return false; // Already initialized
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.getFullYear(), now.getMonth(), diff);
    const weekStr = monday.toISOString().split('T')[0];
    db.setLastRolloverWeek(weekStr);
    return true;
  });

  ipcMain.handle('confirm-task', (_e, taskId) => {
    if (!db) return null;
    const task = db.confirmTask(taskId);
    if (sync) sync.pushEvent('task-confirmed', { id: taskId });
    notifyDataChanged();
    return task;
  });

  // Manual sync trigger
  ipcMain.handle('force-sync', () => {
    if (sync) sync.pull();
    return true;
  });
}

// ── App Lifecycle ─────────────────────────────��───────────

app.whenReady().then(async () => {
  // Acquire lock before doing anything else
  if (!acquireLock()) return;

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

  // Defer heavier auto-init work so the auth/setup window can paint immediately.
  setTimeout(async () => {
    const config = loadConfig();
    if (!config || !config.sharedDrivePath) return;

    try {
      const inspection = inspectSharedDrivePath(config.sharedDrivePath, { allowEmpty: true });
      if (!inspection.valid) throw new Error(inspection.reason);

      const localDbPath = getLocalDbPath();
      db = new Database(localDbPath);
      db.initialize();
      excelSync = new ExcelSync(db);
      auth = new Auth(db);
      if (config.loggedInUsername) {
        auth.setUsername(config.loggedInUsername);
        if (!auth.getCurrentUser()) {
          delete config.loggedInUsername;
          saveConfig(config);
          auth.setUsername(null);
        }
      }
      const resolvedSharedPath = inspection.resolvedPath;
      if (resolvedSharedPath !== config.sharedDrivePath) {
        config.sharedDrivePath = resolvedSharedPath;
        saveConfig(config);
      }

      sync = new SyncEngine(db, resolvedSharedPath, config.loggedInUsername || 'unknown', 'scheduling');
      sync.initialize();
      sync.startPolling(async (events) => {
        await applyProjectEventsToExcel(events);
        if (updateManager) {
          updateManager.handleSyncEvents(events).catch((err) => {
            console.error('Update sync handling failed:', err.message);
          });
        }
        notifyDataChanged();
      });
      if (updateManager) {
        updateManager.start();
        await updateManager.checkForUpdates({ promptIfAvailable: true });
      }

      // Auto-refresh projects from Excel if path is saved
      if (config.excelPath && fs.existsSync(config.excelPath)) {
        try {
          const importer = new ExcelImport(db);
          const result = await importer.import(config.excelPath);
          if (result.imported > 0 || result.updated > 0) {
            console.log(`Excel auto-refresh: ${result.imported} new, ${result.updated} updated`);
          }
        } catch (excelErr) {
          console.error('Excel auto-refresh failed:', excelErr.message);
        }
      }
    } catch (err) {
      console.error('Auto-init failed:', err.message);
    }
  }, 0);
});

app.on('window-all-closed', () => {
  if (updateManager) updateManager.stop();
  if (sync) sync.stopPolling();
  if (db) db.close();
  releaseLock();
  app.quit();
});

app.on('before-quit', () => {
  releaseLock();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
