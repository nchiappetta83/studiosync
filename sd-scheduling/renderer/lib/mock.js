/**
 * Mock API for browser preview — simulates the Electron IPC bridge
 * with sample data so the UI can be previewed without Electron.
 * This file is only loaded when the Electron bridge is unavailable.
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
    { id: 'p1', client: 'Acme Corp', name: 'Annual Audit', status: 'active', notes: 'FY2026 year-end', partner_id: 'u1', sort_order: 1 },
    { id: 'p2', client: 'TechStart Inc', name: 'Tax Return', status: 'active', notes: '', partner_id: 'u2', sort_order: 2 },
    { id: 'p3', client: 'City Hospital', name: 'Compliance Review', status: 'active', notes: 'Due April 15', partner_id: 'u1', sort_order: 3 },
    { id: 'p4', client: 'Green Energy Co', name: 'Q1 Reporting', status: 'active', notes: '', partner_id: 'u2', sort_order: 4 },
    { id: 'p5', client: 'Riverside LLC', name: 'Payroll Setup', status: 'inactive', notes: 'On hold', partner_id: 'u1', sort_order: 5 },
  ];

  const MOCK_TASKS = [
    { id: 't1', project_id: 'p1', assigned_to: 'u3', created_by: 'u1', title: 'Acme Corp — Review bank reconciliations', notes: 'Check Q4 statements', priority: 1, due_date: '2026-03-25', completed: 0, sort_order: 1, confirmed: 1, partner_id: 'u1' },
    { id: 't2', project_id: 'p1', assigned_to: 'u3', created_by: 'u1', title: 'Acme Corp — Prepare audit workpapers', notes: '', priority: 2, due_date: '2026-03-28', completed: 0, sort_order: 2, confirmed: 1, partner_id: 'u1' },
    { id: 't3', project_id: 'p2', assigned_to: 'u4', created_by: 'u2', title: 'TechStart Inc — Gather W-2 documents', notes: 'Waiting on client', priority: 2, due_date: '2026-03-26', completed: 0, sort_order: 1, confirmed: 0, partner_id: 'u2' },
    { id: 't4', project_id: 'p3', assigned_to: 'u4', created_by: 'u1', title: 'City Hospital — HIPAA compliance checklist', notes: '', priority: 1, due_date: '2026-03-24', completed: 0, sort_order: 2, confirmed: 1, partner_id: 'u1' },
    { id: 't5', project_id: 'p2', assigned_to: 'u5', created_by: 'u2', title: 'TechStart Inc — Calculate depreciation schedules', notes: 'Use MACRS tables', priority: 3, due_date: '2026-04-01', completed: 0, sort_order: 1, confirmed: 1, partner_id: null },
    { id: 't6', project_id: 'p4', assigned_to: 'u5', created_by: 'u2', title: 'Green Energy Co — Draft quarterly financials', notes: '', priority: 3, due_date: '2026-04-05', completed: 0, sort_order: 2, confirmed: 0, partner_id: 'u2' },
    { id: 't7', project_id: 'p1', assigned_to: 'u6', created_by: 'u1', title: 'Acme Corp — Confirm receivables balances', notes: 'Send confirmation letters', priority: 2, due_date: '2026-03-27', completed: 0, sort_order: 1, confirmed: 1, partner_id: 'u1' },
    { id: 't8', project_id: 'p3', assigned_to: 'u6', created_by: 'u1', title: 'City Hospital — Review vendor agreements', notes: '', priority: 4, due_date: '2026-04-10', completed: 0, sort_order: 2, confirmed: 1, partner_id: null },
    { id: 't9', project_id: 'p4', assigned_to: 'u3', created_by: 'u2', title: 'Green Energy Co — Reconcile intercompany accounts', notes: '', priority: 3, due_date: '2026-04-02', completed: 0, sort_order: 3, confirmed: 1, partner_id: 'u2' },
    { id: 't10', project_id: null, assigned_to: 'u1', created_by: 'u1', title: 'Review all staff workpapers before meeting', notes: 'Weekly scheduling prep', priority: 2, due_date: '2026-03-24', completed: 0, sort_order: 1, confirmed: 1, partner_id: null },
    { id: 't11', project_id: null, assigned_to: 'u2', created_by: 'u2', title: 'Follow up with TechStart on missing docs', notes: '', priority: 1, due_date: '2026-03-24', completed: 0, sort_order: 1, confirmed: 0, partner_id: null },
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

  window.api = {
    getConfig:        async () => ({ sharedDrivePath: 'C:\\MockSharedDrive' }),
    saveConfig:       async () => true,
    getAppVersion:    async () => '1.0.4',
    selectFolder:     async () => 'C:\\MockSharedDrive',
    initializeApp:    async () => ({ success: true, user: MOCK_USERS[0] }),
    getWindowsUsername: async () => 'jsmith',
    getCurrentUser:   async () => MOCK_USERS[0],
    getUsers:         async () => MOCK_USERS.filter(u => u.active),
    createUser:       async (d) => { const u = { ...d, id: 'u' + Date.now(), active: 1 }; MOCK_USERS.push(u); return u; },
    updateUser:       async (d) => d,
    deleteUser:       async () => ({ success: true }),
    getTasks:         async () => MOCK_TASKS,
    createTask:       async (d) => { const t = { ...d, id: 't' + Date.now(), completed: 0, sort_order: 99 }; MOCK_TASKS.push(t); return t; },
    updateTask:       async (d) => { const i = MOCK_TASKS.findIndex(t => t.id === d.id); if (i >= 0) Object.assign(MOCK_TASKS[i], d); return MOCK_TASKS[i]; },
    deleteTask:       async (id) => { const i = MOCK_TASKS.findIndex(t => t.id === id); if (i >= 0) MOCK_TASKS.splice(i, 1); return true; },
    reorderTasks:     async () => true,
    getSubTasks:      async (taskId) => MOCK_SUBTASKS.filter(s => s.task_id === taskId),
    createSubTask:    async (d) => { const s = { ...d, id: 's' + Date.now(), completed: 0 }; MOCK_SUBTASKS.push(s); return s; },
    updateSubTask:    async (d) => d,
    deleteSubTask:    async (id) => { const i = MOCK_SUBTASKS.findIndex(s => s.id === id); if (i >= 0) MOCK_SUBTASKS.splice(i, 1); return true; },
    toggleSubTask:    async (id) => { const s = MOCK_SUBTASKS.find(s => s.id === id); if (s) s.completed = s.completed ? 0 : 1; return s; },
    getComments:      async (taskId) => MOCK_COMMENTS.filter(c => c.task_id === taskId),
    addComment:       async (d) => { const c = { ...d, id: 'c' + Date.now(), author_name: 'John Smith', author_color: '#5856A6', created_at: new Date().toISOString() }; MOCK_COMMENTS.push(c); return c; },
    deleteComment:    async (id) => { const i = MOCK_COMMENTS.findIndex(c => c.id === id); if (i >= 0) MOCK_COMMENTS.splice(i, 1); return true; },
    getProjects:      async () => MOCK_PROJECTS,
    createProject:    async (d) => { const p = { ...d, id: 'p' + Date.now(), sort_order: 99 }; MOCK_PROJECTS.push(p); return p; },
    updateProject:    async (d) => { const i = MOCK_PROJECTS.findIndex(p => p.id === d.id); if (i >= 0) Object.assign(MOCK_PROJECTS[i], d); return MOCK_PROJECTS[i]; },
    deleteProject:    async (id) => { const i = MOCK_PROJECTS.findIndex(p => p.id === id); if (i >= 0) MOCK_PROJECTS.splice(i, 1); return true; },
    getPTO:           async () => MOCK_PTO,
    getPTOForUser:    async (userId) => MOCK_PTO.find(p => p.user_id === userId) || null,
    setPTODates:      async (d) => { const i = MOCK_PTO.findIndex(p => p.user_id === d.user_id); if (i >= 0) MOCK_PTO[i] = d; else MOCK_PTO.push(d); return d; },
    clearPTO:         async (userId) => { const i = MOCK_PTO.findIndex(p => p.user_id === userId); if (i >= 0) MOCK_PTO.splice(i, 1); return true; },
    exportPDF:          async () => 'mock_export.pdf',
    exportHTML:         async () => 'mock_export.html',
    getExportPath:      async () => null,
    setExportPath:      async () => true,
    selectExportFolder: async () => 'C:\\Mock\\Exports',
    importExcel:        async () => ({ imported: 5, updated: 0, sheets: ['Current Projects', 'Future Projects'] }),
    refreshExcel:       async () => ({ imported: 0, updated: 2, sheets: ['Current Projects'] }),
    getExcelPath:       async () => 'C:\\Mock\\SD_Schedule.xlsx',
    getBusinessRoles:     async () => [
      { id: 'r1', name: 'Senior Designer', sort_order: 1 },
      { id: 'r2', name: 'Designer', sort_order: 2 },
      { id: 'r3', name: 'Modeler', sort_order: 3 },
    ],
    createBusinessRole:   async (d) => ({ ...d, id: 'r' + Date.now() }),
    updateBusinessRole:   async (d) => d,
    deleteBusinessRole:   async () => true,
    reorderBusinessRoles: async () => true,
    getCustomPriorities:  async () => [],
    createCustomPriority: async (d) => ({ ...d, id: 'cp' + Date.now() }),
    updateCustomPriority: async (d) => d,
    deleteCustomPriority: async () => true,
    reorderCustomPriorities: async () => true,
    checkRollover:    async () => ({ needed: false, currentWeek: '2026-03-23', lastWeek: '2026-03-23' }),
    performRollover:  async () => { MOCK_TASKS.forEach(t => { t.confirmed = 0; t.priority = 0; }); return true; },
    initRolloverWeek: async () => true,
    confirmTask:      async (id) => { const t = MOCK_TASKS.find(t => t.id === id); if (t) t.confirmed = 1; return t; },
    forceSync:        async () => true,
    onDataUpdated:    (cb) => () => {},
  };
}
