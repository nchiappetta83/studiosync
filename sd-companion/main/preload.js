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
  getStaffOverviewAssignments: () => ipcRenderer.invoke('get-staff-overview-assignments'),
  getTaskActivity:    (taskId)    => ipcRenderer.invoke('get-task-activity', taskId),
  getProjectActivity: (projectId) => ipcRenderer.invoke('get-project-activity', projectId),
  getRolloverReviewState: ()      => ipcRenderer.invoke('get-rollover-review-state'),
  createTask:         (data)      => ipcRenderer.invoke('create-task', data),
  updateTask:         (data)      => ipcRenderer.invoke('update-task', data),
  deleteTask:         (id)        => ipcRenderer.invoke('delete-task', id),

  // Work cards (shared project work, introduced in V1.3)
  getProjectWorkCards: (projectId, weekOf) => ipcRenderer.invoke('get-project-work-cards', projectId, weekOf),
  getMyProjectWorkCards: () => ipcRenderer.invoke('get-my-project-work-cards'),
  getMyWeekWorkCards:  (weekOf)    => ipcRenderer.invoke('get-my-week-work-cards', weekOf),
  getTeamCalendarWorkCards: ()      => ipcRenderer.invoke('get-team-calendar-work-cards'),
  createWorkCard:      (data)      => ipcRenderer.invoke('create-work-card', data),
  updateWorkCard:      (data)      => ipcRenderer.invoke('update-work-card', data),
  deleteWorkCard:      (id)        => ipcRenderer.invoke('delete-work-card', id),
  setWorkCardFocus:    (id)        => ipcRenderer.invoke('set-work-card-focus', id),
  getWorkCardCategories: ()         => ipcRenderer.invoke('get-work-card-categories'),

  // Private tasks (companion-only, not synced)
  getPrivateTasks:    ()          => ipcRenderer.invoke('get-private-tasks'),
  createPrivateTask:  (data)      => ipcRenderer.invoke('create-private-task', data),
  updatePrivateTask:  (data)      => ipcRenderer.invoke('update-private-task', data),
  deletePrivateTask:  (id)        => ipcRenderer.invoke('delete-private-task', id),

  // Sub-tasks
  getSubTasks:        (taskId)    => ipcRenderer.invoke('get-subtasks', taskId),
  getTaskSupportData: (taskIds)   => ipcRenderer.invoke('get-task-support-data', taskIds),
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
  getProjectSharedNotes: (projectId) => ipcRenderer.invoke('get-project-shared-notes', projectId),
  getAllProjectSharedNotes: ()       => ipcRenderer.invoke('get-all-project-shared-notes'),
  createProjectSharedNote: (data)    => ipcRenderer.invoke('create-project-shared-note', data),
  updateProjectSharedNote: (data)    => ipcRenderer.invoke('update-project-shared-note', data),
  deleteProjectSharedNote: (id)      => ipcRenderer.invoke('delete-project-shared-note', id),

  // PTO
  getPTO:             ()          => ipcRenderer.invoke('get-pto'),
  getCustomPriorities: ()         => ipcRenderer.invoke('get-custom-priorities'),
  getPriorityMenuOrder: ()        => ipcRenderer.invoke('get-priority-menu-order'),
  getPriorityDisplayStyles: ()    => ipcRenderer.invoke('get-priority-display-styles'),

  // Config & setup
  getConfig:          ()          => ipcRenderer.invoke('get-config'),
  saveConfig:         (config)    => ipcRenderer.invoke('save-config', config),
  getOfficeCapacity:  ()          => ipcRenderer.invoke('get-office-capacity'),
  saveOfficeCapacity: (capacity)  => ipcRenderer.invoke('save-office-capacity', capacity),
  getLaunchOnStartup: ()          => ipcRenderer.invoke('get-launch-on-startup'),
  setLaunchOnStartup: (enabled)   => ipcRenderer.invoke('set-launch-on-startup', enabled),
  checkForUpdates:    ()          => ipcRenderer.invoke('check-for-updates'),
  getPendingUpdate:   ()          => ipcRenderer.invoke('get-pending-update'),
  dismissUpdate:      (version)   => ipcRenderer.invoke('dismiss-update', version),
  installUpdate:      ()          => ipcRenderer.invoke('install-update'),
  minimizeWindow:     ()          => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: ()        => ipcRenderer.invoke('window-toggle-maximize'),
  closeWindow:        ()          => ipcRenderer.invoke('window-close'),
  getWindowState:     ()          => ipcRenderer.invoke('get-window-state'),
  getRuntimeStatus:   ()          => ipcRenderer.invoke('get-runtime-status'),
  openLink:           (value)     => ipcRenderer.invoke('open-link', value),
  openProjectNotesWindow: (projectId) => ipcRenderer.invoke('open-project-notes-window', projectId),
  openProjectActivityWindow: (projectId) => ipcRenderer.invoke('open-project-activity-window', projectId),
  setWindowMode:      (mode)      => ipcRenderer.invoke('set-window-mode', mode),
  selectFolder:       ()          => ipcRenderer.invoke('select-folder'),
  initializeApp:      (path)      => ipcRenderer.invoke('initialize-app', path),

  // Sync
  forceSync:          ()          => ipcRenderer.invoke('force-sync'),
  getLogPaths:        ()          => ipcRenderer.invoke('get-log-paths'),
  writeLog:           (entry)     => ipcRenderer.invoke('write-log', entry),
  getDiagnosticsPath: ()          => ipcRenderer.invoke('get-diagnostics-path'),
  logDiagnostics:     (entry)     => ipcRenderer.invoke('log-diagnostics', entry),

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
  onRuntimeStatusChanged: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('runtime-status-changed', handler);
    return () => ipcRenderer.removeListener('runtime-status-changed', handler);
  },
});
