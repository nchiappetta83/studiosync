const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config & setup
  getConfig:        ()          => ipcRenderer.invoke('get-config'),
  saveConfig:       (config)    => ipcRenderer.invoke('save-config', config),
  getAppVersion:    ()          => ipcRenderer.invoke('get-app-version'),
  getUpdateFolderPath: ()       => ipcRenderer.invoke('get-update-folder-path'),
  setUpdateFolderPath: (path)   => ipcRenderer.invoke('set-update-folder-path', path),
  checkForUpdates:  ()          => ipcRenderer.invoke('check-for-updates'),
  getPendingUpdate: ()          => ipcRenderer.invoke('get-pending-update'),
  dismissUpdate:    (version)   => ipcRenderer.invoke('dismiss-update', version),
  installUpdate:    ()          => ipcRenderer.invoke('install-update'),
  minimizeWindow:   ()          => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: ()      => ipcRenderer.invoke('window-toggle-maximize'),
  closeWindow:      ()          => ipcRenderer.invoke('window-close'),
  focusWindow:      ()          => ipcRenderer.invoke('window-focus'),
  getWindowState:   ()          => ipcRenderer.invoke('get-window-state'),
  setWindowMode:    (mode)      => ipcRenderer.invoke('set-window-mode', mode),
  selectFolder:     ()          => ipcRenderer.invoke('select-folder'),
  initializeApp:    (path)      => ipcRenderer.invoke('initialize-app', path),

  // Auth
  getCurrentUser:   ()          => ipcRenderer.invoke('get-current-user'),
  login:            (username)  => ipcRenderer.invoke('login', username),
  logout:           ()          => ipcRenderer.invoke('logout'),

  // Users
  getUsers:         ()          => ipcRenderer.invoke('get-users'),
  createUser:       (data)      => ipcRenderer.invoke('create-user', data),
  updateUser:       (data)      => ipcRenderer.invoke('update-user', data),
  deleteUser:       (id)        => ipcRenderer.invoke('delete-user', id),

  // Business Roles
  getBusinessRoles:     ()      => ipcRenderer.invoke('get-business-roles'),
  createBusinessRole:   (data)  => ipcRenderer.invoke('create-business-role', data),
  updateBusinessRole:   (data)  => ipcRenderer.invoke('update-business-role', data),
  deleteBusinessRole:   (id)    => ipcRenderer.invoke('delete-business-role', id),
  reorderBusinessRoles: (orders) => ipcRenderer.invoke('reorder-business-roles', orders),

  // Custom Priorities
  getCustomPriorities:    ()      => ipcRenderer.invoke('get-custom-priorities'),
  createCustomPriority:   (data)  => ipcRenderer.invoke('create-custom-priority', data),
  updateCustomPriority:   (data)  => ipcRenderer.invoke('update-custom-priority', data),
  deleteCustomPriority:   (id)    => ipcRenderer.invoke('delete-custom-priority', id),
  reorderCustomPriorities: (orders) => ipcRenderer.invoke('reorder-custom-priorities', orders),

  // Tasks
  getTasks:         (filters)   => ipcRenderer.invoke('get-tasks', filters),
  createTask:       (data)      => ipcRenderer.invoke('create-task', data),
  updateTask:       (data)      => ipcRenderer.invoke('update-task', data),
  deleteTask:       (id)        => ipcRenderer.invoke('delete-task', id),
  reorderTasks:     (orders)    => ipcRenderer.invoke('reorder-tasks', orders),

  // Sub-tasks
  getSubTasks:      (taskId)    => ipcRenderer.invoke('get-subtasks', taskId),
  createSubTask:    (data)      => ipcRenderer.invoke('create-subtask', data),
  updateSubTask:    (data)      => ipcRenderer.invoke('update-subtask', data),
  deleteSubTask:    (id)        => ipcRenderer.invoke('delete-subtask', id),
  toggleSubTask:    (id)        => ipcRenderer.invoke('toggle-subtask', id),

  // Comments
  getComments:      (taskId)    => ipcRenderer.invoke('get-comments', taskId),
  addComment:       (data)      => ipcRenderer.invoke('add-comment', data),
  deleteComment:    (id)        => ipcRenderer.invoke('delete-comment', id),

  // Projects
  getProjects:      ()          => ipcRenderer.invoke('get-projects'),
  createProject:    (data)      => ipcRenderer.invoke('create-project', data),
  updateProject:    (data)      => ipcRenderer.invoke('update-project', data),
  deleteProject:    (id)        => ipcRenderer.invoke('delete-project', id),

  // Project Notes (partner-authored)
  getProjectNotes:    (projectId) => ipcRenderer.invoke('get-project-notes', projectId),
  getAllProjectNotes:  ()          => ipcRenderer.invoke('get-all-project-notes'),
  updateProjectNotes: (data)      => ipcRenderer.invoke('update-project-notes', data),

  // PTO (date-based)
  getPTO:           ()          => ipcRenderer.invoke('get-pto'),
  getPTOForUser:    (userId)    => ipcRenderer.invoke('get-pto-for-user', userId),
  setPTODates:      (data)      => ipcRenderer.invoke('set-pto-dates', data),
  clearPTO:         (userId)    => ipcRenderer.invoke('clear-pto', userId),

  // Export
  exportPDF:          ()          => ipcRenderer.invoke('export-pdf'),
  exportHTML:         ()          => ipcRenderer.invoke('export-html'),
  getExportPath:      ()          => ipcRenderer.invoke('get-export-path'),
  setExportPath:      (path)      => ipcRenderer.invoke('set-export-path', path),
  selectExportFolder: ()          => ipcRenderer.invoke('select-export-folder'),

  // Excel import
  importExcel:      ()          => ipcRenderer.invoke('import-excel'),
  refreshExcel:     ()          => ipcRenderer.invoke('refresh-excel'),
  getExcelPath:     ()          => ipcRenderer.invoke('get-excel-path'),

  // Weekly Rollover
  checkRollover:    ()          => ipcRenderer.invoke('check-rollover'),
  performRollover:  ()          => ipcRenderer.invoke('perform-rollover'),
  initRolloverWeek: ()          => ipcRenderer.invoke('init-rollover-week'),
  confirmTask:      (id)        => ipcRenderer.invoke('confirm-task', id),

  // Sync
  forceSync:        ()          => ipcRenderer.invoke('force-sync'),

  // Event listeners
  onDataUpdated:    (callback)  => {
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
  }
});
