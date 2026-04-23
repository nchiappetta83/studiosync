// ── SD Companion App ────────────────────────────────
// Connected to real backend via IPC

const RendererLog = {
  _bound: false,

  bind() {
    if (this._bound || !window.api?.writeLog) return;
    this._bound = true;

    const originals = {
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      log: console.log.bind(console),
    };

    const forward = (level, args) => {
      const message = args.map((arg) => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch (_) {
          return String(arg);
        }
      }).join(' ');

      window.api.writeLog({
        level,
        message,
        meta: { scope: 'renderer' },
      }).catch(() => {});
    };

    console.error = (...args) => {
      forward('error', args);
      originals.error(...args);
    };

    console.warn = (...args) => {
      forward('warn', args);
      originals.warn(...args);
    };

    window.addEventListener('error', (event) => {
      window.api.writeLog({
        level: 'error',
        message: 'renderer-window-error',
        meta: {
          scope: 'renderer',
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error instanceof Error ? {
            name: event.error.name,
            message: event.error.message,
            stack: event.error.stack,
          } : event.error,
        },
      }).catch(() => {});
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason instanceof Error
        ? {
            name: event.reason.name,
            message: event.reason.message,
            stack: event.reason.stack,
          }
        : event.reason;

      window.api.writeLog({
        level: 'error',
        message: 'renderer-unhandled-rejection',
        meta: {
          scope: 'renderer',
          reason,
        },
      }).catch(() => {});
    });

    originals.log('Renderer logging initialized');
  },
};

RendererLog.bind();

let currentUser = null;
let selectedTaskId = null;
let selectedProjectId = null;
let selectedStaffFilter = null;
let selectedReadonlyStaffIds = [];
let activeFilter = null; // 'pending' | 'completed' | 'overdue' | null
let activeTab = 'my-tasks';

// ── Local data cache (populated from backend) ───────
let USERS = [];
let TASKS = [];
let PRIVATE_TASKS = [];
let PROJECTS = [];
let PTO_DATA = [];
let CUSTOM_PRIORITIES = [];
let PRIORITY_DISPLAY_STYLES = {};
let PROJECT_SHARED_NOTES_CACHE = {}; // projectId -> note[]
let SUBTASK_CACHE = {};       // taskId -> subtask[]
let COMMENT_CACHE = {};       // taskId -> comment[]
let UPDATE_UI_BOUND = false;
let WINDOW_CHROME_BOUND = false;
let SYNC_STATUS_RESET_TIMER = null;
let RESIZE_PERF_TIMER = null;
let RUNTIME_STATUS_BOUND = false;
let ACTIVE_PROJECT_FOLDER_EDIT = null;
let FORCE_COMMENT_SCROLL_TASK_ID = null;
let EXTERNAL_SYNC_REFRESH_PROMISE = null;
let EXTERNAL_SYNC_REFRESH_PENDING = false;
const STAFF_SECTION_COLLAPSE = {};
const PROJECT_SECTION_COLLAPSE = { active: false, future: true, inactive: true };
const COMMENT_VIEW_STATE = new Map();
const TASK_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
];
const COMMENT_SCROLL_BOTTOM_THRESHOLD = 18;

// ── Data Loading ────────────────────────────────────

async function loadAllData() {
  [USERS, TASKS, PROJECTS, PTO_DATA, CUSTOM_PRIORITIES, PRIORITY_DISPLAY_STYLES] = await Promise.all([
    window.api.getUsers(),
    window.api.getTasks(),
    window.api.getProjects(),
    window.api.getPTO(),
    window.api.getCustomPriorities(),
    window.api.getPriorityDisplayStyles(),
  ]);

  if (currentUser && currentUser.role === 'partner') {
    PRIVATE_TASKS = await window.api.getPrivateTasks();
  } else {
    PRIVATE_TASKS = [];
  }

  // Load shared project notes
  const allNotes = await window.api.getAllProjectSharedNotes();
  PROJECT_SHARED_NOTES_CACHE = {};
  for (const note of allNotes) {
    if (!PROJECT_SHARED_NOTES_CACHE[note.project_id]) {
      PROJECT_SHARED_NOTES_CACHE[note.project_id] = [];
    }
    PROJECT_SHARED_NOTES_CACHE[note.project_id].push(note);
  }

  // Pre-fetch subtasks and comments for all tasks
  const allTaskIds = [...TASKS, ...PRIVATE_TASKS].map(t => t.id);
  await loadSubtasksAndComments(allTaskIds);

  if (currentUser) {
    currentUser = USERS.find((user) => user.id === currentUser.id) || currentUser;
  }
}

async function loadSubtasksAndComments(taskIds) {
  const results = await Promise.all(taskIds.map(async id => {
    const [subs, comments] = await Promise.all([
      window.api.getSubTasks(id),
      window.api.getComments(id),
    ]);
    return { id, subs, comments };
  }));
  for (const r of results) {
    SUBTASK_CACHE[r.id] = r.subs;
    COMMENT_CACHE[r.id] = r.comments;
  }
}

async function refreshExternalDataAndUI() {
  if (EXTERNAL_SYNC_REFRESH_PROMISE) {
    EXTERNAL_SYNC_REFRESH_PENDING = true;
    return EXTERNAL_SYNC_REFRESH_PROMISE;
  }

  EXTERNAL_SYNC_REFRESH_PROMISE = (async () => {
    do {
      EXTERNAL_SYNC_REFRESH_PENDING = false;
      flashSyncIndicator();
      await loadAllData();
      syncCurrentUserUI();
      await refreshAll();
      if (selectedTaskId) await openDetailPanel(selectedTaskId);
      if (selectedProjectId) await openProjectDetailPanel(selectedProjectId);
    } while (EXTERNAL_SYNC_REFRESH_PENDING);
  })();

  try {
    await EXTERNAL_SYNC_REFRESH_PROMISE;
  } finally {
    EXTERNAL_SYNC_REFRESH_PROMISE = null;
  }
}

// ── Helpers ─────────────────────────────────────────

function getInitials(user) {
  if (!user) return '??';
  const f = user.first_name || user.display_name?.split(' ')[0] || '';
  const l = user.last_name || user.display_name?.split(' ').slice(1).join(' ') || '';
  return ((f[0] || '') + (l[0] || '')).toUpperCase() || '??';
}

function getProjectSharedNotes(projectId) {
  return (PROJECT_SHARED_NOTES_CACHE[projectId] || []).slice().sort((left, right) => {
    const updatedDiff = Date.parse(right.updated_at || 0) - Date.parse(left.updated_at || 0);
    if (Number.isFinite(updatedDiff) && updatedDiff !== 0) return updatedDiff;
    const createdDiff = Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0);
    if (Number.isFinite(createdDiff) && createdDiff !== 0) return createdDiff;
    return String(left.title || '').localeCompare(String(right.title || ''));
  });
}

function getPrimaryProjectSharedNote(projectId) {
  return getProjectSharedNotes(projectId)[0] || null;
}

function getProjectSharedNotesPreview(projectId) {
  const notes = getProjectSharedNotes(projectId);
  if (!notes.length) {
    return {
      summary: 'Open shared notes',
      detail: 'Add named notes for project updates, handoff details, and history.',
      count: 0,
    };
  }

  const latest = notes[0];
  const rawBody = String(latest.notes || '').trim().replace(/\s+/g, ' ');
  return {
    summary: notes.length === 1 ? (latest.title || 'Untitled note') : `${notes.length} notes`,
    detail: rawBody || 'No details yet.',
    count: notes.length,
  };
}

function formatProjectNoteTimestamp(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'Just now';
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getDefaultTabForCurrentUser() {
  return isPartner() ? 'staff-view' : 'my-tasks';
}

function getSidebarStaffName(user) {
  if (!user) return '';

  const firstName = String(user.first_name || user.display_name?.split(' ')[0] || '').trim();
  const lastName = String(user.last_name || user.display_name?.split(' ').slice(1).join(' ') || '').trim();

  if (firstName && lastName) {
    return `${firstName} ${lastName[0].toUpperCase()}`;
  }

  return String(user.display_name || '').trim();
}

function getUserById(id) {
  return USERS.find(u => u.id === id);
}

function getCommentStateSignature(comments = []) {
  if (!Array.isArray(comments) || comments.length === 0) return '0';
  const lastComment = comments[comments.length - 1];
  return `${comments.length}:${lastComment.id || ''}:${lastComment.created_at || ''}`;
}

function isCommentScrollAtBottom(scrollEl) {
  if (!scrollEl) return true;
  const remaining = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
  return remaining <= COMMENT_SCROLL_BOTTOM_THRESHOLD;
}

function setCommentJumpButtonState(button, unreadCount = 0) {
  if (!button) return;
  const hasUnread = unreadCount > 0;
  button.classList.toggle('hidden', !hasUnread);
  button.textContent = unreadCount > 1 ? `${unreadCount} new messages ↓` : 'New message ↓';
}

function getProjectById(id) {
  return PROJECTS.find(p => p.id === id);
}

function getTaskPartnerLabel(task, project = null) {
  const linkedProject = project || getProjectById(task.project_id);
  if (linkedProject?.partner_initials) return linkedProject.partner_initials;

  const partner = getUserById(task.partner_id || linkedProject?.partner_id);
  return partner ? getInitials(partner) : '';
}

function getProjectPartnerIds(project) {
  if (!project) return [];

  try {
    const parsed = JSON.parse(project.partner_ids || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function isFutureProject(project) {
  return project?.category === 'future' || project?.status === 'future';
}

function isProjectManagedByCurrentPartner(project) {
  if (!isPartner() || !currentUser || !project) return false;
  if (project.partner_id === currentUser.id) return true;
  return getProjectPartnerIds(project).includes(currentUser.id);
}

function getProjectsForCurrentPartner({ includeFuture = true, includeInactive = false } = {}) {
  if (!isPartner() || !currentUser) return [];

  return PROJECTS.filter((project) => {
    if (!isProjectManagedByCurrentPartner(project)) return false;
    if (includeInactive && project.status !== 'active') return true;
    if (includeFuture) {
      return project.status === 'active' || isFutureProject(project);
    }
    return project.status === 'active' && !isFutureProject(project);
  }).sort((a, b) => {
    const clientCompare = (a.client || '').localeCompare(b.client || '');
    if (clientCompare !== 0) return clientCompare;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function getProjectDisplayTitle(project) {
  if (!project) return '';
  return project.client ? `${project.client} | ${project.name}` : (project.name || '');
}

function normalizeTaskDisplayTitle(title) {
  const rawTitle = String(title || '').trim();
  if (!rawTitle) return '';
  if (rawTitle.includes('|')) {
    return rawTitle
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' | ');
  }
  return rawTitle.replace(/\s+[–—-]\s+/, ' | ');
}

function getTaskDisplayTitle(task, project = null) {
  const linkedProject = project || getProjectById(task?.project_id);
  if (linkedProject) return getProjectDisplayTitle(linkedProject);
  return normalizeTaskDisplayTitle(task?.title || '');
}

function getAssignedStaffForProject(projectId) {
  const seen = new Set();
  const assigned = [];

  for (const task of TASKS) {
    if (task.project_id !== projectId || !task.assigned_to || seen.has(task.assigned_to)) continue;
    const user = getUserById(task.assigned_to);
    if (!user || user.role !== 'staff' || user.active === 0) continue;
    seen.add(task.assigned_to);
    assigned.push(user);
  }

  return assigned.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
}

function canPartnerManageTask(task) {
  if (!isPartner()) return false;
  if (task?.partner_id === currentUser?.id) return true;
  return isProjectManagedByCurrentPartner(getProjectById(task?.project_id));
}

function canCurrentUserAddOwnTasks() {
  return Boolean(currentUser && currentUser.role === 'staff' && currentUser.can_self_assign);
}

function canCurrentUserUseStaffOverview() {
  return Boolean(isPartner() || currentUser?.role === 'staff');
}

function syncTabOrder() {
  const tabBar = document.getElementById('tab-bar');
  if (!tabBar) return;

  const staffViewTab = tabBar.querySelector('.tab[data-tab="staff-view"]');
  const myTasksTab = tabBar.querySelector('.tab[data-tab="my-tasks"]');
  const myProjectsTab = tabBar.querySelector('.tab[data-tab="my-projects"]');
  if (!staffViewTab || !myTasksTab || !myProjectsTab) return;

  if (isPartner()) {
    tabBar.append(staffViewTab, myTasksTab, myProjectsTab);
  } else {
    tabBar.append(myTasksTab, staffViewTab, myProjectsTab);
  }
}

function canCurrentUserAddActionItems(task) {
  return Boolean(
    task &&
    (
      canPartnerManageTask(task) ||
      (currentUser?.role === 'staff' && task.assigned_to === currentUser?.id)
    )
  );
}

function canCurrentUserManageTaskPriority(task) {
  return Boolean(
    task &&
    (
      canPartnerManageTask(task) ||
      (canCurrentUserAddOwnTasks() && task.assigned_to === currentUser?.id)
    )
  );
}

function canCurrentUserEditSharedTask(task) {
  return Boolean(
    task &&
    (
      canPartnerManageTask(task) ||
      (canCurrentUserAddOwnTasks() && task.assigned_to === currentUser?.id)
    )
  );
}

function canCurrentUserDeleteSharedTask(task) {
  return canCurrentUserEditSharedTask(task);
}

function isCurrentUserAssignedToProject(projectId) {
  if (!currentUser?.id || !projectId) return false;
  return TASKS.some((task) => task.project_id === projectId && task.assigned_to === currentUser.id);
}

function canCurrentUserManageProjectFolder(project) {
  if (!project) return false;
  if (isPartner()) return isProjectManagedByCurrentPartner(project);
  return isCurrentUserAssignedToProject(project.id);
}

function getProjectSection(project) {
  if (project?.status !== 'active') return 'inactive';
  return isFutureProject(project) ? 'future' : 'active';
}

function getTasksForUser(userId) {
  return TASKS.filter(t => t.assigned_to === userId);
}

function getTaskThreadTasks(task) {
  if (!task || !task.project_id) return task ? [task] : [];

  const threadTasks = TASKS.filter((item) => item.project_id === task.project_id);
  if (threadTasks.length === 0) return [task];
  return sortTasksLikeScheduling(threadTasks);
}

function getTaskThreadOwner(task) {
  const threadTasks = getTaskThreadTasks(task);
  if (threadTasks.length === 0) return task || null;

  return [...threadTasks].sort((a, b) => {
    const createdCompare = String(a.created_at || '').localeCompare(String(b.created_at || ''));
    if (createdCompare !== 0) return createdCompare;
    return String(a.id || '').localeCompare(String(b.id || ''));
  })[0];
}

function getTaskAssignees(task) {
  const seen = new Set();
  const assignees = [];

  for (const item of getTaskThreadTasks(task)) {
    if (!item.assigned_to || seen.has(item.assigned_to)) continue;
    const user = getUserById(item.assigned_to);
    if (!user) continue;
    seen.add(item.assigned_to);
    assignees.push(user);
  }

  return assignees.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
}

function getTaskActionItems(task) {
  const ownerTask = getTaskThreadOwner(task);
  return ownerTask ? (SUBTASK_CACHE[ownerTask.id] || []) : [];
}

function getTaskComments(task) {
  const comments = [];
  const seen = new Set();

  for (const item of getTaskThreadTasks(task)) {
    for (const comment of COMMENT_CACHE[item.id] || []) {
      if (seen.has(comment.id)) continue;
      seen.add(comment.id);
      comments.push(comment);
    }
  }

  return comments.sort((a, b) => {
    const timeCompare = String(a.created_at || '').localeCompare(String(b.created_at || ''));
    if (timeCompare !== 0) return timeCompare;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function getSharedPriorityTaskCount(userId) {
  const numericPool = TASKS.filter((item) => (
    item.assigned_to === userId &&
    item.priority !== -1 &&
    item.priority !== -2
  ));
  return Math.max(numericPool.length, 1);
}

function withAlpha(color, alpha, fallback) {
  const value = String(color || '').trim();
  const hexMatch = value.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!hexMatch) return fallback;

  const hex = hexMatch[1].length === 3
    ? hexMatch[1].split('').map((char) => char + char).join('')
    : hexMatch[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getPriorityDisplayStyles() {
  return {
    numbered: { color: '#4D4AD5', ...(PRIORITY_DISPLAY_STYLES?.numbered || {}) },
    wait: { color: '#6E7680', ...(PRIORITY_DISPLAY_STYLES?.wait || {}) },
    clear: { color: '#9CA6B4', ...(PRIORITY_DISPLAY_STYLES?.clear || {}) },
    customDefault: { color: '#5C6B75', ...(PRIORITY_DISPLAY_STYLES?.customDefault || {}) },
  };
}

function getPriorityTone(priority) {
  const baseColor = getPriorityDisplayStyles().numbered.color;
  return {
    color: baseColor,
    background: withAlpha(baseColor, 0.14, '#EEEDFE'),
    border: withAlpha(baseColor, 0.18, '#DCDFF7'),
  };
}

function getPriorityStyleForToken(token) {
  const baseColor = getPriorityDisplayStyles()[token]?.color || '#5C6B75';
  const isClear = token === 'clear';
  return {
    color: baseColor,
    background: withAlpha(baseColor, isClear ? 0.08 : 0.14, '#EEF1F4'),
    border: withAlpha(baseColor, isClear ? 0.12 : 0.18, '#E4EAF0'),
  };
}

function getPriorityInlineStyle(priority) {
  const tone = getPriorityTone(priority);
  return tone ? `color:${tone.color};background:${tone.background};border:1px solid ${tone.border};` : '';
}

function getPTOForUser(userId) {
  return PTO_DATA.find(p => p.user_id === userId) || null;
}

function getPrioritySortKey(priority) {
  if (typeof priority === 'number' && priority >= 1) return priority;
  if (priority === -2) return 500;
  if (priority === 0 || priority === null || priority === undefined) return 100;
  if (priority === -1) return 1000;
  return 150;
}

function sortTasksLikeScheduling(tasks) {
  return [...tasks].sort((a, b) => {
    const ac = a.confirmed ?? 1;
    const bc = b.confirmed ?? 1;
    if (ac !== bc) return bc - ac;

    if (a.completed !== b.completed) return a.completed ? 1 : -1;

    const ap = getPrioritySortKey(a.priority);
    const bp = getPrioritySortKey(b.priority);
    if (ap !== bp) return ap - bp;

    const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;

    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;

    return (a.title || '').localeCompare(b.title || '');
  });
}

function getPriorityPresentation(task) {
  const priority = task.priority;
  const isSet = priority !== null && priority !== undefined && priority !== '' && priority !== 0;

  if (!isSet) {
    return { label: '–', className: 'punset', inlineStyle: '', shortLabel: '–' };
  }

  if (priority === -1) {
    return { label: 'W', className: 'pw', inlineStyle: '', shortLabel: 'W' };
  }

  if (priority === -2 && task.priority_label) {
    const customLabel = task.priority_label.replace(/^cp:/, '');
    const shortLabel = customLabel.length <= 2 ? customLabel.toUpperCase() : customLabel.slice(0, 2).toUpperCase();
    return { label: customLabel, className: 'pcustom', inlineStyle: '', shortLabel };
  }

  if (typeof priority === 'number' && priority >= 1) {
    return { label: String(priority), className: 'pnumeric', inlineStyle: '', shortLabel: String(priority) };
  }

  return { label: '–', className: 'punset', inlineStyle: '', shortLabel: '–' };
}

function formatDate(dateStr) {
  if (!dateStr) return { text: '', cls: 'none', isCurrentWeek: false, isToday: false };
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((d - today) / 86400000);
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const isCurrentWeek = d >= weekStart && d <= weekEnd;
  const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const text = isCurrentWeek ? weekday : formatted;

  if (diff < 0) return { text, cls: 'urgent', isCurrentWeek, isToday: false };
  if (isCurrentWeek && diff === 0) return { text, cls: 'urgent', isCurrentWeek, isToday: true };
  if (isCurrentWeek) return { text, cls: 'warn', isCurrentWeek, isToday: false };
  if (diff <= 14) return { text, cls: 'future', isCurrentWeek: false, isToday: false };
  return { text, cls: 'normal', isCurrentWeek: false, isToday: false };
}

function getPriorityPresentation(task) {
  const priority = task.priority;
  const isSet = priority !== null && priority !== undefined && priority !== '' && priority !== 0;

  if (!isSet) {
    const clearTone = getPriorityStyleForToken('clear');
    return {
      label: '–',
      className: 'punset',
      inlineStyle: `color:${clearTone.color};background:${clearTone.background};border:1px solid ${clearTone.border};`,
      shortLabel: '–'
    };
  }

  if (priority === -1) {
    const waitTone = getPriorityStyleForToken('wait');
    return {
      label: 'W',
      className: 'pw',
      inlineStyle: `color:${waitTone.color};background:${waitTone.background};border:1px solid ${waitTone.border};`,
      shortLabel: 'W'
    };
  }

  if (priority === -2 && task.priority_label) {
    const customLabel = task.priority_label.replace(/^cp:/, '');
    const shortLabel = customLabel.length <= 2 ? customLabel.toUpperCase() : customLabel.slice(0, 2).toUpperCase();
    const customPriority = CUSTOM_PRIORITIES.find((item) => item.label === customLabel);
    const customColor = customPriority?.color || getPriorityDisplayStyles().customDefault.color;
    return {
      label: customLabel,
      className: 'pcustom',
      inlineStyle: `color:${customColor};background:${withAlpha(customColor, 0.14, '#EEF1F4')};border:1px solid ${withAlpha(customColor, 0.18, '#E4EAF0')};`,
      shortLabel
    };
  }

  if (typeof priority === 'number' && priority >= 1) {
    return {
      label: String(priority),
      className: 'pnumeric',
      inlineStyle: getPriorityInlineStyle(priority),
      shortLabel: String(priority)
    };
  }

  const clearTone = getPriorityStyleForToken('clear');
  return {
    label: '–',
    className: 'punset',
    inlineStyle: `color:${clearTone.color};background:${clearTone.background};border:1px solid ${clearTone.border};`,
    shortLabel: '–'
  };
}

function formatDate(dateStr) {
  if (!dateStr) return { text: '', cls: 'none', isCurrentWeek: false, isToday: false };
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((d - today) / 86400000);
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const isCurrentWeek = d >= weekStart && d <= weekEnd;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const text = isCurrentWeek ? weekday : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

  if (diff <= 0) return { text, cls: 'urgent', isCurrentWeek, isToday: diff === 0 };
  if (diff <= 3) return { text, cls: 'warn', isCurrentWeek, isToday: false };
  if (diff <= 14) return { text, cls: 'future', isCurrentWeek: false, isToday: false };
  return { text, cls: 'normal', isCurrentWeek: false, isToday: false };
}

function getTaskStatusValue(task) {
  if (!task) return 'not_started';
  if (task.completed) return 'complete';
  const status = String(task.status || '').trim();
  if (status === 'in_review') return 'in_progress';
  if (TASK_STATUS_OPTIONS.some((option) => option.value === status)) {
    return status;
  }
  return 'not_started';
}

function getTaskStatusLabel(task) {
  const value = getTaskStatusValue(task);
  return TASK_STATUS_OPTIONS.find((option) => option.value === value)?.label || 'Not started';
}

function timeAgo(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  const hrs = Math.floor((now - d) / 3600000);
  if (hrs < 1) return 'just now';
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function formatClockTime(isoStr) {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isPartner() {
  return currentUser && currentUser.role === 'partner';
}

function isTaskOverdue(task) {
  if (task.completed || !task.due_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.due_date + 'T00:00:00') < today;
}

function getSharedTaskById(id) {
  return TASKS.find((task) => task.id === id) || null;
}

function getActiveStaffUsers(excludeId = null) {
  return USERS
    .filter((user) => user.role === 'staff' && user.active !== 0 && user.id !== excludeId)
    .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
}

function getActionItemAssigneeOptions(task) {
  const seen = new Set();
  const users = [];

  for (const user of getTaskAssignees(task)) {
    if (!user?.id || seen.has(user.id)) continue;
    seen.add(user.id);
    users.push(user);
  }

  for (const user of getActiveStaffUsers()) {
    if (!user?.id || seen.has(user.id)) continue;
    seen.add(user.id);
    users.push(user);
  }

  return users.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
}

function renderActionItemAssigneeAvatar(userId) {
  const user = getUserById(userId);
  if (!user) return '';
  return `
    <span
      class="subtask-assignee-avatar"
      style="background:${user.avatar_color}"
      title="${escapeAttr(user.display_name || '')}"
    >
      ${escapeHtml(getInitials(user))}
    </span>
  `;
}

function escapeHtml(value) {
  if (!value) return '';
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function escapeAttr(value) {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getAvailableProjectsForTaskCreation() {
  if (isPartner()) {
    return getProjectsForCurrentPartner({ includeFuture: false });
  }

  return PROJECTS
    .filter((project) => project.status === 'active' && !isFutureProject(project))
    .sort((a, b) => {
      const clientCompare = (a.client || '').localeCompare(b.client || '');
      if (clientCompare !== 0) return clientCompare;
      return (a.name || '').localeCompare(b.name || '');
    });
}

function setTaskTitleInputValue(input, project) {
  if (!input) return;

  if (project) {
    input.value = `${project.client} | ${project.name}`;
    input.readOnly = true;
    input.dataset.projectLocked = 'true';
    input.classList.add('task-title-locked');
  } else {
    if (input.dataset.projectLocked === 'true') {
      input.value = '';
    }
    input.readOnly = false;
    input.dataset.projectLocked = 'false';
    input.classList.remove('task-title-locked');
  }
}

function bindProjectPickerSelection(picker, projects, titleInput, onProjectChange) {
  if (!picker) return;

  let selectedProjectId = null;

  picker.innerHTML = projects.length === 0 ? `
    <div class="project-picker-empty">No active projects are available right now.</div>
  ` : projects.map((project) => `
    <div class="project-picker-item" data-project-id="${project.id}">
      <span class="pp-name">${escapeHtml(project.client)} | ${escapeHtml(project.name)}</span>
      <span class="pp-status" style="color:var(--status-active)">ACTIVE</span>
    </div>
  `).join('');

  const applySelection = (projectId) => {
    selectedProjectId = projectId;
    picker.querySelectorAll('.project-picker-item').forEach((item) => {
      item.classList.toggle('selected', item.dataset.projectId === selectedProjectId);
    });
    const selectedProject = selectedProjectId ? getProjectById(selectedProjectId) : null;
    setTaskTitleInputValue(titleInput, selectedProject);
    if (onProjectChange) onProjectChange(selectedProjectId, selectedProject);
  };

  picker.querySelectorAll('.project-picker-item').forEach((item) => {
    item.addEventListener('click', () => {
      const nextProjectId = item.dataset.projectId;
      applySelection(selectedProjectId === nextProjectId ? null : nextProjectId);
    });
  });

  applySelection(null);
}

function positionMenu(menu, x, y) {
  menu.style.top = `${y}px`;
  menu.style.left = `${x}px`;

  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) {
      menu.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
    }
    if (rect.right > window.innerWidth - 8) {
      menu.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
    }
  });
}

const ContextMenu = {
  _current: null,

  create(items) {
    this.dismiss();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    this._appendItems(menu, items);

    document.body.appendChild(menu);
    this._current = menu;

    setTimeout(() => {
      document.addEventListener('click', this._onOutsideClick);
      document.addEventListener('keydown', this._onEscape);
    }, 0);

    return menu;
  },

  _appendItems(container, items) {
    for (const item of items) {
      if (item.divider) {
        const divider = document.createElement('div');
        divider.className = 'context-menu-divider';
        container.appendChild(divider);
        continue;
      }

      const btn = document.createElement(item.submenu ? 'div' : 'button');
      if (!item.submenu) btn.type = 'button';
      btn.className = `context-menu-item ${item.danger ? 'danger' : ''}${item.submenu ? ' has-submenu' : ''}`;

      let iconHtml = '';
      if (item.icon) {
        iconHtml = item.icon;
      } else if (item.color) {
        iconHtml = `<span style="width:10px;height:10px;border-radius:50%;background:${item.color};flex-shrink:0;"></span>`;
      }

      const chevronHtml = item.submenu
        ? '<span class="context-menu-chevron" aria-hidden="true">&#8250;</span>'
        : '';

      btn.innerHTML = `${iconHtml}<span class="context-menu-label">${escapeHtml(item.label)}</span>${chevronHtml}`;

      if (item.submenu) {
        const submenu = document.createElement('div');
        submenu.className = 'context-menu context-submenu';
        this._appendItems(submenu, item.submenu);
        btn.appendChild(submenu);

        const positionSubmenu = () => {
          requestAnimationFrame(() => {
            const rect = submenu.getBoundingClientRect();
            btn.classList.toggle('open-left', rect.right > window.innerWidth - 8);
            btn.classList.toggle('open-up', rect.bottom > window.innerHeight - 8);
          });
        };

        btn.addEventListener('mouseenter', positionSubmenu);
        btn.addEventListener('focusin', positionSubmenu);
      } else {
        btn.addEventListener('click', () => {
          this.dismiss();
          if (item.action) item.action();
        });
      }

      container.appendChild(btn);
    }
  },

  dismiss() {
    if (this._current) {
      this._current.remove();
      this._current = null;
    }
    document.removeEventListener('click', this._onOutsideClick);
    document.removeEventListener('keydown', this._onEscape);
  },

  _onOutsideClick(e) {
    if (ContextMenu._current && !ContextMenu._current.contains(e.target)) {
      ContextMenu.dismiss();
    }
  },

  _onEscape(e) {
    if (e.key === 'Escape') {
      ContextMenu.dismiss();
    }
  }
};

async function refreshAfterTaskChange(taskId = null) {
  await loadAllData();
  await refreshAll();

  if (taskId && getSharedTaskById(taskId)) {
    await openDetailPanel(taskId);
  } else if (taskId && selectedTaskId === taskId) {
    selectedTaskId = null;
    showDetailEmptyState();
  }
}

async function refreshAfterProjectChange(projectId = null, taskId = selectedTaskId) {
  await loadAllData();
  await refreshAll();

  if (taskId && getSharedTaskById(taskId)) {
    await openDetailPanel(taskId);
    return;
  }

  if (projectId && getProjectById(projectId)) {
    await openProjectDetailPanel(projectId);
  }
}

function clearSelectedTaskDetail() {
  selectedTaskId = null;
  ACTIVE_PROJECT_FOLDER_EDIT = null;
  document.querySelectorAll('.task-card').forEach((card) => card.classList.remove('selected'));
  showDetailEmptyState();
}

function buildPriorityMenuItems(task) {
  const maxPriority = getSharedPriorityTaskCount(task.assigned_to);
  const items = [];

  for (let i = 1; i <= maxPriority; i++) {
    items.push({
      label: String(i),
      color: getPriorityStyleForToken('numbered').color,
      action: async () => {
        await window.api.updateTask({ id: task.id, priority: i, priority_label: null });
        await refreshAfterTaskChange(task.id);
      }
    });
  }

  items.push({ divider: true });
  items.push({
    label: 'W (Wait)',
    color: getPriorityStyleForToken('wait').color,
    action: async () => {
      await window.api.updateTask({ id: task.id, priority: -1, priority_label: null });
      await refreshAfterTaskChange(task.id);
    }
  });

  if (CUSTOM_PRIORITIES.length > 0) {
    items.push({ divider: true });
    for (const priority of CUSTOM_PRIORITIES) {
      items.push({
        label: priority.label,
        color: priority.color,
        action: async () => {
          await window.api.updateTask({ id: task.id, priority: -2, priority_label: `cp:${priority.label}` });
          await refreshAfterTaskChange(task.id);
        }
      });
    }
  }

  items.push({ divider: true });
  items.push({
    label: '— Clear',
    color: getPriorityStyleForToken('clear').color,
    action: async () => {
      await window.api.updateTask({ id: task.id, priority: 0, priority_label: null });
      await refreshAfterTaskChange(task.id);
    }
  });

  return items;
}

function openPriorityMenu(anchor, task) {
  const menu = ContextMenu.create(buildPriorityMenuItems(task));
  const rect = anchor.getBoundingClientRect();
  positionMenu(menu, rect.left, rect.bottom + 4);
}

function buildPrioritySelectOptions(maxPriority) {
  const labels = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' };
  const options = ['<option value="">None</option>'];
  for (let i = 1; i <= maxPriority; i++) {
    const suffix = labels[i] ? ` - ${labels[i]}` : '';
    options.push(`<option value="${i}">${i}${suffix}</option>`);
  }
  options.push('<option value="w">W - Wait</option>');
  for (const priority of CUSTOM_PRIORITIES) {
    options.push(`<option value="cp:${escapeAttr(priority.label)}">${escapeHtml(priority.label)}</option>`);
  }
  return options.join('');
}

function populatePrioritySelect(userId, selectedValue = '') {
  const select = document.getElementById('add-task-priority');
  if (!select) return;

  const maxPriority = getSharedPriorityTaskCount(userId);
  select.innerHTML = buildPrioritySelectOptions(maxPriority);
  if (selectedValue && select.querySelector(`option[value="${selectedValue}"]`)) {
    select.value = selectedValue;
  } else {
    select.value = '';
  }
}

async function duplicateSharedTask(task) {
  const created = await window.api.createTask({
    project_id: task.project_id,
    assigned_to: task.assigned_to,
    created_by: currentUser?.id || null,
    partner_id: task.partner_id || currentUser?.id || null,
    title: task.title,
    notes: task.notes || '',
    priority: task.priority ?? 0,
    due_date: task.due_date || null,
  });

  if (created && task.priority === -2 && task.priority_label) {
    await window.api.updateTask({
      id: created.id,
      priority: -2,
      priority_label: task.priority_label,
    });
  }

  await refreshAfterTaskChange(created?.id || null);
}

async function deleteSharedTask(task) {
  const displayTitle = getTaskDisplayTitle(task);
  if (!confirm(`Delete '${displayTitle || task.title}'?`)) return;
  await window.api.deleteTask(task.id);
  await refreshAfterTaskChange(task.id);
}

function openEditSharedTaskDialog(task) {
  const canPartnerEdit = canPartnerManageTask(task);
  const canEditTask = canCurrentUserEditSharedTask(task);
  if (!canEditTask) return;

  const project = getProjectById(task.project_id);
  const selectedPriorityValue = task.priority === -1
    ? 'w'
    : (task.priority === -2 && task.priority_label ? task.priority_label : String(task.priority || ''));
  const priorityOptions = buildPrioritySelectOptions(getSharedPriorityTaskCount(task.assigned_to));
  const staffOptions = getActiveStaffUsers().map((user) => `
    <option value="${user.id}" ${user.id === task.assigned_to ? 'selected' : ''}>${escapeHtml(user.display_name)}</option>
  `).join('');

  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog-card">
      <div class="dialog-header">
        <h3 class="dialog-title">Edit Task</h3>
        <button class="detail-close" id="edit-task-close">&times;</button>
      </div>
      <div class="dialog-body">
        <p class="dialog-subtitle">${project ? `${escapeHtml(project.client || '')}${project.client ? ' | ' : ''}${escapeHtml(project.name || '')}` : 'Update task details'}</p>
        <div class="form-group">
          <label>Task Title</label>
          <input type="text" class="input" id="edit-task-title" value="${escapeAttr(task.title || '')}">
        </div>
        <div class="form-group">
          <label>Assign To</label>
          <select class="select" id="edit-task-assignee" ${canPartnerEdit ? '' : 'disabled'}>
            ${staffOptions}
          </select>
        </div>
        <div style="display:flex;gap:12px">
          <div class="form-group" style="flex:1">
            <label>Priority</label>
            <select class="select" id="edit-task-priority">
              ${priorityOptions}
            </select>
          </div>
          <div class="form-group" style="flex:1">
            <label>Due Date</label>
            <input type="date" class="input" id="edit-task-due" value="${escapeAttr(task.due_date || '')}">
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea class="input" id="edit-task-notes" rows="3" style="resize:vertical">${escapeHtml(task.notes || '')}</textarea>
        </div>
      </div>
      <div class="dialog-footer">
        <div style="flex:1"></div>
        <button class="btn btn-ghost" id="edit-task-cancel">Cancel</button>
        <button class="btn btn-primary" id="edit-task-save">Save Changes</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const prioritySelect = overlay.querySelector('#edit-task-priority');
  if (prioritySelect?.querySelector(`option[value="${selectedPriorityValue}"]`)) {
    prioritySelect.value = selectedPriorityValue;
  } else if (prioritySelect) {
    prioritySelect.value = '';
  }

  const onEsc = (e) => {
    if (e.key === 'Escape') {
      close();
    }
  };

  const close = () => {
    document.removeEventListener('keydown', onEsc);
    overlay.remove();
  };

  overlay.querySelector('#edit-task-close').addEventListener('click', close);
  overlay.querySelector('#edit-task-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#edit-task-save').addEventListener('click', async () => {
    const title = document.getElementById('edit-task-title').value.trim();
    if (!title) return;

    const priorityValue = document.getElementById('edit-task-priority').value;
    let priority = 0;
    let priorityLabel = null;
    if (priorityValue === 'w') {
      priority = -1;
    } else if (priorityValue.startsWith('cp:')) {
      priority = -2;
      priorityLabel = priorityValue;
    } else {
      priority = parseInt(priorityValue || '0', 10);
    }

    await window.api.updateTask({
      id: task.id,
      title,
      assigned_to: document.getElementById('edit-task-assignee').value || null,
      priority,
      priority_label: priorityLabel,
      due_date: document.getElementById('edit-task-due').value || null,
      notes: document.getElementById('edit-task-notes').value.trim(),
    });

    close();
    await refreshAfterTaskChange(task.id);
  });

  document.addEventListener('keydown', onEsc);

  setTimeout(() => document.getElementById('edit-task-title')?.focus(), 30);
}

function openSharedTaskContextMenu(e, task) {
  const canPartnerEdit = canPartnerManageTask(task);
  const canEditTask = canCurrentUserEditSharedTask(task);
  const canDeleteTask = canCurrentUserDeleteSharedTask(task);
  if (!canEditTask) return;

  const moveTargets = canPartnerEdit ? getActiveStaffUsers(task.assigned_to).map((user) => ({
    label: user.display_name,
    action: async () => {
      await window.api.updateTask({ id: task.id, assigned_to: user.id });
      await refreshAfterTaskChange(task.id);
    }
  })) : [];

  const items = [
    {
      label: 'Edit Task...',
      action: () => openEditSharedTaskDialog(task)
    },
    { divider: true },
    {
      label: 'Set Priority',
      submenu: buildPriorityMenuItems(task)
    }
  ];

  if (moveTargets.length > 0) {
    items.push({
      label: 'Move To',
      submenu: moveTargets
    });
  }

  items.push({ divider: true });
  items.push({
    label: 'Duplicate Task',
    action: async () => {
      await duplicateSharedTask(task);
    }
  });

  if (canDeleteTask) {
    items.push({
      label: 'Delete Task',
      danger: true,
      action: async () => {
        await deleteSharedTask(task);
      }
    });
  }

  const menu = ContextMenu.create(items);
  positionMenu(menu, e.clientX, e.clientY);
}

function bindWindowChrome() {
  if (WINDOW_CHROME_BOUND) return;
  WINDOW_CHROME_BOUND = true;

  document.querySelectorAll('[data-window-action]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.windowAction;
      if (action === 'minimize') {
        await window.api.minimizeWindow();
      } else if (action === 'maximize') {
        const state = await window.api.toggleMaximizeWindow();
        applyWindowState(state);
      } else if (action === 'close') {
        await window.api.closeWindow();
      }
    });
  });

  document.querySelectorAll('.topbar, .login-screen').forEach((region) => {
    region.addEventListener('dblclick', async (e) => {
      if (e.target.closest('.window-controls, .login-card, .topbar-center, .topbar-right')) return;
      const state = await window.api.toggleMaximizeWindow();
      applyWindowState(state);
    });
  });

  window.api.onWindowStateChanged((state) => {
    applyWindowState(state);
  });

  window.api.getWindowState().then((state) => {
    applyWindowState(state);
  });
}

function bindResizePerfMode() {
  if (document.body.dataset.resizePerfBound === 'true') return;
  document.body.dataset.resizePerfBound = 'true';

  const markResizing = () => {
    document.body.classList.add('window-resizing');
    clearTimeout(RESIZE_PERF_TIMER);
    RESIZE_PERF_TIMER = setTimeout(() => {
      document.body.classList.remove('window-resizing');
    }, 140);
  };

  window.addEventListener('resize', markResizing, { passive: true });
}

function applyWindowState(state) {
  const isMaximized = Boolean(state?.isMaximized);
  document.querySelectorAll('[data-window-action="maximize"]').forEach((btn) => {
    btn.title = isMaximized ? 'Restore' : 'Maximize';
    btn.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
    btn.querySelector('.maximize')?.classList.toggle('hidden', isMaximized);
    btn.querySelector('.restore')?.classList.toggle('hidden', !isMaximized);
  });
}

function bindUpdatePrompt() {
  const overlay = document.getElementById('update-overlay');
  if (!overlay || UPDATE_UI_BOUND) return;

  UPDATE_UI_BOUND = true;

  const hide = () => overlay.classList.add('hidden');
  const defer = async () => {
    await window.api.dismissUpdate(overlay.dataset.version || null);
    hide();
  };
  const showError = (message) => {
    const subtitle = document.getElementById('update-subtitle');
    subtitle.textContent = message;
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) defer();
  });

  document.getElementById('update-later').addEventListener('click', async () => {
    await defer();
  });

  document.getElementById('update-install').addEventListener('click', async () => {
    const button = document.getElementById('update-install');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Launching Installer...';
    const result = await window.api.installUpdate();
    if (!result?.success) {
      button.disabled = false;
      button.textContent = originalText;
      showError(result?.error || 'Unable to launch installer right now.');
    }
  });

  window.api.onUpdateAvailable((payload) => {
    showUpdatePrompt(payload);
  });
}

function showUpdatePrompt(payload) {
  const overlay = document.getElementById('update-overlay');
  if (!overlay || !payload) return;

  overlay.dataset.version = payload.latestVersion || '';
  document.getElementById('update-title').textContent = `${payload.latestVersion || 'New'} is ready for install`;
  document.getElementById('update-subtitle').textContent = 'A newer build was found in your shared update folder. Install it now or come back to it later.';
  document.getElementById('update-current-version').textContent = payload.currentVersion || '-';
  document.getElementById('update-latest-version').textContent = payload.latestVersion || '-';
  document.getElementById('update-installer-name').textContent = payload.installerName || '-';
  const installBtn = document.getElementById('update-install');
  installBtn.disabled = false;
  installBtn.textContent = 'Install Update';
  overlay.classList.remove('hidden');
}

// ── Login ───────────────────────────────────────────

async function initApp() {
  bindWindowChrome();
  bindResizePerfMode();
  bindUpdatePrompt();
  await bindRuntimeStatus();
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const subtitleEl = document.getElementById('login-subtitle');
  const titleEl = document.getElementById('login-title');
  const usersEl = document.getElementById('login-users');
  const helpEl = document.getElementById('login-help');
  const errorEl = document.getElementById('login-error');

  function setLoginHeading(title, subtitle) {
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
  }

  function resetLoginState() {
    usersEl.innerHTML = '';
    helpEl?.classList.add('hidden');
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
    errorEl.innerHTML = '';
  }

  function bindReconnectButton(buttonId) {
    document.getElementById(buttonId)?.addEventListener('click', async () => {
      const folderPath = await window.api.selectFolder();
      await initializeSelectedFolder(folderPath);
    });
  }

  function renderConnectPrompt(subtitle, errorMessage = '') {
    resetLoginState();
    setLoginHeading('Connect', subtitle);
    usersEl.innerHTML = `
      <button class="btn btn-primary" id="setup-btn">Select Shared Drive Folder</button>
    `;
    bindReconnectButton('setup-btn');
    if (errorMessage) {
      errorEl.classList.remove('hidden');
      errorEl.textContent = errorMessage;
    }
  }

  function renderAuthEntryFromStatus(status) {
    const authEntry = status?.authEntry;
    if (!authEntry) return false;

    if (authEntry.screen === 'connect') {
      renderConnectPrompt(authEntry.subtitle || 'Select the StudioSync folder or its data folder to connect.', authEntry.error || '');
      return true;
    }

    if (authEntry.screen !== 'login') {
      return false;
    }

    resetLoginState();
    setLoginHeading(authEntry.title || 'Sign In', authEntry.subtitle || 'Enter your username to continue.');
    usersEl.innerHTML = `
      <div class="login-form">
        <input type="text" id="login-username" class="input" placeholder="e.g. JSmith" autocomplete="off" spellcheck="false">
        <button class="btn btn-primary auth-submit-btn" id="login-submit">Sign In</button>
      </div>
    `;
    helpEl?.classList.remove('hidden');
    errorEl.classList.add('hidden');
    return true;
  }

  const pendingUpdate = await window.api.getPendingUpdate();
  if (pendingUpdate) {
    showUpdatePrompt(pendingUpdate);
  }

  async function initializeSelectedFolder(folderPath) {
    if (!folderPath) return;

    resetLoginState();
    setLoginHeading('Connect', 'Connecting to shared drive...');

    const result = await window.api.initializeApp(folderPath);
    if (!result.success) {
      setLoginHeading('Connect', 'Select the StudioSync folder or its data folder.');
      errorEl.classList.remove('hidden');
      errorEl.textContent = result.error || 'Failed to connect to the shared drive.';
      return;
    }

    const users = await window.api.getUsers();
    if (users.length === 0) {
      setLoginHeading('Connect', 'No users were found in that shared folder yet.');
      errorEl.classList.remove('hidden');
      errorEl.textContent = 'Open StudioSync first and finish setup, then try again.';
      usersEl.innerHTML = `
        <button class="btn btn-primary" id="setup-btn">Select Shared Drive Folder</button>
      `;
      document.getElementById('setup-btn').addEventListener('click', async () => {
        const nextFolderPath = await window.api.selectFolder();
        await initializeSelectedFolder(nextFolderPath);
      });
      return;
    }

    await initApp();
  }

  // Check if backend is initialized and user already logged in
  const user = await window.api.getCurrentUser();
  if (user) {
    currentUser = user;
    await loadAllData();
    document.getElementById('login-screen').classList.add('hidden');
    await nextFrame();
    await window.api.setWindowMode('app');
    enterApp();
    return;
  }

  // Backend not initialized — check for config
  const runtimeStatus = await window.api.getRuntimeStatus();
  if (renderAuthEntryFromStatus(runtimeStatus) && runtimeStatus?.authEntry?.screen !== 'login') {
    return;
  }

  const usernameInput = document.getElementById('login-username');
  const submitBtn = document.getElementById('login-submit');

  async function attemptLogin() {
    const username = usernameInput.value.trim().toLowerCase();
    if (!username) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';
    errorEl.classList.add('hidden');

    const loggedInUser = await window.api.login(username);
    if (loggedInUser) {
      currentUser = loggedInUser;
      await loadAllData();
      document.getElementById('login-screen').classList.add('hidden');
      await nextFrame();
      await window.api.setWindowMode('app');
      enterApp();
    } else {
      const latestStatus = await window.api.getRuntimeStatus();
      if (renderAuthEntryFromStatus(latestStatus) && latestStatus?.authEntry?.screen !== 'login') {
        return;
      }

      errorEl.classList.remove('hidden');
      errorEl.textContent = 'Username not found. Check with your administrator.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
      usernameInput.focus();
    }
  }

  submitBtn.addEventListener('click', attemptLogin);
  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });
  usernameInput.focus();
}

// ── Enter App ───────────────────────────────────────

async function enterApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  syncCurrentUserUI();
  activeTab = getDefaultTabForCurrentUser();

  // Sidebar collapse toggle
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    const btn = document.getElementById('sidebar-toggle');
    btn.title = sidebar.classList.contains('collapsed') ? 'Expand sidebar' : 'Collapse sidebar';
  });

  selectedTaskId = null;
  selectedProjectId = null;
  activeFilter = null;
  showDetailEmptyState();
  setSyncIndicatorState('synced');

  renderStatsBar();
  renderMyTasks();
  if (isPartner()) {
    renderSidebar();
    renderStaffOverview();
    renderMyProjects();
    setupAddPrivateTask();
    setupAddProject();
  }
  setupAddSelfTask();
  setupTabBar();
  setupSearch();
  setupSettingsMenu();
  activateTab(activeTab);

  // Listen for sync updates
  window.api.onDataUpdated(async () => {
    await refreshExternalDataAndUI();
  });
}

function syncCurrentUserUI() {
  const appShell = document.getElementById('app-shell');
  if (appShell) {
    appShell.classList.toggle('role-partner', isPartner());
    appShell.classList.toggle('role-staff', !isPartner());
  }

  const canUseStaffOverview = canCurrentUserUseStaffOverview();
  const tabBar = document.getElementById('tab-bar');
  const sidebar = document.getElementById('sidebar');
  const staffViewTab = document.querySelector('.tab[data-tab="staff-view"]');
  const myProjectsTab = document.querySelector('.tab[data-tab="my-projects"]');
  syncTabOrder();

  const avatar = document.getElementById('user-avatar');
  if (avatar && currentUser) {
    avatar.style.background = currentUser.avatar_color;
    avatar.textContent = getInitials(currentUser);
  }

  const nameEl = document.getElementById('user-name');
  if (nameEl && currentUser) {
    nameEl.textContent = currentUser.display_name;
  }

  const roleEl = document.getElementById('user-role-badge');
  if (roleEl && currentUser) {
    const roleName = currentUser.business_role || (currentUser.role === 'partner' ? 'Partner' : 'Staff');
    roleEl.textContent = roleName;
  }

  document.getElementById('add-private-task-btn')?.classList.add('hidden');
  document.getElementById('add-self-task-btn')?.classList.add('hidden');
  document.getElementById('my-tasks-private-badge')?.classList.add('hidden');

  if (staffViewTab) {
    staffViewTab.textContent = isPartner() ? 'Staff Overview' : 'Staff View';
    staffViewTab.classList.toggle('hidden', !canUseStaffOverview);
  }

  myProjectsTab?.classList.toggle('hidden', !isPartner());

  if (isPartner()) {
    tabBar?.classList.remove('hidden');
    sidebar?.classList.remove('hidden');
    document.getElementById('add-private-task-btn')?.classList.remove('hidden');
    document.getElementById('my-tasks-private-badge')?.classList.remove('hidden');
  } else {
    tabBar?.classList.toggle('hidden', !canUseStaffOverview);
    sidebar?.classList.add('hidden');
    if (canCurrentUserAddOwnTasks()) {
      document.getElementById('add-self-task-btn')?.classList.remove('hidden');
    }
  }

  if (!canUseStaffOverview && activeTab === 'staff-view') {
    activeTab = 'my-tasks';
  }

  if (!isPartner() && activeTab === 'my-projects') {
    activeTab = 'my-tasks';
  }

  syncActiveTabLayout();
}

// ── Stats Header Bar ────────────────────────────────

function renderStatsBar() {
  const tasks = isPartner() ? PRIVATE_TASKS : getTasksForUser(currentUser.id);

  const pending = tasks.filter(t => !t.completed).length;
  const completed = tasks.filter(t => t.completed).length;
  const overdue = tasks.filter(t => isTaskOverdue(t)).length;

  const container = document.getElementById('stats-bar');
  container.innerHTML = `
    <button class="stat-btn ${activeFilter === 'pending' ? 'active' : ''}" data-filter="pending">
      <span class="stat-value accent">${pending}</span>
      <span class="stat-label">Pending</span>
    </button>
    <button class="stat-btn ${activeFilter === 'completed' ? 'active' : ''}" data-filter="completed">
      <span class="stat-value success">${completed}</span>
      <span class="stat-label">Completed</span>
    </button>
    ${overdue > 0 ? `
    <button class="stat-btn ${activeFilter === 'overdue' ? 'active' : ''}" data-filter="overdue">
      <span class="stat-value danger">${overdue}</span>
      <span class="stat-label">Overdue</span>
    </button>` : ''}
  `;

  container.querySelectorAll('.stat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      activeFilter = (activeFilter === filter) ? null : filter;
      renderStatsBar();
      renderMyTasks(document.getElementById('search-input').value);
    });
  });
}

// ── Sidebar (partner only — staff list) ─────────────

function renderSidebar() {
  const staffUsers = USERS.filter(u => u.role === 'staff' && u.active !== 0);
  document.getElementById('staff-list').innerHTML = `
    <button class="sidebar-clear-filter ${selectedStaffFilter ? '' : 'active'}" data-clear-staff-filter="true">All Staff</button>
    ${staffUsers.map(user => {
    const count = getTasksForUser(user.id).filter(t => !t.completed).length;
    const pto = getPTOForUser(user.id);
    return `
      <div class="sidebar-staff-item ${selectedStaffFilter === user.id ? 'active' : ''}" data-user-id="${user.id}">
        <div class="avatar" style="background: ${user.avatar_color}">${getInitials(user)}</div>
        <span class="staff-name">${escapeHtml(getSidebarStaffName(user))}${pto ? ' <span class="badge badge-pto" style="font-size:8px;padding:1px 5px;margin-left:4px">' + pto.label + '</span>' : ''}</span>
        <span class="staff-count ${count === 0 ? 'zero' : ''}">${count}</span>
      </div>
    `;
  }).join('')}
  `;

  document.getElementById('staff-list').onclick = (e) => {
    if (e.target.closest('[data-clear-staff-filter]')) {
      selectedStaffFilter = null;
      renderSidebar();
      activateTab('staff-view', { preserveStaffFilter: false });
      renderStaffOverview();
      return;
    }

    const item = e.target.closest('.sidebar-staff-item');
    if (!item) return;
    const userId = item.dataset.userId;
    if (selectedStaffFilter === userId) {
      selectedStaffFilter = null;
    } else {
      selectedStaffFilter = userId;
    }
    renderSidebar();
    activateTab('staff-view', { preserveStaffFilter: true });
    renderStaffOverview();
  };
}

// ── My Tasks View ───────────────────────────────────

function renderMyTasks(query = '') {
  let tasks = isPartner() ? [...PRIVATE_TASKS] : getTasksForUser(currentUser.id);

  if (query) {
    const q = query.toLowerCase();
    tasks = tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.notes && t.notes.toLowerCase().includes(q))
    );
  }

  if (activeFilter === 'pending') tasks = tasks.filter(t => !t.completed);
  else if (activeFilter === 'completed') tasks = tasks.filter(t => t.completed);
  else if (activeFilter === 'overdue') tasks = tasks.filter(t => isTaskOverdue(t));

  tasks = sortTasksLikeScheduling(tasks);

  const container = document.getElementById('my-task-list');
  const allTasks = isPartner() ? PRIVATE_TASKS : getTasksForUser(currentUser.id);
  const totalPending = allTasks.filter(t => !t.completed).length;

  document.getElementById('my-task-count').textContent = activeFilter
    ? `${tasks.length} of ${allTasks.length}`
    : `${totalPending} tasks`;

  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#10003;</div>
        <div class="empty-state-text">${query ? 'No tasks match your search' : activeFilter ? 'No ' + activeFilter + ' tasks' : isPartner() ? 'No private tasks yet' : 'No tasks assigned this week'}</div>
      </div>
    `;
    return;
  }

  const waitingTasks = tasks.filter((task) => task.priority === -1 && !task.completed);
  const activeTasks = tasks.filter((task) => !(task.priority === -1 && !task.completed));

  const activeMarkup = activeTasks.map((task) => renderTaskCard(task, { isPrivate: isPartner() })).join('');
  const waitingMarkup = waitingTasks.map((task) => renderTaskCard(task, { isPrivate: isPartner() })).join('');

  container.innerHTML = `
    ${activeMarkup}
    ${waitingTasks.length > 0 ? `
      <div class="task-divider">
        <div class="task-divider-line"></div>
        <span class="task-divider-label">Waiting</span>
        <div class="task-divider-line"></div>
      </div>
      ${waitingMarkup}
    ` : ''}
  `;
  attachTaskCardEvents(container);
}

// ── My Projects (from Excel, partner only) ──────────

function renderMyProjects() {
  const query = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  const projects = getProjectsForCurrentPartner({ includeFuture: true, includeInactive: true }).filter((project) => {
    if (!query) return true;
    return (
      (project.client || '').toLowerCase().includes(query) ||
      (project.name || '').toLowerCase().includes(query) ||
      (project.notes || '').toLowerCase().includes(query)
    );
  });

  document.getElementById('my-projects-count').textContent = `${projects.length} projects`;

  const activeProjects = projects.filter((project) => getProjectSection(project) === 'active');
  const futureProjects = projects.filter((project) => getProjectSection(project) === 'future');
  const inactiveProjects = projects.filter((project) => getProjectSection(project) === 'inactive');
  const container = document.getElementById('my-projects-list');

  if (projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#128193;</div>
        <div class="empty-state-text">${query ? 'No projects match your search' : 'No projects assigned to your initials yet'}</div>
      </div>
    `;
    return;
  }

  const getStatusLabel = (project) => {
    const section = getProjectSection(project);
    if (section === 'future') return 'FUTURE';
    if (section === 'inactive') return 'INACTIVE';
    return 'ACTIVE';
  };

  const renderAssignedStaff = (project) => {
    const staff = getAssignedStaffForProject(project.id);
    if (staff.length === 0) return '';

    const visibleStaff = staff.slice(0, 4);
    const overflow = staff.length - visibleStaff.length;
    const title = staff.map((user) => user.display_name).join(', ');

    return `
      <div class="pp-card-assignees" title="${escapeAttr(title)}">
        ${visibleStaff.map((user) => `
          <span class="pp-card-avatar" style="background:${user.avatar_color}" aria-hidden="true">${getInitials(user)}</span>
        `).join('')}
        ${overflow > 0 ? `<span class="pp-card-avatar pp-card-avatar-more" aria-hidden="true">+${overflow}</span>` : ''}
      </div>
    `;
  };

  const renderSection = (sectionKey, title, items) => `
    <div class="project-group ${PROJECT_SECTION_COLLAPSE[sectionKey] ? 'collapsed' : ''}">
      <button class="project-group-header" data-project-group-toggle="${sectionKey}">
        <span class="project-group-label">${title}</span>
        <span class="project-group-count">${items.length}</span>
        <span class="project-group-chevron">${PROJECT_SECTION_COLLAPSE[sectionKey] ? '&#9656;' : '&#9662;'}</span>
      </button>
      <div class="project-group-body ${PROJECT_SECTION_COLLAPSE[sectionKey] ? 'hidden' : ''}">
        ${items.length === 0 ? `
          <div class="empty-state" style="padding:24px 18px">
            <div class="empty-state-text">No ${title.toLowerCase()}.</div>
          </div>
        ` : `
          <div class="project-group-list">
            ${items.map(project => `
              <div class="personal-project-card ${selectedProjectId === project.id ? 'selected' : ''}" data-project-id="${project.id}">
                <div class="pp-card-info">
                  <div class="pp-card-top">
                    <div class="pp-card-title">${escapeHtml(getProjectDisplayTitle(project))}</div>
                    ${renderAssignedStaff(project)}
                  </div>
                  <div class="pp-card-notes">
                    <span class="pp-card-status">${getStatusLabel(project)}</span>
                    ${project.notes
                      ? `<span class="pp-card-note-text">${escapeHtml(project.notes)}</span>`
                      : '<span class="pp-card-note-text pp-card-note-empty">No scheduling notes yet</span>'}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  container.innerHTML = [
    renderSection('active', 'Active Projects', activeProjects),
    renderSection('future', 'Future Projects', futureProjects),
    renderSection('inactive', 'Non-Active Projects', inactiveProjects),
  ].join('');

  container.querySelectorAll('[data-project-group-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const sectionKey = button.dataset.projectGroupToggle;
      PROJECT_SECTION_COLLAPSE[sectionKey] = !PROJECT_SECTION_COLLAPSE[sectionKey];
      renderMyProjects();
    });
  });

  container.querySelectorAll('.personal-project-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      openProjectDetailPanel(card.dataset.projectId);
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const project = getProjectById(card.dataset.projectId);
      if (!project || !isPartner()) return;
      openProjectContextMenu(e, project);
    });
  });
}

// ── Add Private Task (partner only) ─────────────────

function setupAddPrivateTask() {
  document.getElementById('add-private-task-btn').addEventListener('click', () => {
    openAddPrivateTaskDialog();
  });
}

function openAddPrivateTaskDialog() {
  const overlay = document.getElementById('add-task-overlay');
  overlay.classList.remove('hidden');

  document.getElementById('add-task-title').textContent = 'Add Private Task';
  document.getElementById('add-task-subtitle').textContent = 'This task is only visible to you';

  const titleInput = document.getElementById('add-task-title-input');
  document.getElementById('add-task-notes-input').value = '';
  populatePrioritySelect(currentUser?.id || null);
  document.getElementById('add-task-due').value = '';
  titleInput.value = '';
  titleInput.placeholder = 'Task title...';
  titleInput.dataset.projectLocked = 'false';
  titleInput.readOnly = false;
  titleInput.classList.remove('task-title-locked');

  let selectedProjectId = null;

  const picker = document.getElementById('project-picker');
  bindProjectPickerSelection(picker, getAvailableProjectsForTaskCreation(), titleInput, (projectId) => {
    selectedProjectId = projectId;
  });

  const close = () => {
    document.removeEventListener('keydown', escHandler);
    overlay.classList.add('hidden');
  };
  document.getElementById('add-task-close').onclick = close;
  document.getElementById('add-task-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  document.getElementById('add-task-save').onclick = async () => {
    const title = titleInput.value.trim();
    if (!title) return;

    const notes = document.getElementById('add-task-notes-input').value.trim();
    const priorityVal = document.getElementById('add-task-priority').value;
    const dueDate = document.getElementById('add-task-due').value || null;
    let priority = 0;
    if (priorityVal === 'w') priority = -1;
    else if (priorityVal) priority = parseInt(priorityVal);

    await window.api.createPrivateTask({
      project_id: selectedProjectId,
      title,
      notes,
      priority,
      due_date: dueDate,
    });
    close();
    await loadAllData();
    await refreshAll();
  };

  const escHandler = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', escHandler);
}

// ── Add Project (adds to project list) ──────────────

function setupAddProject() {
  document.getElementById('add-project-btn').addEventListener('click', () => {
    const overlay = document.getElementById('add-personal-project-overlay');
    overlay.classList.remove('hidden');

    document.getElementById('add-pp-client').value = '';
    document.getElementById('add-pp-name').value = '';
    document.getElementById('add-pp-notes').value = '';
    document.getElementById('add-pp-future').checked = false;
    document.getElementById('add-pp-client').focus();

    const close = () => {
      document.removeEventListener('keydown', escHandler);
      overlay.classList.add('hidden');
    };
    document.getElementById('add-pp-close').onclick = close;
    document.getElementById('add-pp-cancel').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    document.getElementById('add-pp-save').onclick = async () => {
      const client = document.getElementById('add-pp-client').value.trim();
      const name = document.getElementById('add-pp-name').value.trim();
      const notes = document.getElementById('add-pp-notes').value.trim();
      const category = document.getElementById('add-pp-future').checked ? 'future' : 'current';
      if (!client || !name) return;

      const project = await window.api.createProject({
        client,
        name,
        status: 'active',
        category,
        notes,
        partner_id: currentUser.id,
      });
      close();
      await loadAllData();
      renderMyProjects();
      if (project?.id) {
        await openProjectDetailPanel(project.id);
      }
    };

    const escHandler = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', escHandler);
  });
}

async function assignProjectToStaff(project, staffId) {
  const staffUser = getUserById(staffId);
  if (!project || !staffUser) return;

  const existingTask = TASKS.find((task) => task.project_id === project.id && task.assigned_to === staffId);
  if (existingTask) return existingTask;

  return window.api.createTask({
    project_id: project.id,
    assigned_to: staffId,
    created_by: currentUser?.id || null,
    partner_id: project.partner_id || currentUser?.id || null,
    title: project.client ? `${project.client} — ${project.name}` : project.name,
    notes: '',
    priority: 0,
    due_date: null,
  });
}

async function duplicateProject(project) {
  if (!project) return null;

  return window.api.createProject({
    client: project.client || '',
    name: `${project.name || 'Project'} Copy`,
    status: 'active',
    category: isFutureProject(project) ? 'future' : 'current',
    notes: project.notes || '',
    partner_id: project.partner_id || currentUser?.id || null,
    partner_ids: getProjectPartnerIds(project),
    partner_initials: project.partner_initials || '',
  });
}

function openProjectContextMenu(e, project) {
  const assignedStaffIds = new Set(getAssignedStaffForProject(project.id).map((user) => user.id));
  const assignToItems = getActiveStaffUsers().map((user) => ({
    label: `${assignedStaffIds.has(user.id) ? '✓ ' : ''}${user.display_name}`,
    action: async () => {
      if (assignedStaffIds.has(user.id)) return;
      await assignProjectToStaff(project, user.id);
      await loadAllData();
      await refreshAll();
      if (selectedProjectId === project.id) {
        await openProjectDetailPanel(project.id);
      }
    }
  }));

  const items = [
    {
      label: 'Edit Project...',
      action: () => openProjectDetailPanel(project.id)
    }
  ];

  if (assignToItems.length > 0) {
    items.push({ divider: true });
    items.push({
      label: 'Assign To',
      submenu: assignToItems
    });
  }

  items.push({ divider: true });

  if (isFutureProject(project)) {
    items.push({
      label: 'Move To Current',
      action: async () => {
        await window.api.updateProject({ id: project.id, category: 'current', status: 'active' });
        await loadAllData();
        await refreshAll();
        if (selectedProjectId === project.id) {
          await openProjectDetailPanel(project.id);
        }
      }
    });
  } else if (project.status !== 'active') {
    items.push({
      label: 'Make Active',
      action: async () => {
        await window.api.updateProject({ id: project.id, status: 'active', category: project.category || 'current' });
        await loadAllData();
        await refreshAll();
        if (selectedProjectId === project.id) {
          await openProjectDetailPanel(project.id);
        }
      }
    });
  }

  if (project.status !== 'inactive') {
    items.push({
      label: 'Mark Inactive',
      action: async () => {
        await window.api.updateProject({ id: project.id, status: 'inactive', category: project.category || 'current' });
        await loadAllData();
        await refreshAll();
        if (selectedProjectId === project.id) {
          await openProjectDetailPanel(project.id);
        }
      }
    });
  }

  items.push(
    {
      label: 'Duplicate',
      action: async () => {
        const duplicated = await duplicateProject(project);
        await loadAllData();
        await refreshAll();
        if (duplicated?.id) {
          await openProjectDetailPanel(duplicated.id);
        }
      }
    },
    {
      label: 'Delete',
      danger: true,
      action: async () => {
        if (!confirm(`Delete '${getProjectDisplayTitle(project)}'?`)) return;
        await window.api.deleteProject(project.id);
        await loadAllData();
        if (selectedProjectId === project.id) {
          selectedProjectId = null;
          showDetailEmptyState();
        }
        await refreshAll();
      }
    }
  );

  const menu = ContextMenu.create(items);
  positionMenu(menu, e.clientX, e.clientY);
}

// ── Task Card HTML ──────────────────────────────────

function renderTaskCard(task, options = {}) {
  const { showAssignee = false, isPrivate = false, readOnly = false } = options;
  const due = formatDate(task.due_date);
  const project = getProjectById(task.project_id);
  const displayTitle = isPrivate ? normalizeTaskDisplayTitle(task.title) : getTaskDisplayTitle(task, project);
  const subtasks = isPrivate ? (SUBTASK_CACHE[task.id] || []) : getTaskActionItems(task);
  const comments = isPrivate ? (COMMENT_CACHE[task.id] || []) : getTaskComments(task);
  const completedSubs = subtasks.filter(s => s.completed).length;
  const canManageSharedTask = !readOnly && !isPrivate && canPartnerManageTask(task);
  const canManagePriority = !readOnly && !isPrivate && canCurrentUserManageTaskPriority(task);
  const hasMeta = subtasks.length > 0 || comments.length > 0;
  const canEditTask = !readOnly && !isPrivate && canCurrentUserEditSharedTask(task);
  const priority = getPriorityPresentation(task);
  const noteText = String(task.notes || '').trim();
  const partnerParticipants = !isPrivate && project ? getProjectPartners(project) : [];

  const dueMarkup = due.text
    ? `<span class="task-due task-due-pill ${due.cls} ${canEditTask ? 'task-due-editable' : ''}" ${canEditTask ? `data-edit-task-id="${task.id}"` : ''}>${escapeHtml(due.text)}</span>`
    : '<span class="task-due task-due-pill none">No due date</span>';

  const notesMarkup = canManageSharedTask
    ? `<input type="text" class="task-notes-input task-notes-input-editable" data-notes-task-id="${task.id}" value="${escapeAttr(task.notes || '')}" placeholder="—">`
    : `<div class="task-notes ${noteText ? '' : 'task-notes-empty'}">${escapeHtml(noteText || '—')}</div>`;

  const indicatorsMarkup = `
    <div class="task-indicators">
      <span class="task-indicator ${subtasks.length > 0 ? 'has-value' : ''}">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="1" y="2" width="14" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M4 13h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M5 6h6M5 9h3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
        ${subtasks.length > 0 ? `${completedSubs}/${subtasks.length}` : '0/0'}
      </span>
      <span class="task-indicator ${comments.length > 0 ? 'has-value' : ''}">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M14 8c0 3.314-2.686 6-6 6a5.97 5.97 0 0 1-3.5-1.126L2 14l1.126-2.5A5.97 5.97 0 0 1 2 8c0-3.314 2.686-6 6-6s6 2.686 6 6z" stroke="currentColor" stroke-width="1.2"/></svg>
        ${comments.length}
      </span>
    </div>
  `;

  return `
    <div class="task-card ${task.completed ? 'completed' : ''} ${selectedTaskId === task.id ? 'selected' : ''} ${readOnly ? 'read-only' : ''} ${task.priority === -1 ? 'wait' : ''} ${hasMeta ? 'has-activity' : ''}" data-task-id="${task.id}" ${isPrivate ? 'data-private="true"' : ''} ${readOnly ? 'data-read-only="true"' : ''}>
      <div class="task-check">
        <div class="task-checkbox ${task.completed ? 'checked' : ''} ${readOnly ? 'read-only' : ''}" data-task-id="${task.id}" ${isPrivate ? 'data-private="true"' : ''} ${readOnly ? 'data-read-only="true"' : ''}></div>
      </div>
      <div class="task-body">
        <div class="task-top-row">
          <span class="task-priority ${priority.className} ${canManagePriority ? 'task-priority-interactive' : ''}" style="${priority.inlineStyle}" ${canManagePriority ? `data-priority-task-id="${task.id}"` : ''} title="${escapeAttr(priority.label)}">${escapeHtml(priority.shortLabel || priority.label)}</span>
          <span class="task-title">${escapeHtml(displayTitle)}</span>
        </div>
        <div class="task-note-row">
          ${notesMarkup}
        </div>
        <div class="task-footer-row ${readOnly ? 'read-only-footer' : ''}">
          <div class="task-footer-left">
            ${partnerParticipants.length > 0 ? `
              <div class="task-avatar-stack">
                ${partnerParticipants.slice(0, 4).map((user, index) => `
                  <span class="task-avatar-chip partner" style="background:${user.avatar_color};z-index:${partnerParticipants.length - index};margin-right:${index < Math.min(partnerParticipants.length, 4) - 1 ? '-5px' : '0'}" title="${escapeAttr(user.display_name || '')}">
                    ${getInitials(user)}
                  </span>
                `).join('')}
              </div>
            ` : ''}
            ${readOnly ? '' : indicatorsMarkup}
          </div>
          ${dueMarkup}
        </div>
      </div>
    </div>
  `;
}

// ── Attach Task Card Click Events ───────────────────

function attachTaskCardEvents(container, options = {}) {
  const { allowTaskActions = true, allowDetailOpen = true } = options;

  container.querySelectorAll('.task-checkbox').forEach(cb => {
    if (!allowTaskActions || cb.dataset.readOnly === 'true') return;

    cb.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = cb.dataset.taskId;
      const isPrivate = cb.dataset.private === 'true';

      if (isPrivate) {
        const task = PRIVATE_TASKS.find(t => t.id === taskId);
        if (task) {
          await window.api.updatePrivateTask({ id: taskId, completed: task.completed ? 0 : 1 });
        }
      } else {
        const task = TASKS.find(t => t.id === taskId);
        if (task) {
          const nextCompleted = task.completed ? 0 : 1;
          await window.api.updateTask({
            id: taskId,
            completed: nextCompleted,
            status: nextCompleted ? 'complete' : 'not_started',
          });
        }
      }
      await loadAllData();
      await refreshAll();
      if (selectedTaskId === taskId) await openDetailPanel(taskId);
    });
  });

  container.querySelectorAll('.task-priority-interactive').forEach((pill) => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const task = getSharedTaskById(pill.dataset.priorityTaskId);
      if (task && canCurrentUserManageTaskPriority(task)) {
        openPriorityMenu(pill, task);
      }
    });
  });

  container.querySelectorAll('.task-due-editable').forEach((dueEl) => {
    dueEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const task = getSharedTaskById(dueEl.dataset.editTaskId);
      if (task && canCurrentUserEditSharedTask(task)) {
        openEditSharedTaskDialog(task);
      }
    });
  });

  container.querySelectorAll('.task-notes-input').forEach((input) => {
    const taskId = input.dataset.notesTaskId;
    let original = input.value;

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());

    input.addEventListener('blur', async () => {
      const nextValue = input.value.trim();
      if (nextValue === original) return;
      await window.api.updateTask({ id: taskId, notes: nextValue });
      original = nextValue;
      await refreshAfterTaskChange(taskId);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        input.value = original;
        input.blur();
      }
    });
  });

  container.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!allowDetailOpen || card.dataset.readOnly === 'true') return;
      if (e.target.closest('.task-checkbox, .task-priority-interactive, .task-notes-input')) return;
      openDetailPanel(card.dataset.taskId);
    });

    card.addEventListener('dblclick', (e) => {
      if (!allowTaskActions || card.dataset.readOnly === 'true') return;
      const task = getSharedTaskById(card.dataset.taskId);
      if (!task || !canCurrentUserEditSharedTask(task)) return;
      if (e.target.closest('.task-checkbox, .task-priority-interactive, .task-notes-input')) return;
      openEditSharedTaskDialog(task);
    });

    card.addEventListener('contextmenu', (e) => {
      if (!allowTaskActions || card.dataset.readOnly === 'true') return;
      const task = getSharedTaskById(card.dataset.taskId);
      if (!task || !canCurrentUserEditSharedTask(task)) return;
      e.preventDefault();
      e.stopPropagation();
      openSharedTaskContextMenu(e, task);
    });
  });
}

// ── Refresh all views ───────────────────────────────

async function refreshAll() {
  renderStatsBar();
  if (isPartner()) {
    renderSidebar();
  }
  if (activeTab === 'my-projects') renderMyProjects();
  else if (activeTab === 'staff-view') renderStaffOverview();
  else renderMyTasks(document.getElementById('search-input').value);
}

// ── Staff Overview (Partner) ────────────────────────

function renderStaffOverview() {
  const container = document.getElementById('staff-overview');
  const isReadOnlyStaffView = !isPartner();
  const query = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  let staffUsers = getActiveStaffUsers(isReadOnlyStaffView ? currentUser?.id : null);

  if (isReadOnlyStaffView) {
    selectedReadonlyStaffIds = selectedReadonlyStaffIds.filter((id) => staffUsers.some((user) => user.id === id));
    if (selectedReadonlyStaffIds.length === 0 && staffUsers[0]) {
      selectedReadonlyStaffIds = [staffUsers[0].id];
    }

    const selectedUsers = staffUsers.filter((user) => selectedReadonlyStaffIds.includes(user.id));
    container.innerHTML = selectedUsers.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-text">No staff available to display.</div>
      </div>
    ` : `
      <div class="staff-readonly-shell">
        <aside class="staff-readonly-sidebar">
          <div class="staff-readonly-sidebar-header">
            <div class="staff-readonly-sidebar-label">Staff</div>
            <div class="staff-readonly-sidebar-count">${staffUsers.length} teammates</div>
          </div>
          <div class="staff-readonly-sidebar-list">
            ${staffUsers.map((user) => {
              const pendingCount = getTasksForUser(user.id).filter((task) => !task.completed).length;
              return `
                <button class="staff-readonly-item ${selectedReadonlyStaffIds.includes(user.id) ? 'active' : ''}" data-readonly-staff-select="${user.id}">
                  <span class="staff-readonly-item-avatar" style="background:${user.avatar_color}">${getInitials(user)}</span>
                  <span class="staff-readonly-item-name">${escapeHtml(getSidebarStaffName(user))}</span>
                  <span class="staff-readonly-item-count ${pendingCount === 0 ? 'zero' : ''}">${pendingCount}</span>
                </button>
              `;
            }).join('')}
          </div>
        </aside>

        <section class="staff-readonly-main ${selectedUsers.length === 1 ? 'single-selection' : ''}">
          <div class="staff-readonly-task-list">
            ${selectedUsers.map((user) => {
              const pto = getPTOForUser(user.id);
              const tasks = sortTasksLikeScheduling(getTasksForUser(user.id)).filter((task) => {
                if (!query) return true;
                const project = getProjectById(task.project_id);
                const haystack = [
                  task.title,
                  task.notes,
                  project?.client,
                  project?.name,
                ].map((value) => String(value || '').toLowerCase());
                return haystack.some((value) => value.includes(query));
              });
              const pendingCount = tasks.filter((task) => !task.completed).length;

              return `
                <section class="staff-readonly-group">
                  <div class="staff-readonly-group-header">
                    <div class="staff-readonly-group-person">
                      <div class="staff-readonly-group-avatar" style="background:${user.avatar_color}">${getInitials(user)}</div>
                      <div class="staff-readonly-group-copy">
                        <div class="staff-readonly-group-title">${escapeHtml(user.display_name)}</div>
                        <div class="staff-readonly-group-subtitle">${pendingCount} active task${pendingCount !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    ${pto ? `<span class="pto-badge">${pto.label}</span>` : ''}
                  </div>
                  <div class="staff-readonly-group-list">
                    ${tasks.length === 0 ? `
                      <div class="empty-state">
                        <div class="empty-state-text">${query ? 'No tasks match your search' : 'No tasks assigned'}</div>
                      </div>
                    ` : tasks.map((task) => renderTaskCard(task, { readOnly: true })).join('')}
                  </div>
                </section>
              `;
            }).join('')}
          </div>
        </section>
      </div>
    `;

    container.querySelectorAll('.staff-readonly-group-list').forEach((taskList) => {
      attachTaskCardEvents(taskList, {
        allowTaskActions: false,
        allowDetailOpen: false,
      });
    });

    container.querySelectorAll('[data-readonly-staff-select]').forEach((button) => {
      button.addEventListener('click', (event) => {
        const userId = button.dataset.readonlyStaffSelect;
        const wantsMultiSelect = event.ctrlKey || event.metaKey;

        if (wantsMultiSelect) {
          if (selectedReadonlyStaffIds.includes(userId)) {
            if (selectedReadonlyStaffIds.length > 1) {
              selectedReadonlyStaffIds = selectedReadonlyStaffIds.filter((id) => id !== userId);
            }
          } else {
            selectedReadonlyStaffIds = [...selectedReadonlyStaffIds, userId];
          }
        } else {
          selectedReadonlyStaffIds = [userId];
        }

        renderStaffOverview();
      });
    });

    return;
  }

  if (!isReadOnlyStaffView && selectedStaffFilter) {
    staffUsers = staffUsers.filter(u => u.id === selectedStaffFilter);
  }

  container.innerHTML = staffUsers.map(user => {
    let tasks = sortTasksLikeScheduling(getTasksForUser(user.id));
    if (query) {
      tasks = tasks.filter((task) => {
        const project = getProjectById(task.project_id);
        const haystack = [
          task.title,
          task.notes,
          project?.client,
          project?.name,
        ].map((value) => String(value || '').toLowerCase());
        return haystack.some((value) => value.includes(query));
      });
    }
    const pending = tasks.filter(t => !t.completed);
    const pto = getPTOForUser(user.id);
    const isCollapsed = !isReadOnlyStaffView && selectedStaffFilter
      ? user.id !== selectedStaffFilter
      : (STAFF_SECTION_COLLAPSE[user.id] ?? true);

    return `
      <div class="staff-section">
        <button class="staff-section-header" data-staff-toggle="${user.id}">
          <div class="avatar" style="background: ${user.avatar_color}">${getInitials(user)}</div>
          <span class="staff-section-name">${user.display_name}</span>
          ${pto ? `<span class="pto-badge">${pto.label}</span>` : ''}
          <span class="staff-section-count">${pending.length} task${pending.length !== 1 ? 's' : ''}</span>
          <span class="staff-section-chevron">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
        </button>
        <div class="staff-section-tasks ${isCollapsed ? 'hidden' : ''}" data-staff-id="${user.id}">
          ${tasks.length === 0 ? `
            <div class="empty-state" style="padding:20px">
              <div class="empty-state-text">${query ? 'No tasks match your search' : 'No tasks assigned'}</div>
            </div>
          ` : tasks.map(t => renderTaskCard(t, { readOnly: isReadOnlyStaffView })).join('')}
          ${isReadOnlyStaffView ? '' : `
            <div class="add-task-inline" data-staff-id="${user.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add task
            </div>
          `}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.staff-section-tasks').forEach(section => {
    attachTaskCardEvents(section, {
      allowTaskActions: !isReadOnlyStaffView,
      allowDetailOpen: !isReadOnlyStaffView,
    });
  });

  container.querySelectorAll('[data-staff-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const staffId = button.dataset.staffToggle;
      const nextCollapsed = !(STAFF_SECTION_COLLAPSE[staffId] ?? true);
      STAFF_SECTION_COLLAPSE[staffId] = nextCollapsed;

      if (nextCollapsed && selectedTaskId) {
        const selectedTask = getSharedTaskById(selectedTaskId);
        if (String(selectedTask?.assigned_to || '') === String(staffId)) {
          clearSelectedTaskDetail();
        }
      }

      renderStaffOverview();
    });
  });

  if (!isReadOnlyStaffView) {
    container.querySelectorAll('.add-task-inline').forEach(btn => {
      btn.addEventListener('click', () => {
        openAddStaffTaskDialog(btn.dataset.staffId);
      });
    });
  }
}

// ── Add Task to Staff (project picker, non-editable title) ──

function openAddStaffTaskDialog(staffId) {
  const staffUser = getUserById(staffId);
  if (!staffUser) return;

  const overlay = document.getElementById('add-task-overlay');
  overlay.classList.remove('hidden');

  document.getElementById('add-task-title').textContent = 'Add Task';
  document.getElementById('add-task-subtitle').textContent = `Assigning to ${staffUser.display_name}`;

  const titleInput = document.getElementById('add-task-title-input');
  document.getElementById('add-task-notes-input').value = '';
  populatePrioritySelect(staffId);
  document.getElementById('add-task-due').value = '';
  titleInput.value = '';
  titleInput.placeholder = 'Task title...';
  titleInput.dataset.projectLocked = 'false';
  titleInput.readOnly = false;
  titleInput.classList.remove('task-title-locked');

  let selectedProjectId = null;

  const picker = document.getElementById('project-picker');
  bindProjectPickerSelection(picker, getAvailableProjectsForTaskCreation(), titleInput, (projectId) => {
    selectedProjectId = projectId;
  });

  const close = () => {
    document.removeEventListener('keydown', escHandler);
    overlay.classList.add('hidden');
  };
  document.getElementById('add-task-close').onclick = close;
  document.getElementById('add-task-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  document.getElementById('add-task-save').onclick = async () => {
    const project = getProjectById(selectedProjectId);
    const title = titleInput.value.trim();
    if (!title) return;

    const notes = document.getElementById('add-task-notes-input').value.trim();
    const priorityVal = document.getElementById('add-task-priority').value;
    const dueDate = document.getElementById('add-task-due').value || null;
    let priority = 0;
    if (priorityVal === 'w') priority = -1;
    else if (priorityVal) priority = parseInt(priorityVal);

    await window.api.createTask({
      project_id: selectedProjectId,
      assigned_to: staffId,
      created_by: currentUser.id,
      partner_id: project?.partner_id || currentUser.id,
      title,
      notes,
      priority,
      due_date: dueDate,
    });
    close();
    await loadAllData();
    await refreshAll();
  };

  const escHandler = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', escHandler);
}

function setupAddSelfTask() {
  document.getElementById('add-self-task-btn').addEventListener('click', () => {
    const overlay = document.getElementById('add-task-overlay');
    overlay.classList.remove('hidden');

    document.getElementById('add-task-title').textContent = 'Add Task';
    document.getElementById('add-task-subtitle').textContent = 'Add a project-linked or freeform task to your list';

    const titleInput = document.getElementById('add-task-title-input');
    document.getElementById('add-task-notes-input').value = '';
    populatePrioritySelect(currentUser.id);
    document.getElementById('add-task-due').value = '';
    titleInput.value = '';
    titleInput.placeholder = 'Task title...';
    titleInput.dataset.projectLocked = 'false';
    titleInput.readOnly = false;
    titleInput.classList.remove('task-title-locked');

    let selectedProjectId = null;
    const picker = document.getElementById('project-picker');
    bindProjectPickerSelection(picker, getAvailableProjectsForTaskCreation(), titleInput, (projectId) => {
      selectedProjectId = projectId;
    });

    const close = () => {
      document.removeEventListener('keydown', escHandler);
      overlay.classList.add('hidden');
    };
    document.getElementById('add-task-close').onclick = close;
    document.getElementById('add-task-cancel').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    document.getElementById('add-task-save').onclick = async () => {
      const project = getProjectById(selectedProjectId);
      const title = titleInput.value.trim();
      if (!title) return;

      const notes = document.getElementById('add-task-notes-input').value.trim();
      const priorityVal = document.getElementById('add-task-priority').value;
      const dueDate = document.getElementById('add-task-due').value || null;
      let priority = 0;
      if (priorityVal === 'w') priority = -1;
      else if (priorityVal) priority = parseInt(priorityVal, 10);

      await window.api.createTask({
        project_id: selectedProjectId,
        assigned_to: currentUser.id,
        created_by: currentUser.id,
        partner_id: project?.partner_id || null,
        title,
        notes,
        priority,
        due_date: dueDate,
      });
      close();
      await loadAllData();
      await refreshAll();
    };

    const escHandler = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', escHandler);
  });
}

// ── Detail Panel ────────────────────────────────────

function showDetailEmptyState() {
  ACTIVE_PROJECT_FOLDER_EDIT = null;
  document.getElementById('detail-header').innerHTML = `
    <h3 class="detail-title" id="detail-title">Task Details</h3>
  `;
  document.getElementById('detail-body').innerHTML = `
    <div class="detail-empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
      <span>Select a task for details</span>
    </div>
  `;
}

async function openDetailPanel(taskId) {
  selectedTaskId = taskId;
  selectedProjectId = null;
  // Look in both regular and private tasks
  let task = TASKS.find(t => t.id === taskId);
  const isPrivateTask = !task;
  if (!task) task = PRIVATE_TASKS.find(t => t.id === taskId);
  if (!task) return;

  document.querySelectorAll('.task-card').forEach(c => c.classList.toggle('selected', c.dataset.taskId === taskId));
  document.querySelectorAll('.personal-project-card').forEach((card) => card.classList.remove('selected'));

  const assignee = getUserById(task.assigned_to || task.owner_id);
  const assignees = isPrivateTask ? (assignee ? [assignee] : []) : getTaskAssignees(task);
  const project = getProjectById(task.project_id);
  if (ACTIVE_PROJECT_FOLDER_EDIT && ACTIVE_PROJECT_FOLDER_EDIT.projectId !== project?.id) {
    ACTIVE_PROJECT_FOLDER_EDIT = null;
  }

  const displayTitle = isPrivateTask ? normalizeTaskDisplayTitle(task.title) : getTaskDisplayTitle(task, project);
  const subtasks = isPrivateTask ? (SUBTASK_CACHE[task.id] || []) : getTaskActionItems(task);
  const comments = isPrivateTask ? (COMMENT_CACHE[task.id] || []) : getTaskComments(task);
  const due = formatDate(task.due_date);
  const projectNotesPreview = project ? getProjectSharedNotesPreview(project.id) : null;
  const canManageThisTask = canCurrentUserAddActionItems(task);
  const canEditTask = !isPrivateTask && canCurrentUserEditSharedTask(task);
  const canManageFolder = !isPrivateTask && canCurrentUserManageProjectFolder(project);
  const priority = getPriorityPresentation(task);
  const partnerUsers = project ? getProjectPartners(project) : [];
  const commentSignature = getCommentStateSignature(comments);
  const previousCommentState = COMMENT_VIEW_STATE.get(taskId) || null;
  const priorityHTML = `<span class="task-priority detail-task-priority ${priority.className}" style="${priority.inlineStyle}">${priority.label}</span>`;
  const dueHTML = `
    <span class="detail-task-due ${due.text ? due.cls : 'empty'}">
      <svg class="detail-chip-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="3"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
      <span>${escapeHtml(due.text || 'No due date')}</span>
    </span>
  `;
  const statusHTML = !isPrivateTask ? renderTaskStatusControl(task, canEditTask) : '';
  const orderedAssignees = assignees.slice().sort((a, b) => {
    if (currentUser?.id && a.id === currentUser.id && b.id !== currentUser.id) return -1;
    if (currentUser?.id && b.id === currentUser.id && a.id !== currentUser.id) return 1;
    return (a.display_name || '').localeCompare(b.display_name || '');
  });

  const header = document.getElementById('detail-header');
  header.innerHTML = `
    <div class="detail-header-copy">
      <h3 class="detail-title" id="detail-title">${escapeHtml(displayTitle || task.title)}</h3>
      <div class="detail-subtitle ${task.notes ? '' : 'is-empty'}">${task.notes ? escapeHtml(task.notes) : '&nbsp;'}</div>
    </div>
    <button class="detail-close" id="detail-close" aria-label="Close details">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  document.getElementById('detail-close').addEventListener('click', () => {
    selectedTaskId = null;
    ACTIVE_PROJECT_FOLDER_EDIT = null;
    document.querySelectorAll('.task-card').forEach(c => c.classList.remove('selected'));
    showDetailEmptyState();
  });

  document.getElementById('detail-body').innerHTML = `
    <section class="detail-panel-section">
      <div class="detail-section-heading">Details</div>
      <div class="detail-summary-grid">
        <div class="detail-summary-item">
          <div class="detail-summary-label">Due date</div>
          <div class="detail-summary-value">${dueHTML}</div>
        </div>
        <div class="detail-summary-item">
          <div class="detail-summary-label">Priority</div>
          <div class="detail-summary-value">${priorityHTML}</div>
        </div>
        ${!isPrivateTask ? `
        <div class="detail-summary-item detail-summary-item-full">
          <div class="detail-summary-label">Status</div>
          <div class="detail-summary-value">${statusHTML}</div>
        </div>
        ` : ''}
      </div>
    </section>

    ${(assignees.length > 0 || partnerUsers.length > 0) ? `
    <section class="detail-panel-section">
      <div class="detail-section-heading">People</div>
      <div class="detail-summary-grid">
        ${assignees.length > 0 ? `
        <div class="detail-summary-item">
          <div class="detail-summary-label">Assigned to</div>
          <div class="detail-avatar-list detail-avatar-list-assignees detail-avatar-list-stacked">
            ${orderedAssignees.map((user, index) => `
              <span class="detail-avatar-dot" title="${escapeAttr(user.display_name || '')}" style="background:${user.avatar_color};z-index:${orderedAssignees.length - index}">
                ${getInitials(user)}
              </span>
            `).join('')}
          </div>
        </div>
        ` : ''}
        ${partnerUsers.length > 0 ? `
        <div class="detail-summary-item">
          <div class="detail-summary-label">Partner</div>
          <div class="detail-avatar-list detail-avatar-list-partners detail-avatar-list-stacked">
            ${partnerUsers.map((user, index) => `
              <span class="detail-avatar-dot" title="${escapeAttr(user.display_name || '')}" style="background:${user.avatar_color};z-index:${partnerUsers.length - index}">
                ${getInitials(user)}
              </span>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>
    </section>
    ` : ''}

    ${project ? `
    <section class="detail-panel-section">
      <div class="detail-section-heading">Project Info</div>
      <div class="detail-info-stack">
        <div class="detail-info-item">
          <div class="detail-summary-label">Project folder</div>
          ${renderProjectFolderCard(project, canManageFolder)}
        </div>
        <div class="detail-info-item">
          <div class="detail-summary-label">Project Notes</div>
          <button class="project-notes-btn detail-project-info-btn" id="open-project-notes" data-project-id="${project.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span class="detail-project-info-btn-label">Project Notes</span>
            ${projectNotesPreview ? `
              <span class="notes-preview">
                <span class="notes-preview-title">${escapeHtml(projectNotesPreview.summary)}</span>
                <span class="notes-preview-detail">${escapeHtml(projectNotesPreview.detail)}</span>
              </span>
            ` : '<span class="notes-preview notes-preview-empty">Open notes</span>'}
            <span class="detail-link-arrow" aria-hidden="true">›</span>
          </button>
        </div>
      </div>
    </section>
    ` : ''}

    <section class="detail-panel-section">
      <div class="detail-section-heading">Action Items</div>
      ${subtasks.length === 0 ? `
        <div class="detail-empty-copy">No action items yet</div>
      ` : subtasks.map((subtask) => `
        <div class="subtask-item ${subtask.completed ? 'completed' : ''}" data-subtask-id="${subtask.id}">
          <div class="task-checkbox ${subtask.completed ? 'checked' : ''}" data-subtask-id="${subtask.id}"></div>
          <span class="subtask-title">${escapeHtml(subtask.title)}</span>
          ${subtask.assigned_to ? renderActionItemAssigneeAvatar(subtask.assigned_to) : ''}
        </div>
      `).join('')}
      ${canManageThisTask ? '<div class="detail-add-link" id="add-subtask-btn">+ Add action item</div>' : ''}
    </section>

    ${!isPrivateTask ? `
    <section class="detail-panel-section detail-comments">
      <div class="detail-section-heading">Comments</div>
      <div class="comment-list-scroll">
        <div class="comment-list">
          ${comments.length === 0 ? `
            <div class="detail-empty-copy">No comments yet</div>
          ` : comments.map((comment) => {
            const author = getUserById(comment.author_id);
            const authorName = author?.display_name || comment.author_name || 'Unknown';
            const authorColor = author?.avatar_color || comment.author_color || '#5856A6';
            const authorInitials = author ? getInitials(author) : getInitials({ display_name: authorName });
            const isOwnComment = String(comment.author_id || '') === String(currentUser?.id || '');
            return `
              <div class="comment-item ${isOwnComment ? 'self' : 'peer'}">
                ${isOwnComment ? '' : `<span class="avatar-mini" style="background:${authorColor}">${authorInitials}</span>`}
                <div class="comment-body">
                  <div class="comment-bubble">
                    <div class="comment-text">${escapeHtml(comment.body)}</div>
                  </div>
                  <div class="comment-meta">${escapeHtml(isOwnComment ? 'You' : authorName)} · ${escapeHtml(formatClockTime(comment.created_at) || timeAgo(comment.created_at))}</div>
                </div>
                ${isOwnComment ? `<span class="avatar-mini comment-own-avatar" style="background:${authorColor}">${authorInitials}</span>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <button class="comment-jump-btn hidden" id="comment-jump-btn" type="button">New message ↓</button>
      <div class="comment-input-row">
        <textarea placeholder="Message the team..." rows="1" id="comment-textarea"></textarea>
        <button class="btn btn-primary btn-sm" id="send-comment-btn">Send</button>
      </div>
    </section>
    ` : ''}
  `;

  const panel = document.getElementById('detail-panel');
  const commentScroll = panel.querySelector('.comment-list-scroll');
  const commentJumpBtn = panel.querySelector('#comment-jump-btn');
  if (commentScroll) {
    const shouldForceScroll = FORCE_COMMENT_SCROLL_TASK_ID === taskId;
    const previousUnreadCount = previousCommentState?.unreadCount || 0;
    const hasNewComments = previousCommentState && previousCommentState.signature !== commentSignature;
    const nextUnreadCount = hasNewComments
      ? Math.max(1, comments.length - (previousCommentState?.count || 0))
      : previousUnreadCount;
    const shouldAutoScroll = shouldForceScroll || !previousCommentState || previousCommentState.atBottom;

    requestAnimationFrame(() => {
      if (shouldAutoScroll) {
        commentScroll.scrollTop = commentScroll.scrollHeight;
        COMMENT_VIEW_STATE.set(taskId, {
          scrollTop: Math.max(0, commentScroll.scrollHeight - commentScroll.clientHeight),
          atBottom: true,
          signature: commentSignature,
          count: comments.length,
          unreadCount: 0,
        });
        setCommentJumpButtonState(commentJumpBtn, 0);
      } else {
        const targetScrollTop = previousCommentState?.scrollTop || 0;
        const maxScrollTop = Math.max(0, commentScroll.scrollHeight - commentScroll.clientHeight);
        commentScroll.scrollTop = Math.min(targetScrollTop, maxScrollTop);
        COMMENT_VIEW_STATE.set(taskId, {
          scrollTop: commentScroll.scrollTop,
          atBottom: isCommentScrollAtBottom(commentScroll),
          signature: commentSignature,
          count: comments.length,
          unreadCount: nextUnreadCount,
        });
        setCommentJumpButtonState(commentJumpBtn, nextUnreadCount);
      }

      if (FORCE_COMMENT_SCROLL_TASK_ID === taskId) {
        FORCE_COMMENT_SCROLL_TASK_ID = null;
      }
    });

    commentScroll.addEventListener('scroll', () => {
      const atBottom = isCommentScrollAtBottom(commentScroll);
      const state = COMMENT_VIEW_STATE.get(taskId) || {};
      const unreadCount = atBottom ? 0 : (state.unreadCount || 0);
      COMMENT_VIEW_STATE.set(taskId, {
        ...state,
        scrollTop: commentScroll.scrollTop,
        atBottom,
        signature: commentSignature,
        count: comments.length,
        unreadCount,
      });
      setCommentJumpButtonState(commentJumpBtn, unreadCount);
    });

    commentJumpBtn?.addEventListener('click', () => {
      commentScroll.scrollTo({ top: commentScroll.scrollHeight, behavior: 'smooth' });
      COMMENT_VIEW_STATE.set(taskId, {
        scrollTop: Math.max(0, commentScroll.scrollHeight - commentScroll.clientHeight),
        atBottom: true,
        signature: commentSignature,
        count: comments.length,
        unreadCount: 0,
      });
      setCommentJumpButtonState(commentJumpBtn, 0);
    });
  }

  panel.querySelectorAll('.task-checkbox[data-subtask-id]').forEach((checkbox) => {
    checkbox.addEventListener('click', async () => {
      const subId = checkbox.dataset.subtaskId;
      await window.api.toggleSubTask(subId);
      await loadAllData();
      await openDetailPanel(taskId);
      await refreshAll();
    });
  });

  panel.querySelectorAll('.subtask-item[data-subtask-id]').forEach((item) => {
    item.addEventListener('contextmenu', (event) => {
      if (!canManageThisTask) return;
      const subtask = subtasks.find((candidate) => candidate.id === item.dataset.subtaskId);
      if (!subtask) return;
      event.preventDefault();
      event.stopPropagation();
      openActionItemContextMenu(event, task, subtask);
    });
  });

  panel.querySelectorAll('.detail-status-step[data-task-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      const nextStatus = button.dataset.taskStatus;
      if (!nextStatus || nextStatus === getTaskStatusValue(task)) return;
      await window.api.updateTask({
        id: task.id,
        status: nextStatus,
        completed: nextStatus === 'complete' ? 1 : 0,
      });
      await refreshAfterTaskChange(task.id);
    });
  });

  document.getElementById('send-comment-btn')?.addEventListener('click', async () => {
    const textarea = document.getElementById('comment-textarea');
    const body = textarea.value.trim();
    if (!body) return;
    FORCE_COMMENT_SCROLL_TASK_ID = taskId;
    await window.api.addComment({
      task_id: taskId,
      author_id: currentUser.id,
      body,
    });
    await loadAllData();
    await openDetailPanel(taskId);
    await refreshAll();
  });

  document.getElementById('comment-textarea')?.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
  });

  document.getElementById('comment-textarea')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('send-comment-btn')?.click();
    }
  });

  document.getElementById('open-project-notes')?.addEventListener('click', () => {
    openProjectNotesDialog(project);
  });

  document.getElementById('add-subtask-btn')?.addEventListener('click', () => {
    openAddSubtaskDialog(task);
  });

  const folderCard = document.getElementById('detail-folder-link-card');
  const folderMenuBtn = document.getElementById('detail-folder-link-menu');
  const folderInput = document.getElementById('detail-folder-link-input');
  const folderSaveBtn = document.getElementById('detail-folder-link-save');
  const folderCancelBtn = document.getElementById('detail-folder-link-cancel');

  folderCard?.addEventListener('click', async () => {
    if (!project) return;
    const linkValue = String(project.folder_link || '').trim();
    if (linkValue) {
      const result = await window.api.openLink(linkValue);
      if (!result?.success) {
        alert(result?.error || 'Could not open that link.');
      }
      return;
    }

    if (canManageFolder) {
      ACTIVE_PROJECT_FOLDER_EDIT = { projectId: project.id, value: '' };
      await openDetailPanel(taskId);
    }
  });

  folderMenuBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!project || !canManageFolder) return;

    const menu = ContextMenu.create([
      {
        label: 'Edit',
        action: async () => {
          ACTIVE_PROJECT_FOLDER_EDIT = {
            projectId: project.id,
            value: project.folder_link || '',
          };
          await openDetailPanel(taskId);
        }
      },
      {
        label: 'Clear',
        danger: true,
        action: async () => {
          ACTIVE_PROJECT_FOLDER_EDIT = null;
          await window.api.updateProject({ id: project.id, folder_link: '' });
          await refreshAfterProjectChange(project.id, taskId);
        }
      }
    ]);

    const rect = folderMenuBtn.getBoundingClientRect();
    positionMenu(menu, rect.right - 180, rect.bottom + 6);
  });

  if (folderInput) {
    setTimeout(() => {
      folderInput.focus();
      folderInput.select();
    }, 20);
  }

  folderSaveBtn?.addEventListener('click', async () => {
    if (!project) return;
    const nextValue = folderInput.value.trim();
    ACTIVE_PROJECT_FOLDER_EDIT = null;
    await window.api.updateProject({ id: project.id, folder_link: nextValue });
    await refreshAfterProjectChange(project.id, taskId);
  });

  folderCancelBtn?.addEventListener('click', async () => {
    ACTIVE_PROJECT_FOLDER_EDIT = null;
    await openDetailPanel(taskId);
  });

  folderInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      folderSaveBtn?.click();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      folderCancelBtn?.click();
    }
  });
}

// ── Add Subtask Dialog ──────────────────────────────

function openActionItemContextMenu(event, task, subtask) {
  const assigneeOptions = [
    {
      label: `Unassigned${!subtask.assigned_to ? ' ✓' : ''}`,
      action: async () => {
        await window.api.updateSubTask({ id: subtask.id, assigned_to: null });
        await loadAllData();
        await openDetailPanel(task.id);
        await refreshAll();
      }
    },
    ...getActionItemAssigneeOptions(task).map((user) => ({
      label: `${user.display_name}${subtask.assigned_to === user.id ? ' ✓' : ''}`,
      action: async () => {
        await window.api.updateSubTask({ id: subtask.id, assigned_to: user.id });
        await loadAllData();
        await openDetailPanel(task.id);
        await refreshAll();
      }
    }))
  ];

  const items = [
    {
      label: 'Edit Action Item',
      action: () => openAddSubtaskDialog(task, subtask)
    }
  ];

  if (assigneeOptions.length > 0) {
    items.push({
      label: 'Assign To',
      submenu: assigneeOptions
    });
  }

  items.push({ divider: true });
  items.push({
    label: 'Delete Action Item',
    danger: true,
    action: async () => {
      if (!confirm(`Delete action item "${subtask.title}"?`)) return;
      await window.api.deleteSubTask(subtask.id);
      await loadAllData();
      await openDetailPanel(task.id);
      await refreshAll();
    }
  });

  const menu = ContextMenu.create(items);
  positionMenu(menu, event.clientX, event.clientY);
}

function openAddSubtaskDialog(task, subtask = null) {
  if (!canCurrentUserAddActionItems(task)) return;

  const overlay = document.getElementById('add-subtask-overlay');
  const ownerTask = getTaskThreadOwner(task) || task;
  const titleInput = document.getElementById('add-subtask-title');
  const assigneeSelect = document.getElementById('add-subtask-assignee');
  const saveButton = document.getElementById('add-subtask-save');
  const assigneeOptions = getActionItemAssigneeOptions(task);
  const defaultAssignee = subtask?.assigned_to || task.assigned_to || task.owner_id || assigneeOptions[0]?.id || '';

  overlay.classList.remove('hidden');
  document.getElementById('add-subtask-subtitle').textContent = task.title;
  saveButton.textContent = subtask ? 'Save Action Item' : 'Add Action Item';
  titleInput.value = subtask?.title || '';
  assigneeSelect.innerHTML = [
    '<option value="">Unassigned</option>',
    ...assigneeOptions.map((user) => `<option value="${user.id}">${escapeHtml(user.display_name)}</option>`)
  ].join('');
  assigneeSelect.value = assigneeSelect.querySelector(`option[value="${defaultAssignee}"]`) ? defaultAssignee : '';
  setTimeout(() => titleInput.focus(), 50);

  const close = () => {
    document.removeEventListener('keydown', escHandler);
    overlay.classList.add('hidden');
  };
  document.getElementById('add-subtask-close').onclick = close;
  document.getElementById('add-subtask-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  saveButton.onclick = async () => {
    const title = titleInput.value.trim();
    if (!title) return;

    if (subtask) {
      await window.api.updateSubTask({
        id: subtask.id,
        title,
        assigned_to: assigneeSelect.value || null,
      });
    } else {
      await window.api.createSubTask({
        task_id: ownerTask.id,
        title,
        assigned_to: assigneeSelect.value || null,
      });
    }

    close();
    await loadAllData();
    await openDetailPanel(task.id);
    await refreshAll();
  };

  const escHandler = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', escHandler);
}

// ── Project Notes Dialog ────────────────────────────

async function openProjectNotesDialog(project) {
  if (!project) return;
  const overlay = document.getElementById('project-notes-overlay');
  const listEl = document.getElementById('project-notes-list');
  const mainEl = document.getElementById('project-notes-main');
  const addBtn = document.getElementById('project-notes-add');
  const saveBtn = document.getElementById('project-notes-save');

  overlay.classList.remove('hidden');
  document.getElementById('project-notes-title').textContent = 'Project Notes';
  document.getElementById('project-notes-subtitle').textContent = `${project.client} | ${project.name}`;

  const buildDrafts = () => {
    const drafts = new Map();
    for (const note of getProjectSharedNotes(project.id)) {
      drafts.set(note.id, {
        ...note,
        _lastSavedTitle: note.title || 'Untitled Note',
        _lastSavedNotes: note.notes || '',
      });
    }
    return drafts;
  };

  let drafts = buildDrafts();
  let activeNoteId = getPrimaryProjectSharedNote(project.id)?.id || null;
  let autosaveTimer = null;
  let saveChain = Promise.resolve();
  let isClosing = false;

  const orderedDrafts = () => [...drafts.values()].sort((left, right) => {
    const updatedDiff = Date.parse(right.updated_at || 0) - Date.parse(left.updated_at || 0);
    if (Number.isFinite(updatedDiff) && updatedDiff !== 0) return updatedDiff;
    return String(left.title || '').localeCompare(String(right.title || ''));
  });

  const getActiveDraft = () => (activeNoteId ? drafts.get(activeNoteId) || null : null);
  const getAuthorName = (userId) => getUserById(userId)?.display_name || 'StudioSync';
  const isUntouchedDraft = (draft) => draft?.isDraft
    && String(draft.title || '').trim() === 'Untitled Note'
    && !String(draft.notes || '').trim();
  const hasPersistedChanges = (draft) => {
    if (!draft) return false;
    if (draft.isDraft) return !isUntouchedDraft(draft);
    return String(draft.title || 'Untitled Note') !== String(draft._lastSavedTitle || 'Untitled Note')
      || String(draft.notes || '') !== String(draft._lastSavedNotes || '');
  };

  const syncDraftFromInputs = () => {
    const draft = getActiveDraft();
    if (!draft) return null;

    const bodyInput = document.getElementById('project-note-body-input');
    if (bodyInput) draft.notes = bodyInput.value;
    draft.updated_by = currentUser?.id || draft.updated_by || null;
    return draft;
  };

  const updateEditorMeta = (draft) => {
    const updatedEl = document.getElementById('project-note-meta-updated');
    const byEl = document.getElementById('project-note-meta-by');
    if (updatedEl) updatedEl.textContent = `Updated ${formatProjectNoteTimestamp(draft?.updated_at)}`;
    if (byEl) byEl.textContent = `by ${getAuthorName(draft?.updated_by || draft?.created_by)}`;
  };

  const refreshProjectNoteRelatedUI = async () => {
    renderMyProjects();
    if (selectedTaskId) {
      await openDetailPanel(selectedTaskId);
    } else if (selectedProjectId === project.id) {
      await openProjectDetailPanel(project.id);
    }
  };

  const persistDraft = async (draftId) => {
    const draft = draftId ? drafts.get(draftId) : null;
    if (!draft || !hasPersistedChanges(draft)) return draft;

    const title = String(draft.title || '').trim() || 'Untitled Note';
    const notes = String(draft.notes || '');

    if (draft.isDraft) {
      const createdNote = await window.api.createProjectSharedNote({
        project_id: project.id,
        title,
        notes,
        created_by: currentUser?.id || null,
        updated_by: currentUser?.id || null,
      });

      if (!createdNote?.id) return draft;

      drafts.delete(draftId);
      const persistedDraft = {
        ...createdNote,
        _lastSavedTitle: createdNote.title || title,
        _lastSavedNotes: createdNote.notes || notes,
      };
      drafts.set(createdNote.id, persistedDraft);
      if (activeNoteId === draftId) {
        activeNoteId = createdNote.id;
      }
      renderDialog();
      if (activeNoteId === createdNote.id) {
        updateEditorMeta(persistedDraft);
      }
    } else {
      const updatedNote = await window.api.updateProjectSharedNote({
        id: draft.id,
        title,
        notes,
        updated_by: currentUser?.id || null,
      });

      const persistedDraft = drafts.get(draft.id);
      if (!persistedDraft) return draft;
      persistedDraft.title = updatedNote?.title ?? title;
      persistedDraft.notes = updatedNote?.notes ?? notes;
      persistedDraft.updated_at = updatedNote?.updated_at || new Date().toISOString();
      persistedDraft.updated_by = updatedNote?.updated_by ?? currentUser?.id ?? persistedDraft.updated_by;
      persistedDraft._lastSavedTitle = persistedDraft.title || title;
      persistedDraft._lastSavedNotes = persistedDraft.notes || notes;
      if (activeNoteId === persistedDraft.id) {
        updateEditorMeta(persistedDraft);
      }
    }

    await refreshProjectNoteRelatedUI();
    return drafts.get(activeNoteId) || null;
  };

  const queuePersistDraft = (draftId) => {
    saveChain = saveChain
      .catch(() => null)
      .then(() => persistDraft(draftId));
    return saveChain;
  };

  const scheduleAutosave = (draftId = activeNoteId, { immediate = false } = {}) => {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    if (!draftId) return saveChain;

    const run = () => {
      autosaveTimer = null;
      return queuePersistDraft(draftId);
    };

    if (immediate) {
      return run();
    }

    autosaveTimer = setTimeout(run, 450);
    return saveChain;
  };

  const openNoteActionsMenu = (event, noteId) => {
    event.preventDefault();
    event.stopPropagation();

    const note = drafts.get(noteId);
    if (!note) return;

    const menu = ContextMenu.create([
      {
        label: 'Rename Note',
        action: () => {
          const nextTitle = window.prompt('Rename note', note.title || 'Untitled Note');
          if (nextTitle === null) return;
          note.title = nextTitle.trim() || 'Untitled Note';
          note.updated_by = currentUser?.id || note.updated_by || null;
          renderDialog();
          void scheduleAutosave(note.id, { immediate: true });
        }
      },
      {
        label: note.isDraft ? 'Discard Draft' : 'Delete Note',
        danger: true,
        action: async () => {
          if (note.isDraft) {
            drafts.delete(note.id);
            if (activeNoteId === note.id) {
              activeNoteId = orderedDrafts()[0]?.id || null;
            }
            renderDialog();
            return;
          }

          const confirmed = window.confirm(`Delete "${note.title || 'this note'}"?`);
          if (!confirmed) return;
          await window.api.deleteProjectSharedNote(note.id);
          await reloadFromStore();
        }
      }
    ]);

    const rect = event.currentTarget.getBoundingClientRect();
    positionMenu(menu, rect.right - 180, rect.bottom + 6);
  };

  const renderDialog = () => {
    const notes = orderedDrafts();
    const activeDraft = getActiveDraft();

    listEl.innerHTML = notes.length ? notes.map((note) => {
      return `
        <div class="project-notes-item ${note.id === activeNoteId ? 'active' : ''}" data-note-id="${note.id}">
          <button class="project-notes-item-select" data-note-id="${note.id}" type="button">
            <span class="project-notes-item-title">${escapeHtml(note.title || 'Untitled Note')}</span>
          </button>
          <button class="project-notes-item-menu" data-note-menu="${note.id}" type="button" aria-label="Note options">&#8942;</button>
        </div>
      `;
    }).join('') : '<div class="project-notes-empty-sidebar">No shared notes yet.</div>';

    if (!activeDraft) {
      mainEl.innerHTML = `
        <div class="project-notes-empty-state">
          <div class="project-notes-empty-title">No note selected</div>
          <div class="project-notes-empty-copy">Create a named note for project updates, handoff details, and shared history.</div>
          <button class="btn btn-accent btn-sm" id="project-notes-empty-add" type="button">+ New Note</button>
        </div>
      `;
      document.getElementById('project-notes-empty-add')?.addEventListener('click', () => addBtn.click());
      saveBtn.textContent = 'Close';
      saveBtn.disabled = false;
    } else {
      mainEl.innerHTML = `
        <div class="project-notes-editor">
          <div class="project-notes-main-header">
            <div class="project-notes-main-copy">
              <div class="project-notes-main-title">${escapeHtml(activeDraft.title || 'Untitled Note')}</div>
            </div>
          </div>
          <div class="detail-field">
            <div class="detail-field-label">Note Details</div>
            <textarea class="dialog-textarea project-note-body-input" id="project-note-body-input" rows="12" placeholder="Add the shared details everyone should see for this project...">${escapeHtml(activeDraft.notes || '')}</textarea>
          </div>
          <div class="project-notes-meta">
            <span id="project-note-meta-updated">Updated ${escapeHtml(formatProjectNoteTimestamp(activeDraft.updated_at))}</span>
            <span id="project-note-meta-by">by ${escapeHtml(getAuthorName(activeDraft.updated_by || activeDraft.created_by))}</span>
          </div>
        </div>
      `;
      document.getElementById('project-note-body-input')?.addEventListener('input', () => {
        syncDraftFromInputs();
        void scheduleAutosave();
      });
      saveBtn.textContent = 'Close';
      saveBtn.disabled = false;
    }

    listEl.querySelectorAll('.project-notes-item-select[data-note-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const previousNoteId = activeNoteId;
        syncDraftFromInputs();
        void scheduleAutosave(previousNoteId, { immediate: true });
        activeNoteId = button.dataset.noteId;
        renderDialog();
      });
    });

    listEl.querySelectorAll('.project-notes-item-menu[data-note-menu]').forEach((button) => {
      button.addEventListener('click', (event) => {
        syncDraftFromInputs();
        openNoteActionsMenu(event, button.dataset.noteMenu);
      });
    });
  };

  const close = () => {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    document.removeEventListener('keydown', escHandler);
    overlay.classList.add('hidden');
  };

  const handleClose = async () => {
    if (isClosing) return;
    isClosing = true;
    try {
      syncDraftFromInputs();
      if (activeNoteId) {
        await scheduleAutosave(activeNoteId, { immediate: true });
      } else {
        await saveChain.catch(() => null);
      }
    } finally {
      close();
      isClosing = false;
    }
  };

  const reloadFromStore = async (nextActiveId = null) => {
    await loadAllData();
    drafts = buildDrafts();
    const notes = orderedDrafts();
    activeNoteId = nextActiveId && drafts.has(nextActiveId) ? nextActiveId : notes[0]?.id || null;
    renderDialog();
    await refreshProjectNoteRelatedUI();
  };

  addBtn.onclick = () => {
    syncDraftFromInputs();
    const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    drafts.set(draftId, {
      id: draftId,
      project_id: project.id,
      title: 'Untitled Note',
      notes: '',
      created_by: currentUser?.id || null,
      updated_by: currentUser?.id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      isDraft: true,
    });
    activeNoteId = draftId;
    renderDialog();
  };

  document.getElementById('project-notes-close').onclick = () => { void handleClose(); };
  overlay.onclick = (e) => { if (e.target === overlay) void handleClose(); };

  saveBtn.onclick = () => { void handleClose(); };

  renderDialog();

  const escHandler = (e) => {
    if (e.key === 'Escape') void handleClose();
  };
  document.addEventListener('keydown', escHandler);
}

function getProjectPartners(project) {
  if (!project) return [];
  const ids = new Set();
  if (project.partner_id) ids.add(project.partner_id);
  for (const partnerId of getProjectPartnerIds(project)) {
    if (partnerId) ids.add(partnerId);
  }
  return [...ids].map((id) => getUserById(id)).filter(Boolean);
}

function getFolderLinkDisplayLabel(project) {
  return getProjectDisplayTitle(project) || 'Project folder';
}

function renderTaskStatusControl(task, canEditStatus) {
  const currentStatus = getTaskStatusValue(task);
  return `
    <div class="detail-status-control">
      ${TASK_STATUS_OPTIONS.map((option) => `
        <button
          class="detail-status-step ${option.value === currentStatus ? 'active' : ''} ${canEditStatus ? '' : 'read-only'}"
          ${canEditStatus ? `data-task-status="${option.value}"` : 'disabled'}
          type="button"
        >
          ${option.label}
        </button>
      `).join('')}
    </div>
  `;
}

function renderProjectFolderCard(project, canManageFolder) {
  if (!project) return '';

  const isEditing = ACTIVE_PROJECT_FOLDER_EDIT?.projectId === project.id;
  const hasLink = Boolean(String(project.folder_link || '').trim());

  if (isEditing) {
    return `
      <div class="detail-link-card detail-link-card-editing">
        <div class="detail-link-card-main">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.086a1.5 1.5 0 0 1 1.06.44l.915.914A1.5 1.5 0 0 0 8.621 4H13.5A1.5 1.5 0 0 1 15 5.5v7A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-9z" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          <input type="text" class="detail-link-input" id="detail-folder-link-input" value="${escapeAttr(ACTIVE_PROJECT_FOLDER_EDIT.value || '')}" placeholder="Paste a folder path or link">
        </div>
        <div class="detail-link-card-actions">
          <button class="detail-link-action" id="detail-folder-link-cancel" type="button">Cancel</button>
          <button class="detail-link-action detail-link-action-primary" id="detail-folder-link-save" type="button">Save</button>
        </div>
      </div>
    `;
  }

  const clickableClass = hasLink ? 'is-clickable' : (canManageFolder ? 'is-empty-editable' : 'is-empty');
  return `
    <button class="detail-link-card ${clickableClass}" id="detail-folder-link-card" type="button">
      <div class="detail-link-card-main">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.086a1.5 1.5 0 0 1 1.06.44l.915.914A1.5 1.5 0 0 0 8.621 4H13.5A1.5 1.5 0 0 1 15 5.5v7A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-9z" stroke="currentColor" stroke-width="1.2"/>
        </svg>
        <span class="detail-link-card-label">${escapeHtml(hasLink ? getFolderLinkDisplayLabel(project) : (canManageFolder ? 'Add project folder link' : 'No project folder link'))}</span>
      </div>
      <div class="detail-link-card-end">
        ${hasLink && canManageFolder ? `
          <span class="detail-link-menu-btn" id="detail-folder-link-menu" title="Folder link options" aria-label="Folder link options">⋮</span>
        ` : ''}
        ${hasLink ? '<span class="detail-link-arrow" aria-hidden="true">→</span>' : ''}
      </div>
    </button>
  `;
}

async function openProjectDetailPanel(projectId) {
  const project = getProjectById(projectId);
  if (!project) return;

  selectedProjectId = projectId;
  selectedTaskId = null;
  document.querySelectorAll('.task-card').forEach((card) => card.classList.remove('selected'));
  document.querySelectorAll('.personal-project-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.projectId === projectId);
  });

  const header = document.getElementById('detail-header');
  header.innerHTML = `
    <h3 class="detail-title" id="detail-title">${escapeHtml(project.client)} | ${escapeHtml(project.name)}</h3>
    <button class="detail-close" id="detail-close">&times;</button>
  `;

  document.getElementById('detail-close').addEventListener('click', () => {
    selectedProjectId = null;
    document.querySelectorAll('.personal-project-card').forEach((card) => card.classList.remove('selected'));
    showDetailEmptyState();
  });

  const projectNotesPreview = getProjectSharedNotesPreview(project.id);
  document.getElementById('detail-body').innerHTML = `
    <div class="detail-field">
      <div class="detail-field-label">Client Name</div>
      <input type="text" class="input" id="project-detail-client" value="${escapeAttr(project.client || '')}">
    </div>
    <div class="detail-field">
      <div class="detail-field-label">Project Name</div>
      <input type="text" class="input" id="project-detail-name" value="${escapeAttr(project.name || '')}">
    </div>
    <div class="detail-field">
      <div class="detail-field-label">Status</div>
      <div class="detail-field-value">${escapeHtml(getProjectSection(project).toUpperCase())}</div>
    </div>
    <div class="detail-field">
      <div class="detail-field-label">Scheduling Notes</div>
      <input type="text" class="input" id="project-detail-notes" value="${escapeAttr(project.notes || '')}" placeholder="Short note shown in Dashboard and project cards.">
    </div>
    <div class="detail-field">
      <div class="detail-field-label">Project Notes</div>
      <button class="project-notes-btn detail-project-info-btn detail-project-notes-launch" id="project-detail-project-notes" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <span class="detail-project-info-btn-label">Manage shared notes</span>
        <span class="notes-preview">
          <span class="notes-preview-title">${escapeHtml(projectNotesPreview.summary)}</span>
          <span class="notes-preview-detail">${escapeHtml(projectNotesPreview.detail)}</span>
        </span>
        <span class="detail-link-arrow" aria-hidden="true">›</span>
      </button>
    </div>
    <div class="detail-actions">
      <button class="btn btn-primary btn-sm" id="project-detail-save">Save Changes</button>
    </div>
  `;

  document.getElementById('project-detail-project-notes').addEventListener('click', () => {
    openProjectNotesDialog(project);
  });

  document.getElementById('project-detail-save').addEventListener('click', async () => {
    const client = document.getElementById('project-detail-client').value.trim();
    const name = document.getElementById('project-detail-name').value.trim();
    const notes = document.getElementById('project-detail-notes').value.trim();
    if (!client || !name) return;

    await window.api.updateProject({
      id: project.id,
      client,
      name,
      notes,
    });
    await loadAllData();
    renderMyProjects();
    await openProjectDetailPanel(project.id);
  });
}

// ── Tab Bar ─────────────────────────────────────────

function setupTabBar() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab, { preserveStaffFilter: false }));
  });
}

function syncActiveTabLayout() {
  const appShell = document.getElementById('app-shell');
  if (!appShell) return;

  const isReadOnlyStaffOverview = !isPartner() && activeTab === 'staff-view' && canCurrentUserUseStaffOverview();
  appShell.classList.toggle('staff-readonly-overview', isReadOnlyStaffOverview);
}

function activateTab(tabName, options = {}) {
  const { preserveStaffFilter = false } = options;
  const canUseStaffOverview = canCurrentUserUseStaffOverview();

  if (tabName === 'staff-view' && !canUseStaffOverview) {
    tabName = 'my-tasks';
  }

  if (tabName === 'my-projects' && !isPartner()) {
    tabName = 'my-tasks';
  }

  if (tabName === 'staff-view' && activeTab !== 'staff-view' && !preserveStaffFilter) {
    selectedStaffFilter = null;
    if (isPartner()) renderSidebar();
  }

  activeTab = tabName;
  syncActiveTabLayout();
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${tabName}`).classList.remove('hidden');
  document.getElementById(`view-${tabName}`).classList.add('active');

  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  if (tabName === 'my-projects') {
    searchInput.placeholder = 'Search projects...';
    renderMyProjects();
    if (selectedProjectId) {
      openProjectDetailPanel(selectedProjectId);
    } else {
      showDetailEmptyState();
    }
  } else if (tabName === 'staff-view') {
    searchInput.placeholder = 'Search tasks...';
    if (!isPartner()) {
      clearSelectedTaskDetail();
    }
    renderStaffOverview();
    if (isPartner() && selectedTaskId) {
      openDetailPanel(selectedTaskId);
    } else {
      showDetailEmptyState();
    }
  } else {
    searchInput.placeholder = 'Search tasks...';
    renderMyTasks(searchInput.value);
    if (selectedTaskId) {
      openDetailPanel(selectedTaskId);
    } else {
      showDetailEmptyState();
    }
  }
}

// ── Search ──────────────────────────────────────────

function setupSearch() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    if (activeTab === 'my-projects') {
      renderMyProjects();
    } else if (activeTab === 'staff-view') {
      renderStaffOverview();
    } else {
      renderMyTasks(e.target.value);
    }
  });
}

// ── Logout ──────────────────────────────────────────

function setSyncIndicatorState(state) {
  const indicator = document.getElementById('sync-indicator');
  if (!indicator) return;

  const dot = indicator.querySelector('.sync-dot');
  if (!dot) return;

  dot.classList.remove('syncing', 'error');
  if (SYNC_STATUS_RESET_TIMER) {
    clearTimeout(SYNC_STATUS_RESET_TIMER);
    SYNC_STATUS_RESET_TIMER = null;
  }

  if (state === 'syncing') {
    dot.classList.add('syncing');
    indicator.title = 'Syncing...';
  } else if (state === 'error') {
    dot.classList.add('error');
    indicator.title = 'Sync error';
  } else {
    indicator.title = 'Synced';
  }
}

function formatStatusTimestamp(isoStr) {
  if (!isoStr) return 'No recent sync';
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return 'No recent sync';
  return `Synced ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function applyRuntimeStatus(status) {
  const indicator = document.getElementById('sync-indicator');
  const userBadge = document.getElementById('user-badge');
  const userName = document.getElementById('user-name');
  if (!indicator) return;

  const text = formatStatusTimestamp(status?.lastSyncAt);

  const sharedPath = status?.sharedDrivePath || 'Not configured';
  const sharedState = status?.sharedDrivePath
    ? (status.sharedDriveReachable ? 'reachable' : 'unavailable')
    : 'not configured';

  const tooltip = `${text}\nShared folder: ${sharedPath}\nStatus: ${sharedState}`;
  indicator.title = tooltip;
  if (userBadge) userBadge.title = tooltip;
  if (userName) userName.title = tooltip;
}

async function bindRuntimeStatus() {
  if (RUNTIME_STATUS_BOUND) return;
  RUNTIME_STATUS_BOUND = true;

  applyRuntimeStatus(await window.api.getRuntimeStatus());
  window.api.onRuntimeStatusChanged((status) => {
    applyRuntimeStatus(status);
  });
}

function flashSyncIndicator() {
  setSyncIndicatorState('syncing');
  SYNC_STATUS_RESET_TIMER = setTimeout(() => {
    setSyncIndicatorState('synced');
  }, 1200);
}

function setupSettingsMenu() {
  document.getElementById('settings-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    let launchOnStartup = null;
    try {
      launchOnStartup = await window.api.getLaunchOnStartup();
    } catch (_) {
      launchOnStartup = null;
    }

    const items = [
      {
        label: 'Sync Now',
        action: async () => {
          try {
            setSyncIndicatorState('syncing');
            await window.api.forceSync();
            setSyncIndicatorState('synced');
          } catch (_) {
            setSyncIndicatorState('error');
          }
        }
      },
      {
        label: 'Check for Updates',
        action: async () => {
          await window.api.checkForUpdates();
        }
      },
    ];

    if (launchOnStartup?.manageable) {
      items.push({
        label: launchOnStartup.enabled ? 'Disable Launch on Windows Startup' : 'Enable Launch on Windows Startup',
        action: async () => {
          try {
            await window.api.setLaunchOnStartup(!launchOnStartup.enabled);
          } catch (error) {
            console.error('Could not update launch-on-startup setting:', error);
            alert('Could not update the Windows startup setting.');
          }
        }
      });
    }

    items.push(
      { divider: true },
      {
        label: 'Sign Out',
        action: async () => {
          await window.api.logout();
          await window.api.setWindowMode('login');
          window.location.reload();
        }
      }
    );

    const menu = ContextMenu.create(items);

    const rect = e.currentTarget.getBoundingClientRect();
    positionMenu(menu, rect.right - 220, rect.bottom + 6);
  });
}

// ── Init ────────────────────────────────────────────

initApp();
