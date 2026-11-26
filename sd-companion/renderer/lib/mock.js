/**
 * Mock API for browser preview — simulates the Electron IPC bridge
 * with sample data so the UI can be previewed without Electron.
 * This file is only loaded when the Electron bridge is unavailable.
 * (Mirrors sd-scheduling/renderer/lib/mock.js, extended with the
 * companion-only endpoints this app's preload exposes.)
 */

if (!window.api) {
  const MOCK_USERS = [
    { id: 'u1', username: 'jsmith', display_name: 'John Smith', role: 'partner', avatar_color: '#5856A6', sort_order: 1, active: 1 },
    { id: 'u2', username: 'mjones', display_name: 'Maria Jones', role: 'partner', avatar_color: '#3D8A6E', sort_order: 2, active: 1 },
    { id: 'u3', username: 'bwilson', display_name: 'Brian Wilson', role: 'staff', avatar_color: '#A8803F', sort_order: 3, active: 1 },
    { id: 'u4', username: 'achen', display_name: 'Amy Chen', role: 'staff', avatar_color: '#5478A3', sort_order: 4, active: 1 },
    { id: 'u5', username: 'dgarcia', display_name: 'David Garcia', role: 'staff', avatar_color: '#A65C5C', sort_order: 5, active: 1 },
    { id: 'u6', username: 'klee', display_name: 'Karen Lee', role: 'staff', avatar_color: '#7E5FA6', sort_order: 6, active: 1 },
  ];

  const MOCK_PROJECTS = [
    { id: 'p1', client: 'Acme Corp', name: 'Annual Audit', status: 'active', category: 'active', notes: 'FY2026 year-end', partner_id: 'u1', partner_ids: '["u1"]', folder_path: '', sort_order: 1 },
    { id: 'p2', client: 'TechStart Inc', name: 'Tax Return', status: 'active', category: 'active', notes: '', partner_id: 'u2', partner_ids: '["u2"]', folder_path: '', sort_order: 2 },
    { id: 'p3', client: 'City Hospital', name: 'Compliance Review', status: 'active', category: 'active', notes: 'Due April 15', partner_id: 'u1', partner_ids: '["u1","u2"]', folder_path: '', sort_order: 3 },
    { id: 'p4', client: 'Green Energy Co', name: 'Q1 Reporting', status: 'active', category: 'future', notes: '', partner_id: 'u2', partner_ids: '["u2"]', folder_path: '', sort_order: 4 },
    { id: 'p5', client: 'Riverside LLC', name: 'Payroll Setup', status: 'inactive', category: 'active', notes: 'On hold', partner_id: 'u1', partner_ids: '["u1"]', folder_path: '', sort_order: 5 },
  ];

  const MOCK_TASKS = [
    { id: 't1', project_id: 'p1', assigned_to: 'u3', created_by: 'u1', title: 'Acme Corp | Review bank reconciliations', notes: 'Check Q4 statements', priority: 1, due_date: '2026-03-25', completed: 0, sort_order: 1, confirmed: 1, partner_id: 'u1' },
    { id: 't2', project_id: 'p1', assigned_to: 'u3', created_by: 'u1', title: 'Acme Corp | Prepare audit workpapers', notes: '', priority: 2, due_date: '2026-03-28', completed: 0, sort_order: 2, confirmed: 1, partner_id: 'u1' },
    { id: 't3', project_id: 'p2', assigned_to: 'u4', created_by: 'u2', title: 'TechStart Inc | Gather W-2 documents', notes: 'Waiting on client', priority: 2, due_date: '2026-03-26', completed: 0, sort_order: 1, confirmed: 0, partner_id: 'u2' },
    { id: 't4', project_id: 'p3', assigned_to: 'u4', created_by: 'u1', title: 'City Hospital | HIPAA compliance checklist', notes: '', priority: 1, due_date: '2026-03-14', completed: 0, sort_order: 2, confirmed: 1, partner_id: 'u1' },
    { id: 't5', project_id: 'p2', assigned_to: 'u5', created_by: 'u2', title: 'TechStart Inc | Calculate depreciation schedules', notes: 'Use MACRS tables', priority: 3, due_date: '2026-04-01', completed: 0, sort_order: 1, confirmed: 1, partner_id: null },
    { id: 't6', project_id: 'p4', assigned_to: 'u5', created_by: 'u2', title: 'Green Energy Co | Draft quarterly financials', notes: '', priority: -1, due_date: '2026-04-05', completed: 0, sort_order: 2, confirmed: 0, partner_id: 'u2' },
    { id: 't7', project_id: 'p1', assigned_to: 'u6', created_by: 'u1', title: 'Acme Corp | Confirm receivables balances', notes: 'Send confirmation letters', priority: 2, due_date: '2026-03-27', completed: 0, sort_order: 1, confirmed: 1, partner_id: 'u1' },
    { id: 't8', project_id: 'p3', assigned_to: 'u6', created_by: 'u1', title: 'City Hospital | Review vendor agreements', notes: '', priority: 4, due_date: '2026-04-10', completed: 1, sort_order: 2, confirmed: 1, partner_id: null },
    { id: 't9', project_id: 'p4', assigned_to: 'u3', created_by: 'u2', title: 'Green Energy Co | Reconcile intercompany accounts', notes: '', priority: 3, due_date: '2026-04-02', completed: 0, sort_order: 3, confirmed: 1, partner_id: 'u2' },
    { id: 't10', project_id: null, assigned_to: 'u1', created_by: 'u1', title: 'Review all staff workpapers before meeting', notes: 'Weekly scheduling prep', priority: 2, due_date: '2026-03-24', completed: 0, sort_order: 1, confirmed: 1, partner_id: null },
    { id: 't11', project_id: null, assigned_to: 'u2', created_by: 'u2', title: 'Follow up with TechStart on missing docs', notes: '', priority: 1, due_date: '2026-03-24', completed: 0, sort_order: 1, confirmed: 0, partner_id: null },
  ];

  const MOCK_PRIVATE_TASKS = [
    { id: 'pv1', project_id: null, assigned_to: 'u1', created_by: 'u1', title: 'Call landlord about lease renewal', notes: '', priority: 2, due_date: '2026-03-25', completed: 0, sort_order: 1, confirmed: 1, partner_id: null },
    { id: 'pv2', project_id: null, assigned_to: 'u1', created_by: 'u1', title: 'Draft partner meeting agenda', notes: '', priority: 1, due_date: '2026-03-23', completed: 0, sort_order: 2, confirmed: 1, partner_id: null },
  ];

  const MOCK_SUBTASKS = [
    { id: 's1', task_id: 't1', title: 'Download December statement', completed: 1, sort_order: 1 },
    { id: 's2', task_id: 't1', title: 'Compare against GL entries', completed: 0, sort_order: 2 },
    { id: 's3', task_id: 't1', title: 'Document discrepancies', completed: 0, sort_order: 3 },
    { id: 's4', task_id: 't3', title: 'Email client for W-2 copies', completed: 1, sort_order: 1 },
    { id: 's5', task_id: 't3', title: 'Cross-reference with payroll records', completed: 0, sort_order: 2 },
  ];

  const MOCK_COMMENTS = [
    { id: 'c1', task_id: 't1', author_id: 'u1', author_name: 'John Smith', author_color: '#5856A6', body: 'Make sure to flag anything over $5K variance.', created_at: '2026-03-23T14:30:00' },
    { id: 'c2', task_id: 't1', author_id: 'u3', author_name: 'Brian Wilson', author_color: '#A8803F', body: 'Will do. I noticed a $12K discrepancy in the operating account — investigating now.', created_at: '2026-03-23T15:45:00' },
    { id: 'c3', task_id: 't3', author_id: 'u2', author_name: 'Maria Jones', author_color: '#3D8A6E', body: 'Client said they\'ll send by EOD Thursday.', created_at: '2026-03-22T10:00:00' },
  ];

  const MOCK_PTO = [
    { user_id: 'u5', dates: ['2026-03-25', '2026-03-26', '2026-03-27'], label: '3/25-3/27' },
  ];

  const MOCK_PROJECT_NOTES = [
    { id: 'pn1', project_id: 'p1', author_id: 'u1', author_name: 'John Smith', body: 'Client wants a mid-quarter check-in call before the 15th.', created_at: '2026-03-20T09:00:00', updated_at: '2026-03-20T09:00:00' },
    { id: 'pn2', project_id: 'p3', author_id: 'u1', author_name: 'John Smith', body: 'Compliance deadline confirmed for April 15.', created_at: '2026-03-18T11:00:00', updated_at: '2026-03-18T11:00:00' },
  ];

  let currentUser = MOCK_USERS[0];

  window.api = {
    // Auth
    getCurrentUser:   async () => currentUser,
    login:            async (username) => {
      const match = MOCK_USERS.find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());
      if (match) currentUser = match;
      return match || null;
    },
    logout:           async () => { currentUser = null; return true; },

    // Users
    getUsers:         async () => MOCK_USERS.filter((u) => u.active),

    // Tasks (shared)
    getTasks:         async () => MOCK_TASKS,
    createTask:       async (d) => { const t = { ...d, id: 't' + Date.now(), completed: 0, sort_order: 99 }; MOCK_TASKS.push(t); return t; },
    updateTask:       async (d) => { const i = MOCK_TASKS.findIndex((t) => t.id === d.id); if (i >= 0) Object.assign(MOCK_TASKS[i], d); return MOCK_TASKS[i]; },
    deleteTask:       async (id) => { const i = MOCK_TASKS.findIndex((t) => t.id === id); if (i >= 0) MOCK_TASKS.splice(i, 1); return true; },

    // Private tasks
    getPrivateTasks:    async () => MOCK_PRIVATE_TASKS,
    createPrivateTask:  async (d) => { const t = { ...d, id: 'pv' + Date.now(), completed: 0, sort_order: 99 }; MOCK_PRIVATE_TASKS.push(t); return t; },
    updatePrivateTask:  async (d) => { const i = MOCK_PRIVATE_TASKS.findIndex((t) => t.id === d.id); if (i >= 0) Object.assign(MOCK_PRIVATE_TASKS[i], d); return MOCK_PRIVATE_TASKS[i]; },
    deletePrivateTask:  async (id) => { const i = MOCK_PRIVATE_TASKS.findIndex((t) => t.id === id); if (i >= 0) MOCK_PRIVATE_TASKS.splice(i, 1); return true; },

    // Sub-tasks
    getSubTasks:      async (taskId) => MOCK_SUBTASKS.filter((s) => s.task_id === taskId),
    getTaskSupportData: async (taskIds) => {
      const ids = Array.isArray(taskIds) ? taskIds : [];
      const subtasksByTaskId = {};
      const commentsByTaskId = {};
      for (const id of ids) {
        subtasksByTaskId[id] = MOCK_SUBTASKS.filter((s) => s.task_id === id);
        commentsByTaskId[id] = MOCK_COMMENTS.filter((c) => c.task_id === id);
      }
      return { subtasksByTaskId, commentsByTaskId };
    },
    createSubTask:    async (d) => { const s = { ...d, id: 's' + Date.now(), completed: 0 }; MOCK_SUBTASKS.push(s); return s; },
    updateSubTask:    async (d) => d,
    deleteSubTask:    async (id) => { const i = MOCK_SUBTASKS.findIndex((s) => s.id === id); if (i >= 0) MOCK_SUBTASKS.splice(i, 1); return true; },
    toggleSubTask:    async (id) => { const s = MOCK_SUBTASKS.find((s) => s.id === id); if (s) s.completed = s.completed ? 0 : 1; return s; },

    // Comments
    getComments:      async (taskId) => MOCK_COMMENTS.filter((c) => c.task_id === taskId),
    addComment:       async (d) => { const c = { ...d, id: 'c' + Date.now(), author_name: currentUser?.display_name || 'You', author_color: currentUser?.avatar_color || '#5856A6', created_at: new Date().toISOString() }; MOCK_COMMENTS.push(c); return c; },

    // Projects
    getProjects:      async () => MOCK_PROJECTS,
    createProject:    async (d) => { const p = { ...d, id: 'p' + Date.now(), sort_order: 99 }; MOCK_PROJECTS.push(p); return p; },
    updateProject:    async (d) => { const i = MOCK_PROJECTS.findIndex((p) => p.id === d.id); if (i >= 0) Object.assign(MOCK_PROJECTS[i], d); return MOCK_PROJECTS[i]; },
    deleteProject:    async (id) => { const i = MOCK_PROJECTS.findIndex((p) => p.id === id); if (i >= 0) MOCK_PROJECTS.splice(i, 1); return true; },

    // Project Notes
    getProjectNotes:        async (projectId) => MOCK_PROJECT_NOTES.filter((n) => n.project_id === projectId),
    getAllProjectNotes:     async () => MOCK_PROJECT_NOTES,
    updateProjectNotes:     async (d) => d,
    getProjectSharedNotes:      async (projectId) => MOCK_PROJECT_NOTES.filter((n) => n.project_id === projectId),
    getAllProjectSharedNotes:   async () => MOCK_PROJECT_NOTES,
    createProjectSharedNote:    async (d) => { const n = { ...d, id: 'pn' + Date.now(), author_name: currentUser?.display_name || 'You', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; MOCK_PROJECT_NOTES.push(n); return n; },
    updateProjectSharedNote:    async (d) => { const i = MOCK_PROJECT_NOTES.findIndex((n) => n.id === d.id); if (i >= 0) Object.assign(MOCK_PROJECT_NOTES[i], d); return MOCK_PROJECT_NOTES[i]; },
    deleteProjectSharedNote:    async (id) => { const i = MOCK_PROJECT_NOTES.findIndex((n) => n.id === id); if (i >= 0) MOCK_PROJECT_NOTES.splice(i, 1); return true; },

    // PTO / priorities
    getPTO:                   async () => MOCK_PTO,
    getCustomPriorities:      async () => [],
    getPriorityMenuOrder:     async () => [],
    getPriorityDisplayStyles: async () => ({}),
    getWorkCardCategories: async () => [],

    // Config & setup
    getConfig:          async () => ({ sharedDrivePath: 'C:\\MockSharedDrive', rememberedUsername: currentUser?.username || '' }),
    saveConfig:         async () => true,
    getLaunchOnStartup: async () => false,
    setLaunchOnStartup: async () => true,
    checkForUpdates:    async () => ({ upToDate: true }),
    getPendingUpdate:   async () => null,
    dismissUpdate:      async () => true,
    installUpdate:      async () => true,
    minimizeWindow:     async () => true,
    toggleMaximizeWindow: async () => true,
    closeWindow:        async () => true,
    getWindowState:     async () => ({ isMaximized: false }),
    getRuntimeStatus:   async () => ({ authEntry: null, sharedDriveReachable: true, syncFailures: { count: 0 } }),
    openLink:           async () => true,
    openProjectNotesWindow: async () => true,
    setWindowMode:      async () => true,
    selectFolder:       async () => 'C:\\MockSharedDrive',
    initializeApp:      async () => ({ success: true, user: MOCK_USERS[0] }),

    // Sync
    forceSync:          async () => ({ success: true }),
    getLogPaths:        async () => ({ appLogPath: '', combinedLogPath: '' }),
    writeLog:           async () => true,

    // Data change listeners (no-ops in preview)
    onDataUpdated:          () => () => {},
    onUpdateAvailable:      () => () => {},
    onWindowStateChanged:   () => () => {},
    onRuntimeStatusChanged: () => () => {},
  };
}
