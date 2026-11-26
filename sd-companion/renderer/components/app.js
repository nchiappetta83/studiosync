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

      window.MyTasksToast?.show({
        message: event.reason?.message || 'Something went wrong. Your last change may not have been saved.',
        tone: 'error',
        duration: 6000,
      });
    });

    originals.log('Renderer logging initialized');
  },
};

RendererLog.bind();

const MyTasksDiagnostics = {
  log(type, detail = {}) {
    window.api?.logDiagnostics?.({ type, href: window.location.href, ...detail }).catch(() => {});
  },
  bind() {
    this.log('renderer-started');
    window.addEventListener('error', (event) => this.log('renderer-error', { message: event.message, filename: event.filename, line: event.lineno }));
    window.addEventListener('unhandledrejection', (event) => this.log('renderer-unhandled-rejection', { message: event.reason?.message || String(event.reason || '') }));
    window.addEventListener('pageshow', () => this.log('renderer-pageshow'));
    window.addEventListener('beforeunload', () => this.log('renderer-beforeunload'));
    try {
      new PerformanceObserver((entries) => entries.getEntries().forEach((entry) => {
        if (entry.duration >= 100) this.log('renderer-long-task', { durationMs: Math.round(entry.duration) });
      })).observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  },
};

MyTasksDiagnostics.bind();

function showToast(message, options = {}) {
  return window.MyTasksToast?.show({ message, ...options });
}

function requireTextInput(input, message) {
  if (input?.value.trim()) return true;
  showToast(message, { tone: 'warning' });
  input?.focus();
  return false;
}

function hasUnsavedProjectDetailChanges() {
  return ACTIVE_PROJECT_DETAIL_DRAFT?.dirty === true;
}

async function confirmDiscardProjectDetailChanges(nextProjectId = null) {
  if (!hasUnsavedProjectDetailChanges()) return true;
  if (nextProjectId && String(nextProjectId) === String(ACTIVE_PROJECT_DETAIL_DRAFT.projectId)) return true;

  const confirmed = await window.MyTasksConfirmDialog.show({
    title: 'Discard unsaved changes?',
    message: 'Your project detail edits have not been saved.',
    confirmLabel: 'Discard Changes',
    tone: 'danger',
  });
  if (confirmed) ACTIVE_PROJECT_DETAIL_DRAFT = null;
  return confirmed;
}

async function runUiAction(action, options = {}) {
  const button = options.button || null;
  const originalLabel = button?.textContent;

  if (button) {
    if (button.disabled) return { ok: false, skipped: true };
    button.disabled = true;
    button.classList.add('is-pending');
    if (options.pendingLabel) button.textContent = options.pendingLabel;
  }

  try {
    const result = await action();
    if (options.successMessage) showToast(options.successMessage, { tone: 'success' });
    return { ok: true, result };
  } catch (error) {
    console.error(options.logMessage || options.errorMessage || 'UI action failed:', error);
    showToast(options.errorMessage || error?.message || 'That action could not be completed.', {
      tone: 'error',
      duration: 6000,
    });
    return { ok: false, error };
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.classList.remove('is-pending');
      if (options.pendingLabel) button.textContent = originalLabel;
    }
  }
}

let currentUser = null;
let selectedTaskId = null;
let selectedProjectId = null;
let selectedStaffFilter = null;
let selectedReadonlyStaffIds = [];
let activeFilter = null; // 'pending' | 'completed' | 'overdue' | null
let activeTab = 'my-tasks';
let myTaskSearchQuery = '';
let myProjectsSearchQuery = '';
let staffOverviewSearchQuery = '';
let STYLE_PREFERENCES = { theme: 'light', detailPaneMode: 'permanent' };
let DETAIL_PANE_COLLAPSE = { staff: false, partner: false };

// ── Local data cache (populated from backend) ───────
let USERS = [];
let TASKS = [];
let STAFF_OVERVIEW_ASSIGNMENTS = [];
let PRIVATE_TASKS = [];
let PROJECTS = [];
let PTO_DATA = [];
let CUSTOM_PRIORITIES = [];
let PRIORITY_MENU_ORDER = [];
let PRIORITY_DISPLAY_STYLES = {};
let WORK_CARD_CATEGORIES = [];
let PROJECT_WORK_CARDS = [];
let MY_WEEK_WORK_CARDS = [];
let TEAM_CALENDAR_WORK_CARDS = [];
let MY_WEEK_FOCUS = null;
let MY_WEEK_SELECTED_START = null;
let OFFICE_CAPACITY = { dailyHours: 8, weeklyHours: 40 };
let STAFF_SIDEBAR_SORT = 'name';
let PROJECT_SHARED_NOTES_CACHE = {}; // projectId -> note[]
let SUBTASK_CACHE = {};       // taskId -> subtask[]
let COMMENT_CACHE = {};       // taskId -> comment[]
let UPDATE_UI_BOUND = false;
let WINDOW_CHROME_BOUND = false;
let SYNC_STATUS_RESET_TIMER = null;
let RESIZE_PERF_TIMER = null;
let RUNTIME_STATUS_BOUND = false;
let LAST_RUNTIME_STATUS = null;
let LAST_SYNC_RECOVERY_NOTICE_AT = null;
let SYNC_BANNER_DISMISSED = false;
let SYSTEM_THEME_LISTENER_BOUND = false;
let ACTIVE_PROJECT_FOLDER_EDIT = null;
let ACTIVE_PROJECT_DETAIL_DRAFT = null;
let ACTIVE_PROJECT_DETAIL_TAB = { projectId: null, tab: 'work-cards' };
let WORK_CARD_DONE_EXPANDED_PROJECT_ID = null;
let FORCE_COMMENT_SCROLL_TASK_ID = null;
let OPEN_COMMENT_DRAWER_TASK_ID = null;
let EXTERNAL_SYNC_REFRESH_PROMISE = null;
let EXTERNAL_SYNC_REFRESH_PENDING = false;
let ROLLOVER_REVIEW_STATE = { active: false, week: null, startedAt: null };
const LAST_VIEWED_TASK_KEY = 'mytasks:last-viewed-task-id';
const LAST_VIEWED_PROJECT_KEY = 'mytasks:last-viewed-project-id';
const LAST_ACTIVE_TAB_KEY = 'mytasks:last-active-tab';
const LAST_COMMENT_DRAWER_TASK_KEY = 'mytasks:last-comment-drawer-task-id';
const STAFF_FILTER_KEY = 'mytasks:staff-filter';
const STAFF_SECTION_COLLAPSE_KEY = 'mytasks:staff-section-collapse';
const READONLY_STAFF_SELECTION_KEY = 'mytasks:readonly-staff-selection';
const PROJECT_SECTION_COLLAPSE_KEY = 'mytasks:project-section-collapse';
const MY_PROJECT_GROUP_COLLAPSE_KEY = 'mytasks:my-project-group-collapse';
const STYLE_PREFERENCES_KEY = 'mytasks:style-preferences';
const DETAIL_PANE_COLLAPSE_KEY = 'mytasks:detail-pane-collapse';
const ACCENT_PRESETS = [
  {
    id: 'slate',
    label: 'Slate blue',
    light: { accent: '#3B608F', hover: '#2F4F78', soft: '#E8EEF5', rgb: '59, 96, 143', strong: '#2B466B' },
    dark: { accent: '#8FB0D6', hover: '#A6C2E1', soft: 'rgba(143, 176, 214, 0.18)', rgb: '143, 176, 214', strong: '#C9DAEE' },
  },
  {
    id: 'navy',
    label: 'Navy',
    light: { accent: '#1F4E79', hover: '#173D60', soft: '#E6EDF5', rgb: '31, 78, 121', strong: '#143556' },
    dark: { accent: '#8FB5DC', hover: '#A8C8E6', soft: 'rgba(143, 181, 220, 0.18)', rgb: '143, 181, 220', strong: '#D6E5F4' },
  },
  {
    id: 'graphite',
    label: 'Graphite',
    light: { accent: '#4A5560', hover: '#39424B', soft: '#ECEFF2', rgb: '74, 85, 96', strong: '#2F373F' },
    dark: { accent: '#B4BEC8', hover: '#C6CED6', soft: 'rgba(180, 190, 200, 0.18)', rgb: '180, 190, 200', strong: '#E3E8ED' },
  },
  {
    id: 'teal',
    label: 'Teal',
    light: { accent: '#1D7479', hover: '#165B5F', soft: '#E4F1F2', rgb: '29, 116, 121', strong: '#145659' },
    dark: { accent: '#6FC4C8', hover: '#8AD0D3', soft: 'rgba(111, 196, 200, 0.18)', rgb: '111, 196, 200', strong: '#C5E8EA' },
  },
  {
    id: 'blue',
    label: 'Blue',
    light: { accent: '#2F6FDB', hover: '#265DBA', soft: '#EAF1FD', rgb: '47, 111, 219', strong: '#204D99' },
    dark: { accent: '#76A9FF', hover: '#94BCFF', soft: 'rgba(118, 169, 255, 0.18)', rgb: '118, 169, 255', strong: '#C1D8FF' },
  },
  {
    id: 'green',
    label: 'Green',
    light: { accent: '#1F7A58', hover: '#186347', soft: '#E8F7F1', rgb: '31, 122, 88', strong: '#14573F' },
    dark: { accent: '#58CFA8', hover: '#78DCBA', soft: 'rgba(88, 207, 168, 0.18)', rgb: '88, 207, 168', strong: '#B5F0DC' },
  },
  {
    id: 'olive',
    label: 'Olive',
    light: { accent: '#5E6B2B', hover: '#4B5522', soft: '#EFF1E2', rgb: '94, 107, 43', strong: '#444E1F' },
    dark: { accent: '#B5C37A', hover: '#C4CF94', soft: 'rgba(181, 195, 122, 0.18)', rgb: '181, 195, 122', strong: '#E0E8C4' },
  },
  {
    id: 'violet',
    label: 'Violet',
    light: { accent: '#4D4AD5', hover: '#3F3CC4', soft: '#EDEDFB', rgb: '77, 74, 213', strong: '#3C3489' },
    dark: { accent: '#AFA6FF', hover: '#C2BBFF', soft: 'rgba(175, 166, 255, 0.18)', rgb: '175, 166, 255', strong: '#DDD9FF' },
  },
  {
    id: 'plum',
    label: 'Plum',
    light: { accent: '#7A4A78', hover: '#613B5F', soft: '#F1E8F0', rgb: '122, 74, 120', strong: '#573456' },
    dark: { accent: '#C79BC4', hover: '#D4B0D1', soft: 'rgba(199, 155, 196, 0.18)', rgb: '199, 155, 196', strong: '#EBD6E9' },
  },
  {
    id: 'rose',
    label: 'Rose',
    light: { accent: '#BE3868', hover: '#A12E58', soft: '#FCEBF2', rgb: '190, 56, 104', strong: '#8C2549' },
    dark: { accent: '#F28BAF', hover: '#F5A6C1', soft: 'rgba(242, 139, 175, 0.18)', rgb: '242, 139, 175', strong: '#FFD0DF' },
  },
  {
    id: 'terracotta',
    label: 'Terracotta',
    light: { accent: '#A5502F', hover: '#843F25', soft: '#F6EAE4', rgb: '165, 80, 47', strong: '#7A3A21' },
    dark: { accent: '#E0A084', hover: '#E8B49C', soft: 'rgba(224, 160, 132, 0.18)', rgb: '224, 160, 132', strong: '#F4D9CB' },
  },
  {
    id: 'orange',
    label: 'Orange',
    light: { accent: '#A25B1B', hover: '#874C16', soft: '#FBF0E5', rgb: '162, 91, 27', strong: '#6E3F14' },
    dark: { accent: '#F2B16D', hover: '#F5C286', soft: 'rgba(242, 177, 109, 0.18)', rgb: '242, 177, 109', strong: '#F9D7AD' },
  },
];
const STAFF_SECTION_COLLAPSE = {};
const PROJECT_SECTION_COLLAPSE = { active: false, future: true, inactive: true };
const MY_PROJECT_GROUP_COLLAPSE = { due: false, active: false, wait: true, completed: true };
const COMMENT_VIEW_STATE = new Map();
const {
  PRIORITY_NONE,
  PRIORITY_WAIT,
  PRIORITY_CUSTOM,
  buildCustomPriorityLabel,
  getCustomPriorityLabel,
  isPrioritySet,
  parsePrioritySelectValue,
  getPrioritySelectValue,
} = window.MyTasksPriority;
const {
  getPriorityDisplayStyles: getPriorityDisplayStylesBase,
  getPriorityStyleForToken: getPriorityStyleForTokenBase,
  getPriorityInlineStyle: getPriorityInlineStyleBase,
  getPriorityPresentation: getPriorityPresentationBase,
} = window.MyTasksPriorityPresentation;
const {
  canAddActionItems: canAddActionItemsPermission,
  canManageOwnSharedTask: canManageOwnSharedTaskPermission,
  canManageProjectFolder: canManageProjectFolderPermission,
} = window.MyTasksPermissions;
const {
  buildTaskPayload,
} = window.MyTasksTaskPayload;
const {
  getPlainTextFromRichNote,
} = window.MyTasksRichNotes;
const {
  orderProjectNotes,
} = window.MyTasksProjectNotes;
const {
  getProjectPartnerIds,
  isFutureProject,
  getProjectSection,
  getProjectDisplayTitle,
  normalizeTaskDisplayTitle,
  getTaskDisplayTitle: getTaskDisplayTitleFromProjectDisplay,
} = window.MyTasksProjectDisplay;
const {
  bindProjectFolderLinkControls,
  renderProjectFolderCard,
} = window.MyTasksProjectFolderLink;
const {
  getSubtaskAssigneeIds,
  getVisibleRepresentativeTasks,
} = window.MyTasksActionItems;
const {
  escapeHtml,
  escapeAttr,
} = window.MyTasksHtml;
const {
  TASK_STATUS_OPTIONS,
  formatDate,
  getTaskStatusValue,
  getTaskStatusLabel,
  isTaskOverdue,
} = window.MyTasksTaskDisplay;
const {
  getCommentStateSignature,
  isCommentScrollAtBottom,
  setCommentJumpButtonState,
  timeAgo,
  formatClockTime,
} = window.MyTasksCommentDisplay;
const {
  sortTasksLikeScheduling: sortTasksLikeSchedulingBase,
} = window.MyTasksTaskOrdering;
const {
  getWorkCardStatus,
  transitionWorkCard,
  getDateChip,
  getScheduleProgress,
  getProjectWorkCardSummary,
  getWorkCardsDailyLoad,
  getWorkCardWeeklyHours,
  getLoadState,
  getStaffLoadState,
  normalizeWorkCardDates,
  getStaffProjectPopupCards,
} = window.MyTasksWorkCard;
const {
  getProjectListDueChip,
  getProjectListWorkSummary,
  getProjectListGroups,
  getProjectListHeaderSummary,
  getProjectListAssignees,
} = window.MyTasksProjectList;

// ── Data Loading ────────────────────────────────────

function getCurrentWeekStartString(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay();
  local.setDate(local.getDate() - (day === 0 ? 6 : day - 1));
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
}

function addDaysToIsoDate(isoDate, offset) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function formatWeekRange(weekOf) {
  const start = new Date(`${weekOf}T12:00:00`);
  const end = new Date(`${addDaysToIsoDate(weekOf, 4)}T12:00:00`);
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function getDisplayedWeekStart() {
  return MY_WEEK_SELECTED_START || getCurrentWeekStartString();
}

async function loadDisplayedWeekData() {
  if (!currentUser) return;
  const myWeek = await window.api.getMyWeekWorkCards(getDisplayedWeekStart());
  MY_WEEK_WORK_CARDS = myWeek?.cards || [];
  MY_WEEK_FOCUS = myWeek?.focus || null;
}

function formatCapacityHours(hours) {
  const rounded = Math.round((Number(hours) || 0) * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
}

async function loadAllData() {
  const rolloverReviewPromise = window.api.getRolloverReviewState();
  [USERS, TASKS, STAFF_OVERVIEW_ASSIGNMENTS, PROJECTS, PTO_DATA, CUSTOM_PRIORITIES, PRIORITY_MENU_ORDER, PRIORITY_DISPLAY_STYLES, WORK_CARD_CATEGORIES, OFFICE_CAPACITY] = await Promise.all([
    window.api.getUsers(),
    window.api.getTasks(),
    window.api.getStaffOverviewAssignments?.() || Promise.resolve([]),
    window.api.getProjects(),
    window.api.getPTO(),
    window.api.getCustomPriorities(),
    window.api.getPriorityMenuOrder(),
    window.api.getPriorityDisplayStyles(),
    window.api.getWorkCardCategories(),
    window.api.getOfficeCapacity(),
  ]);

  OFFICE_CAPACITY = {
    dailyHours: Math.max(0.25, Number(OFFICE_CAPACITY?.dailyHours) || 8),
    weeklyHours: Math.max(1, Number(OFFICE_CAPACITY?.weeklyHours) || 40),
  };

  if (!Array.isArray(PRIORITY_MENU_ORDER)) {
    PRIORITY_MENU_ORDER = [];
  }
  if (!Array.isArray(WORK_CARD_CATEGORIES)) {
    WORK_CARD_CATEGORIES = [];
  }
  if (!Array.isArray(STAFF_OVERVIEW_ASSIGNMENTS)) {
    STAFF_OVERVIEW_ASSIGNMENTS = [];
  }

  if (currentUser && (currentUser.role === 'partner' || currentUser.is_admin === 1 || currentUser.is_admin === true)) {
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
    const [myWeek, projectWorkCards, teamCalendarWorkCards] = await Promise.all([
      window.api.getMyWeekWorkCards(MY_WEEK_SELECTED_START || getCurrentWeekStartString()),
      window.api.getMyProjectWorkCards(),
      window.api.getTeamCalendarWorkCards(),
    ]);
    MY_WEEK_WORK_CARDS = myWeek?.cards || [];
    MY_WEEK_FOCUS = myWeek?.focus || null;
    PROJECT_WORK_CARDS = Array.isArray(projectWorkCards) ? projectWorkCards : [];
    TEAM_CALENDAR_WORK_CARDS = Array.isArray(teamCalendarWorkCards) ? teamCalendarWorkCards : [];
  } else {
    MY_WEEK_WORK_CARDS = [];
    MY_WEEK_FOCUS = null;
    PROJECT_WORK_CARDS = [];
    TEAM_CALENDAR_WORK_CARDS = [];
  }

  setRolloverReviewUi(await rolloverReviewPromise);
}

function setRolloverReviewUi(state) {
  ROLLOVER_REVIEW_STATE = state?.active
    ? state
    : { active: false, week: null, startedAt: null };
  document.body.classList.toggle('rollover-review-active', ROLLOVER_REVIEW_STATE.active);
  const overlay = document.getElementById('rollover-review-overlay');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !ROLLOVER_REVIEW_STATE.active);
  overlay.setAttribute('aria-hidden', ROLLOVER_REVIEW_STATE.active ? 'false' : 'true');
}

async function loadSubtasksAndComments(taskIds) {
  const ids = [...new Set((Array.isArray(taskIds) ? taskIds : []).filter(Boolean))];
  if (ids.length === 0) return;

  const payload = await window.api.getTaskSupportData(ids);
  const subtasksByTaskId = payload?.subtasksByTaskId || {};
  const commentsByTaskId = payload?.commentsByTaskId || {};

  for (const id of ids) {
    SUBTASK_CACHE[id] = subtasksByTaskId[id] || [];
    COMMENT_CACHE[id] = commentsByTaskId[id] || [];
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

function getLastName(user) {
  if (!user) return 'None';
  const explicitLastName = String(user.last_name || '').trim();
  if (explicitLastName) return explicitLastName;
  const nameParts = String(user.display_name || '').trim().split(/\s+/).filter(Boolean);
  return nameParts[nameParts.length - 1] || 'None';
}

function getProjectSharedNotes(projectId) {
  return orderProjectNotes(PROJECT_SHARED_NOTES_CACHE[projectId] || []);
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
  const rawBody = getPlainTextFromRichNote(latest.notes || '').trim().replace(/\s+/g, ' ');
  return {
    summary: notes.length === 1 ? (latest.title || 'Untitled note') : `${notes.length} notes`,
    detail: rawBody || 'No details yet.',
    count: notes.length,
  };
}

function getProjectPartners(project) {
  if (!project) return [];
  const partnerIds = [
    ...getProjectPartnerIds(project),
    project.partner_id,
  ].filter(Boolean);
  const seen = new Set();

  return partnerIds
    .filter((partnerId) => {
      if (seen.has(partnerId)) return false;
      seen.add(partnerId);
      return true;
    })
    .map((partnerId) => getUserById(partnerId))
    .filter(Boolean);
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
          ${escapeHtml(option.label)}
        </button>
      `).join('')}
    </div>
  `;
}

function getDefaultTabForCurrentUser() {
  return 'my-tasks';
}

function getUserScopedStorageKey(baseKey) {
  return `${baseKey}:${currentUser?.id || 'unknown'}`;
}

function getLastViewedTaskStorageKey() {
  return getUserScopedStorageKey(LAST_VIEWED_TASK_KEY);
}

function getLastViewedProjectStorageKey() {
  return getUserScopedStorageKey(LAST_VIEWED_PROJECT_KEY);
}

function getLastActiveTabStorageKey() {
  return getUserScopedStorageKey(LAST_ACTIVE_TAB_KEY);
}

function getLastCommentDrawerTaskStorageKey() {
  return getUserScopedStorageKey(LAST_COMMENT_DRAWER_TASK_KEY);
}

function readScopedStorageString(baseKey) {
  try {
    return window.localStorage?.getItem(getUserScopedStorageKey(baseKey)) || null;
  } catch (_) {
    return null;
  }
}

function writeScopedStorageString(baseKey, value) {
  if (!currentUser?.id) return;
  try {
    if (value === null || value === undefined || value === '') {
      window.localStorage?.removeItem(getUserScopedStorageKey(baseKey));
    } else {
      window.localStorage?.setItem(getUserScopedStorageKey(baseKey), String(value));
    }
  } catch (_) {}
}

function readScopedStorageJson(baseKey, fallback) {
  try {
    const raw = window.localStorage?.getItem(getUserScopedStorageKey(baseKey));
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function writeScopedStorageJson(baseKey, value) {
  if (!currentUser?.id) return;
  try {
    window.localStorage?.setItem(getUserScopedStorageKey(baseKey), JSON.stringify(value));
  } catch (_) {}
}

function rememberStaffFilter() {
  writeScopedStorageString(STAFF_FILTER_KEY, selectedStaffFilter);
}

function rememberStaffSectionCollapsePrefs() {
  writeScopedStorageJson(STAFF_SECTION_COLLAPSE_KEY, STAFF_SECTION_COLLAPSE);
}

function rememberReadonlyStaffSelection() {
  writeScopedStorageJson(READONLY_STAFF_SELECTION_KEY, selectedReadonlyStaffIds);
}

function rememberProjectSectionCollapsePrefs() {
  writeScopedStorageJson(PROJECT_SECTION_COLLAPSE_KEY, PROJECT_SECTION_COLLAPSE);
}

function rememberMyProjectGroupCollapsePrefs() {
  writeScopedStorageJson(MY_PROJECT_GROUP_COLLAPSE_KEY, MY_PROJECT_GROUP_COLLAPSE);
}

function normalizeStylePreferences(value) {
  const next = value && typeof value === 'object' ? value : {};
  // Violet used to be the default accent, so a saved "violet" from before the
  // calmer default (accentRevision 2) is the old default, not a choice. Moving it
  // once to the new default; picking Violet again afterwards is kept.
  const fromOlderDefault = next.accentRevision !== 2 && next.accent === 'violet';
  return {
    theme: ['dark', 'auto'].includes(next.theme) ? next.theme : 'light',
    accent: !fromOlderDefault && ACCENT_PRESETS.some((preset) => preset.id === next.accent) ? next.accent : 'slate',
    accentRevision: 2,
    detailPaneMode: next.detailPaneMode === 'slide' ? 'slide' : 'permanent',
  };
}

function getAccentPreset(accentId = STYLE_PREFERENCES.accent) {
  return ACCENT_PRESETS.find((preset) => preset.id === accentId) || ACCENT_PRESETS[0];
}

function getSystemPrefersDarkTheme() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function getEffectiveTheme() {
  if (STYLE_PREFERENCES.theme === 'auto') {
    return getSystemPrefersDarkTheme() ? 'dark' : 'light';
  }
  return STYLE_PREFERENCES.theme;
}

function setupSystemThemeListener() {
  if (SYSTEM_THEME_LISTENER_BOUND || !window.matchMedia) return;
  SYSTEM_THEME_LISTENER_BOUND = true;
  const themeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemThemeChange = () => {
    if (STYLE_PREFERENCES.theme === 'auto') {
      applyStylePreferences();
      refreshForThemeChange();
    }
  };

  if (typeof themeQuery.addEventListener === 'function') {
    themeQuery.addEventListener('change', handleSystemThemeChange);
  } else if (typeof themeQuery.addListener === 'function') {
    themeQuery.addListener(handleSystemThemeChange);
  }
}

// Priority badge colors are computed per-theme and baked into inline styles at
// render time, so already-rendered cards need a re-render to pick up a theme change.
async function refreshForThemeChange() {
  await refreshAll();
  if (selectedTaskId) {
    await openDetailPanel(selectedTaskId);
  }
}

function rememberStylePreferences() {
  writeScopedStorageJson(STYLE_PREFERENCES_KEY, STYLE_PREFERENCES);
}

function canUseSlideDetailPane() {
  return !isPartner();
}

function shouldUseSlideDetailPane() {
  return canUseSlideDetailPane() && STYLE_PREFERENCES.detailPaneMode === 'slide';
}

function getDetailPaneRoleKey() {
  return isPartner() ? 'partner' : 'staff';
}

function isDetailPaneOpen() {
  const appShell = document.getElementById('app-shell');
  if (!appShell || appShell.classList.contains('staff-readonly-overview') || appShell.classList.contains('staff-overview-mode')) return false;
  if (shouldUseSlideDetailPane()) return appShell.classList.contains('detail-drawer-open');
  return !appShell.classList.contains('detail-pane-collapsed');
}

function syncDetailPaneToggle() {
  const button = document.getElementById('detail-pane-toggle');
  if (!button) return;

  const isOpen = isDetailPaneOpen();
  button.classList.toggle('is-collapsed', !isOpen);
  button.setAttribute('aria-expanded', String(isOpen));
  button.setAttribute('aria-label', isOpen ? 'Collapse details' : 'Expand details');
  button.title = isOpen ? 'Collapse details' : 'Expand details';
}

function rememberDetailPaneCollapse() {
  writeScopedStorageJson(DETAIL_PANE_COLLAPSE_KEY, DETAIL_PANE_COLLAPSE);
}

function setPermanentDetailPaneCollapsed(collapsed, { remember = true } = {}) {
  const appShell = document.getElementById('app-shell');
  if (!appShell) return;

  DETAIL_PANE_COLLAPSE[getDetailPaneRoleKey()] = collapsed === true;
  appShell.classList.toggle('detail-pane-collapsed', collapsed === true);
  if (remember) rememberDetailPaneCollapse();
  syncDetailPaneToggle();
}

function toggleDetailPane() {
  if (shouldUseSlideDetailPane()) {
    setDetailDrawerOpen(!isDetailPaneOpen());
    return;
  }

  setPermanentDetailPaneCollapsed(isDetailPaneOpen());
}

function applyStylePreferences() {
  const effectiveTheme = getEffectiveTheme();
  document.body.classList.toggle('theme-dark', effectiveTheme === 'dark');
  document.body.classList.toggle('theme-light', effectiveTheme !== 'dark');
  const accentValues = getAccentPreset()[effectiveTheme === 'dark' ? 'dark' : 'light'];
  document.body.style.setProperty('--accent', accentValues.accent);
  document.body.style.setProperty('--accent-hover', accentValues.hover);
  document.body.style.setProperty('--accent-light', accentValues.soft);
  document.body.style.setProperty('--accent-rgb', accentValues.rgb);
  document.body.style.setProperty('--accent-text-strong', accentValues.strong);
  document.body.style.setProperty('--accent-hover-bg', `rgba(${accentValues.rgb}, ${effectiveTheme === 'dark' ? '0.08' : '0.04'})`);
  document.body.style.setProperty('--accent-active-bg', `rgba(${accentValues.rgb}, ${effectiveTheme === 'dark' ? '0.14' : '0.08'})`);
  document.body.style.setProperty('--accent-hover-border', `rgba(${accentValues.rgb}, ${effectiveTheme === 'dark' ? '0.32' : '0.24'})`);
  document.body.style.setProperty('--accent-active-border', `rgba(${accentValues.rgb}, ${effectiveTheme === 'dark' ? '0.42' : '0.35'})`);
  document.body.style.setProperty('--accent-active-shadow', `rgba(${accentValues.rgb}, ${effectiveTheme === 'dark' ? '0.12' : '0.1'})`);
  document.body.style.setProperty('--accent-focus-ring', `rgba(${accentValues.rgb}, ${effectiveTheme === 'dark' ? '0.16' : '0.1'})`);
  const appShell = document.getElementById('app-shell');
  if (appShell) {
    const hasRenderedDetail = Boolean(selectedTaskId || selectedProjectId)
      && !document.getElementById('detail-body')?.querySelector('.detail-empty-state');
    appShell.classList.toggle('detail-slide-mode', shouldUseSlideDetailPane());
    appShell.classList.toggle('detail-drawer-open', shouldUseSlideDetailPane() && hasRenderedDetail);
    appShell.classList.toggle(
      'detail-pane-collapsed',
      !shouldUseSlideDetailPane() && DETAIL_PANE_COLLAPSE[getDetailPaneRoleKey()] === true
    );
  }
  syncDetailPaneToggle();
}

function setDetailDrawerOpen(open) {
  const appShell = document.getElementById('app-shell');
  if (!appShell) return;
  appShell.classList.toggle('detail-drawer-open', shouldUseSlideDetailPane() && open);
  syncDetailPaneToggle();
}

function restoreViewPreferences() {
  if (!currentUser?.id) return;

  STYLE_PREFERENCES = normalizeStylePreferences(readScopedStorageJson(STYLE_PREFERENCES_KEY, STYLE_PREFERENCES));
  const storedDetailPaneCollapse = readScopedStorageJson(DETAIL_PANE_COLLAPSE_KEY, null);
  if (storedDetailPaneCollapse && typeof storedDetailPaneCollapse === 'object') {
    DETAIL_PANE_COLLAPSE = {
      staff: storedDetailPaneCollapse.staff === true,
      partner: storedDetailPaneCollapse.partner === true,
    };
  }
  if (!canUseSlideDetailPane() && STYLE_PREFERENCES.detailPaneMode === 'slide') {
    STYLE_PREFERENCES = { ...STYLE_PREFERENCES, detailPaneMode: 'permanent' };
  }
  applyStylePreferences();

  const storedStaffCollapse = readScopedStorageJson(STAFF_SECTION_COLLAPSE_KEY, null);
  if (storedStaffCollapse && typeof storedStaffCollapse === 'object') {
    Object.keys(storedStaffCollapse).forEach((staffId) => {
      STAFF_SECTION_COLLAPSE[staffId] = storedStaffCollapse[staffId] === true;
    });
  }

  const storedProjectCollapse = readScopedStorageJson(PROJECT_SECTION_COLLAPSE_KEY, null);
  if (storedProjectCollapse && typeof storedProjectCollapse === 'object') {
    for (const sectionKey of Object.keys(PROJECT_SECTION_COLLAPSE)) {
      if (typeof storedProjectCollapse[sectionKey] === 'boolean') {
        PROJECT_SECTION_COLLAPSE[sectionKey] = storedProjectCollapse[sectionKey];
      }
    }
  }

  const storedMyProjectGroupCollapse = readScopedStorageJson(MY_PROJECT_GROUP_COLLAPSE_KEY, null);
  if (storedMyProjectGroupCollapse && typeof storedMyProjectGroupCollapse === 'object') {
    for (const sectionKey of Object.keys(MY_PROJECT_GROUP_COLLAPSE)) {
      if (typeof storedMyProjectGroupCollapse[sectionKey] === 'boolean') {
        MY_PROJECT_GROUP_COLLAPSE[sectionKey] = storedMyProjectGroupCollapse[sectionKey];
      }
    }
  }

  if (isPartner()) {
    const storedStaffFilter = readScopedStorageString(STAFF_FILTER_KEY);
    selectedStaffFilter = USERS.some((user) => user.id === storedStaffFilter && user.role === 'staff' && user.active !== 0)
      ? storedStaffFilter
      : null;
  } else {
    selectedStaffFilter = null;
    const allowedStaffIds = new Set(getActiveStaffUsers(currentUser?.id).map((user) => user.id));
    const storedSelection = readScopedStorageJson(READONLY_STAFF_SELECTION_KEY, []);
    selectedReadonlyStaffIds = Array.isArray(storedSelection)
      ? storedSelection.filter((staffId) => allowedStaffIds.has(staffId))
      : [];
  }
}

function getAllowedTabsForCurrentUser() {
  const tabs = ['my-tasks', 'my-week'];
  if (isPartner()) tabs.push('staff-view');
  if (isActualPartner()) tabs.push('my-projects');
  else if (canCurrentUserUseStaffOverview()) tabs.push('staff-view');
  return tabs;
}

function readLastActiveTab() {
  try {
    const tab = window.localStorage?.getItem(getLastActiveTabStorageKey()) || null;
    return getAllowedTabsForCurrentUser().includes(tab) ? tab : null;
  } catch (_) {
    return null;
  }
}

function rememberLastActiveTab(tabName) {
  if (!tabName || !currentUser?.id) return;
  if (!getAllowedTabsForCurrentUser().includes(tabName)) return;
  try {
    window.localStorage?.setItem(getLastActiveTabStorageKey(), tabName);
  } catch (_) {}
}

function readLastCommentDrawerTaskId() {
  try {
    return window.localStorage?.getItem(getLastCommentDrawerTaskStorageKey()) || null;
  } catch (_) {
    return null;
  }
}

function rememberCommentDrawerTask(taskId) {
  if (!taskId || !currentUser?.id) return;
  try {
    window.localStorage?.setItem(getLastCommentDrawerTaskStorageKey(), String(taskId));
  } catch (_) {}
}

function forgetCommentDrawerTask() {
  try {
    window.localStorage?.removeItem(getLastCommentDrawerTaskStorageKey());
  } catch (_) {}
}

function readLastViewedTaskId() {
  try {
    return window.localStorage?.getItem(getLastViewedTaskStorageKey()) || null;
  } catch (_) {
    return null;
  }
}

function rememberLastViewedTask(taskId) {
  if (!taskId || !currentUser?.id) return;
  try {
    window.localStorage?.setItem(getLastViewedTaskStorageKey(), String(taskId));
  } catch (_) {}
}

function forgetLastViewedTask() {
  try {
    window.localStorage?.removeItem(getLastViewedTaskStorageKey());
  } catch (_) {}
}

function readLastViewedProjectId() {
  try {
    return window.localStorage?.getItem(getLastViewedProjectStorageKey()) || null;
  } catch (_) {
    return null;
  }
}

function rememberLastViewedProject(projectId) {
  if (!projectId || !currentUser?.id) return;
  try {
    window.localStorage?.setItem(getLastViewedProjectStorageKey(), String(projectId));
  } catch (_) {}
}

function forgetLastViewedProject() {
  try {
    window.localStorage?.removeItem(getLastViewedProjectStorageKey());
  } catch (_) {}
}

function getRestorableProjectById(projectId) {
  if (!projectId || !isActualPartner()) return null;
  const project = PROJECTS.find((candidate) => String(candidate.id) === String(projectId));
  return isProjectManagedByCurrentPartner(project) ? project : null;
}

function filterMyTasks(tasks, query = '') {
  let filtered = [...tasks];

  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter((task) => getTaskSearchText(task).includes(q));
  }

  if (activeFilter === 'pending') filtered = filtered.filter((task) => !task.completed);
  else if (activeFilter === 'completed') filtered = filtered.filter((task) => task.completed);
  else if (activeFilter === 'overdue') filtered = filtered.filter((task) => isTaskOverdue(task));

  return sortTasksLikeScheduling(filtered);
}

function getMyTasksForCurrentView(query = '') {
  return filterMyTasks(getTasksForUser(currentUser.id), query);
}

function getPrivateTasksForCurrentView(query = '') {
  return filterMyTasks(PRIVATE_TASKS, query);
}

function getPartnerAssignedProjectTasks(query = '') {
  if (!isActualPartner() || !currentUser) return [];

  const managedProjectIds = new Set(
    getProjectsForCurrentPartner({ includeFuture: true, includeInactive: true })
      .map((project) => String(project.id))
  );
  const tasksByProject = new Map();

  const assignments = STAFF_OVERVIEW_ASSIGNMENTS.length ? STAFF_OVERVIEW_ASSIGNMENTS : TASKS;
  for (const task of assignments) {
    const projectId = String(task?.project_id || '');
    if (!projectId || !managedProjectIds.has(projectId)) continue;
    const assignee = getUserById(task.assigned_to);
    if (!assignee || assignee.role !== 'staff' || assignee.active === 0) continue;
    if (!tasksByProject.has(projectId)) tasksByProject.set(projectId, []);
    tasksByProject.get(projectId).push(task);
  }

  const representativeTasks = [...tasksByProject.values()]
    .map((projectTasks) => sortTasksLikeScheduling(projectTasks)[0])
    .filter(Boolean);

  return filterMyTasks(representativeTasks, query);
}

function getTaskSearchText(task) {
  const project = getProjectById(task?.project_id);
  const sharedNotes = project?.id ? (PROJECT_SHARED_NOTES_CACHE[project.id] || []) : [];
  const isPrivateTask = PRIVATE_TASKS.some((item) => String(item.id) === String(task?.id));
  const actionItems = task ? (isPrivateTask ? (SUBTASK_CACHE[task.id] || []) : getTaskActionItems(task)) : [];
  const comments = task ? (isPrivateTask ? (COMMENT_CACHE[task.id] || []) : getTaskComments(task)) : [];

  return [
    task?.title,
    task?.notes,
    project ? getProjectDisplayTitle(project) : '',
    project?.client,
    project?.name,
    project?.notes,
    ...actionItems.flatMap((item) => [item.title, item.notes]),
    ...comments.flatMap((comment) => [comment.body, comment.message, comment.text, comment.comment]),
    ...sharedNotes.flatMap((note) => [note.title, getPlainTextFromRichNote(note.notes || '')]),
  ].filter(Boolean).join(' ').toLowerCase();
}

function getRestorableTaskById(taskId, tasks = getMyTasksForCurrentView()) {
  if (!taskId) return null;
  return tasks.find((task) => String(task.id) === String(taskId)) || null;
}

function restoreCommentDrawerState() {
  const storedTaskId = readLastCommentDrawerTaskId();
  const task = getRestorableTaskById(storedTaskId);
  if (task && !PRIVATE_TASKS.some((privateTask) => String(privateTask.id) === String(storedTaskId))) {
    OPEN_COMMENT_DRAWER_TASK_ID = task.id;
    return;
  }

  OPEN_COMMENT_DRAWER_TASK_ID = null;
  if (storedTaskId) forgetCommentDrawerTask();
}

function getTaskIdForDetailRestore({ allowFallback = false } = {}) {
  const visibleTasks = getMyTasksForCurrentView();

  const selectedTask = getRestorableTaskById(selectedTaskId, visibleTasks);
  if (selectedTask) return selectedTask.id;

  // Project selection is the current My Projects context. It is updated any
  // time the Work Cards panel is opened, while LAST_VIEWED_TASK can be an
  // older V1-style assignment that happened to be completed. Prefer the
  // project so reopening MyTasks returns to the panel the person last used.
  const storedProjectId = readLastViewedProjectId();
  const projectTask = storedProjectId
    ? visibleTasks.find((task) => String(task.project_id || '') === String(storedProjectId))
    : null;
  if (projectTask) return projectTask.id;
  if (storedProjectId && !getProjectById(storedProjectId)) forgetLastViewedProject();

  const storedTaskId = readLastViewedTaskId();
  const storedTask = getRestorableTaskById(storedTaskId, visibleTasks);
  if (storedTask) return storedTask.id;
  if (storedTaskId) forgetLastViewedTask();

  if (!allowFallback) return null;
  return visibleTasks[0]?.id || null;
}

async function restoreTaskDetailPane({ allowFallback = false } = {}) {
  if (shouldUseSlideDetailPane()) {
    selectedTaskId = null;
    selectedProjectId = null;
    showDetailEmptyState();
    return false;
  }

  const taskId = getTaskIdForDetailRestore({ allowFallback });
  if (!taskId) {
    showDetailEmptyState();
    return false;
  }

  // Shared V1 assignments represent projects in MyTasks. Restoring one as a
  // legacy task detail bypassed the Work Cards pane until the user clicked the
  // project again. Restore the project surface directly instead.
  const sharedTask = getSharedTaskById(taskId);
  if (sharedTask?.project_id && getProjectById(sharedTask.project_id)) {
    await openProjectDetailPanel(sharedTask.project_id);
    return true;
  }

  await openDetailPanel(taskId);
  return true;
}

function getProjectIdForDetailRestore({ allowFallback = false } = {}) {
  if (!isActualPartner()) return null;

  const storedProjectId = readLastViewedProjectId();
  const storedProject = getRestorableProjectById(storedProjectId);
  if (storedProject) return storedProject.id;
  if (storedProjectId) forgetLastViewedProject();

  if (!allowFallback) return null;
  return getProjectsForCurrentPartner({ includeFuture: true, includeInactive: true })[0]?.id || null;
}

async function restoreProjectDetailPane({ allowFallback = false } = {}) {
  const projectId = getProjectIdForDetailRestore({ allowFallback });
  if (!projectId) {
    showDetailEmptyState();
    return false;
  }

  await openProjectDetailPanel(projectId);
  return true;
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

function getProjectById(id) {
  return PROJECTS.find(p => p.id === id);
}

function isProjectManagedByCurrentPartner(project) {
  if (!isActualPartner() || !currentUser || !project) return false;
  if (project.partner_id === currentUser.id) return true;
  return getProjectPartnerIds(project).includes(currentUser.id);
}

function getProjectsForCurrentPartner({ includeFuture = true, includeInactive = false } = {}) {
  if (!isActualPartner() || !currentUser) return [];

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

function getTaskDisplayTitle(task, project = null) {
  const linkedProject = project || getProjectById(task?.project_id);
  return getTaskDisplayTitleFromProjectDisplay(task, linkedProject);
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
  // Dashboard Staff Management owns this permission.  It deliberately does
  // not depend on whether the person is staff, a senior administrator, or a
  // partner.
  return Boolean(currentUser && (currentUser.can_self_assign === 1 || currentUser.can_self_assign === true));
}

function canCurrentUserUseStaffOverview() {
  return Boolean(isPartner() || currentUser?.role === 'staff');
}

function syncTabOrder() {
  const tabBar = document.getElementById('tab-bar');
  if (!tabBar) return;

  const staffViewTab = tabBar.querySelector('.tab[data-tab="staff-view"]');
  const myTasksTab = tabBar.querySelector('.tab[data-tab="my-tasks"]');
  const myWeekTab = tabBar.querySelector('.tab[data-tab="my-week"]');
  const myProjectsTab = tabBar.querySelector('.tab[data-tab="my-projects"]');
  if (!staffViewTab || !myTasksTab || !myWeekTab || !myProjectsTab) return;

  tabBar.append(myTasksTab, myWeekTab, myProjectsTab, staffViewTab);
}

function canCurrentUserAddActionItems(task) {
  return canAddActionItemsPermission(task, {
    currentUser,
    canPartnerManageTask,
  });
}

function canCurrentUserManageOwnSharedTask(task) {
  return canManageOwnSharedTaskPermission(task, {
    currentUser,
    canPartnerManageTask,
    canCurrentUserAddOwnTasks,
  });
}

function canCurrentUserManageTaskPriority(task) {
  return canCurrentUserManageOwnSharedTask(task);
}

function canCurrentUserEditSharedTask(task) {
  return canCurrentUserManageOwnSharedTask(task);
}

function canCurrentUserDeleteSharedTask(task) {
  return canCurrentUserManageOwnSharedTask(task);
}

function isCurrentUserAssignedToProject(projectId) {
  if (!currentUser?.id || !projectId) return false;
  return TASKS.some((task) => task.project_id === projectId && task.assigned_to === currentUser.id);
}

function canCurrentUserManageProjectFolder(project) {
  return canManageProjectFolderPermission(project, {
    isPartner,
    isProjectManagedByCurrentPartner,
    isCurrentUserAssignedToProject,
  });
}

function buildSharedTaskPayloadFromInput(options = {}) {
  return buildTaskPayload({
    title: options.title,
    notes: options.notes,
    priorityValue: options.priorityValue,
    dueDate: options.dueDate,
    base: options.base,
    includePriorityLabel: true,
  });
}

function buildPrivateTaskPayloadFromInput(options = {}) {
  return buildTaskPayload({
    title: options.title,
    notes: options.notes,
    priorityValue: options.priorityValue,
    dueDate: options.dueDate,
    base: options.base,
    includePriorityLabel: false,
  });
}

async function applyTaskPriorityChange(taskId, priority, priorityLabel = null) {
  await window.api.updateTask({
    id: taskId,
    priority,
    priority_label: priorityLabel,
  });
  await refreshAfterTaskChange(taskId);
}

async function applyTaskAssignmentChange(taskId, assignedTo) {
  await window.api.updateTask({
    id: taskId,
    assigned_to: assignedTo,
  });
  await refreshAfterTaskChange(taskId);
}

async function applyTaskStatusChange(taskId, nextStatus) {
  await window.api.updateTask({
    id: taskId,
    status: nextStatus,
    completed: nextStatus === 'complete' ? 1 : 0,
  });
  await refreshAfterTaskChange(taskId);
}

async function applyTaskCompletionChange(taskId, nextCompleted) {
  await window.api.updateTask({
    id: taskId,
    completed: nextCompleted,
    status: nextCompleted ? 'complete' : 'not_started',
  });
  await refreshAfterTaskChange(taskId);
}

async function applyTaskNotesChange(taskId, notes) {
  await window.api.updateTask({
    id: taskId,
    notes,
  });
  await refreshAfterTaskChange(taskId);
}

function getTasksForUser(userId) {
  return getVisibleRepresentativeTasks(TASKS, userId, getTaskActionItems, sortTasksLikeScheduling);
}

function getScheduledProjectsForStaff(staffId) {
  const normalizedStaffId = String(staffId || '');
  if (!normalizedStaffId) return [];

  // Staff Overview is an assignment audit, not a personal task feed. Do not
  // reuse the action-item visibility helper here: its intentional collapsing
  // rules can hide scheduled Dashboard assignments. Keep one row per project
  // only when the same staff member has genuinely been scheduled twice.
  const tasksByProject = new Map();
  for (const task of TASKS) {
    if (String(task?.assigned_to || '') !== normalizedStaffId) continue;
    const key = String(task.project_id || task.id || '');
    if (!key) continue;
    if (!tasksByProject.has(key)) tasksByProject.set(key, []);
    tasksByProject.get(key).push(task);
  }

  return sortTasksLikeScheduling([...tasksByProject.values()].map((projectTasks) => {
    const unfinished = projectTasks.filter((task) => !task.completed);
    return sortTasksLikeScheduling(unfinished.length ? unfinished : projectTasks)[0];
  }).filter(Boolean));
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

  for (const subtask of getTaskActionItems(task)) {
    for (const userId of getSubtaskAssigneeIds(subtask)) {
      if (!userId || seen.has(userId)) continue;
      const user = getUserById(userId);
      if (!user) continue;
      seen.add(userId);
      assignees.push(user);
    }
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
    item.priority !== PRIORITY_WAIT &&
    item.priority !== PRIORITY_CUSTOM
  ));
  return Math.max(numericPool.length, 1);
}

const getPriorityDisplayStyles = () => getPriorityDisplayStylesBase(PRIORITY_DISPLAY_STYLES);
const getPriorityStyleForToken = (token) => getPriorityStyleForTokenBase(token, PRIORITY_DISPLAY_STYLES, document.body.classList.contains('theme-dark'));
const getPriorityInlineStyle = (priority) => getPriorityInlineStyleBase(priority, PRIORITY_DISPLAY_STYLES, document.body.classList.contains('theme-dark'));

function getPTOForUser(userId) {
  return PTO_DATA.find(p => p.user_id === userId) || null;
}

function getPriorityMenuToken(task) {
  const priority = task?.priority;
  if (typeof priority === 'number' && priority >= 1) return 'numbered';
  if (priority === PRIORITY_WAIT) return 'wait';
  if (priority === PRIORITY_CUSTOM) {
    const label = getCustomPriorityLabel(task?.priority_label);
    const customPriority = CUSTOM_PRIORITIES.find((item) => item.label === label);
    return customPriority ? `custom:${customPriority.id}` : 'clear';
  }
  return 'clear';
}

function getDashboardPrioritySortKey(task) {
  const validTokens = [
    'numbered',
    ...CUSTOM_PRIORITIES.map((item) => `custom:${item.id}`),
    'wait',
    'clear',
  ];
  const orderedTokens = [];

  for (const token of PRIORITY_MENU_ORDER) {
    if (validTokens.includes(token) && !orderedTokens.includes(token)) {
      orderedTokens.push(token);
    }
  }

  for (const token of validTokens) {
    if (!orderedTokens.includes(token)) {
      orderedTokens.push(token);
    }
  }

  const token = getPriorityMenuToken(task);
  const offset = typeof task?.priority === 'number' && task.priority >= 1 ? task.priority : 0;
  const index = orderedTokens.indexOf(token);
  return (index >= 0 ? index : orderedTokens.length) * 100 + offset;
}

function getDashboardProjectTitleSortKey(task) {
  const project = PROJECTS.find((item) => item.id === task?.project_id);
  if (project) {
    return `${project.client || ''} | ${project.name || ''}`.trim();
  }

  return String(task?.title || '').replace(/\s+[-\u2013\u2014]\s+/, ' | ').trim();
}

function compareDashboardClearedPriorityTasks(a, b) {
  const isClearA = !a?.priority;
  const isClearB = !b?.priority;
  if (!isClearA || !isClearB) return 0;

  if (a.due_date && b.due_date) {
    const dueCompare = String(a.due_date).localeCompare(String(b.due_date));
    if (dueCompare !== 0) return dueCompare;
  } else if (a.due_date) {
    return -1;
  } else if (b.due_date) {
    return 1;
  }

  return getDashboardProjectTitleSortKey(a).localeCompare(getDashboardProjectTitleSortKey(b), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

const sortTasksLikeScheduling = (tasks) => sortTasksLikeSchedulingBase(tasks, {
  getPrioritySortKey: getDashboardPrioritySortKey,
  compareClearedPriorityTasks: compareDashboardClearedPriorityTasks,
});

const getPriorityPresentation = (task) => getPriorityPresentationBase(task, {
  displayStyles: PRIORITY_DISPLAY_STYLES,
  customPriorities: CUSTOM_PRIORITIES,
  isPrioritySet,
  getCustomPriorityLabel,
  PRIORITY_WAIT,
  PRIORITY_CUSTOM,
  isDarkTheme: document.body.classList.contains('theme-dark'),
});

function isPartner() {
  // V1 calls senior scheduling staff "admin". They share work-card authority
  // with partners without changing the existing title hierarchy.
  return Boolean(currentUser && (currentUser.role === 'partner' || currentUser.is_admin === 1 || currentUser.is_admin === true));
}

function isActualPartner() {
  return Boolean(currentUser?.role === 'partner');
}

function getSharedTaskById(id) {
  return TASKS.find((task) => String(task.id) === String(id)) || null;
}

function getActiveStaffUsers(excludeId = null) {
  return USERS
    .filter((user) => user.role === 'staff' && user.active !== 0 && user.id !== excludeId)
    .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
}

function getActionItemAssigneeOptions(task) {
  const seen = new Set();
  const users = [];

  for (const user of [...getTaskAssignees(task), currentUser]) {
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

function renderActionItemAssignees(subtask) {
  const assigneeIds = getSubtaskAssigneeIds(subtask);
  if (!assigneeIds.length) return '';

  const avatars = assigneeIds.map((userId) => {
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
  }).join('');

  return avatars ? `<span class="subtask-assignee-list">${avatars}</span>` : '';
}

function renderActionItemDueDate(subtask) {
  if (!subtask?.due_date) return '';
  const due = formatDate(subtask.due_date);
  const overdue = isTaskOverdue(subtask);
  const label = overdue ? `Overdue · ${due.text}` : `Due ${due.text}`;
  return `<span class="subtask-due ${overdue ? 'overdue' : due.cls || 'normal'}">${escapeHtml(label)}</span>`;
}

function renderActionItemContent(subtask) {
  return `
    <div class="subtask-content">
      <div class="subtask-title-row">
        <span class="subtask-title">${escapeHtml(subtask.title)}</span>
        ${renderActionItemDueDate(subtask)}
      </div>
      ${subtask.notes ? `<div class="subtask-notes">${escapeHtml(subtask.notes)}</div>` : ''}
    </div>
  `;
}

function getAvailableProjectsForTaskCreation() {
  // Senior scheduling administrators have partner-level task permissions,
  // but they do not own a partner portfolio. They must browse the same office
  // project list used in Dashboard rather than an empty personal portfolio.
  if (isActualPartner()) {
    return getProjectsForCurrentPartner({ includeFuture: true, includeInactive: true });
  }

  return [...PROJECTS]
    .sort((a, b) => {
      const clientCompare = (a.client || '').localeCompare(b.client || '');
      if (clientCompare !== 0) return clientCompare;
      return (a.name || '').localeCompare(b.name || '');
    });
}

function setTaskTitleInputValue(input, project, fallbackTitle = '') {
  if (!input) return;

  if (project) {
    input.value = `${project.client} | ${project.name}`;
    input.readOnly = true;
    input.dataset.projectLocked = 'true';
    input.classList.add('task-title-locked');
  } else {
    if (input.dataset.projectLocked === 'true') {
      input.value = fallbackTitle;
    }
    input.readOnly = false;
    input.dataset.projectLocked = 'false';
    input.classList.remove('task-title-locked');
  }
}

function bindProjectPickerSelection(picker, projects, titleInput, onProjectChange) {
  if (!picker) return;

  if (titleInput?._projectPickerInputHandler) {
    titleInput.removeEventListener('input', titleInput._projectPickerInputHandler);
  }
  const clearTitleButton = document.getElementById('add-task-title-clear');
  if (clearTitleButton?._projectPickerClearHandler) {
    clearTitleButton.removeEventListener('click', clearTitleButton._projectPickerClearHandler);
  }

  let selectedProjectId = null;
  let activePickerTab = 'active';
  let searchQuery = '';
  let freeformTitle = titleInput?.value || '';

  const getProjectPickerSection = (project) => {
    if (isFutureProject(project)) return 'future';
    return project.status === 'active' ? 'active' : 'inactive';
  };

  const getProjectSearchText = (project) => `${project.client || ''} ${project.name || ''}`.toLowerCase();
  const getTabProjects = (tab) => projects.filter((project) => getProjectPickerSection(project) === tab);
  const getMatchingProjects = () => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return getTabProjects(activePickerTab);
    return projects.filter((project) => getProjectSearchText(project).includes(query));
  };

  const renderPicker = () => {
    const tabs = [
      { id: 'active', label: 'Active' },
      { id: 'inactive', label: 'Inactive' },
      { id: 'future', label: 'Future' },
    ];
    const isFiltering = Boolean(searchQuery.trim());
    const visibleProjects = getMatchingProjects();
    const freeformLabel = freeformTitle.trim() || 'Task title';
    const showFreeformOption = isFiltering;
    const pickerLabel = isFiltering
      ? (visibleProjects.length > 0 ? 'Matching projects' : 'No matches')
      : 'Project';

    picker.innerHTML = `
      <div class="project-picker-header">
        <span class="project-picker-label">${pickerLabel}</span>
        <div class="project-picker-tabs ${isFiltering ? 'is-disabled' : ''}" role="tablist" aria-label="Project status">
          ${tabs.map((tab) => `
            <button
              class="project-picker-tab ${activePickerTab === tab.id ? 'active' : ''}"
              type="button"
              data-project-picker-tab="${tab.id}"
              role="tab"
              aria-selected="${activePickerTab === tab.id ? 'true' : 'false'}"
              ${isFiltering ? 'disabled' : ''}
            >
              <span>${tab.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="project-picker-list">
        ${showFreeformOption ? `
          <button class="project-picker-freeform ${selectedProjectId ? '' : 'selected'}" type="button" id="project-picker-freeform">
            <span class="pp-name">No Project - Freeform Task</span>
            <span class="pp-freeform-title">${escapeHtml(freeformLabel)}</span>
          </button>
          <div class="project-picker-divider" aria-hidden="true"></div>
        ` : ''}
        ${visibleProjects.length === 0 ? `
          <div class="project-picker-empty">${isFiltering ? 'No projects found.' : `No ${activePickerTab} projects are available right now.`}</div>
        ` : visibleProjects.map((project) => {
          const section = getProjectPickerSection(project);
          return `
            <div class="project-picker-item ${selectedProjectId === project.id ? 'selected' : ''}" data-project-id="${project.id}">
              <span class="pp-client">${escapeHtml(project.client || 'Project')}</span>
              <span class="pp-name">${escapeHtml(project.name || '')}</span>
              <span class="pp-status ${section}">${section === 'future' ? 'FUTURE' : (section === 'active' ? 'ACTIVE' : 'INACTIVE')}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    picker.querySelector('#project-picker-freeform')?.addEventListener('click', () => {
      applySelection(null);
    });

    picker.querySelectorAll('[data-project-picker-tab]').forEach((tabButton) => {
      tabButton.addEventListener('click', () => {
        activePickerTab = tabButton.dataset.projectPickerTab;
        renderPicker();
      });
    });

    picker.querySelectorAll('.project-picker-item').forEach((item) => {
      item.addEventListener('click', () => {
        const nextProjectId = item.dataset.projectId;
        applySelection(selectedProjectId === nextProjectId ? null : nextProjectId);
      });
    });
  };

  const applySelection = (projectId) => {
    selectedProjectId = projectId;
    picker.querySelectorAll('.project-picker-item').forEach((item) => {
      item.classList.toggle('selected', item.dataset.projectId === selectedProjectId);
    });
    picker.querySelector('#project-picker-freeform')?.classList.toggle('selected', !selectedProjectId);
    const selectedProject = selectedProjectId ? getProjectById(selectedProjectId) : null;
    setTaskTitleInputValue(titleInput, selectedProject, freeformTitle);
    clearTitleButton?.classList.toggle('hidden', !selectedProject);
    titleInput?.closest('.task-search-field')?.classList.toggle('has-clear', Boolean(selectedProject));
    if (onProjectChange) onProjectChange(selectedProjectId, selectedProject);
  };

  const handleTitleInput = () => {
    if (!titleInput || titleInput.dataset.projectLocked === 'true') return;
    freeformTitle = titleInput.value;
    searchQuery = titleInput.value;
    renderPicker();
  };

  if (titleInput) {
    titleInput._projectPickerInputHandler = handleTitleInput;
    titleInput.addEventListener('input', handleTitleInput);
  }
  if (clearTitleButton) {
    clearTitleButton._projectPickerClearHandler = () => {
      applySelection(null);
      searchQuery = freeformTitle;
      renderPicker();
      titleInput?.focus();
      if (titleInput) {
        titleInput.selectionStart = titleInput.value.length;
        titleInput.selectionEnd = titleInput.value.length;
      }
    };
    clearTitleButton.addEventListener('click', clearTitleButton._projectPickerClearHandler);
  }

  renderPicker();
  applySelection(null);
}

async function refreshAfterTaskChange(taskId = null) {
  await loadAllData();
  await refreshAll();

  if (taskId && getSharedTaskById(taskId)) {
    await openDetailPanel(taskId);
  } else if (taskId && String(selectedTaskId) === String(taskId)) {
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
  document.querySelectorAll('.task-card').forEach((card) => {
    card.classList.remove('selected');
  });
  setDetailDrawerOpen(false);
  showDetailEmptyState();
}

async function toggleTaskDetailPanel(taskId) {
  const isSameRenderedTask = String(selectedTaskId || '') === String(taskId || '')
    && !document.getElementById('detail-body')?.querySelector('.detail-empty-state');

  if (isSameRenderedTask) {
    clearSelectedTaskDetail();
    return;
  }

  // A shared V1 "task" is the assigned project card.  Send that normal
  // staff-overview path through the project detail surface so work cards are
  // available everywhere a project assignment can be opened.  Private tasks
  // and any legacy record without a project keep their existing detail view.
  const task = getSharedTaskById(taskId);
  if (task?.project_id && getProjectById(task.project_id)) {
    await openProjectDetailPanel(task.project_id);
    return;
  }

  await openDetailPanel(taskId);
}

function buildPriorityMenuItems(task) {
  const maxPriority = getSharedPriorityTaskCount(task.assigned_to);
  const items = [];

  for (let i = 1; i <= maxPriority; i++) {
    items.push({
      label: String(i),
      color: getPriorityStyleForToken('numbered').color,
      action: async () => applyTaskPriorityChange(task.id, i)
    });
  }

  items.push({ divider: true });
  items.push({
    label: 'W (Wait)',
    color: getPriorityStyleForToken('wait').color,
    action: async () => applyTaskPriorityChange(task.id, PRIORITY_WAIT)
  });

  if (CUSTOM_PRIORITIES.length > 0) {
    items.push({ divider: true });
    for (const priority of CUSTOM_PRIORITIES) {
      items.push({
        label: priority.label,
        color: priority.color,
        action: async () => applyTaskPriorityChange(task.id, PRIORITY_CUSTOM, buildCustomPriorityLabel(priority.label))
      });
    }
  }

  items.push({ divider: true });
  items.push({
    label: '— Clear',
    color: getPriorityStyleForToken('clear').color,
    action: async () => applyTaskPriorityChange(task.id, PRIORITY_NONE)
  });

  return items;
}

function openPriorityMenu(anchor, task) {
  const menu = ContextMenu.create(buildPriorityMenuItems(task));
  menu.classList.add('priority-picker-menu');
  const rect = anchor.getBoundingClientRect();
  const viewportPadding = 8;
  const gap = 4;
  const availableAbove = Math.max(0, rect.top - viewportPadding - gap);
  const availableBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding - gap);
  // The picker can be longer than a densely scheduled project list. Let it
  // prefer the larger side of its badge, and scroll only when neither side
  // can show every entry.
  menu.style.maxHeight = `${Math.max(120, Math.min(window.innerHeight - (viewportPadding * 2), Math.max(availableAbove, availableBelow)))}px`;
  menu.style.overflowY = 'auto';

  requestAnimationFrame(() => {
    const menuHeight = menu.getBoundingClientRect().height;
    const openUp = menuHeight > availableBelow && availableAbove > availableBelow;
    const top = openUp
      ? Math.max(viewportPadding, rect.top - menuHeight - gap)
      : Math.min(window.innerHeight - menuHeight - viewportPadding, rect.bottom + gap);
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - menu.getBoundingClientRect().width - viewportPadding));
    menu.classList.toggle('opens-up', openUp);
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  });
}

function buildPrioritySelectOptions(maxPriority) {
  const options = ['<option value="">None</option>'];
  for (let i = 1; i <= maxPriority; i++) {
    options.push(`<option value="${i}">${i}</option>`);
  }
  options.push('<option value="w">W - Wait</option>');
  for (const priority of CUSTOM_PRIORITIES) {
    options.push(`<option value="${escapeAttr(buildCustomPriorityLabel(priority.label))}">${escapeHtml(priority.label)}</option>`);
  }
  return options.join('');
}

function selectOptionValue(select, value, fallback = '') {
  if (!select) return;
  const hasOption = Array.from(select.options || []).some((option) => option.value === value);
  select.value = hasOption ? value : fallback;
}

function populatePrioritySelect(userId, selectedValue = '') {
  const select = document.getElementById('add-task-priority');
  if (!select) return;

  const maxPriority = getSharedPriorityTaskCount(userId);
  select.innerHTML = buildPrioritySelectOptions(maxPriority);
  selectOptionValue(select, selectedValue, '');
}

async function duplicateSharedTask(task) {
  const created = await window.api.createTask(buildSharedTaskPayloadFromInput({
    title: task.title,
    notes: task.notes || '',
    priorityValue: getPrioritySelectValue(task),
    dueDate: task.due_date || null,
    base: {
      project_id: task.project_id,
      assigned_to: task.assigned_to,
      created_by: currentUser?.id || null,
      partner_id: task.partner_id || currentUser?.id || null,
    },
  }));

  if (!created) {
    showToast('Task could not be duplicated. Check your permissions, or try again once the weekly review is finished.', { tone: 'error', duration: 6000 });
    return;
  }

  await refreshAfterTaskChange(created.id || null);
  showToast('Task duplicated.', { tone: 'success' });
}

async function deleteSharedTask(task) {
  const displayTitle = getTaskDisplayTitle(task);
  const confirmed = await window.MyTasksConfirmDialog.show({
    title: 'Delete task?',
    message: `Delete "${displayTitle || task.title}"?`,
    confirmLabel: 'Delete',
    tone: 'danger',
  });
  if (!confirmed) return;
  await window.api.deleteTask(task.id);
  await refreshAfterTaskChange(task.id);
  showToast('Task deleted.', { tone: 'success' });
}

function openEditSharedTaskDialog(task) {
  const canPartnerEdit = canPartnerManageTask(task);
  const canEditTask = canCurrentUserEditSharedTask(task);
  if (!canEditTask) return;

  const project = getProjectById(task.project_id);
  const selectedPriorityValue = getPrioritySelectValue(task);
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
  selectOptionValue(prioritySelect, selectedPriorityValue, '');

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
    const titleInput = document.getElementById('edit-task-title');
    if (!requireTextInput(titleInput, 'Enter a task title.')) return;
    const title = titleInput.value.trim();

    const payload = buildSharedTaskPayloadFromInput({
      title,
      notes: document.getElementById('edit-task-notes').value,
      priorityValue: document.getElementById('edit-task-priority').value,
      dueDate: document.getElementById('edit-task-due').value,
      base: {
        id: task.id,
        assigned_to: document.getElementById('edit-task-assignee').value || null,
      },
    });

    const button = overlay.querySelector('#edit-task-save');
    const outcome = await runUiAction(async () => {
      await window.api.updateTask(payload);
      await refreshAfterTaskChange(task.id);
    }, {
      button,
      pendingLabel: 'Saving...',
      successMessage: 'Task changes saved.',
      errorMessage: 'Task changes could not be saved.',
    });
    if (outcome.ok) close();
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
      await applyTaskAssignmentChange(task.id, user.id);
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

function openPrivateTaskContextMenu(e, task) {
  if (!task) return;

  const items = [
    {
      label: 'Open Details',
      action: () => openDetailPanel(task.id)
    },
    {
      label: task.completed ? 'Mark Incomplete' : 'Mark Complete',
      action: async () => {
        await window.api.updatePrivateTask({ id: task.id, completed: task.completed ? 0 : 1 });
        await loadAllData();
        await refreshAll();
        if (String(selectedTaskId) === String(task.id)) await openDetailPanel(task.id);
      }
    },
    { divider: true },
    {
      label: 'Delete Task',
      danger: true,
      action: async () => {
        const confirmed = await window.MyTasksConfirmDialog.show({
          title: 'Delete private task?',
          message: `Delete "${normalizeTaskDisplayTitle(task.title) || 'this task'}"?`,
          confirmLabel: 'Delete',
          tone: 'danger',
        });
        if (!confirmed) return;
        await window.api.deletePrivateTask(task.id);
        await loadAllData();
        if (String(selectedTaskId) === String(task.id)) {
          selectedTaskId = null;
          showDetailEmptyState();
        }
        await refreshAll();
      }
    },
  ];

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
      if (e.target.closest('.window-controls, .login-card, .topbar-right')) return;
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

function bindAdaptiveScrollSmoothing() {
  window.StudioSyncScrollSmoothing?.init({
    selector: [
      '.sidebar',
      '.view',
      '.my-week-grid-scroll',
      '#my-projects-list',
      '.staff-overview',
      '.detail-body',
      '.detail-comments-scroll',
      '.dialog-body',
      '.dialog-checklist',
      '.project-picker-list',
    ].join(', '),
  });
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
  const initStartedAt = performance.now();
  bindWindowChrome();
  bindResizePerfMode();
  bindAdaptiveScrollSmoothing();
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
    MyTasksDiagnostics.log('renderer-ready', { durationMs: Math.round(performance.now() - initStartedAt), mode: 'remembered-user' });
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
      MyTasksDiagnostics.log('renderer-ready', { durationMs: Math.round(performance.now() - initStartedAt), mode: 'login' });
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
  // Reopen on the tab the person last used. If that tab is no longer available to them (a role or
  // permission change removed it) or nothing is stored yet, land on My Work, which opens the first
  // project in the list.
  activeTab = readLastActiveTab() || getDefaultTabForCurrentUser();
  restoreViewPreferences();

  // Sidebar collapse toggle
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    const btn = document.getElementById('sidebar-toggle');
    btn.title = sidebar.classList.contains('collapsed') ? 'Expand sidebar' : 'Collapse sidebar';
  });
  document.getElementById('detail-pane-toggle')?.addEventListener('click', toggleDetailPane);

  selectedTaskId = null;
  selectedProjectId = null;
  restoreCommentDrawerState();
  activeFilter = null;
  showDetailEmptyState();
  setSyncIndicatorState('synced');

  renderStatsBar();
  renderMyTasks();
  if (isPartner()) {
    renderSidebar();
    renderStaffOverview();
    renderMyProjects();
    setupAddProject();
  }
  // Bind once; visibility and server-side authorization both follow the
  // Dashboard Staff Management permission and can change after a sync.
  setupAddPrivateTask();
  setupTabBar();
  setupTeamDueDateCalendar();
  setupSettingsMenu();
  setupPreferencesDialog();
  setupSyncMenu();
  setupSyncBanner();
  setupSystemThemeListener();
  setupMyTaskSearch();
  setupMyProjectsSearch();
  setupStaffOverviewControls();
  setupStaffOverviewSectionToggle();
  setupKeyboardShortcuts();
  await activateTab(activeTab);

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
  const myTasksTab = document.querySelector('.tab[data-tab="my-tasks"]');
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
  const isPortfolioPartner = isActualPartner();
  if (myTasksTab) myTasksTab.textContent = isPortfolioPartner ? 'My Work' : 'My Projects';
  const myTasksTitle = document.getElementById('my-tasks-view-title');
  if (myTasksTitle) myTasksTitle.textContent = isPortfolioPartner ? 'My Work' : 'My Projects';
  const addOwnTaskLabel = document.getElementById('add-private-task-label');
  if (addOwnTaskLabel) addOwnTaskLabel.textContent = isPortfolioPartner ? 'Add Private Task' : 'Add Project';

  if (staffViewTab) {
    staffViewTab.textContent = isPartner() ? 'Staff Overview' : 'Staff View';
    staffViewTab.classList.toggle('hidden', !canUseStaffOverview);
  }

  myProjectsTab?.classList.toggle('hidden', !isActualPartner());

  if (isPartner()) {
    tabBar?.classList.remove('hidden');
  } else {
    tabBar?.classList.toggle('hidden', !canUseStaffOverview);
    sidebar?.classList.add('hidden');
  }

  if (canCurrentUserAddOwnTasks() || isPortfolioPartner) {
    document.getElementById('add-private-task-btn')?.classList.remove('hidden');
  }

  if (!canUseStaffOverview && activeTab === 'staff-view') {
    activeTab = 'my-tasks';
  }

  if (!isActualPartner() && activeTab === 'my-projects') {
    activeTab = 'my-tasks';
  }

  syncActiveTabLayout();
}

// ── Stats Header Bar ────────────────────────────────

function renderStatsBar() {
  const tasks = getTasksForUser(currentUser.id);

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
      renderMyTasks();
    });
  });
}

// ── Sidebar (partner only — staff list) ─────────────

function getWorkCardsForStaffWeek(staffId, weekOf = getDisplayedWeekStart()) {
  return PROJECT_WORK_CARDS.filter((card) => (
    String(card.week_of || '') === String(weekOf)
    && (card.assignee_ids || []).some((id) => String(id) === String(staffId))
  ));
}

function getStaffCapacitySummary(staffId, weekOf = getDisplayedWeekStart()) {
  const cards = getWorkCardsForStaffWeek(staffId, weekOf);
  const hours = getWorkCardWeeklyHours(cards);
  const projectCount = new Set(getScheduledProjectsForStaff(staffId)
    .filter((task) => !task.completed)
    .map((task) => task.project_id || task.id)).size;
  const load = getStaffLoadState(hours, projectCount, OFFICE_CAPACITY.weeklyHours);
  return { cards, hours, projectCount, load };
}

function renderLoadBar(hours, capacity, load = getLoadState(hours, capacity)) {
  return `<span class="staff-load-bar load-${load.key}" aria-label="${escapeAttr(`${formatCapacityHours(hours)} of ${formatCapacityHours(capacity)}: ${load.label}`)}"><i style="width:${Math.min(100, Math.round(load.ratio * 100))}%"></i></span>`;
}

function renderSidebar() {
  const staffUsers = USERS.filter(u => u.role === 'staff' && u.active !== 0)
    .sort((left, right) => {
      if (STAFF_SIDEBAR_SORT === 'load') {
        const difference = getStaffCapacitySummary(right.id).hours - getStaffCapacitySummary(left.id).hours;
        if (difference) return difference;
      }
      return String(left.display_name || '').localeCompare(String(right.display_name || ''));
    });
  document.getElementById('staff-list').innerHTML = `
    <div class="sidebar-staff-sort" role="group" aria-label="Sort staff">
      <button type="button" class="${STAFF_SIDEBAR_SORT === 'name' ? 'active' : ''}" data-staff-sort="name">Name</button>
      <button type="button" class="${STAFF_SIDEBAR_SORT === 'load' ? 'active' : ''}" data-staff-sort="load">Load</button>
    </div>
    <button class="sidebar-clear-filter ${selectedStaffFilter ? '' : 'active'}" data-clear-staff-filter="true">All Staff</button>
    ${staffUsers.map(user => {
    const { hours, load } = getStaffCapacitySummary(user.id);
    const pto = getPTOForUser(user.id);
    return `
      <button class="sidebar-staff-item ${selectedStaffFilter === user.id ? 'active' : ''}" data-user-id="${user.id}" type="button" aria-pressed="${selectedStaffFilter === user.id ? 'true' : 'false'}" title="${escapeAttr(user.display_name || '')}">
        <div class="avatar" style="background: ${user.avatar_color}">${getInitials(user)}</div>
        <span class="staff-sidebar-meta"><span class="staff-name">${escapeHtml(getSidebarStaffName(user))}${pto ? ' <span class="badge badge-pto" style="font-size:8px;padding:1px 5px;margin-left:4px">' + pto.label + '</span>' : ''}</span><span class="staff-sidebar-load">${renderLoadBar(hours, OFFICE_CAPACITY.weeklyHours, load)}<em>${escapeHtml(formatCapacityHours(hours))}</em></span></span>
      </button>
    `;
  }).join('')}
    <div class="staff-load-legend"><span><i class="load-none"></i>Unscheduled / No projects</span><span><i class="load-available"></i>Available</span><span><i class="load-target"></i>On target</span><span><i class="load-over"></i>Over capacity</span></div>
  `;

  document.getElementById('staff-list').onclick = async (e) => {
    const sortButton = e.target.closest('[data-staff-sort]');
    if (sortButton) {
      STAFF_SIDEBAR_SORT = sortButton.dataset.staffSort === 'load' ? 'load' : 'name';
      renderSidebar();
      return;
    }
    if (e.target.closest('[data-clear-staff-filter]')) {
      selectedStaffFilter = null;
      rememberStaffFilter();
      renderSidebar();
      if (!(await activateTab('staff-view', { preserveStaffFilter: false }))) return;
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
    rememberStaffFilter();
    renderSidebar();
    if (!(await activateTab('staff-view', { preserveStaffFilter: true }))) return;
    renderStaffOverview();
  };
}

// ── My Tasks View ───────────────────────────────────

function renderMyTaskSection(section, { isPrivate = false, projectRows = false, emptyMessage = '' } = {}) {
  if (!section.tasks.length && !emptyMessage) return '';

  const itemLabel = projectRows ? 'project' : 'task';
  const renderRow = projectRows
    ? (task) => renderProjectListRow(task)
    : (task) => renderTaskCard(task, { isPrivate });

  return `
    <section class="my-task-section my-task-section-${section.id}">
      <div class="my-task-section-header">
        <div class="my-task-section-copy">
          <div class="my-task-section-title">${escapeHtml(section.title)}</div>
        </div>
        <span class="my-task-section-count">${section.tasks.length} ${itemLabel}${section.tasks.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="my-task-section-list">
        ${section.tasks.length
          ? section.tasks.map(renderRow).join('')
          : `<div class="my-task-section-empty">${escapeHtml(emptyMessage)}</div>`}
      </div>
    </section>
  `;
}

function setupMyTaskSearch() {
  const input = document.getElementById('my-task-search-input');
  const clearBtn = document.getElementById('my-task-search-clear');
  if (!input || input.dataset.bound === 'true') return;

  input.dataset.bound = 'true';
  const syncClearButton = () => clearBtn?.classList.toggle('hidden', !input.value.trim());
  const applySearch = () => {
    myTaskSearchQuery = input.value.trim();
    syncClearButton();
    renderMyTasks(myTaskSearchQuery);
  };

  input.addEventListener('input', applySearch);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    input.value = '';
    applySearch();
    input.blur();
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    applySearch();
    input.focus();
  });

  syncClearButton();
}

function setupMyProjectsSearch() {
  const input = document.getElementById('my-projects-search-input');
  const clearBtn = document.getElementById('my-projects-search-clear');
  if (!input || input.dataset.bound === 'true') return;

  input.dataset.bound = 'true';
  const syncClearButton = () => clearBtn?.classList.toggle('hidden', !input.value.trim());
  const applySearch = () => {
    myProjectsSearchQuery = input.value.trim();
    syncClearButton();
    renderMyProjects();
  };

  input.addEventListener('input', applySearch);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    input.value = '';
    applySearch();
    input.blur();
  });
  clearBtn?.addEventListener('click', () => {
    input.value = '';
    applySearch();
    input.focus();
  });
  syncClearButton();
}

function setupStaffOverviewControls() {
  const input = document.getElementById('staff-overview-search-input');
  const clearBtn = document.getElementById('staff-overview-search-clear');
  if (input && input.dataset.bound !== 'true') {
    input.dataset.bound = 'true';
    const syncClearButton = () => clearBtn?.classList.toggle('hidden', !input.value.trim());
    const applySearch = () => {
      staffOverviewSearchQuery = input.value.trim();
      syncClearButton();
      renderStaffOverview();
    };

    input.addEventListener('input', applySearch);
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      input.value = '';
      applySearch();
      input.blur();
    });

    clearBtn?.addEventListener('click', () => {
      input.value = '';
      applySearch();
      input.focus();
    });

    syncClearButton();
  }
}

function isEditableShortcutTarget(target) {
  if (!target) return false;
  const tagName = String(target.tagName || '').toLowerCase();
  return target.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
}

function getVisibleTaskCardsForActiveTab() {
  const activeView = document.querySelector(`#view-${activeTab}:not(.hidden)`);
  if (!activeView) return [];
  return [...activeView.querySelectorAll('.task-card:not([data-read-only="true"])')]
    .filter((card) => card.offsetParent !== null);
}

function moveTaskCardFocus(direction) {
  const cards = getVisibleTaskCardsForActiveTab();
  if (cards.length === 0) return false;

  const activeElement = document.activeElement?.closest?.('.task-card');
  const selectedCard = selectedTaskId
    ? cards.find((card) => String(card.dataset.taskId) === String(selectedTaskId))
    : null;
  const currentCard = cards.includes(activeElement) ? activeElement : selectedCard;
  const currentIndex = currentCard ? cards.indexOf(currentCard) : -1;
  const nextIndex = currentIndex < 0
    ? 0
    : Math.max(0, Math.min(cards.length - 1, currentIndex + direction));
  const nextCard = cards[nextIndex];

  nextCard.focus({ preventScroll: true });
  nextCard.scrollIntoView({ block: 'nearest' });
  openDetailPanel(nextCard.dataset.taskId);
  return true;
}

// Focus the search box of the current view (the view without one falls back to My Work).
async function focusActiveSearch() {
  const input = activeTab === 'staff-view'
    ? document.getElementById('staff-overview-search-input')
    : activeTab === 'my-projects'
      ? document.getElementById('my-projects-search-input')
      : document.getElementById('my-task-search-input');
  if (activeTab !== 'staff-view' && activeTab !== 'my-projects') {
    if (!(await activateTab('my-tasks', { preserveStaffFilter: false }))) return;
  }
  input?.focus();
  input?.select();
}

function setupKeyboardShortcuts() {
  if (document.body.dataset.mytasksShortcutsBound === 'true') return;
  document.body.dataset.mytasksShortcutsBound = 'true';

  document.getElementById('btn-command-palette')?.addEventListener('click', () => CommandPalette.open());

  document.addEventListener('keydown', async (event) => {
    const mod = event.ctrlKey || event.metaKey;
    const key = String(event.key || '').toLowerCase();

    // The command palette is modal: while it is open, only Ctrl+K (which closes it) is handled here.
    if (CommandPalette.isOpen()) {
      if (mod && key === 'k') {
        event.preventDefault();
        CommandPalette.close();
      }
      return;
    }

    // Ctrl+K opens the command palette; Ctrl+F is the shortcut for the search box.
    if (mod && key === 'k') {
      event.preventDefault();
      CommandPalette.open();
      return;
    }

    if (mod && key === 'f') {
      event.preventDefault();
      await focusActiveSearch();
      return;
    }

    if (mod && String(event.key || '').toLowerCase() === 'n') {
      if (isEditableShortcutTarget(event.target)) return;
      event.preventDefault();
      if (activeTab !== 'my-tasks') {
        if (!(await activateTab('my-tasks', { preserveStaffFilter: false }))) return;
      }
      if (canCurrentUserAddOwnTasks() || isActualPartner()) {
        document.getElementById('add-private-task-btn')?.click();
      }
      return;
    }

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !isEditableShortcutTarget(event.target)) {
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      if (moveTaskCardFocus(direction)) {
        event.preventDefault();
      }
      return;
    }

    if (event.key === 'Escape' && !isEditableShortcutTarget(event.target)) {
      const openOverlay = document.querySelector('.dialog-overlay:not(.hidden):not(.is-leaving)');
      if (openOverlay) return;
      if (activeTab === 'my-tasks' && myTaskSearchQuery) {
        const input = document.getElementById('my-task-search-input');
        if (input) input.value = '';
        myTaskSearchQuery = '';
        document.getElementById('my-task-search-clear')?.classList.add('hidden');
        renderMyTasks();
        return;
      }
      if (activeTab === 'my-projects' && myProjectsSearchQuery) {
        const input = document.getElementById('my-projects-search-input');
        if (input) input.value = '';
        myProjectsSearchQuery = '';
        document.getElementById('my-projects-search-clear')?.classList.add('hidden');
        renderMyProjects();
        return;
      }
      if (activeTab === 'staff-view' && staffOverviewSearchQuery) {
        const input = document.getElementById('staff-overview-search-input');
        if (input) input.value = '';
        staffOverviewSearchQuery = '';
        document.getElementById('staff-overview-search-clear')?.classList.add('hidden');
        renderStaffOverview();
        return;
      }
      if (selectedTaskId || selectedProjectId) {
        clearSelectedTaskDetail();
        return;
      }
    }
  });
}

function renderMyTasks(query = '') {
  query = query || myTaskSearchQuery;
  if (isActualPartner()) {
    renderPartnerMyWork(query);
    return;
  }
  const tasks = getMyTasksForCurrentView(query);
  const privateTasks = isPartner() ? getPrivateTasksForCurrentView(query) : [];
  const container = document.getElementById('my-task-list');
  // Keep the list aligned with the scheduling meeting's configurable priority
  // order. Due dates determine which group a project belongs in, not whether
  // an unranked project jumps above a numbered priority inside that group.
  const groups = getProjectListGroups(tasks, new Date(), getProjectListTaskName, sortTasksLikeScheduling);
  const headerSummary = getProjectListHeaderSummary(groups);
  const summaryEl = document.getElementById('my-projects-summary');
  if (summaryEl) {
    summaryEl.innerHTML = [
      headerSummary.dueCount ? `<strong>${headerSummary.dueCount} due today or overdue</strong>` : '',
      `${headerSummary.activeCount} active`,
      headerSummary.waitingCount ? `${headerSummary.waitingCount} waiting` : '',
      `${headerSummary.completedCount} completed`,
    ].filter(Boolean).join('<span aria-hidden="true"> · </span>');
  }

  const groupDefinitions = [
    { id: 'due', title: 'Due today or overdue', tasks: groups.due, urgent: true },
    { id: 'active', title: 'Active', tasks: groups.active },
    { id: 'wait', title: 'Waiting', tasks: groups.waiting },
    { id: 'completed', title: 'Completed', tasks: groups.completed },
  ];
  const renderedGroups = groupDefinitions
    .filter((group) => group.tasks.length)
    .map(renderMyProjectListGroup)
    .join('');

  container.innerHTML = renderedGroups || `
    <div class="empty-state my-project-list-empty">
      <div class="empty-state-text">${query ? 'No projects match your search.' : 'No projects assigned to you yet.'}</div>
    </div>
  `;
  if (privateTasks.length) {
    container.insertAdjacentHTML('beforeend', renderMyTaskSection({ id: 'private', title: 'Private tasks', tasks: privateTasks }, { isPrivate: true }));
  }

  container.querySelectorAll('[data-my-project-group-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const groupId = button.dataset.myProjectGroupToggle;
      if (!Object.hasOwn(MY_PROJECT_GROUP_COLLAPSE, groupId)) return;
      MY_PROJECT_GROUP_COLLAPSE[groupId] = !MY_PROJECT_GROUP_COLLAPSE[groupId];
      rememberMyProjectGroupCollapsePrefs();
      renderMyTasks(query);
    });
  });
  attachTaskCardEvents(container);
}

function renderPartnerMyWork(query = '') {
  const privateTasks = getPrivateTasksForCurrentView(query);
  const assignedProjects = getPartnerAssignedProjectTasks(query);
  const container = document.getElementById('my-task-list');
  const summaryEl = document.getElementById('my-projects-summary');
  if (summaryEl) {
    summaryEl.textContent = `${privateTasks.length} private task${privateTasks.length === 1 ? '' : 's'} · ${assignedProjects.length} assigned project${assignedProjects.length === 1 ? '' : 's'}`;
  }

  container.innerHTML = [
    renderMyTaskSection(
      { id: 'private', title: 'Private Tasks', tasks: privateTasks },
      { isPrivate: true, emptyMessage: query ? 'No private tasks match your search.' : 'No private tasks yet.' }
    ),
    renderMyTaskSection(
      { id: 'assigned-projects', title: 'Assigned Projects', tasks: assignedProjects },
      { projectRows: true, emptyMessage: query ? 'No assigned projects match your search.' : 'No projects have been assigned to staff this week.' }
    ),
  ].join('');

  attachTaskCardEvents(container);
}

function getProjectListTaskName(task) {
  const project = getProjectById(task?.project_id);
  return project ? getProjectDisplayTitle(project) : normalizeTaskDisplayTitle(task?.title || 'Untitled project');
}

function renderMyProjectListGroup(group) {
  const isCollapsed = MY_PROJECT_GROUP_COLLAPSE[group.id] === true;
  return `
    <section class="my-project-list-group ${isCollapsed ? 'collapsed' : ''}">
      <button class="my-project-list-group-header" type="button" data-my-project-group-toggle="${escapeAttr(group.id)}" aria-expanded="${isCollapsed ? 'false' : 'true'}">
        ${group.urgent ? '<span class="my-project-list-group-dot" aria-hidden="true"></span>' : ''}
        <span class="my-project-list-group-title">${escapeHtml(group.title)}</span>
        <span class="my-project-list-group-count">${group.tasks.length}</span>
        <span class="my-project-list-group-chevron" aria-hidden="true">&#8250;</span>
      </button>
      ${isCollapsed ? '' : `<div class="my-project-list-group-rows">${group.tasks.map(renderProjectListRow).join('')}</div>`}
    </section>
  `;
}

// ── My Projects (from Excel, partner only) ──────────

function renderMyProjects() {
  const allProjects = getProjectsForCurrentPartner({ includeFuture: true, includeInactive: true });
  const query = myProjectsSearchQuery.trim().toLowerCase();
  const projects = query
    ? allProjects.filter((project) => [project.client, project.name, project.notes, getProjectDisplayTitle(project)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query))
    : allProjects;

  document.getElementById('my-projects-count').textContent = query
    ? `${projects.length} of ${allProjects.length} projects`
    : `${projects.length} projects`;

  const activeProjects = projects.filter((project) => getProjectSection(project) === 'active');
  const futureProjects = projects.filter((project) => getProjectSection(project) === 'future');
  const inactiveProjects = projects.filter((project) => getProjectSection(project) === 'inactive');
  const container = document.getElementById('my-projects-list');

  if (projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"></path></svg></div>
        <div class="empty-state-text">${query ? 'No projects match your search.' : 'No projects assigned to your initials yet'}</div>
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
              <div class="personal-project-card ${selectedProjectId === project.id ? 'selected' : ''}" data-project-id="${project.id}" tabindex="0" role="button">
                <div class="pp-card-info">
                  <div class="pp-card-top">
                    <div class="pp-card-title">${escapeHtml(getProjectDisplayTitle(project))}</div>
                    ${renderAssignedStaff(project)}
                  </div>
                  <div class="pp-card-notes">
                    <span class="pp-card-status pp-card-status-${getProjectSection(project)}">${getStatusLabel(project)}</span>
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
      rememberProjectSectionCollapsePrefs();
      renderMyProjects();
    });
  });

  container.querySelectorAll('.personal-project-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      openProjectDetailPanel(card.dataset.projectId);
    });

    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
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

// ── Add Project to My List ───────────────────────────

function setupAddPrivateTask() {
  document.getElementById('add-private-task-btn').addEventListener('click', () => {
    openAddProjectToMyListDialog({
      defaultMode: isActualPartner() ? 'private' : 'office',
      privateOnly: isActualPartner(),
    });
  });
}

function openAddProjectToMyListDialog({ defaultMode = 'office', privateOnly = false } = {}) {
  const overlay = document.getElementById('add-task-overlay');
  overlay.classList.remove('hidden');

  document.getElementById('add-task-title').textContent = privateOnly ? 'Add Private Task' : 'Add Project';
  document.getElementById('add-task-subtitle').textContent = privateOnly
    ? 'This private task is visible only to you.'
    : 'Select an office project to add it to your list.';

  const titleInput = document.getElementById('add-task-title-input');
  document.getElementById('add-task-notes-input').value = '';
  populatePrioritySelect(currentUser?.id || null);
  document.getElementById('add-task-due').value = '';
  titleInput.value = '';
  titleInput.placeholder = 'Search office projects...';
  titleInput.dataset.projectLocked = 'false';
  titleInput.readOnly = false;
  titleInput.classList.remove('task-title-locked');

  let selectedProjectId = null;
  let mode = 'office';
  const modeControl = document.getElementById('add-project-mode');
  const privateModeButton = modeControl?.querySelector('[data-add-project-mode="private"]');
  const pickerGroup = document.getElementById('project-picker-group');
  const titleLabel = document.getElementById('add-task-title-label');
  const notesLabel = document.getElementById('add-task-notes-label');
  const saveButton = document.getElementById('add-task-save');

  // Private items are intentionally restricted to partners and designated
  // senior administrators; regular staff may add an office project only when
  // their self-assignment setting permits it.
  privateModeButton?.classList.toggle('hidden', !isPartner());
  modeControl?.classList.toggle('hidden', privateOnly);

  const picker = document.getElementById('project-picker');
  const configureProjectPicker = () => {
    bindProjectPickerSelection(picker, getAvailableProjectsForTaskCreation(), titleInput, (projectId) => {
      selectedProjectId = projectId;
    });
  };
  configureProjectPicker();

  const applyMode = (nextMode) => {
    const modeChanged = mode !== nextMode;
    mode = nextMode;
    const isPrivate = mode === 'private';
    modeControl?.querySelectorAll('[data-add-project-mode]').forEach((button) => {
      const selected = button.dataset.addProjectMode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });

    pickerGroup?.classList.toggle('hidden', isPrivate);
    titleLabel.textContent = isPrivate ? 'Private task' : 'Find a project';
    notesLabel.textContent = isPrivate ? 'Description' : 'Task summary';
    document.getElementById('add-task-subtitle').textContent = isPrivate
      ? 'This private item is visible only to you.'
      : 'Select an office project to add it to your list.';
    saveButton.textContent = isPrivate ? 'Add Private Task' : 'Add Project';

    titleInput.value = '';
    titleInput.readOnly = false;
    titleInput.dataset.projectLocked = 'false';
    titleInput.classList.remove('task-title-locked');
    titleInput.placeholder = isPrivate ? 'What do you need to work on?' : 'Search office projects...';
    titleInput.closest('.task-search-field')?.classList.remove('has-clear');
    document.getElementById('add-task-title-clear')?.classList.add('hidden');
    if (isPrivate) {
      selectedProjectId = null;
    } else if (modeChanged) {
      // Reset the picker after returning from the private entry form so an
      // old visual selection can never be mistaken for the current choice.
      selectedProjectId = null;
      configureProjectPicker();
    }
    titleInput.focus();
  };

  modeControl?.querySelectorAll('[data-add-project-mode]').forEach((button) => {
    button.onclick = () => {
      if (button.classList.contains('hidden')) return;
      applyMode(button.dataset.addProjectMode);
    };
  });
  applyMode(privateOnly ? 'private' : defaultMode);

  const close = () => {
    document.removeEventListener('keydown', escHandler);
    overlay.classList.add('hidden');
  };
  document.getElementById('add-task-close').onclick = close;
  document.getElementById('add-task-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  document.getElementById('add-task-save').onclick = async () => {
    const selectedProject = getProjectById(selectedProjectId);
    if (mode === 'office' && !selectedProject) {
      showToast('Select an office project to add it to your list.', { tone: 'warning' });
      titleInput.focus();
      return;
    }
    if (mode === 'private' && !requireTextInput(titleInput, 'Enter a private project or task.')) return;

    const button = document.getElementById('add-task-save');
    const outcome = await runUiAction(async () => {
      if (mode === 'private') {
        await window.api.createPrivateTask(buildPrivateTaskPayloadFromInput({
          title: titleInput.value.trim(),
          notes: document.getElementById('add-task-notes-input').value,
          priorityValue: document.getElementById('add-task-priority').value,
          dueDate: document.getElementById('add-task-due').value,
          base: { project_id: null },
        }));
      } else {
        const created = await window.api.createTask(buildSharedTaskPayloadFromInput({
          title: selectedProject.client ? `${selectedProject.client} - ${selectedProject.name}` : selectedProject.name,
          notes: document.getElementById('add-task-notes-input').value,
          priorityValue: document.getElementById('add-task-priority').value,
          dueDate: document.getElementById('add-task-due').value,
          base: {
            project_id: selectedProject.id,
            assigned_to: currentUser.id,
            created_by: currentUser.id,
            partner_id: selectedProject.partner_id || null,
          },
        }));
        if (!created) throw new Error('Project was not added to your list.');
      }
      await loadAllData();
      await refreshAll();
    }, {
      button,
      pendingLabel: 'Adding...',
      successMessage: mode === 'private' ? 'Private item added.' : 'Project added to your list.',
      errorMessage: mode === 'private'
        ? 'Private item could not be added.'
        : 'Project could not be added to your list. Check your permissions, or try again once the weekly review is finished.',
    });
    if (outcome.ok) close();
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
      if (!requireTextInput(document.getElementById('add-pp-client'), 'Enter a client name.')) return;
      if (!requireTextInput(document.getElementById('add-pp-name'), 'Enter a project name.')) return;

      const button = document.getElementById('add-pp-save');
      const outcome = await runUiAction(async () => {
        const project = await window.api.createProject({
          client,
          name,
          status: 'active',
          category,
          notes,
          partner_id: currentUser.id,
        });
        await loadAllData();
        renderMyProjects();
        if (project?.id) await openProjectDetailPanel(project.id);
        return project;
      }, {
        button,
        pendingLabel: 'Adding...',
        successMessage: 'Project added.',
        errorMessage: 'Project could not be added.',
      });
      if (outcome.ok) close();
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

  const payload = buildSharedTaskPayloadFromInput({
    title: project.client ? `${project.client} - ${project.name}` : project.name,
    notes: '',
    priorityValue: '',
    dueDate: null,
    base: {
      project_id: project.id,
      assigned_to: staffId,
      created_by: currentUser?.id || null,
      partner_id: project.partner_id || currentUser?.id || null,
    },
  });
  return window.api.createTask(payload);
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
      showToast(`Assigned to ${staffUser.display_name}.`, { tone: 'success' });
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
        showToast('Project moved to Current.', { tone: 'success' });
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
        showToast('Project marked active.', { tone: 'success' });
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
        showToast('Project marked inactive.', { tone: 'success' });
      }
    });
  }

  items.push(
    {
      label: 'View Activity...',
      action: () => window.api.openProjectActivityWindow(project.id)
    },
    { divider: true },
    {
      label: 'Duplicate',
      action: async () => {
        const duplicated = await duplicateProject(project);
        await loadAllData();
        await refreshAll();
        if (duplicated?.id) {
          await openProjectDetailPanel(duplicated.id);
        }
        showToast('Project duplicated.', { tone: 'success' });
      }
    },
    {
      label: 'Delete',
      danger: true,
      action: async () => {
        const confirmed = await window.MyTasksConfirmDialog.show({
          title: 'Delete project?',
          message: `Delete "${getProjectDisplayTitle(project)}"?`,
          confirmLabel: 'Delete',
          tone: 'danger',
        });
        if (!confirmed) return;
        await window.api.deleteProject(project.id);
        await loadAllData();
        if (selectedProjectId === project.id) {
          selectedProjectId = null;
          showDetailEmptyState();
        }
        await refreshAll();
        showToast('Project deleted.', { tone: 'success' });
      }
    }
  );

  const menu = ContextMenu.create(items);
  positionMenu(menu, e.clientX, e.clientY);
}

// ── Task Card HTML ──────────────────────────────────

function renderTaskCard(task, options = {}) {
  const { showAssignee = false, isPrivate = false, readOnly = false } = options;
  const isNotReviewed = !isPrivate && (task.confirmed ?? 1) === 0;
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
  const showTaskMenu = !readOnly && (isPrivate || canEditTask);
  const priority = getPriorityPresentation(task);
  const noteText = String(task.notes || '').trim();
  const partnerParticipants = !isPrivate && project ? getProjectPartners(project) : [];

  const dueMarkup = due.text
    ? `<span class="task-due task-due-pill ${due.cls} ${canEditTask ? 'task-due-editable' : ''}" ${canEditTask ? `data-edit-task-id="${task.id}" tabindex="0" role="button" aria-label="Edit due date: ${escapeAttr(due.text)}"` : ''}>${escapeHtml(due.text)}</span>`
    : (canEditTask ? `
      <span class="task-due-calendar task-due-editable" data-edit-task-id="${task.id}" title="Pick due date" aria-label="Pick due date" tabindex="0" role="button">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="2"></rect>
          <path d="M8 3v4M16 3v4M4 10h16"></path>
        </svg>
      </span>
    ` : '');

  const partnerAvatarsMarkup = partnerParticipants.length > 0 ? `
    <div class="task-avatar-stack">
      ${partnerParticipants.slice(0, 4).map((user, index) => `
        <span class="task-avatar-chip partner" style="background:${user.avatar_color};z-index:${partnerParticipants.length - index};margin-right:${index < Math.min(partnerParticipants.length, 4) - 1 ? '-5px' : '0'}" title="${escapeAttr(user.display_name || '')}">
          ${getInitials(user)}
        </span>
      `).join('')}
    </div>
  ` : '';

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
    <div class="task-card ${task.completed ? 'completed' : ''} ${isNotReviewed ? 'not-reviewed' : ''} ${String(selectedTaskId) === String(task.id) ? 'selected' : ''} ${readOnly ? 'read-only' : ''} ${task.priority === PRIORITY_WAIT ? 'wait' : ''} ${hasMeta ? 'has-activity' : ''}" data-task-id="${task.id}" ${isPrivate ? 'data-private="true"' : ''} ${readOnly ? 'data-read-only="true"' : ''} ${readOnly ? '' : 'tabindex="0" role="button"'}>
      <div class="task-check">
        <div class="task-checkbox ${task.completed ? 'checked' : ''} ${readOnly ? 'read-only' : ''}" data-task-id="${task.id}" ${isPrivate ? 'data-private="true"' : ''} ${readOnly ? 'data-read-only="true"' : `tabindex="0" role="checkbox" aria-checked="${task.completed ? 'true' : 'false'}" aria-label="${task.completed ? 'Mark task incomplete' : 'Mark task complete'}"`}></div>
      </div>
      <div class="task-body">
        <div class="task-top-row">
          <span class="task-priority ${priority.className} ${canManagePriority ? 'task-priority-interactive' : ''}" style="${priority.inlineStyle}" ${canManagePriority ? `data-priority-task-id="${task.id}" tabindex="0" role="button" aria-label="Change priority: ${escapeAttr(priority.isUnset ? 'none set' : priority.label)}"` : ''} title="${escapeAttr(priority.isUnset ? 'No priority set' : priority.label)}">${escapeHtml(priority.shortLabel ?? priority.label)}</span>
          <span class="task-title">
            ${isNotReviewed ? '<span class="task-not-reviewed-badge" title="This assignment has not been reviewed for the current week">Not Reviewed</span>' : ''}
            <span class="task-title-text">${escapeHtml(displayTitle)}</span>
          </span>
          ${dueMarkup}
          ${partnerAvatarsMarkup}
          ${showTaskMenu ? `
            <button class="task-card-menu-btn" data-task-menu-id="${task.id}" type="button" aria-label="Task actions" title="Task actions">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
            </button>
          ` : ''}
        </div>
        <div class="task-note-row">
          ${notesMarkup}
        </div>
        <div class="task-footer-row ${readOnly ? 'read-only-footer' : ''}">
          <div class="task-footer-left">
            ${readOnly ? '' : indicatorsMarkup}
          </div>
        </div>
      </div>
    </div>
  `;
}

function getProjectWorkCards(projectId) {
  return PROJECT_WORK_CARDS.filter((card) => String(card.project_id) === String(projectId));
}

function renderProjectRowSummary(summary, task) {
  const due = formatDate(task?.due_date);
  const dueMarkup = due.text
    ? `<span class="project-row-summary-separator" aria-hidden="true"> · </span><span class="project-row-due project-row-due-${escapeAttr(due.cls)}" title="Project due: ${escapeAttr(due.text)}">Due ${escapeHtml(due.text)}</span>`
    : '';
  return `${escapeHtml(summary.text)}${dueMarkup}`;
}

function renderProjectListRow(task) {
  const project = getProjectById(task.project_id);
  if (!project) return renderTaskCard(task);

  const isNotReviewed = (task.confirmed ?? 1) === 0;
  const canEditTask = canCurrentUserEditSharedTask(task);
  const summary = getProjectListWorkSummary(getProjectWorkCards(project.id));
  const due = getProjectListDueChip(task);
  const assigneeInfo = getProjectListAssignees(getAssignedStaffForProject(project.id), currentUser?.id);
  const comments = getTaskComments(task);
  const priority = getPriorityPresentation(task);
  const priorityLabel = priority.label === '-' ? 'No priority set' : (priority.className === 'pnumeric' ? `Priority ${priority.label}` : `Priority: ${priority.label}`);
  const selected = String(selectedProjectId) === String(project.id);
  const dueMarkup = due ? `
    <span class="project-row-due-chip project-row-due-chip-${escapeAttr(due.tone)}" title="${escapeAttr(due.title)}">
      ${due.tone === 'done' ? '' : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path></svg>'}
      ${escapeHtml(due.label)}
    </span>` : '';
  const assigneesMarkup = assigneeInfo.visible.length ? `
    <div class="project-row-avatar-stack" title="${escapeAttr(assigneeInfo.title)}" aria-label="${escapeAttr(assigneeInfo.title)}">
      ${assigneeInfo.visible.map((user, index) => `<span class="project-row-avatar" style="--project-row-avatar-color:${escapeAttr(user.avatar_color || '#64748B')};z-index:${assigneeInfo.visible.length - index}">${escapeHtml(getInitials(user))}</span>`).join('')}
      ${assigneeInfo.hiddenCount ? `<span class="project-row-avatar project-row-avatar-more">+${assigneeInfo.hiddenCount}</span>` : ''}
    </div>` : '';
  const detailMarkup = dueMarkup || summary.text || comments.length || assigneesMarkup ? `
    <div class="project-row-detail">
      <div class="project-row-detail-copy">
        ${dueMarkup}
        <span class="project-row-summary project-row-summary-${summary.tone}" title="${escapeAttr(summary.text)}">${escapeHtml(summary.text)}</span>
      </div>
      ${comments.length > 0 ? `<span class="project-row-comments" title="${comments.length} comment${comments.length === 1 ? '' : 's'}" aria-label="${comments.length} comment${comments.length === 1 ? '' : 's'}"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M14 8c0 3.314-2.686 6-6 6a5.97 5.97 0 0 1-3.5-1.126L2 14l1.126-2.5A5.97 5.97 0 0 1 2 8c0-3.314 2.686-6 6-6s6 2.686 6 6z" stroke="currentColor" stroke-width="1.2"/></svg>${comments.length}</span>` : ''}
      ${assigneesMarkup}
    </div>` : '';

  return `
    <div class="task-card project-list-row ${task.completed ? 'completed' : ''} ${isNotReviewed ? 'not-reviewed' : ''} ${selected ? 'selected' : ''}" data-task-id="${task.id}" data-project-id="${project.id}" tabindex="0" role="button">
      <div class="task-check">
        <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-task-id="${task.id}" tabindex="0" role="checkbox" aria-checked="${task.completed ? 'true' : 'false'}" aria-label="${task.completed ? 'Mark project incomplete' : 'Mark project complete'}" title="${task.completed ? 'Mark project incomplete' : 'Mark project complete'}"></div>
      </div>
      <span class="project-row-priority task-priority ${priority.className} ${canEditTask ? 'task-priority-interactive' : ''}" style="${priority.inlineStyle}" ${canEditTask ? `data-priority-task-id="${task.id}" tabindex="0" role="button"` : 'role="img"'} aria-label="${escapeAttr(priorityLabel)}" title="${escapeAttr(priorityLabel)}">${escapeHtml(priority.shortLabel ?? priority.label)}</span>
      <div class="project-row-title" title="${escapeAttr(getProjectDisplayTitle(project))}">${escapeHtml(getProjectDisplayTitle(project))}</div>
      <button class="task-card-menu-btn project-row-menu" data-task-menu-id="${task.id}" type="button" aria-label="Project actions" title="Project actions" ${canEditTask ? '' : 'disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg></button>
      ${detailMarkup}
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

      const task = isPrivate
        ? PRIVATE_TASKS.find(t => String(t.id) === String(taskId))
        : TASKS.find(t => String(t.id) === String(taskId));
      if (!task) return;

      const previousCompleted = task.completed ? 1 : 0;
      const nextCompleted = previousCompleted ? 0 : 1;
      const outcome = await runUiAction(async () => {
        if (isPrivate) {
          await window.api.updatePrivateTask({ id: taskId, completed: nextCompleted });
          await loadAllData();
          await refreshAll();
          if (String(selectedTaskId) === String(taskId)) await openDetailPanel(taskId);
        } else {
          await applyTaskCompletionChange(taskId, nextCompleted);
        }
      }, { errorMessage: 'Task status could not be updated.' });
      if (!outcome.ok) return;

      showToast(nextCompleted ? 'Task completed.' : 'Task reopened.', {
        tone: 'success',
        actionLabel: 'Undo',
        onAction: async () => {
          if (isPrivate) {
            await window.api.updatePrivateTask({ id: taskId, completed: previousCompleted });
            await loadAllData();
            await refreshAll();
            if (String(selectedTaskId) === String(taskId)) await openDetailPanel(taskId);
          } else {
            await applyTaskCompletionChange(taskId, previousCompleted);
          }
        },
      });
    });
  });

  container.querySelectorAll('.task-checkbox, .task-priority-interactive, .task-due-editable').forEach((control) => {
    control.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      control.click();
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

  container.querySelectorAll('.task-card-menu-btn').forEach((button) => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const taskId = button.dataset.taskMenuId;
      const privateTask = PRIVATE_TASKS.find(t => String(t.id) === String(taskId));
      if (privateTask) {
        openPrivateTaskContextMenu(e, privateTask);
        return;
      }

      const sharedTask = getSharedTaskById(taskId);
      if (sharedTask && canCurrentUserEditSharedTask(sharedTask)) {
        openSharedTaskContextMenu(e, sharedTask);
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
      await applyTaskNotesChange(taskId, nextValue);
      original = nextValue;
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
      if (e.target.closest('.task-checkbox, .task-priority-interactive, .task-notes-input, .task-card-menu-btn')) return;
      toggleTaskDetailPanel(card.dataset.taskId);
    });

    card.addEventListener('keydown', (e) => {
      if (!allowDetailOpen || card.dataset.readOnly === 'true') return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (isEditableShortcutTarget(e.target)) return;
      e.preventDefault();
      toggleTaskDetailPanel(card.dataset.taskId);
    });

    card.addEventListener('dblclick', (e) => {
      if (!allowTaskActions || card.dataset.readOnly === 'true') return;
      const task = getSharedTaskById(card.dataset.taskId);
      if (!task || !canCurrentUserEditSharedTask(task)) return;
      if (e.target.closest('.task-checkbox, .task-priority-interactive, .task-notes-input, .task-card-menu-btn')) return;
      openEditSharedTaskDialog(task);
    });

    card.addEventListener('contextmenu', (e) => {
      if (!allowTaskActions || card.dataset.readOnly === 'true') return;
      const privateTask = PRIVATE_TASKS.find(t => String(t.id) === String(card.dataset.taskId));
      if (privateTask) {
        e.preventDefault();
        e.stopPropagation();
        openPrivateTaskContextMenu(e, privateTask);
        return;
      }

      const task = getSharedTaskById(card.dataset.taskId);
      if (!task || !canCurrentUserEditSharedTask(task)) return;
      e.preventDefault();
      e.stopPropagation();
      openSharedTaskContextMenu(e, task);
    });
  });
}

// ── Refresh all views ───────────────────────────────

function workCardPlannedLabel(card) {
  if (!card?.planned_minutes) return '';
  const hours = card.planned_minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h planned`;
}

function formatMyWeekCardDateRange(card) {
  const start = card?.start_date || card?.end_date;
  const end = card?.end_date || card?.start_date;
  if (!start) return 'Flexible this week';
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const startText = formatter.format(new Date(`${start}T12:00:00`));
  if (!end || end === start) return startText;
  return `${startText} – ${formatter.format(new Date(`${end}T12:00:00`))}`;
}

function openMyWeekWorkCardDialog(cardId) {
  const card = MY_WEEK_WORK_CARDS.find((item) => String(item.id) === String(cardId));
  if (!card) return;

  document.getElementById('my-week-work-card-overlay')?.remove();

  const project = getProjectById(card.project_id);
  const isFocused = String(MY_WEEK_FOCUS?.id || '') === String(card.id);
  const overlay = document.createElement('div');
  overlay.id = 'my-week-work-card-overlay';
  overlay.className = 'dialog-overlay my-week-work-card-overlay';
  overlay.innerHTML = `
    <div class="dialog-card my-week-work-card-dialog" role="dialog" aria-modal="true" aria-labelledby="my-week-work-card-title">
      <div class="dialog-header">
        <div class="my-week-dialog-heading">
          <span class="my-week-dialog-kicker">${escapeHtml(project ? getProjectDisplayTitle(project) : 'Project')}</span>
          <h3 class="dialog-title" id="my-week-work-card-title">${escapeHtml(card.title)}</h3>
        </div>
        <button class="detail-close" type="button" data-close-my-week-dialog aria-label="Close work card details">&times;</button>
      </div>
      <div class="dialog-body my-week-work-card-body">
        <div class="my-week-dialog-facts">
          <div><span>Schedule</span><strong>${escapeHtml(formatMyWeekCardDateRange(card))}</strong></div>
          <div><span>Allotted time</span><strong>${escapeHtml(workCardPlannedLabel(card) || 'Not set')}</strong></div>
          <div><span>Status</span><strong>${card.completed ? 'Complete' : (isFocused ? 'Working now' : 'Planned')}</strong></div>
        </div>
        <section class="my-week-dialog-description">
          <span>Work card details</span>
          <p>${escapeHtml(card.description || 'No additional details were added for this work card.')}</p>
        </section>
      </div>
      <div class="dialog-footer">
        <button class="btn btn-ghost" type="button" data-close-my-week-dialog>Close</button>
        <button class="btn btn-primary" type="button" data-focus-my-week-dialog-card="${escapeAttr(card.id)}">${isFocused ? 'Stop working' : 'Work on this'}</button>
      </div>
    </div>
  `;

  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape') close();
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelectorAll('[data-close-my-week-dialog]').forEach((button) => button.addEventListener('click', close));
  overlay.querySelector('[data-focus-my-week-dialog-card]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await window.api.setWorkCardFocus(isFocused ? null : card.id);
      await loadAllData();
      renderMyWeek();
      close();
    } catch (_) {
      button.disabled = false;
      showToast('Could not update your active work card. Please try again.', { tone: 'error' });
    }
  });

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeydown);
  overlay.querySelector('[data-focus-my-week-dialog-card]')?.focus();
}

function renderMyWeek() {
  const calendar = document.getElementById('my-week-calendar');
  const unscheduled = document.getElementById('my-week-unscheduled');
  const range = document.getElementById('my-week-range');
  const focus = document.getElementById('my-week-focus');
  if (!calendar || !unscheduled || !range || !focus) return;

  const weekOf = getDisplayedWeekStart();
  const days = Array.from({ length: 5 }, (_, index) => addDaysToIsoDate(weekOf, index));
  const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  range.textContent = `Week of ${formatWeekRange(weekOf)}`;

  const focusedStatus = MY_WEEK_FOCUS ? getWorkCardStatus(MY_WEEK_FOCUS) : null;
  const focusedPaused = Boolean(MY_WEEK_FOCUS?.paused);
  focus.classList.remove('hidden', 'is-paused', 'is-idle');
  if (!MY_WEEK_FOCUS || focusedStatus === 'done') {
    focus.classList.add('is-idle');
    focus.textContent = 'Nothing in progress';
  } else {
    focus.classList.toggle('is-paused', focusedPaused);
    focus.innerHTML = `
      <span>${focusedPaused ? 'Paused' : 'Working on'}: ${escapeHtml(MY_WEEK_FOCUS.title)}</span>
      <button type="button" data-my-week-focus-action="${focusedPaused ? 'resume' : 'pause'}">${focusedPaused ? 'Resume' : 'Pause'}</button>
      <button class="my-week-focus-complete" type="button" data-my-week-focus-action="complete">Complete</button>`;
  }

  const datedCards = MY_WEEK_WORK_CARDS.filter((card) => card.start_date || card.end_date);
  const unscheduledCards = MY_WEEK_WORK_CARDS.filter((card) => !card.start_date && !card.end_date);
  const cardMarkup = (card, className = '', inlineStyle = '') => {
    const project = getProjectById(card.project_id);
    const isFocused = MY_WEEK_FOCUS?.id === card.id;
    const projectLabel = project ? getProjectDisplayTitle(project) : 'Project';
    const hours = workCardPlannedLabel(card);
    const category = WORK_CARD_CATEGORIES.find((item) => item.id === card.category_id) || getWorkCardCategory(card);
    const status = getWorkCardStatus(card);
    const dateChip = getDateChip(card);
    const isPaused = status === 'in_progress' && Boolean(card.paused);
    const statusLabel = status === 'done'
      ? 'Done'
      : isPaused
        ? 'Paused'
        : dateChip.tone === 'soon'
          ? 'Due soon'
          : status === 'in_progress'
            ? 'In progress'
            : 'To do';
    const statusClass = status === 'done' ? 'done' : isPaused ? 'paused' : dateChip.tone === 'soon' ? 'soon' : status === 'in_progress' ? 'in-progress' : 'todo';
    const inlineVariables = `--week-card-accent:${escapeAttr(category.color)};${inlineStyle || ''}`;
    return `<article class="my-week-card ${className} ${card.completed ? 'is-completed' : ''} ${isFocused ? 'is-focused' : ''}" style="${inlineVariables}" data-work-card-id="${escapeAttr(card.id)}" data-project-id="${escapeAttr(card.project_id)}" tabindex="0" role="button" aria-haspopup="dialog" aria-label="Open details for ${escapeAttr(card.title)}">
      <div class="my-week-card-topline"><span class="my-week-card-project">${escapeHtml(projectLabel)}</span></div>
      <span class="work-card-category project-work-card-category" style="--work-card-category-color:${escapeAttr(category.color)}"><i aria-hidden="true"></i>${escapeHtml(category.label)}</span>
      <div class="my-week-card-title">${escapeHtml(card.title)}</div>
      <div class="my-week-card-chips">
        ${hours ? `<span class="work-card-chip">${escapeHtml(hours)}</span>` : ''}
        <span class="work-card-chip my-week-status-chip my-week-status-${statusClass}">${escapeHtml(statusLabel)}</span>
      </div>
    </article>`;
  };

  const weekEnd = days[days.length - 1];
  const placedCards = [];
  const laneEnds = [];
  for (const card of datedCards
    .map((item) => {
      const startDate = item.start_date || item.end_date;
      const endDate = item.end_date || item.start_date;
      if (endDate < weekOf || startDate > weekEnd) return null;
      const coveredDays = days.filter((day) => day >= startDate && day <= endDate);
      if (!coveredDays.length) return null;
      return {
        card: item,
        start: days.indexOf(coveredDays[0]),
        end: days.indexOf(coveredDays[coveredDays.length - 1]),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || b.end - a.end)) {
    let lane = laneEnds.findIndex((end) => end < card.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = card.end;
    placedCards.push({ ...card, lane });
  }
  const laneCount = Math.max(1, laneEnds.length);
  const dailyLoad = getWorkCardsDailyLoad(MY_WEEK_WORK_CARDS, weekOf);

  calendar.innerHTML = `
    <div class="my-week-grid-header">${days.map((day) => {
      const hours = dailyLoad[day] || 0;
      const load = getLoadState(hours, OFFICE_CAPACITY.dailyHours);
      const width = Math.min(100, Math.round(load.ratio * 100));
      return `<div class="${day === todayIso ? 'is-today' : ''}"><span class="my-week-day-label">${escapeHtml(dayFormatter.format(new Date(`${day}T12:00:00`)))}</span><span class="my-week-day-load"><i class="my-week-load-bar load-${load.key}"><b style="width:${width}%"></b></i>${escapeHtml(formatCapacityHours(hours))} / ${escapeHtml(formatCapacityHours(OFFICE_CAPACITY.dailyHours))}</span></div>`;
    }).join('')}</div>
    <div class="my-week-grid-scroll" tabindex="0" role="region" aria-label="Scheduled work cards">
      <div class="my-week-grid-body" style="--work-card-lanes: ${laneCount}">
        ${days.map((day, index) => `<div class="my-week-day" data-week-day="${day}" style="grid-column:${index + 1}; grid-row:1 / span ${laneCount}"></div>`).join('')}
        ${placedCards.length ? placedCards.map(({ card, start, end, lane }) => cardMarkup(card, 'is-scheduled', `grid-column:${start + 1} / ${end + 2}; grid-row:${lane + 1};`)).join('') : '<div class="my-week-grid-empty" style="grid-column:1 / -1;grid-row:1;">No work cards scheduled for this week.</div>'}
      </div>
    </div>`;

  unscheduled.innerHTML = `
    <div class="my-week-unscheduled-heading">Flexible this week <span>${unscheduledCards.length}</span></div>
    ${unscheduledCards.length ? `<div class="my-week-unscheduled-list">${unscheduledCards.map((card) => cardMarkup(card, 'is-flexible')).join('')}</div>` : '<div class="my-week-empty">No undated work cards assigned to you this week.</div>'}
  `;

  focus.querySelectorAll('[data-my-week-focus-action]').forEach((button) => {
    button.addEventListener('click', () => updateMyWeekFocusStatus(button.dataset.myWeekFocusAction));
  });
  document.querySelectorAll('.my-week-card[data-work-card-id]').forEach((card) => {
    const openCard = () => openMyWeekWorkCardDialog(card.dataset.workCardId);
    card.addEventListener('click', openCard);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCard(); }
    });
  });

  setupMyWeekNavigation();
}

async function updateMyWeekFocusStatus(action) {
  const card = MY_WEEK_FOCUS;
  if (!card) return;
  const updated = await window.api.updateWorkCard({ id: card.id, ...transitionWorkCard(card, action) });
  if (!updated) return showToast('Work card status could not be updated.', { tone: 'error' });
  if (action === 'complete') await window.api.setWorkCardFocus(null);
  await loadAllData();
  await refreshAll();
}

function setupMyWeekNavigation() {
  const moveWeek = async (offset) => {
    MY_WEEK_SELECTED_START = addDaysToIsoDate(getDisplayedWeekStart(), offset * 7);
    await loadDisplayedWeekData();
    renderMyWeek();
  };
  const previous = document.getElementById('my-week-previous');
  const next = document.getElementById('my-week-next');
  const today = document.getElementById('my-week-today');
  if (previous && previous.dataset.bound !== 'true') {
    previous.dataset.bound = 'true';
    previous.addEventListener('click', () => moveWeek(-1));
  }
  if (next && next.dataset.bound !== 'true') {
    next.dataset.bound = 'true';
    next.addEventListener('click', () => moveWeek(1));
  }
  if (today && today.dataset.bound !== 'true') {
    today.dataset.bound = 'true';
    today.addEventListener('click', async () => {
      MY_WEEK_SELECTED_START = null;
      await loadDisplayedWeekData();
      renderMyWeek();
    });
  }
}

async function refreshAll() {
  renderStatsBar();
  if (isPartner()) {
    renderSidebar();
  }
  if (activeTab === 'my-projects') renderMyProjects();
  else if (activeTab === 'my-week') renderMyWeek();
  else if (activeTab === 'staff-view') renderStaffOverview();
  else renderMyTasks();
}

function updateStaffOverviewControls({ visibleStaffCount = 0, visibleProjectCount = 0 } = {}) {
  const countEl = document.getElementById('staff-overview-count');
  const searchClear = document.getElementById('staff-overview-search-clear');

  if (countEl) {
    countEl.textContent = `${visibleStaffCount} staff · ${visibleProjectCount} project${visibleProjectCount !== 1 ? 's' : ''}`;
  }
  searchClear?.classList.toggle('hidden', !staffOverviewSearchQuery.trim());
}

function toggleStaffOverviewSection(staffId, currentlyExpanded) {
  if (!staffId) return;
  STAFF_SECTION_COLLAPSE[staffId] = Boolean(currentlyExpanded);
  rememberStaffSectionCollapsePrefs();
  renderStaffOverview();
}

function setupStaffOverviewSectionToggle() {
  const container = document.getElementById('staff-overview');
  if (!container || container.dataset.sectionToggleBound === 'true') return;
  container.dataset.sectionToggleBound = 'true';

  // The rows are frequently replaced when shared data refreshes. Delegating
  // from the stable container keeps the header and its chevron interactive
  // after every re-render.
  container.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-staff-toggle]');
    if (!button || !container.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    toggleStaffOverviewSection(button.dataset.staffToggle, button.getAttribute('aria-expanded') === 'true');
  });
}

// ── Staff Overview (Partner) ────────────────────────

function getStaffProjectCards(staffId, projectId) {
  return getStaffProjectPopupCards(PROJECT_WORK_CARDS, staffId, projectId);
}

function renderStaffOverviewProjectRow(user, task) {
  const project = getProjectById(task.project_id);
  if (!project) return '';
  const cards = getStaffProjectCards(user.id, project.id);
  const summary = getProjectWorkCardSummary(cards);
  const comments = getTaskComments(task);
  const partners = getProjectPartners(project);
  const section = getProjectSection(project);
  const isOnHold = section === 'inactive' || task.priority === PRIORITY_WAIT;
  const priority = getPriorityPresentation(task);
  const canManagePriority = canCurrentUserManageTaskPriority(task);
  const priorityLabel = priority.label === '-' ? 'No project priority' : `Project priority: ${priority.label}`;
  return `
    <div class="staff-project-row ${isOnHold ? 'is-on-hold' : ''}" data-staff-project-row data-staff-id="${escapeAttr(user.id)}" data-project-id="${escapeAttr(project.id)}" data-task-id="${escapeAttr(task.id)}" tabindex="0" role="button" aria-label="Open ${escapeAttr(getProjectDisplayTitle(project))} work cards for ${escapeAttr(user.display_name)}">
      <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-staff-project-complete="${escapeAttr(task.id)}" tabindex="0" role="checkbox" aria-checked="${task.completed ? 'true' : 'false'}" aria-label="${task.completed ? 'Mark project incomplete' : 'Mark project complete'}" title="${task.completed ? 'Mark project incomplete' : 'Mark project complete'}"></div>
      <span class="staff-project-priority project-row-priority task-priority ${priority.className} ${canManagePriority ? 'task-priority-interactive' : ''}" style="${priority.inlineStyle}" ${canManagePriority ? `data-priority-task-id="${task.id}" tabindex="0" role="button"` : 'role="img"'} aria-label="${escapeAttr(priorityLabel)}" title="${escapeAttr(priorityLabel)}">${escapeHtml(priority.shortLabel ?? priority.label)}</span>
      <span class="staff-project-copy"><span class="staff-project-name">${escapeHtml(getProjectDisplayTitle(project))}</span><span class="staff-project-summary project-row-summary-${summary.tone}">${renderProjectRowSummary(summary, task)}</span></span>
      ${comments.length ? `<span class="project-row-comments" title="${comments.length} comment${comments.length === 1 ? '' : 's'}"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M14 8c0 3.314-2.686 6-6 6a5.97 5.97 0 0 1-3.5-1.126L2 14l1.126-2.5A5.97 5.97 0 0 1 2 8c0-3.314 2.686-6 6-6s6 2.686 6 6z" stroke="currentColor" stroke-width="1.2"/></svg>${comments.length}</span>` : ''}
      <span class="staff-project-partners">${partners.map((partner) => `<span class="staff-project-partner" title="Partner: ${escapeAttr(partner.display_name || '')}" style="background:${escapeAttr(partner.avatar_color || '#64748B')}">${escapeHtml(getInitials(partner))}</span>`).join('')}</span>
    </div>`;
}

function renderStaffOverview() {
  const container = document.getElementById('staff-overview');
  const isReadOnlyStaffView = !isPartner();
  let staffUsers = getActiveStaffUsers(isReadOnlyStaffView ? currentUser?.id : null);
  const query = staffOverviewSearchQuery.trim().toLowerCase();
  container.classList.toggle('staff-filtered-overview', !isReadOnlyStaffView && Boolean(selectedStaffFilter));
  container.classList.toggle('staff-readonly-overview-list', isReadOnlyStaffView);

  if (!isReadOnlyStaffView && selectedStaffFilter) {
    staffUsers = staffUsers.filter(u => u.id === selectedStaffFilter);
  }

  const getVisibleStaffTasks = (user) => {
    let tasks = getScheduledProjectsForStaff(user.id);
    if (query) {
      const matchesName = String(user.display_name || '').toLowerCase().includes(query);
      tasks = matchesName ? tasks : tasks.filter((task) => getTaskSearchText(task).includes(query));
    }
    return tasks;
  };

  const visibleTasks = staffUsers.flatMap((user) => getVisibleStaffTasks(user));
  const visibleProjectIds = new Set(visibleTasks.map((task) => task.project_id || task.id));
  updateStaffOverviewControls({
    visibleStaffCount: staffUsers.length,
    visibleProjectCount: visibleProjectIds.size,
  });

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
          <div class="staff-readonly-task-list" style="--staff-selection-count:${Math.max(selectedUsers.length, 1)}">
            ${selectedUsers.map((user) => {
              const pto = getPTOForUser(user.id);
              const tasks = getVisibleStaffTasks(user);
              const pendingCount = tasks.filter((task) => !task.completed).length;

              return `
                <section class="staff-readonly-group">
                  <div class="staff-readonly-group-header">
                    <div class="staff-readonly-group-person">
                      <div class="staff-readonly-group-avatar" style="background:${user.avatar_color}">${getInitials(user)}</div>
                      <div class="staff-readonly-group-copy">
                        <div class="staff-readonly-group-title">${escapeHtml(user.display_name)}</div>
                        <div class="staff-readonly-group-subtitle">${pendingCount} active project${pendingCount !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    ${pto ? `<span class="pto-badge">${pto.label}</span>` : ''}
                  </div>
                  <div class="staff-readonly-group-list">
                    ${tasks.length === 0 ? `
                      <div class="empty-state">
                        <div class="empty-state-text">${query ? 'No projects match this view' : 'No projects assigned'}</div>
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

        rememberReadonlyStaffSelection();
        renderStaffOverview();
      });
    });

    return;
  }

  if (!selectedStaffFilter && !query && staffUsers.length > 0 && staffUsers.every((user) => STAFF_SECTION_COLLAPSE[user.id] === true)) {
    STAFF_SECTION_COLLAPSE[staffUsers[0].id] = false;
  }

  const filteredStaffRows = staffUsers.map((user, index) => {
    const tasks = getVisibleStaffTasks(user);
    const pto = getPTOForUser(user.id);
    const { hours, load } = getStaffCapacitySummary(user.id);
    const isFiltering = Boolean(query);
    const isCollapsed = isFiltering
      ? false
      : selectedStaffFilter
        ? user.id !== selectedStaffFilter
        : (STAFF_SECTION_COLLAPSE[user.id] ?? index !== 0);

    return `
      <section class="staff-section ${isCollapsed ? '' : 'is-open'}">
        <button type="button" class="staff-section-header" data-staff-toggle="${escapeAttr(user.id)}" aria-expanded="${isCollapsed ? 'false' : 'true'}" title="${escapeAttr(user.display_name || '')}">
          <div class="avatar" style="background: ${user.avatar_color}">${escapeHtml(getInitials(user))}</div>
          <span class="staff-section-name">${escapeHtml(user.display_name)}</span>
          ${pto ? `<span class="pto-badge">${escapeHtml(pto.label)}</span>` : ''}
          <span class="staff-section-meta"><span>${tasks.length} project${tasks.length !== 1 ? 's' : ''} · ${escapeHtml(formatCapacityHours(hours))} this week</span>${renderLoadBar(hours, OFFICE_CAPACITY.weeklyHours, load)}<b class="staff-load-tag load-${load.key}" title="${escapeAttr(load.label)}">${escapeHtml(load.label)}</b></span>
          <svg class="staff-section-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="staff-section-tasks ${isCollapsed ? 'hidden' : ''}" data-staff-id="${escapeAttr(user.id)}">
          ${tasks.length === 0 ? `<div class="empty-state staff-project-empty"><div class="empty-state-text">${isFiltering ? 'No projects match this view' : 'No projects assigned'}</div></div>` : tasks.map((task) => renderStaffOverviewProjectRow(user, task)).join('')}
        </div>
      </section>`;
  }).join('');

  container.innerHTML = filteredStaffRows;

  container.querySelectorAll('[data-staff-project-complete]').forEach((checkbox) => {
    const toggle = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const task = getSharedTaskById(checkbox.dataset.staffProjectComplete);
      if (!task || !canCurrentUserEditSharedTask(task)) return;
      await applyTaskCompletionChange(task.id, task.completed ? 0 : 1);
      renderStaffOverview();
    };
    checkbox.addEventListener('click', toggle);
    checkbox.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') toggle(event);
    });
  });

  container.querySelectorAll('.staff-project-priority.task-priority-interactive').forEach((priorityBadge) => {
    priorityBadge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const task = getSharedTaskById(priorityBadge.dataset.priorityTaskId);
      if (task && canCurrentUserManageTaskPriority(task)) openPriorityMenu(priorityBadge, task);
    });
    priorityBadge.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      priorityBadge.click();
    });
  });

  container.querySelectorAll('[data-staff-project-row]').forEach((row) => {
    const open = (event) => {
      if (event?.target?.closest?.('[data-staff-project-complete], .staff-project-priority')) return;
      const user = getUserById(row.dataset.staffId);
      const project = getProjectById(row.dataset.projectId);
      if (user && project) openStaffProjectWorkCardsDialog(user, project, row, {
        openedWithKeyboard: event?.type === 'keydown',
      });
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open(event);
    });
  });
}

function renderStaffPopupWorkCard(card) {
  const category = getWorkCardCategory(card);
  const status = getWorkCardStatus(card);
  const isPaused = status === 'in_progress' && Boolean(card.paused);
  const dateChip = getDateChip(card);
  const statusLabel = status === 'done' ? 'Done' : isPaused ? 'Paused' : status === 'in_progress' ? 'In progress' : 'To do';
  const statusClass = status === 'done' ? 'done' : isPaused ? 'paused' : status === 'in_progress' ? 'in-progress' : 'todo';
  return `<article class="staff-popup-work-card ${status === 'done' ? 'is-done' : ''}" style="--work-card-category-color:${escapeAttr(category.color)}">
    <div class="staff-popup-work-card-category"><i aria-hidden="true"></i>${escapeHtml(category.label)}</div>
    <div class="staff-popup-work-card-title">${escapeHtml(card.title)}</div>
    <div class="staff-popup-work-card-chips">
      <span class="work-card-chip ${dateChip.tone === 'soon' ? 'work-card-chip-soon' : dateChip.tone === 'done' ? 'work-card-chip-done' : ''}">${escapeHtml(dateChip.label)}</span>
      ${card.planned_minutes ? `<span class="work-card-chip">${escapeHtml(workCardPlannedLabel(card))}</span>` : ''}
      <span class="work-card-chip staff-popup-status-${statusClass}">${escapeHtml(statusLabel)}</span>
    </div>
  </article>`;
}

function openStaffProjectWorkCardsDialog(staffUser, project, opener, { openedWithKeyboard = false } = {}) {
  document.getElementById('staff-project-work-cards-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'staff-project-work-cards-overlay';
  overlay.className = 'dialog-overlay staff-project-work-cards-overlay';
  const dialogId = `staff-project-work-cards-title-${String(project.id).replace(/[^a-z0-9_-]/gi, '')}`;
  let dialogElement = null;
  const returnFocus = () => {
    const liveRow = document.querySelector(`[data-staff-project-row][data-staff-id="${CSS.escape(String(staffUser.id))}"][data-project-id="${CSS.escape(String(project.id))}"]`);
    (liveRow || opener)?.focus?.({ preventScroll: true });
  };
  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
    setTimeout(returnFocus, 0);
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.disabled && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogElement)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const renderList = () => {
    const cards = getStaffProjectCards(staffUser.id, project.id);
    const activeHours = getWorkCardWeeklyHours(cards);
    const partners = getProjectPartners(project);
    const partner = partners[0];
    const isOnHold = getProjectSection(project) === 'inactive';
    overlay.innerHTML = `
      <div class="dialog-card staff-project-work-cards-dialog" role="dialog" aria-modal="true" aria-labelledby="${dialogId}" tabindex="-1">
        <div class="dialog-header staff-project-popup-header">
          <div><h3 class="dialog-title" id="${dialogId}">${escapeHtml(getProjectDisplayTitle(project))}</h3><div class="staff-project-popup-person"><span class="staff-project-partner" style="background:${escapeAttr(staffUser.avatar_color || '#64748B')}">${escapeHtml(getInitials(staffUser))}</span>${escapeHtml(staffUser.display_name)}'s work cards</div></div>
          <button class="detail-close" type="button" data-staff-popup-close aria-label="Close work cards">&times;</button>
        </div>
        <div class="staff-project-popup-tags"><span>${cards.length} card${cards.length === 1 ? '' : 's'}</span><span>${escapeHtml(formatCapacityHours(activeHours))} planned</span>${partner ? `<span title="Partner: ${escapeAttr(partner.display_name || '')}">Partner: ${escapeHtml(partner.display_name || '')}</span>` : ''}</div>
        <div class="dialog-body staff-project-popup-body">
          ${cards.length ? cards.map(renderStaffPopupWorkCard).join('') : `<div class="staff-project-popup-empty"><strong>No work cards yet</strong><p>${isOnHold ? 'This project is on hold. Add a card when work is ready to resume.' : 'Break this project into cards with an owner, hours and dates.'}</p></div>`}
        </div>
        <div class="dialog-footer"><button class="btn btn-ghost" type="button" data-staff-popup-close>Close</button>${isPartner() ? '<button class="btn btn-primary" type="button" data-staff-popup-add>Add Task</button>' : ''}</div>
      </div>`;
    overlay.querySelectorAll('[data-staff-popup-close]').forEach((button) => button.addEventListener('click', close));
    overlay.querySelector('[data-staff-popup-add]')?.addEventListener('click', renderForm);
    dialogElement = overlay.querySelector('.staff-project-work-cards-dialog');
    const closeButton = overlay.querySelector('[data-staff-popup-close]');
    (openedWithKeyboard ? closeButton : dialogElement)?.focus();
  };

  const renderForm = () => {
    const categoryOptions = WORK_CARD_CATEGORIES.map((category) => `<option value="${escapeAttr(category.id)}">${escapeHtml(category.label)}</option>`).join('');
    overlay.innerHTML = `
      <div class="dialog-card staff-project-work-cards-dialog" role="dialog" aria-modal="true" aria-labelledby="${dialogId}" tabindex="-1">
        <div class="dialog-header staff-project-popup-header"><div><h3 class="dialog-title" id="${dialogId}">Add task</h3><p class="dialog-subtitle">${escapeHtml(getProjectDisplayTitle(project))}</p></div><button class="detail-close" type="button" data-staff-popup-close aria-label="Close add task">&times;</button></div>
        <form class="dialog-body staff-project-popup-form" id="staff-project-popup-form">
          <div class="staff-project-popup-assigned"><span class="staff-project-partner" style="background:${escapeAttr(staffUser.avatar_color || '#64748B')}">${escapeHtml(getInitials(staffUser))}</span><span><strong>${escapeHtml(staffUser.display_name)}</strong><small>${escapeHtml(project.client || project.name || '')}</small></span></div>
          <label class="detail-field" for="staff-popup-card-title"><span class="detail-field-label">Title</span><input class="input" id="staff-popup-card-title" name="title" required aria-describedby="staff-popup-title-error"></label>
          <div class="staff-popup-validation" id="staff-popup-title-error" aria-live="polite"></div>
          <label class="detail-field" for="staff-popup-card-category"><span class="detail-field-label">Category</span><select class="input" id="staff-popup-card-category" name="category">${categoryOptions}</select></label>
          <label class="detail-field" for="staff-popup-card-description"><span class="detail-field-label">Description</span><textarea class="input" id="staff-popup-card-description" name="description" rows="3"></textarea></label>
          <div class="staff-project-popup-form-grid"><label class="detail-field" for="staff-popup-card-hours"><span class="detail-field-label">Planned hours</span><input class="input" id="staff-popup-card-hours" name="hours" type="number" min="0.5" step="0.5" value="4"></label><label class="detail-field" for="staff-popup-card-start"><span class="detail-field-label">Start date</span><input class="input" id="staff-popup-card-start" name="start" type="date"></label><label class="detail-field" for="staff-popup-card-end"><span class="detail-field-label">End date</span><input class="input" id="staff-popup-card-end" name="end" type="date"></label></div>
        </form>
        <div class="dialog-footer"><button class="btn btn-ghost" type="button" data-staff-popup-cancel>Cancel</button><button class="btn btn-primary" type="submit" form="staff-project-popup-form">Add Task</button></div>
      </div>`;
    dialogElement = overlay.querySelector('.staff-project-work-cards-dialog');
    overlay.querySelectorAll('[data-staff-popup-close]').forEach((button) => button.addEventListener('click', close));
    overlay.querySelector('[data-staff-popup-cancel]')?.addEventListener('click', renderList);
    const form = overlay.querySelector('#staff-project-popup-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const titleInput = form.elements.title;
      const titleError = overlay.querySelector('#staff-popup-title-error');
      const title = String(titleInput.value || '').trim();
      if (!title) {
        titleError.textContent = 'Please enter a title.';
        titleInput.focus();
        return;
      }
      titleError.textContent = '';
      const dates = normalizeWorkCardDates(form.elements.start.value, form.elements.end.value);
      const plannedHours = Math.max(0.5, Number(form.elements.hours.value) || 4);
      const result = await window.api.createWorkCard({
        project_id: project.id,
        week_of: getDisplayedWeekStart(),
        title,
        description: String(form.elements.description.value || '').trim(),
        category_id: form.elements.category.value,
        planned_minutes: Math.round(plannedHours * 60),
        start_date: dates.start_date,
        end_date: dates.end_date,
        assignee_ids: [staffUser.id],
        status: 'todo',
        paused: 0,
      });
      if (!result) return showToast('Work card could not be added.', { tone: 'error' });
      await loadAllData();
      await refreshAll();
      renderList();
      showToast(`Task added for ${String(staffUser.display_name || '').split(/\s+/)[0]}.`, { tone: 'success' });
    });
    overlay.querySelector('#staff-popup-card-title')?.focus();
  };

  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeydown);
  renderList();
}

// ── Add Task to Staff (project picker, non-editable title) ──

// ── Detail Panel ────────────────────────────────────

function showDetailEmptyState() {
  ACTIVE_PROJECT_FOLDER_EDIT = null;
  ACTIVE_PROJECT_DETAIL_DRAFT = null;
  OPEN_COMMENT_DRAWER_TASK_ID = null;
  setDetailDrawerOpen(false);
  document.getElementById('detail-header').innerHTML = `
    <h3 class="detail-title" id="detail-title">Task Details</h3>
  `;
  const detailBody = document.getElementById('detail-body');
  detailBody.className = 'detail-body';
  detailBody.innerHTML = `
    <div class="detail-empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
      <span>Select a task for details</span>
    </div>
  `;
}

function renderTaskCommentItems(comments) {
  if (comments.length === 0) {
    return '<div class="detail-empty-copy">No comments yet</div>';
  }

  return comments.map((comment) => {
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
          <div class="comment-meta">${escapeHtml(isOwnComment ? 'You' : authorName)} &middot; ${escapeHtml(formatClockTime(comment.created_at) || timeAgo(comment.created_at))}</div>
        </div>
        ${isOwnComment ? `<span class="avatar-mini comment-own-avatar" style="background:${authorColor}">${authorInitials}</span>` : ''}
      </div>
    `;
  });

}

function renderTaskCommentsDrawer(comments) {
  return `
    <aside class="detail-comments-drawer" aria-label="Task comments">
      <div class="detail-comments-drawer-header">
        <div>
          <div class="detail-comments-drawer-title">Comments</div>
          <div class="detail-comments-drawer-subtitle">${comments.length === 1 ? '1 message' : `${comments.length} messages`}</div>
        </div>
        <button class="detail-close" id="close-comments-drawer" type="button" aria-label="Close comments">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="comment-list-scroll">
        <div class="comment-list">
          ${renderTaskCommentItems(comments)}
        </div>
      </div>
      <button class="comment-jump-btn hidden" id="comment-jump-btn" type="button">New message</button>
      <div class="comment-input-row">
        <textarea placeholder="Message the team..." rows="1" id="comment-textarea"></textarea>
        <button class="btn btn-primary btn-sm" id="send-comment-btn">Send</button>
      </div>
    </aside>
  `;
}

async function openDetailPanel(taskId) {
  if (!(await confirmDiscardProjectDetailChanges())) return false;
  selectedProjectId = null;
  // Look in both regular and private tasks
  let task = TASKS.find(t => String(t.id) === String(taskId));
  const isPrivateTask = !task;
  if (!task) task = PRIVATE_TASKS.find(t => String(t.id) === String(taskId));
  if (!task) {
    selectedTaskId = null;
    setDetailDrawerOpen(false);
    return;
  }

  selectedTaskId = task.id;
  rememberLastViewedTask(task.id);
  if (task.project_id) rememberLastViewedProject(task.project_id);

  document.querySelectorAll('.task-card').forEach(c => c.classList.toggle('selected', String(c.dataset.taskId) === String(taskId)));
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
  const isCommentDrawerOpen = !isPrivateTask && String(OPEN_COMMENT_DRAWER_TASK_ID) === String(taskId);
  const priorityHTML = priority.isUnset
    ? `<span class="task-priority detail-task-priority ${priority.className}" style="${priority.inlineStyle}" role="img" aria-label="No priority set" title="No priority set"></span>`
    : `<span class="task-priority detail-task-priority ${priority.className}" style="${priority.inlineStyle}">${priority.label}</span>`;
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

  const detailFullTitle = displayTitle || task.title || 'Task Details';
  const header = document.getElementById('detail-header');
  header.innerHTML = `
    <div class="detail-header-copy">
      <h3 class="detail-title" id="detail-title" title="${escapeAttr(detailFullTitle)}">${escapeHtml(detailFullTitle)}</h3>
      <div class="detail-subtitle ${task.notes ? '' : 'is-empty'}">${task.notes ? escapeHtml(task.notes) : '&nbsp;'}</div>
    </div>
    <div class="detail-header-actions">
      ${!isPrivateTask ? `
        <button class="detail-comments-toggle ${comments.length > 0 ? 'has-comments' : ''} ${isCommentDrawerOpen ? 'active' : ''}" id="detail-comments-toggle" type="button" aria-label="Open comments (${comments.length})" title="Comments">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
          </svg>
          <span class="detail-comments-count">${comments.length}</span>
        </button>
      ` : ''}
    </div>
  `;

  document.getElementById('detail-comments-toggle')?.addEventListener('click', () => {
    OPEN_COMMENT_DRAWER_TASK_ID = isCommentDrawerOpen ? null : taskId;
    if (String(OPEN_COMMENT_DRAWER_TASK_ID) === String(taskId)) {
      FORCE_COMMENT_SCROLL_TASK_ID = taskId;
      rememberCommentDrawerTask(taskId);
    } else {
      forgetCommentDrawerTask();
    }
    openDetailPanel(taskId);
  });

  const detailBody = document.getElementById('detail-body');
  detailBody.className = 'detail-body';
  Motion.swap(detailBody, `task:${taskId}`); // a different task rises in; a refresh of the same one does not
  detailBody.innerHTML = `
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
          ${renderProjectFolderCard(project, canManageFolder, {
            editState: ACTIVE_PROJECT_FOLDER_EDIT,
            getProjectDisplayTitle,
          })}
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
          <div class="task-checkbox ${subtask.completed ? 'checked' : ''}" data-subtask-id="${subtask.id}" tabindex="0" role="checkbox" aria-checked="${subtask.completed ? 'true' : 'false'}" aria-label="${subtask.completed ? 'Mark action item incomplete' : 'Mark action item complete'}"></div>
          ${renderActionItemContent(subtask)}
          ${renderActionItemAssignees(subtask)}
        </div>
      `).join('')}
      ${canManageThisTask ? '<button class="detail-add-link" id="add-subtask-btn" type="button">+ Add action item</button>' : ''}
    </section>

    ${isCommentDrawerOpen ? renderTaskCommentsDrawer(comments) : ''}
  `;
  setDetailDrawerOpen(true);

  const panel = document.getElementById('detail-panel');
  const commentScroll = panel.querySelector('.comment-list-scroll');
  const commentJumpBtn = panel.querySelector('#comment-jump-btn');

  document.getElementById('close-comments-drawer')?.addEventListener('click', () => {
    OPEN_COMMENT_DRAWER_TASK_ID = null;
    forgetCommentDrawerTask();
    openDetailPanel(taskId);
  });

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
    checkbox.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      checkbox.click();
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
      await applyTaskStatusChange(task.id, nextStatus);
    });
  });

  document.getElementById('send-comment-btn')?.addEventListener('click', async () => {
    const textarea = document.getElementById('comment-textarea');
    const body = textarea.value.trim();
    if (!body) return;
    const button = document.getElementById('send-comment-btn');
    await runUiAction(async () => {
      FORCE_COMMENT_SCROLL_TASK_ID = taskId;
      OPEN_COMMENT_DRAWER_TASK_ID = taskId;
      rememberCommentDrawerTask(taskId);
      await window.api.addComment({
        task_id: taskId,
        author_id: currentUser.id,
        body,
      });
      await loadAllData();
      await openDetailPanel(taskId);
      await refreshAll();
    }, {
      button,
      pendingLabel: 'Sending...',
      errorMessage: 'Comment could not be sent.',
    });
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
    window.api.openProjectNotesWindow(project.id);
  });

  document.getElementById('add-subtask-btn')?.addEventListener('click', () => {
    openAddSubtaskDialog(task);
  });

  bindProjectFolderLinkControls({
    project,
    canManageFolder,
    refreshTaskId: taskId,
    renderPanel: () => openDetailPanel(taskId),
    setEditState: (nextEditState) => { ACTIVE_PROJECT_FOLDER_EDIT = nextEditState; },
    refreshAfterProjectChange,
    positionMenu,
  });
}

// ── Add Subtask Dialog ──────────────────────────────

function openActionItemContextMenu(event, task, subtask, options = {}) {
  const items = [
    {
      label: 'Edit Action Item',
      action: () => openAddSubtaskDialog(task, subtask, options)
    },
    {
      label: 'Assign To...',
      action: () => openAddSubtaskDialog(task, subtask, { ...options, focusAssignees: true })
    },
  ];

  items.push({ divider: true });
  items.push({
    label: 'Delete Action Item',
    danger: true,
    action: async () => {
      const confirmed = await window.MyTasksConfirmDialog.show({
        title: 'Delete action item?',
        message: `Delete action item "${subtask.title}"?`,
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (!confirmed) return;
      await window.api.deleteSubTask(subtask.id);
      await loadAllData();
      await refreshAll();
      if (options.returnToProjectId) {
        await openProjectDetailPanel(options.returnToProjectId);
      } else {
        await openDetailPanel(task.id);
      }
    }
  });

  const menu = ContextMenu.create(items);
  positionMenu(menu, event.clientX, event.clientY);
}

function getPreferredActionItemAssigneeIds(task, subtask = null) {
  const currentIds = getSubtaskAssigneeIds(subtask);
  if (currentIds.length) return currentIds;

  if (task.assigned_to) return [task.assigned_to];
  if (task.owner_id) return [task.owner_id];
  return [];
}

function renderActionItemAssigneeChips(assigneeOptions, selectedAssigneeIds) {
  const selectedUsers = assigneeOptions.filter((user) => selectedAssigneeIds.has(user.id));
  if (!selectedUsers.length) return '<span class="action-item-assignee-empty">Unassigned</span>';

  return selectedUsers.map((user) => `
    <button class="action-item-assignee-chip" type="button" data-remove-action-item-assignee="${user.id}" title="Remove ${escapeAttr(user.display_name)}">
      <span class="dialog-checklist-avatar" style="background:${user.avatar_color}">${escapeHtml(getInitials(user))}</span>
      <span>${escapeHtml(user.display_name)}</span>
      <span class="action-item-assignee-chip-remove" aria-hidden="true">×</span>
    </button>
  `).join('');
}

function renderActionItemAssigneeResults(assigneeOptions, selectedAssigneeIds, query = '') {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingUsers = assigneeOptions.filter((user) => (user.display_name || '').toLocaleLowerCase().includes(normalizedQuery));
  if (!matchingUsers.length) return '<div class="detail-empty-copy">No people found.</div>';

  return matchingUsers.map((user) => {
    const selected = selectedAssigneeIds.has(user.id);
    return `
      <button class="action-item-assignee-option ${selected ? 'selected' : ''}" type="button" data-action-item-assignee="${user.id}" aria-pressed="${selected ? 'true' : 'false'}">
        <span class="dialog-checklist-avatar" style="background:${user.avatar_color}">${escapeHtml(getInitials(user))}</span>
        <span class="action-item-assignee-option-name">${escapeHtml(user.display_name)}</span>
        <span class="action-item-assignee-option-check" aria-hidden="true">${selected ? '✓' : ''}</span>
      </button>
    `;
  }).join('');
}

function openAddSubtaskDialog(task, subtask = null, options = {}) {
  if (!canCurrentUserAddActionItems(task)) return;

  const overlay = document.getElementById('add-subtask-overlay');
  const ownerTask = getTaskThreadOwner(task) || task;
  const titleInput = document.getElementById('add-subtask-title');
  const notesInput = document.getElementById('add-subtask-notes');
  const dueDateInput = document.getElementById('add-subtask-due-date');
  const assigneeChips = document.getElementById('add-subtask-assignee-chips');
  const assigneeSearch = document.getElementById('add-subtask-assignee-search');
  const assigneeResults = document.getElementById('add-subtask-assignee-results');
  const saveButton = document.getElementById('add-subtask-save');
  const assigneeOptions = getActionItemAssigneeOptions(task);
  const selectedAssigneeIds = new Set(
    getPreferredActionItemAssigneeIds(task, subtask).filter((id) => assigneeOptions.some((user) => user.id === id))
  );
  let assigneeQuery = '';

  const refreshAssigneePicker = () => {
    assigneeChips.innerHTML = renderActionItemAssigneeChips(assigneeOptions, selectedAssigneeIds);
    assigneeResults.innerHTML = renderActionItemAssigneeResults(assigneeOptions, selectedAssigneeIds, assigneeQuery);
  };

  overlay.classList.remove('hidden');
  document.getElementById('add-subtask-subtitle').textContent = task.title;
  saveButton.textContent = subtask ? 'Save Action Item' : 'Add Action Item';
  titleInput.value = subtask?.title || '';
  notesInput.value = subtask?.notes || '';
  dueDateInput.value = subtask?.due_date || '';
  assigneeSearch.value = '';
  refreshAssigneePicker();

  assigneeChips.onclick = (event) => {
    const button = event.target.closest('[data-remove-action-item-assignee]');
    if (!button) return;
    selectedAssigneeIds.delete(button.dataset.removeActionItemAssignee);
    refreshAssigneePicker();
  };
  assigneeResults.onclick = (event) => {
    const button = event.target.closest('[data-action-item-assignee]');
    if (!button) return;
    const userId = button.dataset.actionItemAssignee;
    if (selectedAssigneeIds.has(userId)) selectedAssigneeIds.delete(userId);
    else selectedAssigneeIds.add(userId);
    refreshAssigneePicker();
  };
  assigneeSearch.oninput = () => {
    assigneeQuery = assigneeSearch.value;
    refreshAssigneePicker();
  };
  document.getElementById('add-subtask-assign-me').onclick = () => {
    if (currentUser?.id && assigneeOptions.some((user) => user.id === currentUser.id)) {
      selectedAssigneeIds.add(currentUser.id);
      refreshAssigneePicker();
    }
  };
  document.getElementById('add-subtask-use-task-assignee').onclick = () => {
    selectedAssigneeIds.clear();
    if (task.assigned_to && assigneeOptions.some((user) => user.id === task.assigned_to)) {
      selectedAssigneeIds.add(task.assigned_to);
    }
    refreshAssigneePicker();
  };
  document.getElementById('add-subtask-clear-assignees').onclick = () => {
    selectedAssigneeIds.clear();
    refreshAssigneePicker();
  };

  const focusTarget = options.focusAssignees ? assigneeSearch : titleInput;
  setTimeout(() => focusTarget?.focus(), 50);

  const close = () => {
    document.removeEventListener('keydown', escHandler);
    overlay.classList.add('hidden');
  };
  document.getElementById('add-subtask-close').onclick = close;
  document.getElementById('add-subtask-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  saveButton.onclick = async () => {
    if (!requireTextInput(titleInput, 'Enter an action item title.')) return;
    const title = titleInput.value.trim();
    const notes = notesInput.value.trim();
    const due_date = dueDateInput.value || null;
    const nextAssignedIds = assigneeOptions
      .filter((user) => selectedAssigneeIds.has(user.id))
      .map((user) => user.id);

    const outcome = await runUiAction(async () => {
      const payload = {
        title,
        notes,
        due_date,
        assigned_to: nextAssignedIds[0] || null,
        assigned_to_ids: nextAssignedIds,
      };
      if (subtask) {
        await window.api.updateSubTask({ id: subtask.id, ...payload });
      } else {
        await window.api.createSubTask({ task_id: ownerTask.id, ...payload });
      }

      await loadAllData();
      await refreshAll();
      if (options.returnToProjectId) await openProjectDetailPanel(options.returnToProjectId);
      else await openDetailPanel(task.id);
    }, {
      button: saveButton,
      pendingLabel: 'Saving...',
      successMessage: subtask ? 'Action item saved.' : 'Action item added.',
      errorMessage: 'Action item could not be saved.',
    });
    if (outcome.ok) close();
  };

  const escHandler = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', escHandler);
}

function getWorkCardCategory(card) {
  return WORK_CARD_CATEGORIES.find((item) => item.id === card.category_id)
    || WORK_CARD_CATEGORIES.find((item) => item.id === 'work-card-planning')
    || { id: 'work-card-planning', label: 'Planning', color: '#4A5FE0' };
}

function getProjectLeadUsers(project) {
  if (!project?.id) return [];
  const leadIds = [...new Set(TASKS
    .filter((task) => String(task.project_id || '') === String(project.id) && task.lead_id)
    .map((task) => task.lead_id))];
  return leadIds
    .map((leadId) => getUserById(leadId))
    .filter((user) => user && user.role === 'staff' && (user.is_senior_staff === 1 || user.is_senior_staff === true));
}

// Work-card avatars receive a display-name string. Keep this separate from the
// application-wide getInitials(user) helper above; that helper is also used by
// project partner and staff badges throughout MyTasks.
function getWorkCardInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—';
}

function workCardHoursChip(card) {
  const plannedHours = Number(card.planned_minutes || 0) / 60;
  return plannedHours > 0 ? `${Number.isInteger(plannedHours) ? plannedHours : plannedHours.toFixed(2)}h planned` : 'No hours set';
}

function renderProjectWorkCard(card, focusCard) {
  const category = getWorkCardCategory(card);
  const status = getWorkCardStatus(card);
  const isPaused = status === 'in_progress' && Boolean(card.paused);
  const isAssigned = card.assignee_ids?.includes(currentUser?.id);
  const canManage = isPartner();
  const primaryAssignee = card.assignees?.[0] || null;
  const lead = getProjectLeadUsers(getProjectById(card.project_id))[0] || null;
  const leadLabel = `Lead: ${getLastName(lead)}`;
  const dateChip = getDateChip(card);
  const schedule = getScheduleProgress(card);
  const isFocus = focusCard?.id === card.id;
  const primaryAction = status === 'todo'
    ? `<button class="work-card-primary" type="button" data-work-card-action="start" data-work-card-id="${escapeAttr(card.id)}">Start</button>`
    : status === 'in_progress' && isPaused
      ? `<button class="work-card-primary work-card-primary-resume" type="button" data-work-card-action="resume" data-work-card-id="${escapeAttr(card.id)}">Resume</button>`
      : status === 'in_progress'
        ? `<button class="work-card-pause" type="button" data-work-card-action="pause" data-work-card-id="${escapeAttr(card.id)}" aria-label="Pause ${escapeAttr(card.title)}" title="Pause task">❚❚</button><button class="work-card-primary work-card-primary-complete" type="button" data-work-card-action="complete" data-work-card-id="${escapeAttr(card.id)}">Complete</button>`
        : `<button class="work-card-primary work-card-primary-ghost" type="button" data-work-card-action="reopen" data-work-card-id="${escapeAttr(card.id)}">Reopen</button>`;
  const activityLabel = status === 'done'
    ? 'Completed'
    : isPaused
      ? 'Paused'
      : status === 'in_progress'
        ? 'Active'
        : 'Not Started';
  const activityBadge = `<span class="work-card-activity-badge work-card-activity-${escapeAttr(status)}${isPaused ? ' is-paused' : ''}">${activityLabel}</span>`;

  return `<article class="project-work-card project-work-card-status-${escapeAttr(status)} ${isPaused ? 'is-paused' : ''} ${isFocus ? 'is-active' : ''}" tabindex="0" data-work-card-id="${escapeAttr(card.id)}" style="--work-card-category-color:${escapeAttr(category.color)}">
    <div class="project-work-card-topline">
      <span class="project-work-card-category"><i aria-hidden="true"></i>${escapeHtml(category.label)}</span>
      <button class="work-card-overflow" type="button" data-work-card-menu="${escapeAttr(card.id)}" aria-label="More actions for ${escapeAttr(card.title)}" aria-expanded="false" title="More actions">…</button>
    </div>
    <strong class="project-work-card-title">${escapeHtml(card.title)}</strong>
    ${card.description ? `<div class="project-work-card-copy">${escapeHtml(card.description)}</div>` : ''}
    <div class="project-work-card-chips">
      <span class="work-card-chip work-card-chip-${escapeAttr(dateChip.tone)}">${escapeHtml(dateChip.label)}</span>
      <span class="work-card-chip">${escapeHtml(workCardHoursChip(card))}</span>
      ${isPaused ? '<span class="work-card-chip work-card-chip-paused">Paused</span>' : ''}
    </div>
    <div class="work-card-progress ${schedule.isLate ? 'is-late' : ''}" aria-label="Schedule progress ${schedule.percent}%"><i style="width:${schedule.percent}%"></i></div>
    <div class="project-work-card-footer">
      <span class="work-card-avatar" title="${escapeAttr(primaryAssignee?.display_name || 'Unassigned')}">${escapeHtml(getWorkCardInitials(primaryAssignee?.display_name))}</span>
      <span class="work-card-lead" title="${escapeAttr(lead ? `Project Lead: ${lead.display_name}` : 'Project Lead: None')}">${escapeHtml(leadLabel)}</span>
      <span class="work-card-footer-actions">${isAssigned ? primaryAction : activityBadge}</span>
    </div>
    <div class="work-card-menu hidden" data-work-card-menu-panel="${escapeAttr(card.id)}" role="menu" aria-label="Actions for ${escapeAttr(card.title)}">
      ${canManage ? `<button type="button" role="menuitem" data-work-card-action="edit" data-work-card-id="${escapeAttr(card.id)}">Edit</button><button type="button" role="menuitem" data-work-card-action="duplicate" data-work-card-id="${escapeAttr(card.id)}">Duplicate</button>` : ''}
      ${isAssigned && status === 'in_progress' ? `<button type="button" role="menuitem" data-work-card-action="stop" data-work-card-id="${escapeAttr(card.id)}">Stop and return to To do</button>${isPaused ? `<button type="button" role="menuitem" data-work-card-action="complete" data-work-card-id="${escapeAttr(card.id)}">Mark complete</button>` : ''}` : ''}
      ${canManage ? `<button type="button" role="menuitem" class="work-card-menu-danger" data-work-card-action="delete" data-work-card-id="${escapeAttr(card.id)}">Delete</button>` : ''}
    </div>
  </article>`;
}

function renderProjectWorkCards(cards, focusCard, { canManage = false, doneExpanded = false } = {}) {
  if (cards.length === 0) {
    return `
      <div class="project-work-card-empty-state">
        <strong>No work cards yet</strong>
        <p>Break this project into cards with an owner, hours and dates.</p>
        ${canManage ? '<button class="btn btn-primary btn-sm" type="button" data-project-add-work-card>+ Add work card</button>' : ''}
      </div>
    `;
  }

  const columns = [
    ['todo', 'To do'],
    ['in_progress', 'In progress'],
    ['done', 'Done'],
  ];
  return `<div class="project-work-card-board-wrap">
    <div class="project-work-card-board">
      ${columns.map(([status, label]) => {
        const columnCards = cards.filter((card) => getWorkCardStatus(card) === status);
        if (status === 'done') {
          const doneToggle = columnCards.length > 0 ? `
            <button class="work-card-done-toggle" type="button" data-work-card-done-toggle aria-expanded="${doneExpanded ? 'true' : 'false'}" aria-label="${doneExpanded ? 'Hide' : 'Show'} completed work cards">
              <span>${label}</span><b>${columnCards.length}</b>
              <svg class="work-card-done-chevron ${doneExpanded ? 'is-open' : ''}" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>`
            : `<div class="work-card-done-empty"><span>${label}</span><em>No cards</em><b>0</b></div>`;
          return `<section class="work-card-column work-card-column-done ${doneExpanded ? 'is-expanded' : 'is-folded'}" aria-label="${label}">
            <header>${doneToggle}</header>
            ${doneExpanded ? `<div class="work-card-column-body">${columnCards.map((card) => renderProjectWorkCard(card, focusCard)).join('')}</div>` : ''}
          </section>`;
        }
        return `<section class="work-card-column ${columnCards.length ? '' : 'is-empty'}" aria-label="${label}">
          <header><span>${label}</span><b>${columnCards.length}</b></header>
          <div class="work-card-column-body">${columnCards.length ? columnCards.map((card) => renderProjectWorkCard(card, focusCard)).join('') : '<div class="work-card-column-empty">No cards</div>'}</div>
        </section>`;
      }).join('')}
    </div>
  </div>`;
}

function openWorkCardEditor(project, participants, card = null) {
  if (!isPartner() || !project) return;
  const availablePeople = participants || [];
  const selectedIds = new Set(card?.assignee_ids || availablePeople.map((person) => person.id));
  const selectedCategoryId = card?.category_id || 'work-card-planning';
  const categoryOptions = WORK_CARD_CATEGORIES.map((category) => `<option value="${escapeAttr(category.id)}" ${selectedCategoryId === category.id ? 'selected' : ''}>${escapeHtml(category.label)}</option>`).join('');
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog-card work-card-editor" role="dialog" aria-modal="true" aria-labelledby="work-card-editor-title">
      <div class="dialog-header">
        <div>
          <h3 class="dialog-title" id="work-card-editor-title">${card ? 'Edit work card' : 'Add work card'}</h3>
          <p class="dialog-subtitle">${escapeHtml(getProjectDisplayTitle(project))}</p>
        </div>
        <button class="detail-close" type="button" data-work-card-cancel aria-label="Close">&times;</button>
      </div>
      <form class="dialog-body work-card-editor-form" id="work-card-editor-form">
        <label class="detail-field"><span class="detail-field-label">Title</span><input class="input" name="title" required value="${escapeAttr(card?.title || '')}" placeholder="What needs to be done?"></label>
        <label class="detail-field"><span class="detail-field-label">Description</span><textarea class="input" name="description" rows="2" placeholder="Optional context">${escapeHtml(card?.description || '')}</textarea></label>
        <div class="work-card-editor-grid">
          <label class="detail-field"><span class="detail-field-label">Type</span><select class="input" name="categoryId" required>${categoryOptions}</select></label>
          <label class="detail-field"><span class="detail-field-label">Allotted time (hours)</span><input class="input" name="plannedHours" type="number" min="0" step="0.25" value="${card?.planned_minutes ? escapeAttr(String(card.planned_minutes / 60)) : ''}"></label>
          <label class="detail-field"><span class="detail-field-label">Start date</span><input class="input" name="startDate" type="date" value="${escapeAttr(card?.start_date || '')}"></label>
          <label class="detail-field"><span class="detail-field-label">End date</span><input class="input" name="endDate" type="date" value="${escapeAttr(card?.end_date || '')}"></label>
        </div>
        <fieldset class="work-card-assignee-fieldset"><legend>Assign to project staff</legend>
          ${availablePeople.length ? availablePeople.map((person) => `<label class="work-card-assignee-option"><input type="checkbox" name="assignee" value="${escapeAttr(person.id)}" ${selectedIds.has(person.id) ? 'checked' : ''}> ${escapeHtml(person.display_name)}</label>`).join('') : '<span class="detail-empty-copy">No current project assignments are available yet.</span>'}
        </fieldset>
        ${card ? `<label class="detail-field"><span class="detail-field-label">Status</span><select class="input" name="status"><option value="todo" ${getWorkCardStatus(card) === 'todo' ? 'selected' : ''}>To do</option><option value="in_progress" ${getWorkCardStatus(card) === 'in_progress' ? 'selected' : ''}>In progress</option><option value="done" ${getWorkCardStatus(card) === 'done' ? 'selected' : ''}>Done</option></select></label>` : ''}
        <div class="dialog-actions"><button class="btn btn-secondary" type="button" data-work-card-cancel>Cancel</button><button class="btn btn-accent" type="submit">${card ? 'Save work card' : 'Add work card'}</button></div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-work-card-cancel]').forEach((button) => button.addEventListener('click', close));
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  const form = overlay.querySelector('#work-card-editor-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const plannedHours = String(formData.get('plannedHours') || '').trim();
    const data = {
      project_id: project.id,
      week_of: card?.week_of || getCurrentWeekStartString(),
      title: String(formData.get('title') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      category_id: formData.get('categoryId') || null,
      status: formData.get('status') || (card ? getWorkCardStatus(card) : 'todo'),
      planned_minutes: plannedHours ? Math.round(Number(plannedHours) * 60) : null,
      start_date: formData.get('startDate') || null,
      end_date: formData.get('endDate') || null,
      assignee_ids: formData.getAll('assignee'),
    };
    if (!data.title) return;
    const submit = form.querySelector('[type="submit"]');
    try {
      if (card) await window.api.updateWorkCard({ ...data, id: card.id });
      else await window.api.createWorkCard(data);
      close();
      await loadAllData();
      await openProjectDetailPanel(project.id);
      if (activeTab === 'my-week') renderMyWeek();
      showToast(card ? 'Work card saved.' : 'Work card added.', { tone: 'success' });
    } catch (error) {
      console.error('Unable to save work card:', error);
      showToast(error?.message || 'Work card could not be saved.', { tone: 'error' });
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  });
  overlay.querySelector('[name="title"]')?.focus();
}

// ── Project Notes Dialog ────────────────────────────

async function openProjectDetailPanel(projectId) {
  if (hasUnsavedProjectDetailChanges()
    && String(projectId) === String(ACTIVE_PROJECT_DETAIL_DRAFT?.projectId)) {
    return false;
  }
  if (!(await confirmDiscardProjectDetailChanges(projectId))) return false;
  const project = getProjectById(projectId);
  if (!project) return;
  const switchingProjects = String(selectedProjectId || '') !== String(project.id);
  if (switchingProjects) WORK_CARD_DONE_EXPANDED_PROJECT_ID = null;

  const projectDetailTab = ACTIVE_PROJECT_DETAIL_TAB.projectId === project.id
    ? ACTIVE_PROJECT_DETAIL_TAB.tab
    : 'work-cards';

  selectedProjectId = projectId;
  rememberLastViewedProject(projectId);
  selectedTaskId = null;
  ACTIVE_PROJECT_FOLDER_EDIT = ACTIVE_PROJECT_FOLDER_EDIT?.projectId === project.id ? ACTIVE_PROJECT_FOLDER_EDIT : null;
  document.querySelectorAll('.task-card').forEach((card) => card.classList.remove('selected'));
  document.querySelectorAll('.personal-project-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.projectId === projectId);
  });

  const projectNotesPreview = getProjectSharedNotesPreview(project.id);
  const canManageFolder = canCurrentUserManageProjectFolder(project);
  const statusLabel = getProjectSection(project).toUpperCase();
  const projectAssignees = getAssignedStaffForProject(project.id);
  const projectLeads = getProjectLeadUsers(project);
  const projectPartners = getProjectPartners(project);
  const workCardData = await window.api.getProjectWorkCards(project.id, getCurrentWeekStartString());
  const projectWorkCards = workCardData?.cards || [];
  const canManageWorkCards = isPartner();

  const projectFullTitle = `${project.client || ''} | ${project.name || ''}`.trim();
  const header = document.getElementById('detail-header');
  header.innerHTML = `
    <div class="detail-header-copy">
      <h3 class="detail-title" id="detail-title" title="${escapeAttr(projectFullTitle)}">${escapeHtml(projectFullTitle)}</h3>
      <div class="detail-subtitle project-detail-description ${project.notes ? '' : 'is-empty'}" title="${escapeAttr(project.notes || '')}">${project.notes ? escapeHtml(project.notes) : '&nbsp;'}</div>
    </div>
    <div class="project-detail-tabs" role="tablist" aria-label="Project detail">
      <button class="project-detail-tab ${projectDetailTab === 'work-cards' ? 'active' : ''}" type="button" data-project-detail-tab="work-cards">Work cards</button>
      <button class="project-detail-tab ${projectDetailTab === 'project-info' ? 'active' : ''}" type="button" data-project-detail-tab="project-info">Project info</button>
    </div>
  `;

  const detailBody = document.getElementById('detail-body');
  detailBody.className = 'detail-body project-detail-body';
  Motion.swap(detailBody, `project:${project.id}`);
  detailBody.innerHTML = `
    <section class="detail-panel-section project-work-cards-panel ${projectDetailTab === 'work-cards' ? '' : 'hidden'}" data-project-detail-panel="work-cards">
      <div class="project-work-cards-heading">
        <div class="detail-section-heading">Work cards <span>${projectWorkCards.length}</span></div>
        ${canManageWorkCards && projectWorkCards.length ? '<button class="btn btn-primary btn-sm" type="button" data-project-add-work-card>+ Add</button>' : ''}
      </div>
      ${renderProjectWorkCards(projectWorkCards, workCardData?.focus, {
        canManage: canManageWorkCards,
        doneExpanded: WORK_CARD_DONE_EXPANDED_PROJECT_ID === String(project.id),
      })}
    </section>
    <div class="project-info-content ${projectDetailTab === 'project-info' ? '' : 'hidden'}" data-project-detail-panel="project-info">
    <section class="detail-panel-section">
      <div class="detail-section-heading">Details</div>
      <div class="detail-summary-grid">
        <div class="detail-summary-item">
          <div class="detail-summary-label">Client</div>
          <div class="detail-field-value">${escapeHtml(project.client || '—')}</div>
        </div>
        <div class="detail-summary-item">
          <div class="detail-summary-label">Project</div>
          <div class="detail-field-value">${escapeHtml(project.name || '—')}</div>
        </div>
        <div class="detail-summary-item">
          <div class="detail-summary-label">Status</div>
          <div class="detail-field-value">${escapeHtml(statusLabel)}</div>
        </div>
      </div>
      <div class="detail-info-item project-static-notes">
        <div class="detail-summary-label">Scheduling notes</div>
        <div class="detail-field-value">${escapeHtml(project.notes || '—')}</div>
      </div>
    </section>

    ${(projectAssignees.length > 0 || projectLeads.length > 0 || projectPartners.length > 0) ? `
    <section class="detail-panel-section">
      <div class="detail-section-heading">People</div>
      <div class="detail-summary-grid">
        ${projectAssignees.length > 0 ? `
        <div class="detail-summary-item">
          <div class="detail-summary-label">Assigned to</div>
          <div class="detail-avatar-list detail-avatar-list-assignees detail-avatar-list-stacked">
            ${projectAssignees.map((user, index) => `
              <span class="detail-avatar-dot" title="${escapeAttr(user.display_name || '')}" style="background:${user.avatar_color};z-index:${projectAssignees.length - index}">${getInitials(user)}</span>
            `).join('')}
          </div>
        </div>
        ` : ''}
        ${projectLeads.length > 0 ? `
        <div class="detail-summary-item">
          <div class="detail-summary-label">Project lead</div>
          <div class="detail-avatar-list detail-avatar-list-stacked">
            ${projectLeads.map((user, index) => `
              <span class="detail-avatar-dot" title="${escapeAttr(user.display_name || '')}" style="background:${user.avatar_color};z-index:${projectLeads.length - index}">${getInitials(user)}</span>
            `).join('')}
          </div>
        </div>
        ` : ''}
        ${projectPartners.length > 0 ? `
        <div class="detail-summary-item">
          <div class="detail-summary-label">Partner</div>
          <div class="detail-avatar-list detail-avatar-list-partners detail-avatar-list-stacked">
            ${projectPartners.map((user, index) => `
              <span class="detail-avatar-dot" title="${escapeAttr(user.display_name || '')}" style="background:${user.avatar_color};z-index:${projectPartners.length - index}">${getInitials(user)}</span>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>
    </section>
    ` : ''}

    <section class="detail-panel-section">
      <div class="detail-section-heading">Project Info</div>
      <div class="detail-info-stack">
        <div class="detail-info-item">
          <div class="detail-summary-label">Project folder</div>
          ${renderProjectFolderCard(project, canManageFolder, {
            editState: ACTIVE_PROJECT_FOLDER_EDIT,
            getProjectDisplayTitle,
          })}
        </div>
        <div class="detail-info-item">
          <div class="detail-summary-label">Project Notes</div>
          <button class="project-notes-btn detail-project-info-btn detail-project-notes-launch" id="project-detail-project-notes" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span class="detail-project-info-btn-label">Manage shared notes</span>
            <span class="notes-preview">
              <span class="notes-preview-title">${escapeHtml(projectNotesPreview.summary)}</span>
              <span class="notes-preview-detail">${escapeHtml(projectNotesPreview.detail)}</span>
            </span>
            <span class="detail-link-arrow" aria-hidden="true">&rsaquo;</span>
          </button>
        </div>
      </div>
    </section>

    </div>
  `;

  header.querySelectorAll('[data-project-detail-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const selected = tab.dataset.projectDetailTab;
      ACTIVE_PROJECT_DETAIL_TAB = { projectId: project.id, tab: selected };
      header.querySelectorAll('[data-project-detail-tab]').forEach((candidate) => candidate.classList.toggle('active', candidate === tab));
      detailBody.querySelectorAll('[data-project-detail-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.projectDetailPanel !== selected));
    });
  });

  const refreshWorkCardBoard = async () => {
    await loadAllData();
    await openProjectDetailPanel(project.id);
    if (activeTab === 'my-week') renderMyWeek();
  };
  detailBody.querySelectorAll('[data-project-add-work-card]').forEach((button) => {
    button.addEventListener('click', () => openWorkCardEditor(project, workCardData?.participants || []));
  });
  detailBody.querySelector('[data-work-card-done-toggle]')?.addEventListener('click', () => {
    WORK_CARD_DONE_EXPANDED_PROJECT_ID = WORK_CARD_DONE_EXPANDED_PROJECT_ID === String(project.id)
      ? null
      : String(project.id);
    openProjectDetailPanel(project.id);
  });
  const closeWorkCardMenus = () => {
    detailBody.querySelectorAll('[data-work-card-menu-panel]').forEach((menu) => menu.classList.add('hidden'));
    detailBody.querySelectorAll('[data-work-card-menu]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  };

  detailBody.querySelectorAll('[data-work-card-menu]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const menu = detailBody.querySelector(`[data-work-card-menu-panel="${CSS.escape(button.dataset.workCardMenu)}"]`);
      const isOpen = menu && !menu.classList.contains('hidden');
      closeWorkCardMenus();
      if (menu && !isOpen) {
        menu.classList.remove('hidden');
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });
  detailBody.addEventListener('click', closeWorkCardMenus);

  detailBody.querySelectorAll('[data-work-card-action]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const card = projectWorkCards.find((item) => item.id === button.dataset.workCardId);
      const action = button.dataset.workCardAction;
      if (!card || !action) return;
      if (action === 'edit') return openWorkCardEditor(project, workCardData?.participants || [], card);
      if (action === 'delete') {
        const confirmed = await window.MyTasksConfirmDialog.show({ title: 'Delete work card?', message: `Delete "${card.title}"?`, confirmLabel: 'Delete', tone: 'danger' });
        if (!confirmed || !(await window.api.deleteWorkCard(card.id))) return;
        showToast('Work card deleted.', { tone: 'success' });
        return refreshWorkCardBoard();
      }
      if (action === 'duplicate') {
        const copy = await window.api.createWorkCard({
          project_id: card.project_id, week_of: card.week_of, title: `${card.title} (copy)`, description: card.description,
          category_id: card.category_id, planned_minutes: card.planned_minutes, start_date: card.start_date, end_date: card.end_date,
          assignee_ids: card.assignee_ids, status: 'todo', paused: 0, logged_hours: 0,
        });
        if (!copy) return showToast('This work card could not be duplicated.', { tone: 'error' });
        showToast('Work card duplicated.', { tone: 'success' });
        return refreshWorkCardBoard();
      }
      const transition = transitionWorkCard(card, action);
      button.disabled = true;
      const updated = await window.api.updateWorkCard({ id: card.id, ...transition });
      if (!updated) {
        button.disabled = false;
        return showToast('This work card could not be updated.', { tone: 'error' });
      }
      if (action === 'start') await window.api.setWorkCardFocus(card.id);
      if (action === 'stop' || action === 'complete') await window.api.setWorkCardFocus(null);
      return refreshWorkCardBoard();
    });
  });

  document.getElementById('project-detail-project-notes').addEventListener('click', () => {
    window.api.openProjectNotesWindow(project.id);
  });

  ACTIVE_PROJECT_DETAIL_DRAFT = null;

  bindProjectFolderLinkControls({
    project,
    canManageFolder,
    refreshTaskId: null,
    renderPanel: () => openProjectDetailPanel(project.id),
    setEditState: (nextEditState) => { ACTIVE_PROJECT_FOLDER_EDIT = nextEditState; },
    refreshAfterProjectChange,
    positionMenu,
  });
}

function setupTabBar() {
  const tabBar = document.getElementById('tab-bar');
  if (!tabBar || tabBar.dataset.handlersBound === 'true') return;

  // Keep the workspace selectors live even when their order or visibility is
  // adjusted for a role. Binding to the stable bar also avoids stale direct
  // listeners if its buttons are replaced during a UI refresh.
  tabBar.dataset.handlersBound = 'true';
  // One underline that glides to the active tab (see lib/motion.js).
  Motion.indicator(tabBar, { item: 'button.tab', active: 'button.tab.active' });
  tabBar.addEventListener('click', async (event) => {
    const tab = event.target.closest('button.tab[data-tab]');
    if (!tab || !tabBar.contains(tab) || tab.classList.contains('hidden')) return;
    await activateTab(tab.dataset.tab, { preserveStaffFilter: false });
    if (event.detail > 0) tab.blur();
  });

  tabBar.addEventListener('keydown', async (event) => {
    const tab = event.target.closest('button.tab[data-tab]');
    if (!tab || !tabBar.contains(tab)) return;

    const visibleTabs = [...tabBar.querySelectorAll('button.tab[data-tab]:not(.hidden)')];
    const currentIndex = visibleTabs.indexOf(tab);
    if (currentIndex < 0) return;

    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % visibleTabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = visibleTabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = visibleTabs[nextIndex];
    nextTab.focus();
    await activateTab(nextTab.dataset.tab, { preserveStaffFilter: false });
  });
}

function setupTeamDueDateCalendar() {
  document.getElementById('team-due-calendar-btn')?.addEventListener('click', openTeamDueDateCalendar);
}

function getTeamProjectDueEntries(tasks = TASKS, projects = PROJECTS) {
  const projectsById = new Map(projects.map((project) => [String(project.id), project]));
  const projectAssignees = new Map();
  for (const task of tasks) {
    if (!task?.project_id || !task.assigned_to) continue;
    const projectId = String(task.project_id);
    if (!projectAssignees.has(projectId)) projectAssignees.set(projectId, new Set());
    projectAssignees.get(projectId).add(task.assigned_to);
  }

  const entriesByProjectAndDate = new Map();
  for (const task of tasks) {
    const projectId = String(task?.project_id || '');
    const dueDate = String(task?.due_date || '').slice(0, 10);
    const project = projectsById.get(projectId);
    if (!projectId || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !project || project.status === 'inactive') continue;

    const key = `${dueDate}|${projectId}`;
    if (!entriesByProjectAndDate.has(key)) {
      entriesByProjectAndDate.set(key, {
        dueDate,
        project,
        assigneeIds: new Set(projectAssignees.get(projectId) || []),
      });
    }
  }

  return [...entriesByProjectAndDate.values()].sort((left, right) => (
    left.dueDate.localeCompare(right.dueDate)
    || getProjectDisplayTitle(left.project).localeCompare(getProjectDisplayTitle(right.project))
  ));
}

function getTeamCalendarCardsForDate(cards, isoDate) {
  return cards.filter((card) => {
    const start = String(card.start_date || card.end_date || '').slice(0, 10);
    const end = String(card.end_date || card.start_date || '').slice(0, 10);
    return start && end && start <= isoDate && end >= isoDate;
  });
}

function getTeamCalendarCardCategory(card) {
  return WORK_CARD_CATEGORIES.find((category) => category.id === card.category_id)
    || { id: 'uncategorized', label: 'Work card', color: '#5B6B7F' };
}

function getTeamCalendarCardDateRange(card) {
  const start = String(card.start_date || card.end_date || '').slice(0, 10);
  const end = String(card.end_date || card.start_date || '').slice(0, 10);
  if (!start) return 'No dates';
  const options = { month: 'short', day: 'numeric' };
  const startLabel = new Intl.DateTimeFormat(undefined, options).format(new Date(`${start}T12:00:00`));
  if (!end || end === start) return startLabel;
  return `${startLabel} – ${new Intl.DateTimeFormat(undefined, options).format(new Date(`${end}T12:00:00`))}`;
}

function renderTeamCalendarDayMarkers(projectEntries, workCards) {
  const entries = [
    ...projectEntries.map((entry) => ({
      title: getProjectDisplayTitle(entry.project),
      color: '#C96E37',
      type: 'Project due',
    })),
    ...workCards.map((card) => {
      const category = getTeamCalendarCardCategory(card);
      return { title: card.title, color: category.color, type: category.label };
    }),
  ];
  if (!entries.length) return '';
  const visibleEntries = entries.slice(0, 2);
  return `<div class="team-calendar-day-task-list">${visibleEntries.map((entry) => (
    `<span class="team-calendar-day-task" title="${escapeAttr(`${entry.type}: ${entry.title}`)}" style="--team-calendar-category:${escapeAttr(entry.color)}"><i></i><b>${escapeHtml(entry.title)}</b></span>`
  )).join('')}${entries.length > visibleEntries.length ? `<span class="team-calendar-day-task-more">+${entries.length - visibleEntries.length} More</span>` : ''}</div>`;
}

function openTeamDueDateCalendar() {
  document.getElementById('team-due-calendar-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'team-due-calendar-overlay';
  overlay.className = 'dialog-overlay team-due-calendar-overlay';
  document.body.appendChild(overlay);

  let cursor = new Date();
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  let selectedDate = null;
  const dueEntries = getTeamProjectDueEntries();
  const teamWorkCards = TEAM_CALENDAR_WORK_CARDS;

  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  };
  const onKeydown = (event) => { if (event.key === 'Escape') close(); };

  const renderAgendaMarkup = () => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    const monthLastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`;
    const monthEntries = dueEntries.filter((entry) => entry.dueDate.startsWith(monthPrefix));
    const monthWorkCards = teamWorkCards.filter((card) => {
      const start = String(card.start_date || card.end_date || '').slice(0, 10);
      const end = String(card.end_date || card.start_date || '').slice(0, 10);
      return start && end && start <= monthLastDay && end >= monthPrefix;
    });
    const selectedEntries = selectedDate ? dueEntries.filter((entry) => entry.dueDate === selectedDate) : [];
    const selectedWorkCards = selectedDate ? getTeamCalendarCardsForDate(teamWorkCards, selectedDate) : [];
    const heading = selectedDate
      ? escapeHtml(new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${selectedDate}T12:00:00`)))
      : 'Team schedule';
    const content = selectedDate
      ? ((selectedEntries.length || selectedWorkCards.length) ? `${selectedEntries.length ? `<section class="team-calendar-agenda-section"><h4>Project due dates</h4>${selectedEntries.map((entry) => {
          const people = [...entry.assigneeIds].map((id) => getUserById(id)?.display_name).filter(Boolean).join(', ');
          return `<article><b>${escapeHtml(getProjectDisplayTitle(entry.project))}</b><span>Due ${escapeHtml(new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${entry.dueDate}T12:00:00`)))}</span><small>${escapeHtml(people || 'No staff assignments')}</small></article>`;
        }).join('')}</section>` : ''}${selectedWorkCards.length ? `<section class="team-calendar-agenda-section"><h4>Scheduled work cards</h4>${selectedWorkCards.map((card) => {
          const category = getTeamCalendarCardCategory(card);
          const project = PROJECTS.find((item) => String(item.id) === String(card.project_id));
          const people = (card.assignees || []).map((person) => person.display_name).filter(Boolean).join(', ');
          return `<article class="team-calendar-agenda-task" style="--team-calendar-category:${escapeAttr(category.color)}"><em><i></i>${escapeHtml(category.label)}</em><b>${escapeHtml(card.title)}</b><span>${escapeHtml(getProjectDisplayTitle(project || { title: 'Project' }))}</span><small>${escapeHtml(`${getTeamCalendarCardDateRange(card)}${people ? ` · ${people}` : ''}`)}</small></article>`;
        }).join('')}</section>` : ''}` : '<p>No project due dates or selected work cards on this day.</p>')
      : `<p>${(monthEntries.length || monthWorkCards.length) ? 'Choose a marked day to review the office schedule.' : 'No active projects or selected work cards are scheduled this month.'}</p>`;
    return `<strong>${heading}</strong>${content}`;
  };

  const updateSelectedDate = () => {
    overlay.querySelectorAll('[data-team-calendar-day]').forEach((day) => {
      day.classList.toggle('is-selected', day.dataset.teamCalendarDay === selectedDate);
    });
    const agenda = overlay.querySelector('.team-calendar-agenda');
    if (agenda) agenda.innerHTML = renderAgendaMarkup();
  };

  const render = () => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const formatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    const monthEntries = dueEntries.filter((entry) => entry.dueDate.startsWith(monthPrefix));
    const monthLastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`;
    const monthWorkCards = teamWorkCards.filter((card) => {
      const start = String(card.start_date || card.end_date || '').slice(0, 10);
      const end = String(card.end_date || card.start_date || '').slice(0, 10);
      return start && end && start <= monthLastDay && end >= monthPrefix;
    });
    const cells = Array.from({ length: Math.ceil((firstWeekday + totalDays) / 7) * 7 }, (_, index) => {
      const day = index - firstWeekday + 1;
      if (day < 1 || day > totalDays) return '<div class="team-calendar-day is-blank"></div>';
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEntries = dueEntries.filter((entry) => entry.dueDate === iso);
      const dayWorkCards = getTeamCalendarCardsForDate(teamWorkCards, iso);
      return `<button type="button" class="team-calendar-day ${iso === todayIso ? 'is-today' : ''} ${iso === selectedDate ? 'is-selected' : ''}" data-team-calendar-day="${iso}">
        <span class="team-calendar-day-number">${day}</span><span class="team-calendar-day-markers">${renderTeamCalendarDayMarkers(dayEntries, dayWorkCards)}</span>
      </button>`;
    }).join('');
    overlay.innerHTML = `
      <div class="dialog-card team-due-calendar-dialog" role="dialog" aria-modal="true" aria-labelledby="team-due-calendar-title">
        <div class="dialog-header">
          <div><h3 class="dialog-title" id="team-due-calendar-title">Team schedule calendar</h3><p class="dialog-subtitle">Office project due dates and selected work card types.</p></div>
          <button class="detail-close" type="button" data-close-team-calendar aria-label="Close calendar">&times;</button>
        </div>
        <div class="team-calendar-layout">
          <section class="team-calendar-month">
            <div class="team-calendar-toolbar"><button type="button" class="btn btn-ghost btn-sm" data-team-calendar-shift="-1" aria-label="Previous month" title="Previous month">‹</button><strong>${escapeHtml(formatter.format(cursor))}</strong><span class="team-calendar-month-summary">${monthEntries.length} ${monthEntries.length === 1 ? 'project due' : 'projects due'} · ${monthWorkCards.length} ${monthWorkCards.length === 1 ? 'work card' : 'work cards'}</span><button type="button" class="btn btn-ghost btn-sm" data-team-calendar-today>Today</button><button type="button" class="btn btn-ghost btn-sm" data-team-calendar-shift="1" aria-label="Next month" title="Next month">›</button></div>
            <div class="team-calendar-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
            <div class="team-calendar-grid">${cells}</div>
          </section>
          <aside class="team-calendar-agenda" aria-live="polite">${renderAgendaMarkup()}</aside>
        </div>
        <div class="dialog-footer"><button class="btn btn-ghost" type="button" data-close-team-calendar>Close</button></div>
      </div>`;
    overlay.querySelectorAll('[data-close-team-calendar]').forEach((button) => button.addEventListener('click', close));
    overlay.querySelectorAll('[data-team-calendar-shift]').forEach((button) => button.addEventListener('click', () => {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + Number(button.dataset.teamCalendarShift), 1);
      selectedDate = null;
      render();
    }));
    overlay.querySelector('[data-team-calendar-today]')?.addEventListener('click', () => {
      const today = new Date();
      cursor = new Date(today.getFullYear(), today.getMonth(), 1);
      selectedDate = todayIso;
      render();
    });
    overlay.querySelectorAll('[data-team-calendar-day]').forEach((button) => button.addEventListener('click', () => {
      selectedDate = button.dataset.teamCalendarDay;
      updateSelectedDate();
    }));
  };

  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKeydown);
  render();
}

function syncActiveTabLayout() {
  const appShell = document.getElementById('app-shell');
  if (!appShell) return;

  const isReadOnlyStaffOverview = !isPartner() && activeTab === 'staff-view' && canCurrentUserUseStaffOverview();
  const sidebar = document.getElementById('sidebar');
  // The staff list supports management, not day-to-day personal work. Keep it
  // with Staff Overview so My Tasks, My Week, and My Projects stay focused.
  const showStaffSidebar = isPartner() && activeTab === 'staff-view';
  // Both daily work and the Partner portfolio keep the tab rail aligned to
  // the readable project-list column. This prevents the navigation from
  // jumping wider when a Partner opens the portfolio.
  const isMyTasksWorkspace = activeTab === 'my-tasks' || activeTab === 'my-projects';
  const isMyWeek = activeTab === 'my-week';
  const isStaffOverview = activeTab === 'staff-view';
  appShell.classList.toggle('staff-readonly-overview', isReadOnlyStaffOverview);
  appShell.classList.toggle('my-tasks-project-workspace', isMyTasksWorkspace);
  appShell.classList.toggle('my-week-calendar-mode', isMyWeek);
  appShell.classList.toggle('staff-overview-mode', isStaffOverview);
  sidebar?.classList.toggle('hidden', !showStaffSidebar);
  applyStylePreferences();
}

async function activateTab(tabName, options = {}) {
  const { preserveStaffFilter = false } = options;
  const canUseStaffOverview = canCurrentUserUseStaffOverview();

  if (tabName === 'staff-view' && !canUseStaffOverview) {
    tabName = 'my-tasks';
  }

  if (tabName === 'my-projects' && !isActualPartner()) {
    tabName = 'my-tasks';
  }

  if (tabName !== activeTab && !(await confirmDiscardProjectDetailChanges())) {
    return false;
  }

  if (tabName === 'staff-view' && activeTab !== 'staff-view' && !preserveStaffFilter) {
    selectedStaffFilter = null;
    rememberStaffFilter();
    if (isPartner()) renderSidebar();
  }

  activeTab = tabName;
  rememberLastActiveTab(tabName);
  syncActiveTabLayout();
  document.querySelectorAll('.tab').forEach((tab) => {
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${tabName}`).classList.remove('hidden');
  document.getElementById(`view-${tabName}`).classList.add('active');

  if (tabName === 'my-projects') {
    renderMyProjects();
    if (selectedProjectId && getRestorableProjectById(selectedProjectId)) {
      openProjectDetailPanel(selectedProjectId);
    } else {
      restoreProjectDetailPane({ allowFallback: true });
    }
  } else if (tabName === 'staff-view') {
    if (!isPartner()) {
      clearSelectedTaskDetail();
    }
    renderStaffOverview();
    if (isPartner() && selectedTaskId) {
      openDetailPanel(selectedTaskId);
    } else if (isPartner()) {
      restoreProjectDetailPane({ allowFallback: true });
    } else {
      showDetailEmptyState();
    }
  } else if (tabName === 'my-week') {
    renderMyWeek();
    showDetailEmptyState();
  } else {
    renderMyTasks();
    if (shouldUseSlideDetailPane()) {
      clearSelectedTaskDetail();
      return;
    }
    if (selectedTaskId && getRestorableTaskById(selectedTaskId)) {
      openDetailPanel(selectedTaskId);
    } else {
      restoreTaskDetailPane({ allowFallback: true }).then((restored) => {
        if (!restored && isPartner()) {
          restoreProjectDetailPane({ allowFallback: true });
        }
      });
    }
  }
  return true;
}

// ── Search ──────────────────────────────────────────

// ── Logout ──────────────────────────────────────────

function setSyncIndicatorState(state) {
  const indicator = document.getElementById('sync-indicator');
  const statusText = document.getElementById('sync-status-text');
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
    if (statusText) statusText.textContent = 'Syncing...';
  } else if (state === 'error') {
    dot.classList.add('error');
    indicator.title = 'Sync error';
    if (statusText) statusText.textContent = 'Sync error';
  } else if ((LAST_RUNTIME_STATUS?.syncFailures?.count || 0) > 0 || LAST_RUNTIME_STATUS?.sharedDriveReachable === false) {
    dot.classList.add('error');
    indicator.title = 'Sync needs attention';
    if (statusText) {
      const count = LAST_RUNTIME_STATUS?.syncFailures?.count || 0;
      statusText.textContent = count > 0 ? `${count} sync issue${count === 1 ? '' : 's'}` : 'Sync unavailable';
    }
  } else {
    indicator.title = 'Synced';
    if (statusText && statusText.textContent === 'Syncing...') statusText.textContent = 'Synced';
  }
}

function formatStatusTimestamp(isoStr) {
  if (!isoStr) return 'No recent sync';
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return 'No recent sync';
  return `Synced ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function buildRuntimeStatusMenuItems(status) {
  const sharedPath = status?.sharedDrivePath || 'Not configured';
  const sharedState = status?.sharedDrivePath
    ? (status.sharedDriveReachable ? 'reachable' : 'unavailable')
    : 'not configured';
  const items = [
    { type: 'label', label: formatStatusTimestamp(status?.lastSyncAt) },
    { type: 'label', label: `Shared folder: ${sharedState}` },
  ];

  if ((status?.syncFailures?.count || 0) > 0) {
    items.push({ type: 'label', label: `${status.syncFailures.count} sync change${status.syncFailures.count === 1 ? '' : 's'} need attention` });
  }

  if ((status?.syncOutbox?.pending || 0) > 0) {
    items.push({ type: 'label', label: `${status.syncOutbox.pending} local change${status.syncOutbox.pending === 1 ? '' : 's'} waiting to publish` });
  }

  if (sharedPath !== 'Not configured') {
    items.push({ type: 'label', label: sharedPath });
  }

  if (status?.updateAvailable && status?.latestVersion) {
    items.push({ type: 'label', label: `Update available: ${status.latestVersion}` });
  }

  items.push({ divider: true });
  return items;
}

function applyRuntimeStatus(status) {
  const indicator = document.getElementById('sync-indicator');
  const statusText = document.getElementById('sync-status-text');
  const userBadge = document.getElementById('user-badge');
  const userName = document.getElementById('user-name');
  if (!indicator) return;
  LAST_RUNTIME_STATUS = status || null;

  // After a long absence the shared data was rebuilt from the Dashboard's latest snapshot. Say so once.
  const recoveredAt = status?.syncRecovery?.at || null;
  if (recoveredAt && recoveredAt !== LAST_SYNC_RECOVERY_NOTICE_AT) {
    LAST_SYNC_RECOVERY_NOTICE_AT = recoveredAt;
    showToast('This computer was offline for a long time, so your shared data was refreshed from the Dashboard.', { tone: 'info', duration: 8000 });
  }

  const failureCount = status?.syncFailures?.count || 0;
  const text = failureCount > 0
    ? `${failureCount} sync issue${failureCount === 1 ? '' : 's'}`
    : formatStatusTimestamp(status?.lastSyncAt);

  const sharedPath = status?.sharedDrivePath || 'Not configured';
  const sharedState = status?.sharedDrivePath
    ? (status.sharedDriveReachable ? 'reachable' : 'unavailable')
    : 'not configured';

  const tooltip = `${text}\nShared folder: ${sharedPath}\nStatus: ${sharedState}`;
  const dot = indicator.querySelector('.sync-dot');
  // A manual sync sets the temporary yellow animation before calling the main
  // process. Once its status response arrives, always settle the indicator.
  dot?.classList.remove('syncing', 'error');
  dot?.classList.toggle('error', failureCount > 0 || sharedState === 'unavailable');
  indicator.title = tooltip;
  if (statusText) statusText.textContent = text;
  if (userBadge) userBadge.title = tooltip;
  if (userName) userName.title = tooltip;

  updateSyncBanner(status);
}

function updateSyncBanner(status) {
  const banner = document.getElementById('sync-banner');
  if (!banner) return;

  const configured = Boolean(status?.sharedDrivePath);
  const unreachable = configured && status?.sharedDriveReachable === false;
  const failureCount = status?.syncFailures?.count || 0;
  const hasSyncFailures = failureCount > 0;
  const bannerText = document.getElementById('sync-banner-text');
  const bannerDetail = document.getElementById('sync-banner-detail');

  if (!unreachable && !hasSyncFailures) {
    SYNC_BANNER_DISMISSED = false;
    banner.classList.add('hidden');
    bannerDetail?.classList.add('hidden');
    return;
  }

  if (bannerText) {
    bannerText.textContent = unreachable
      ? "Can't reach the shared sync folder. Your changes are saved locally and will sync once it's back."
      : `${failureCount} sync change${failureCount === 1 ? '' : 's'} could not be applied. Your current data may be incomplete.`;
  }
  if (bannerDetail) {
    const firstFailure = status?.syncFailures?.failures?.[0];
    bannerDetail.textContent = firstFailure?.error
      ? `Details: ${firstFailure.error}`
      : 'Use Retry to check the shared folder again.';
    bannerDetail.classList.remove('hidden');
  }

  banner.classList.toggle('hidden', SYNC_BANNER_DISMISSED);
}

function setupSyncBanner() {
  const banner = document.getElementById('sync-banner');
  if (!banner || banner.dataset.bound === 'true') return;
  banner.dataset.bound = 'true';

  document.getElementById('sync-banner-dismiss')?.addEventListener('click', () => {
    SYNC_BANNER_DISMISSED = true;
    banner.classList.add('hidden');
  });

  document.getElementById('sync-banner-retry')?.addEventListener('click', async () => {
    const button = document.getElementById('sync-banner-retry');
    await runUiAction(async () => {
      setSyncIndicatorState('syncing');
      await window.api.forceSync();
      await refreshExternalDataAndUI();
      await refreshRuntimeStatus();
  }, { button, pendingLabel: 'Retrying...', successMessage: 'Sync retry finished. Review the status banner if it remains visible.' });
  });
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

async function refreshRuntimeStatus() {
  applyRuntimeStatus(await window.api.getRuntimeStatus());
}

function renderPreferencesSyncStatus(status = LAST_RUNTIME_STATUS) {
  const summary = document.getElementById('preferences-sync-summary');
  const details = document.getElementById('preferences-sync-details');
  if (!summary || !details) return;

  const sharedState = status?.sharedDrivePath
    ? (status.sharedDriveReachable ? 'Reachable' : 'Unavailable')
    : 'Not configured';

  const failureCount = status?.syncFailures?.count || 0;
  summary.textContent = failureCount > 0
    ? `${failureCount} sync change${failureCount === 1 ? '' : 's'} need attention.`
    : formatStatusTimestamp(status?.lastSyncAt);
  details.innerHTML = `
    <div class="preferences-status-row">
      <span>Shared folder</span>
      <strong>${escapeHtml(sharedState)}</strong>
    </div>
    ${status?.sharedDrivePath ? `
      <div class="preferences-status-row">
        <span>Folder path</span>
        <strong title="${escapeAttr(status.sharedDrivePath)}">${escapeHtml(status.sharedDrivePath)}</strong>
      </div>
    ` : ''}
    ${failureCount > 0 ? `
      <div class="preferences-status-row preferences-status-warning">
        <span>Pending recovery</span>
        <strong>${failureCount} failed change${failureCount === 1 ? '' : 's'}</strong>
      </div>
    ` : ''}
    ${status?.updateAvailable && status?.latestVersion ? `
      <div class="preferences-status-row">
        <span>Update available</span>
        <strong>${escapeHtml(status.latestVersion)}</strong>
      </div>
    ` : ''}
  `;
}

function renderPreferencesChoices() {
  const detailModeGroup = document.getElementById('preferences-detail-mode-group');
  const detailModeOptions = document.getElementById('detail-pane-mode-options');
  const accentOptions = document.getElementById('accent-options');
  const themeOptions = document.getElementById('theme-options');
  const canSlide = canUseSlideDetailPane();

  if (accentOptions) {
    accentOptions.innerHTML = ACCENT_PRESETS.map((preset) => `
      <button
        class="accent-choice-btn ${STYLE_PREFERENCES.accent === preset.id ? 'active' : ''}"
        type="button"
        data-accent-choice="${escapeAttr(preset.id)}"
        aria-label="${escapeAttr(`${preset.label} accent`)}"
        aria-pressed="${STYLE_PREFERENCES.accent === preset.id ? 'true' : 'false'}"
        title="${escapeAttr(preset.label)}"
        style="--accent-swatch:${escapeAttr(preset.light.accent)};--accent-swatch-dark:${escapeAttr(preset.dark.accent)};"
      >
        <span class="accent-choice-swatch" aria-hidden="true"></span>
        <span class="accent-choice-label">${escapeHtml(preset.label)}</span>
      </button>
    `).join('');
  }

  detailModeGroup?.classList.toggle('hidden', !canSlide);
  if (detailModeOptions && canSlide) {
    detailModeOptions.innerHTML = `
      <button class="preference-preview-btn ${STYLE_PREFERENCES.detailPaneMode === 'permanent' ? 'active' : ''}" type="button" data-detail-pane-mode="permanent">
        <span class="layout-preview layout-preview-permanent" aria-hidden="true">
          <span class="preview-list">
            <span class="preview-bar"></span>
            <span class="preview-row active"></span>
            <span class="preview-row"></span>
            <span class="preview-row short"></span>
          </span>
          <span class="preview-detail">
            <span class="preview-chip"></span>
            <span class="preview-line"></span>
            <span class="preview-line short"></span>
          </span>
        </span>
        <span class="preference-preview-title">Permanent</span>
        <span class="preference-preview-copy">Keep details open beside the list.</span>
      </button>
      <button class="preference-preview-btn ${STYLE_PREFERENCES.detailPaneMode === 'slide' ? 'active' : ''}" type="button" data-detail-pane-mode="slide">
        <span class="layout-preview layout-preview-slide" aria-hidden="true">
          <span class="preview-list">
            <span class="preview-bar"></span>
            <span class="preview-row active"></span>
            <span class="preview-row"></span>
            <span class="preview-row short"></span>
          </span>
          <span class="preview-detail">
            <span class="preview-chip"></span>
            <span class="preview-line"></span>
            <span class="preview-line short"></span>
          </span>
        </span>
        <span class="preference-preview-title">Slide Open</span>
        <span class="preference-preview-copy">Show the list first, then slide details in.</span>
      </button>
    `;
  }

  if (themeOptions) {
    themeOptions.innerHTML = `
      <button class="preference-preview-btn theme-preview-btn ${STYLE_PREFERENCES.theme === 'light' ? 'active' : ''}" type="button" data-theme-choice="light">
        <span class="theme-preview theme-preview-light" aria-hidden="true">
          <span class="theme-preview-top">
            <span class="theme-preview-dot"></span>
            <span class="theme-preview-titlebar"></span>
          </span>
          <span class="theme-preview-main">
            <span class="theme-preview-sidebar"></span>
            <span class="theme-preview-content">
              <span class="theme-preview-row active"></span>
              <span class="theme-preview-row"></span>
              <span class="theme-preview-row short"></span>
            </span>
          </span>
        </span>
        <span class="preference-preview-title">Light</span>
        <span class="preference-preview-copy">Bright default workspace.</span>
      </button>
      <button class="preference-preview-btn theme-preview-btn ${STYLE_PREFERENCES.theme === 'dark' ? 'active' : ''}" type="button" data-theme-choice="dark">
        <span class="theme-preview theme-preview-dark" aria-hidden="true">
          <span class="theme-preview-top">
            <span class="theme-preview-dot"></span>
            <span class="theme-preview-titlebar"></span>
          </span>
          <span class="theme-preview-main">
            <span class="theme-preview-sidebar"></span>
            <span class="theme-preview-content">
              <span class="theme-preview-row active"></span>
              <span class="theme-preview-row"></span>
              <span class="theme-preview-row short"></span>
            </span>
          </span>
        </span>
        <span class="preference-preview-title">Dark</span>
        <span class="preference-preview-copy">Low-light full dark mode.</span>
      </button>
      <button class="preference-preview-btn theme-preview-btn ${STYLE_PREFERENCES.theme === 'auto' ? 'active' : ''}" type="button" data-theme-choice="auto">
        <span class="theme-preview theme-preview-auto" aria-hidden="true">
          <span class="theme-preview-top">
            <span class="theme-preview-dot"></span>
            <span class="theme-preview-titlebar"></span>
          </span>
          <span class="theme-preview-main">
            <span class="theme-preview-sidebar"></span>
            <span class="theme-preview-content">
              <span class="theme-preview-row active"></span>
              <span class="theme-preview-row"></span>
              <span class="theme-preview-row short"></span>
            </span>
          </span>
        </span>
        <span class="preference-preview-title">Auto</span>
        <span class="preference-preview-copy">Follows your system setting.</span>
      </button>
    `;
  }

  document.querySelectorAll('[data-detail-pane-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      STYLE_PREFERENCES = {
        ...STYLE_PREFERENCES,
        detailPaneMode: button.dataset.detailPaneMode === 'slide' ? 'slide' : 'permanent',
      };
      rememberStylePreferences();
      applyStylePreferences();
      renderPreferencesChoices();
      if (shouldUseSlideDetailPane()) {
        clearSelectedTaskDetail();
      } else {
        restoreTaskDetailPane({ allowFallback: true });
      }
    });
  });

  document.querySelectorAll('[data-accent-choice]').forEach((button) => {
    button.addEventListener('click', async () => {
      STYLE_PREFERENCES = {
        ...STYLE_PREFERENCES,
        accent: ACCENT_PRESETS.some((preset) => preset.id === button.dataset.accentChoice)
          ? button.dataset.accentChoice
          : 'slate',
      };
      rememberStylePreferences();
      applyStylePreferences();
      renderPreferencesChoices();
      await refreshForThemeChange();
    });
  });

  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.addEventListener('click', () => setThemePreference(button.dataset.themeChoice));
  });
}

// Light, dark, or automatic (follow the system). Used by Preferences and the command palette.
async function setThemePreference(theme) {
  STYLE_PREFERENCES = {
    ...STYLE_PREFERENCES,
    theme: ['dark', 'auto'].includes(theme) ? theme : 'light',
  };
  rememberStylePreferences();
  applyStylePreferences();
  renderPreferencesChoices();
  await refreshForThemeChange();
}

async function refreshPreferencesStartupState() {
  const row = document.getElementById('preferences-startup-row');
  const toggle = document.getElementById('preferences-startup-toggle');
  if (!row || !toggle) return;

  try {
    const launchOnStartup = await window.api.getLaunchOnStartup();
    row.classList.toggle('hidden', !launchOnStartup?.manageable);
    toggle.checked = launchOnStartup?.enabled === true;
  } catch (_) {
    row.classList.add('hidden');
  }
}

async function openPreferencesDialog() {
  const overlay = document.getElementById('preferences-overlay');
  if (!overlay) return;

  ContextMenu.dismiss();
  renderPreferencesChoices();
  renderPreferencesSyncStatus();
  const userSummary = document.getElementById('preferences-user-summary');
  if (userSummary && currentUser) {
    userSummary.textContent = `Signed in as ${currentUser.display_name || currentUser.username || 'current user'}.`;
  }
  const capacitySection = document.getElementById('preferences-capacity-section');
  const dailyCapacity = document.getElementById('office-capacity-daily');
  const weeklyCapacity = document.getElementById('office-capacity-weekly');
  capacitySection?.classList.toggle('hidden', !isPartner());
  if (dailyCapacity) dailyCapacity.value = String(OFFICE_CAPACITY.dailyHours);
  if (weeklyCapacity) weeklyCapacity.value = String(OFFICE_CAPACITY.weeklyHours);

  overlay.classList.remove('hidden');
  await refreshPreferencesStartupState();
  try {
    const status = await window.api.getRuntimeStatus();
    applyRuntimeStatus(status);
    renderPreferencesSyncStatus(status);
  } catch (_) {
    renderPreferencesSyncStatus();
  }
}

function closePreferencesDialog() {
  document.getElementById('preferences-overlay')?.classList.add('hidden');
}

function setupPreferencesDialog() {
  const overlay = document.getElementById('preferences-overlay');
  if (!overlay || overlay.dataset.bound === 'true') return;
  overlay.dataset.bound = 'true';

  document.getElementById('preferences-close')?.addEventListener('click', closePreferencesDialog);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closePreferencesDialog();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.classList.contains('hidden')) {
      closePreferencesDialog();
    }
  });

  document.getElementById('preferences-refresh-sync')?.addEventListener('click', async () => {
    try {
      const status = await window.api.getRuntimeStatus();
      applyRuntimeStatus(status);
      renderPreferencesSyncStatus(status);
    } catch (_) {}
  });

  document.getElementById('preferences-sync-now')?.addEventListener('click', async () => {
    try {
      setSyncIndicatorState('syncing');
      await window.api.forceSync();
      await refreshExternalDataAndUI();
      await refreshRuntimeStatus();
      renderPreferencesSyncStatus();
    } catch (_) {
      setSyncIndicatorState('error');
    }
  });

  document.getElementById('preferences-check-updates')?.addEventListener('click', async () => {
    await window.api.checkForUpdates();
  });

  document.getElementById('office-capacity-save')?.addEventListener('click', async (event) => {
    const daily = Number(document.getElementById('office-capacity-daily')?.value);
    const weekly = Number(document.getElementById('office-capacity-weekly')?.value);
    if (!Number.isFinite(daily) || daily <= 0 || !Number.isFinite(weekly) || weekly <= 0) {
      showToast('Enter positive daily and weekly capacity values.', { tone: 'error' });
      return;
    }
    const result = await runUiAction(async () => window.api.saveOfficeCapacity({ dailyHours: daily, weeklyHours: weekly }), {
      button: event.currentTarget,
      pendingLabel: 'Saving...',
      errorMessage: 'Office capacity could not be saved.',
    });
    if (!result.ok || !result.result) return;
    OFFICE_CAPACITY = result.result;
    await refreshAll();
    showToast('Office capacity updated.', { tone: 'success' });
  });

  document.getElementById('preferences-startup-toggle')?.addEventListener('change', async (event) => {
    try {
      await window.api.setLaunchOnStartup(event.target.checked);
      await refreshPreferencesStartupState();
    } catch (error) {
      console.error('Could not update launch-on-startup setting:', error);
      await window.MyTasksConfirmDialog.alert({
        title: 'Startup setting not updated',
        message: 'Could not update the Windows startup setting.',
      });
      await refreshPreferencesStartupState();
    }
  });

  document.getElementById('preferences-sign-out')?.addEventListener('click', async () => {
    await window.api.logout();
    await window.api.setWindowMode('login');
    window.location.reload();
  });
}

function setupSyncMenu() {
  const indicator = document.getElementById('sync-indicator');
  if (!indicator || indicator.dataset.bound === 'true') return;
  indicator.dataset.bound = 'true';

  indicator.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    ContextMenu.dismiss();

    const items = [
      ...buildRuntimeStatusMenuItems(LAST_RUNTIME_STATUS),
      {
        label: 'Sync Now',
        action: async () => {
          try {
            setSyncIndicatorState('syncing');
            await window.api.forceSync();
            await refreshExternalDataAndUI();
            await refreshRuntimeStatus();
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

    const menu = ContextMenu.create(items);
    const rect = indicator.getBoundingClientRect();
    positionMenu(menu, Math.max(8, rect.right - 190), rect.bottom + 8);
  });
}

document.addEventListener('click', (event) => {
  const link = event.target.closest?.('[data-open-link]');
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();
  window.api.openLink(link.dataset.openLink);
});

function setupSettingsMenu() {
  const settingsBtn = document.getElementById('settings-btn');
  if (!settingsBtn || settingsBtn.dataset.bound === 'true') return;
  settingsBtn.dataset.bound = 'true';

  settingsBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await openPreferencesDialog();
    } catch (error) {
      console.error('Could not open preferences:', error);
      await window.MyTasksConfirmDialog.alert({
        title: 'Preferences did not open',
        message: 'MyTasks could not open Preferences. Please close and reopen the app, then try again.',
      });
    }
  });
}

// ── Init ────────────────────────────────────────────

initApp();
