const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Auth
  getCurrentUser:     ()          => ipcRenderer.invoke('get-current-user'),
  login:              (username)  => ipcRenderer.invoke('login', username),
  logout:             ()          => ipcRenderer.invoke('logout'),

  // Users
  getUsers:           ()          => ipcRenderer.invoke('get-users'),

  // Tasks (shared, from main app)
  getTasks:           (filters)   => ipcRenderer.invoke('get-tasks', filters),
  createTask:         (data)      => ipcRenderer.invoke('create-task', data),
  updateTask:         (data)      => ipcRenderer.invoke('update-task', data),
  deleteTask:         (id)        => ipcRenderer.invoke('delete-task', id),

  // Private tasks (companion-only, not synced)
  getPrivateTasks:    ()          => ipcRenderer.invoke('get-private-tasks'),
  createPrivateTask:  (data)      => ipcRenderer.invoke('create-private-task', data),
  updatePrivateTask:  (data)      => ipcRenderer.invoke('update-private-task', data),
  deletePrivateTask:  (id)        => ipcRenderer.invoke('delete-private-task', id),

  // Sub-tasks
  getSubTasks:        (taskId)    => ipcRenderer.invoke('get-subtasks', taskId),
  createSubTask:      (data)      => ipcRenderer.invoke('create-subtask', data),
  updateSubTask:      (data)      => ipcRenderer.invoke('update-subtask', data),
  deleteSubTask:      (id)        => ipcRenderer.invoke('delete-subtask', id),
  toggleSubTask:      (id)        => ipcRenderer.invoke('toggle-subtask', id),

  // Comments
  getComments:        (taskId)    => ipcRenderer.invoke('get-comments', taskId),
  addComment:         (data)      => ipcRenderer.invoke('add-comment', data),

  // Projects
  getProjects:        ()          => ipcRenderer.invoke('get-projects'),
  createProject:      (data)      => ipcRenderer.invoke('create-project', data),
  updateProject:      (data)      => ipcRenderer.invoke('update-project', data),
  deleteProject:      (id)        => ipcRenderer.invoke('delete-project', id),

  // Project Notes (partner-authored, separate from Excel notes)
  getProjectNotes:    (projectId) => ipcRenderer.invoke('get-project-notes', projectId),
  getAllProjectNotes:  ()          => ipcRenderer.invoke('get-all-project-notes'),
  updateProjectNotes: (data)      => ipcRenderer.invoke('update-project-notes', data),

  // PTO
  getPTO:             ()          => ipcRenderer.invoke('get-pto'),
  getCustomPriorities: ()         => ipcRenderer.invoke('get-custom-priorities'),

  // Config & setup
  getConfig:          ()          => ipcRenderer.invoke('get-config'),
  saveConfig:         (config)    => ipcRenderer.invoke('save-config', config),
  checkForUpdates:    ()          => ipcRenderer.invoke('check-for-updates'),
  getPendingUpdate:   ()          => ipcRenderer.invoke('get-pending-update'),
  dismissUpdate:      (version)   => ipcRenderer.invoke('dismiss-update', version),
  installUpdate:      ()          => ipcRenderer.invoke('install-update'),
  minimizeWindow:     ()          => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: ()        => ipcRenderer.invoke('window-toggle-maximize'),
  closeWindow:        ()          => ipcRenderer.invoke('window-close'),
  getWindowState:     ()          => ipcRenderer.invoke('get-window-state'),
  setWindowMode:      (mode)      => ipcRenderer.invoke('set-window-mode', mode),
  selectFolder:       ()          => ipcRenderer.invoke('select-folder'),
  initializeApp:      (path)      => ipcRenderer.invoke('initialize-app', path),

  // Sync
  forceSync:          ()          => ipcRenderer.invoke('force-sync'),

  // Data change listener
  onDataUpdated: (callback) => {
    ipcRenderer.on('data-updated', callback);
    return () => ipcRenderer.removeListener('data-updated', callback);
  },
  onUpdateAvailable: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onWindowStateChanged: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('window-state-changed', handler);
    return () => ipcRenderer.removeListener('window-state-changed', handler);
  },
});
