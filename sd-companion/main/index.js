const { app, BrowserWindow, ipcMain, dialog, Menu, Notification, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('./database');
const SyncEngine = require('./sync');
const Auth = require('./auth');
const UpdateManager = require('./updateManager');

let mainWindow = null;
let db = null;
let sync = null;
let auth = null;
let tray = null;
let isQuitting = false;
let hasShownTrayHint = false;
let updateManager = null;

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

function getTrayIconPath() {
  return path.join(__dirname, '..', 'assets', 'studiosync-mytasks-fixed.ico');
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
  if (!task || task.assigned_to !== currentUserId) return;

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
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
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

  mainWindow.once('ready-to-show', () => {
    emitWindowState();
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideToTray();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => emitWindowState());
  mainWindow.on('unmaximize', () => emitWindowState());
  mainWindow.on('enter-full-screen', () => emitWindowState());
  mainWindow.on('leave-full-screen', () => emitWindowState());
}

// ── IPC Handlers ───────────────────────────────────────

function registerIPC() {
  // Config
  ipcMain.handle('get-config', () => loadConfig());
  ipcMain.handle('save-config', (_e, config) => {
    saveConfig(config);
    return true;
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
      sync.startPolling((events) => {
        processIncomingEvents(events);
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
    return true;
  });

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
    const task = db.createTask(data);
    if (sync) sync.pushEvent('task-created', task);
    notifyDataChanged();
    return task;
  });

  ipcMain.handle('update-task', (_e, data) => {
    if (!db) return null;
    const task = db.updateTask(data);
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

  // PTO
  ipcMain.handle('get-pto', () => {
    if (!db) return [];
    return db.getPTO();
  });

  ipcMain.handle('get-custom-priorities', () => {
    if (!db) return [];
    return db.getCustomPriorities();
  });

  // Sync
  ipcMain.handle('force-sync', () => {
    if (!sync) return false;
    const events = sync.pull();
    if (events.length > 0) {
      processIncomingEvents(events);
      notifyDataChanged();
    }
    return true;
  });
}

// ── App Lifecycle ──────────────────────────────────────

app.whenReady().then(async () => {
  app.setAppUserModelId('com.studiosync.mytasks');
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
          delete config.loggedInUsername;
          saveConfig(config);
          auth.setUsername(null);
        }
      }

      sync = new SyncEngine(db, resolvedSharedPath, config.loggedInUsername || 'unknown', 'companion');
      sync.initialize();
      sync.startPolling((events) => {
        processIncomingEvents(events);
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
    } catch (err) {
      console.error('Failed to initialize:', err.message);
    }
  }
});

app.on('window-all-closed', () => {
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
  isQuitting = true;
});
