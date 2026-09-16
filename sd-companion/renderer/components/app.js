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
let staffOverviewSearchQuery = '';
let staffOverviewDueTodayOnly = false;
let STYLE_PREFERENCES = { theme: 'light', detailPaneMode: 'permanent' };
let DETAIL_PANE_COLLAPSE = { staff: false, partner: false };

// ── Local data cache (populated from backend) ───────
let USERS = [];
let TASKS = [];
let PRIVATE_TASKS = [];
let PROJECTS = [];
let PTO_DATA = [];
let CUSTOM_PRIORITIES = [];
let PRIORITY_MENU_ORDER = [];
let PRIORITY_DISPLAY_STYLES = {};
let PROJECT_SHARED_NOTES_CACHE = {}; // projectId -> note[]
let SUBTASK_CACHE = {};       // taskId -> subtask[]
let COMMENT_CACHE = {};       // taskId -> comment[]
let UPDATE_UI_BOUND = false;
let WINDOW_CHROME_BOUND = false;
let SYNC_STATUS_RESET_TIMER = null;
let RESIZE_PERF_TIMER = null;
let RUNTIME_STATUS_BOUND = false;
let LAST_RUNTIME_STATUS = null;
let SYNC_BANNER_DISMISSED = false;
let SYSTEM_THEME_LISTENER_BOUND = false;
let ACTIVE_PROJECT_FOLDER_EDIT = null;
let ACTIVE_PROJECT_DETAIL_DRAFT = null;
let FORCE_COMMENT_SCROLL_TASK_ID = null;
let OPEN_COMMENT_DRAWER_TASK_ID = null;
let EXTERNAL_SYNC_REFRESH_PROMISE = null;
let EXTERNAL_SYNC_REFRESH_PENDING = false;
const LAST_VIEWED_TASK_KEY = 'mytasks:last-viewed-task-id';
const LAST_VIEWED_PROJECT_KEY = 'mytasks:last-viewed-project-id';
const LAST_ACTIVE_TAB_KEY = 'mytasks:last-active-tab';
const LAST_COMMENT_DRAWER_TASK_KEY = 'mytasks:last-comment-drawer-task-id';
const STAFF_FILTER_KEY = 'mytasks:staff-filter';
const STAFF_OVERVIEW_DUE_TODAY_KEY = 'mytasks:staff-overview-due-today';
const STAFF_SECTION_COLLAPSE_KEY = 'mytasks:staff-section-collapse';
const READONLY_STAFF_SELECTION_KEY = 'mytasks:readonly-staff-selection';
const PROJECT_SECTION_COLLAPSE_KEY = 'mytasks:project-section-collapse';
const STYLE_PREFERENCES_KEY = 'mytasks:style-preferences';
const DETAIL_PANE_COLLAPSE_KEY = 'mytasks:detail-pane-collapse';
const ACCENT_PRESETS = [
  {
    id: 'violet',
    label: 'Violet',
    light: { accent: '#4D4AD5', hover: '#3F3CC4', soft: '#EDEDFB', rgb: '77, 74, 213', strong: '#3C3489' },
    dark: { accent: '#8B7DFF', hover: '#A095FF', soft: 'rgba(139, 125, 255, 0.18)', rgb: '139, 125, 255', strong: '#C9C3FF' },
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
    light: { accent: '#2EAD7F', hover: '#248E68', soft: '#E8F7F1', rgb: '46, 173, 127', strong: '#1D7052' },
    dark: { accent: '#58CFA8', hover: '#78DCBA', soft: 'rgba(88, 207, 168, 0.18)', rgb: '88, 207, 168', strong: '#B5F0DC' },
  },
  {
    id: 'rose',
    label: 'Rose',
    light: { accent: '#D8487A', hover: '#B93B67', soft: '#FCEBF2', rgb: '216, 72, 122', strong: '#963052' },
    dark: { accent: '#F28BAF', hover: '#F5A6C1', soft: 'rgba(242, 139, 175, 0.18)', rgb: '242, 139, 175', strong: '#FFD0DF' },
  },
  {
    id: 'orange',
    label: 'Orange',
    light: { accent: '#C9782B', hover: '#A96522', soft: '#FBF0E5', rgb: '201, 120, 43', strong: '#874E18' },
    dark: { accent: '#F2B16D', hover: '#F5C286', soft: 'rgba(242, 177, 109, 0.18)', rgb: '242, 177, 109', strong: '#F9D7AD' },
  },
];
const STAFF_SECTION_COLLAPSE = {};
const PROJECT_SECTION_COLLAPSE = { active: false, future: true, inactive: true };
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

// ── Data Loading ────────────────────────────────────

async function loadAllData() {
  [USERS, TASKS, PROJECTS, PTO_DATA, CUSTOM_PRIORITIES, PRIORITY_MENU_ORDER, PRIORITY_DISPLAY_STYLES] = await Promise.all([
    window.api.getUsers(),
    window.api.getTasks(),
    window.api.getProjects(),
    window.api.getPTO(),
    window.api.getCustomPriorities(),
    window.api.getPriorityMenuOrder(),
    window.api.getPriorityDisplayStyles(),
  ]);

  if (!Array.isArray(PRIORITY_MENU_ORDER)) {
    PRIORITY_MENU_ORDER = [];
  }

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

function getProjectSharedNotes(projectId) {
  return orderProjectNotes(PROJECT_SHARED_NOTES_CACHE[projectId] || []);
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
  return isPartner() ? 'staff-view' : 'my-tasks';
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

function rememberStaffOverviewDueTodayPref() {
  writeScopedStorageJson(STAFF_OVERVIEW_DUE_TODAY_KEY, staffOverviewDueTodayOnly === true);
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

function normalizeStylePreferences(value) {
  const next = value && typeof value === 'object' ? value : {};
  return {
    theme: ['dark', 'auto'].includes(next.theme) ? next.theme : 'light',
    accent: ACCENT_PRESETS.some((preset) => preset.id === next.accent) ? next.accent : 'violet',
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
  if (!appShell || appShell.classList.contains('staff-readonly-overview')) return false;
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

  staffOverviewDueTodayOnly = readScopedStorageJson(STAFF_OVERVIEW_DUE_TODAY_KEY, false) === true;

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
  const tabs = ['my-tasks'];
  if (isPartner()) tabs.push('my-projects', 'staff-view');
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
  if (!projectId || !isPartner()) return null;
  const project = PROJECTS.find((candidate) => String(candidate.id) === String(projectId));
  return isProjectManagedByCurrentPartner(project) ? project : null;
}

function getMyTasksForCurrentView(query = '') {
  let tasks = isPartner() ? [...PRIVATE_TASKS] : getTasksForUser(currentUser.id);

  if (query) {
    const q = query.toLowerCase();
    tasks = tasks.filter((task) => getTaskSearchText(task).includes(q));
  }

  if (activeFilter === 'pending') tasks = tasks.filter((task) => !task.completed);
  else if (activeFilter === 'completed') tasks = tasks.filter((task) => task.completed);
  else if (activeFilter === 'overdue') tasks = tasks.filter((task) => isTaskOverdue(task));

  return sortTasksLikeScheduling(tasks);
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

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isTaskDueToday(task) {
  return !task?.completed && String(task?.due_date || '').slice(0, 10) === getTodayDateString();
}

function getTaskIdForDetailRestore({ allowFallback = false } = {}) {
  const visibleTasks = getMyTasksForCurrentView();

  const selectedTask = getRestorableTaskById(selectedTaskId, visibleTasks);
  if (selectedTask) return selectedTask.id;

  const storedTaskId = readLastViewedTaskId();
  const storedTask = getRestorableTaskById(storedTaskId, visibleTasks);
  if (storedTask) return storedTask.id;
  if (storedTaskId) forgetLastViewedTask();

  const storedProjectId = readLastViewedProjectId();
  const projectTask = storedProjectId
    ? visibleTasks.find((task) => String(task.project_id || '') === String(storedProjectId))
    : null;
  if (projectTask) return projectTask.id;

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

  await openDetailPanel(taskId);
  return true;
}

function getProjectIdForDetailRestore({ allowFallback = false } = {}) {
  if (!isPartner()) return null;

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

function getTaskPartnerLabel(task, project = null) {
  const linkedProject = project || getProjectById(task.project_id);
  if (linkedProject?.partner_initials) return linkedProject.partner_initials;

  const partner = getUserById(task.partner_id || linkedProject?.partner_id);
  return partner ? getInitials(partner) : '';
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

function getProjectActionItemTask(project) {
  if (!project) return null;
  const projectTasks = TASKS.filter((task) => String(task.project_id || '') === String(project.id || ''));
  return sortTasksLikeScheduling(projectTasks)[0] || null;
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
  return currentUser && currentUser.role === 'partner';
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

function getAvailableProjectsForTaskCreation() {
  if (isPartner()) {
    return getProjectsForCurrentPartner({ includeFuture: true, includeInactive: true });
  }

  return PROJECTS
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
  document.querySelectorAll('.task-card').forEach((card) => card.classList.remove('selected'));
  setDetailDrawerOpen(false);
  showDetailEmptyState();
}

function toggleTaskDetailPanel(taskId) {
  const isSameRenderedTask = String(selectedTaskId || '') === String(taskId || '')
    && !document.getElementById('detail-body')?.querySelector('.detail-empty-state');

  if (isSameRenderedTask) {
    clearSelectedTaskDetail();
    return;
  }

  openDetailPanel(taskId);
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

  await refreshAfterTaskChange(created?.id || null);
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
    setupAddPrivateTask();
    setupAddProject();
  }
  setupAddSelfTask();
  setupTabBar();
  setupSettingsMenu();
  setupPreferencesDialog();
  setupSyncMenu();
  setupSyncBanner();
  setupSystemThemeListener();
  setupMyTaskSearch();
  setupStaffOverviewControls();
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
      renderMyTasks();
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
      <button class="sidebar-staff-item ${selectedStaffFilter === user.id ? 'active' : ''}" data-user-id="${user.id}" type="button" aria-pressed="${selectedStaffFilter === user.id ? 'true' : 'false'}">
        <div class="avatar" style="background: ${user.avatar_color}">${getInitials(user)}</div>
        <span class="staff-name">${escapeHtml(getSidebarStaffName(user))}${pto ? ' <span class="badge badge-pto" style="font-size:8px;padding:1px 5px;margin-left:4px">' + pto.label + '</span>' : ''}</span>
        <span class="staff-count ${count === 0 ? 'zero' : ''}">${count}</span>
      </button>
    `;
  }).join('')}
  `;

  document.getElementById('staff-list').onclick = async (e) => {
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

function renderMyTaskSection(section) {
  if (!section.tasks.length) return '';

  return `
    <section class="my-task-section my-task-section-${section.id}">
      <div class="my-task-section-header">
        <div class="my-task-section-copy">
          <div class="my-task-section-title">${escapeHtml(section.title)}</div>
        </div>
        <span class="my-task-section-count">${section.tasks.length} task${section.tasks.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="my-task-section-list">
        ${section.tasks.map((task) => renderTaskCard(task, { isPrivate: isPartner() })).join('')}
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

function setupStaffOverviewControls() {
  const input = document.getElementById('staff-overview-search-input');
  const clearBtn = document.getElementById('staff-overview-search-clear');
  const dueToggle = document.getElementById('staff-due-today-toggle');
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

  if (dueToggle && dueToggle.dataset.bound !== 'true') {
    dueToggle.dataset.bound = 'true';
    dueToggle.addEventListener('click', () => {
      staffOverviewDueTodayOnly = !staffOverviewDueTodayOnly;
      rememberStaffOverviewDueTodayPref();
      renderStaffOverview();
    });
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

function setupKeyboardShortcuts() {
  if (document.body.dataset.mytasksShortcutsBound === 'true') return;
  document.body.dataset.mytasksShortcutsBound = 'true';

  document.addEventListener('keydown', async (event) => {
    const mod = event.ctrlKey || event.metaKey;

    if (mod && String(event.key || '').toLowerCase() === 'k') {
      event.preventDefault();
      const input = activeTab === 'staff-view'
        ? document.getElementById('staff-overview-search-input')
        : document.getElementById('my-task-search-input');
      if (activeTab !== 'staff-view') {
        if (!(await activateTab('my-tasks', { preserveStaffFilter: false }))) return;
      }
      input?.focus();
      input?.select();
      return;
    }

    if (mod && String(event.key || '').toLowerCase() === 'n') {
      if (isEditableShortcutTarget(event.target)) return;
      event.preventDefault();
      if (activeTab !== 'my-tasks') {
        if (!(await activateTab('my-tasks', { preserveStaffFilter: false }))) return;
      }
      if (isPartner()) {
        document.getElementById('add-private-task-btn')?.click();
      } else if (canCurrentUserAddOwnTasks()) {
        document.getElementById('add-self-task-btn')?.click();
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
      const openOverlay = document.querySelector('.dialog-overlay:not(.hidden)');
      if (openOverlay) return;
      if (activeTab === 'my-tasks' && myTaskSearchQuery) {
        const input = document.getElementById('my-task-search-input');
        if (input) input.value = '';
        myTaskSearchQuery = '';
        document.getElementById('my-task-search-clear')?.classList.add('hidden');
        renderMyTasks();
        return;
      }
      if (activeTab === 'staff-view' && (staffOverviewSearchQuery || staffOverviewDueTodayOnly)) {
        const input = document.getElementById('staff-overview-search-input');
        if (input) input.value = '';
        staffOverviewSearchQuery = '';
        staffOverviewDueTodayOnly = false;
        rememberStaffOverviewDueTodayPref();
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
  const tasks = getMyTasksForCurrentView(query);

  const container = document.getElementById('my-task-list');
  const allTasks = isPartner() ? PRIVATE_TASKS : getTasksForUser(currentUser.id);
  const totalPending = allTasks.filter(t => !t.completed).length;

  const myTaskCountEl = document.getElementById('my-task-count');
  if (myTaskCountEl) {
    myTaskCountEl.textContent = activeFilter
      ? `${tasks.length} of ${allTasks.length}`
      : `${totalPending} tasks`;
  }

  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M8.5 12.5l2.5 2.5 5-5"></path></svg></div>
        <div class="empty-state-text">${query ? 'No tasks match your search' : activeFilter ? 'No ' + activeFilter + ' tasks' : isPartner() ? 'No private tasks yet' : 'No tasks assigned this week'}</div>
      </div>
    `;
    return;
  }

  const waitingTasks = tasks.filter((task) => task.priority === PRIORITY_WAIT && !task.completed);
  const dueTodayTasks = tasks.filter(isTaskDueToday);
  const dueTodayIds = new Set(dueTodayTasks.map((task) => task.id));
  const activeTasks = tasks.filter((task) => !(task.priority === PRIORITY_WAIT && !task.completed) && !dueTodayIds.has(task.id));
  const waitingTasksWithoutDueToday = waitingTasks.filter((task) => !dueTodayIds.has(task.id));

  const sections = [
    { id: 'due-today', title: 'Due Today', tasks: dueTodayTasks },
    { id: 'active', title: 'Active', tasks: activeTasks },
    { id: 'waiting', title: 'Waiting', tasks: waitingTasksWithoutDueToday },
  ];

  container.innerHTML = sections.map(renderMyTaskSection).join('');
  attachTaskCardEvents(container);
}

// ── My Projects (from Excel, partner only) ──────────

function renderMyProjects() {
  const projects = getProjectsForCurrentPartner({ includeFuture: true, includeInactive: true });

  document.getElementById('my-projects-count').textContent = `${projects.length} projects`;

  const activeProjects = projects.filter((project) => getProjectSection(project) === 'active');
  const futureProjects = projects.filter((project) => getProjectSection(project) === 'future');
  const inactiveProjects = projects.filter((project) => getProjectSection(project) === 'inactive');
  const container = document.getElementById('my-projects-list');

  if (projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"></path></svg></div>
        <div class="empty-state-text">No projects assigned to your initials yet</div>
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
  document.getElementById('add-task-subtitle').textContent = 'Tasks added here are private to you';

  const titleInput = document.getElementById('add-task-title-input');
  document.getElementById('add-task-notes-input').value = '';
  populatePrioritySelect(currentUser?.id || null);
  document.getElementById('add-task-due').value = '';
  titleInput.value = '';
  titleInput.placeholder = 'Task title / search projects...';
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
    if (!requireTextInput(titleInput, 'Enter a task title.')) return;
    const title = titleInput.value.trim();

    const payload = buildPrivateTaskPayloadFromInput({
      title,
      notes: document.getElementById('add-task-notes-input').value,
      priorityValue: document.getElementById('add-task-priority').value,
      dueDate: document.getElementById('add-task-due').value,
      base: {
        project_id: selectedProjectId,
      },
    });

    const button = document.getElementById('add-task-save');
    const outcome = await runUiAction(async () => {
      await window.api.createPrivateTask(payload);
      await loadAllData();
      await refreshAll();
    }, {
      button,
      pendingLabel: 'Adding...',
      successMessage: 'Task added.',
      errorMessage: 'Task could not be added.',
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
    <div class="task-card ${task.completed ? 'completed' : ''} ${String(selectedTaskId) === String(task.id) ? 'selected' : ''} ${readOnly ? 'read-only' : ''} ${task.priority === PRIORITY_WAIT ? 'wait' : ''} ${hasMeta ? 'has-activity' : ''}" data-task-id="${task.id}" ${isPrivate ? 'data-private="true"' : ''} ${readOnly ? 'data-read-only="true"' : ''} ${readOnly ? '' : 'tabindex="0" role="button"'}>
      <div class="task-check">
        <div class="task-checkbox ${task.completed ? 'checked' : ''} ${readOnly ? 'read-only' : ''}" data-task-id="${task.id}" ${isPrivate ? 'data-private="true"' : ''} ${readOnly ? 'data-read-only="true"' : `tabindex="0" role="checkbox" aria-checked="${task.completed ? 'true' : 'false'}" aria-label="${task.completed ? 'Mark task incomplete' : 'Mark task complete'}"`}></div>
      </div>
      <div class="task-body">
        <div class="task-top-row">
          <span class="task-priority ${priority.className} ${canManagePriority ? 'task-priority-interactive' : ''}" style="${priority.inlineStyle}" ${canManagePriority ? `data-priority-task-id="${task.id}" tabindex="0" role="button" aria-label="Change priority: ${escapeAttr(priority.label)}"` : ''} title="${escapeAttr(priority.label)}">${escapeHtml(priority.shortLabel || priority.label)}</span>
          <span class="task-title">${escapeHtml(displayTitle)}</span>
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

async function refreshAll() {
  renderStatsBar();
  if (isPartner()) {
    renderSidebar();
  }
  if (activeTab === 'my-projects') renderMyProjects();
  else if (activeTab === 'staff-view') renderStaffOverview();
  else renderMyTasks();
}

function updateStaffOverviewControls({ visibleTaskCount = 0, dueTodayCount = 0 } = {}) {
  const countEl = document.getElementById('staff-overview-count');
  const dueToggle = document.getElementById('staff-due-today-toggle');
  const dueCountEl = document.getElementById('staff-due-today-count');
  const searchClear = document.getElementById('staff-overview-search-clear');

  if (countEl) {
    countEl.textContent = `${visibleTaskCount} task${visibleTaskCount !== 1 ? 's' : ''}`;
  }
  if (dueToggle) {
    dueToggle.classList.toggle('hidden', dueTodayCount === 0);
    dueToggle.classList.toggle('active', staffOverviewDueTodayOnly);
    dueToggle.setAttribute('aria-pressed', staffOverviewDueTodayOnly ? 'true' : 'false');
  }
  if (dueCountEl) {
    dueCountEl.textContent = String(dueTodayCount);
  }
  searchClear?.classList.toggle('hidden', !staffOverviewSearchQuery.trim());
}

// ── Staff Overview (Partner) ────────────────────────

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
    let tasks = sortTasksLikeScheduling(getTasksForUser(user.id));
    if (query) {
      tasks = tasks.filter((task) => getTaskSearchText(task).includes(query));
    }
    if (staffOverviewDueTodayOnly) {
      tasks = tasks.filter(isTaskDueToday);
    }
    return tasks;
  };

  const dueTodayCount = staffUsers
    .flatMap((user) => sortTasksLikeScheduling(getTasksForUser(user.id)))
    .filter(isTaskDueToday)
    .length;
  if (dueTodayCount === 0 && staffOverviewDueTodayOnly) {
    staffOverviewDueTodayOnly = false;
    rememberStaffOverviewDueTodayPref();
  }
  const visibleTaskCount = staffUsers.reduce((sum, user) => sum + getVisibleStaffTasks(user).length, 0);
  updateStaffOverviewControls({ visibleTaskCount, dueTodayCount });

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
                        <div class="staff-readonly-group-subtitle">${pendingCount} active task${pendingCount !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    ${pto ? `<span class="pto-badge">${pto.label}</span>` : ''}
                  </div>
                  <div class="staff-readonly-group-list">
                    ${tasks.length === 0 ? `
                      <div class="empty-state">
                        <div class="empty-state-text">${query || staffOverviewDueTodayOnly ? 'No tasks match this view' : 'No tasks assigned'}</div>
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

  const filteredStaffRows = staffUsers.map(user => {
    const allTasks = sortTasksLikeScheduling(getTasksForUser(user.id));
    const tasks = getVisibleStaffTasks(user);
    const pending = allTasks.filter(t => !t.completed);
    const pto = getPTOForUser(user.id);
    const isFiltering = Boolean(query) || staffOverviewDueTodayOnly;
    const isCollapsed = isFiltering
      ? false
      : !isReadOnlyStaffView && selectedStaffFilter
      ? user.id !== selectedStaffFilter
      : (STAFF_SECTION_COLLAPSE[user.id] ?? true);

    return `
      <div class="staff-section">
        <button class="staff-section-header" data-staff-toggle="${user.id}">
          <div class="avatar" style="background: ${user.avatar_color}">${getInitials(user)}</div>
          <span class="staff-section-name">${user.display_name}</span>
          ${pto ? `<span class="pto-badge">${pto.label}</span>` : ''}
          <span class="staff-section-count">${tasks.length}${isFiltering ? ` of ${allTasks.length}` : ''} task${tasks.length !== 1 ? 's' : ''}</span>
          <span class="staff-section-chevron">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
        </button>
        <div class="staff-section-tasks ${isCollapsed ? 'hidden' : ''}" data-staff-id="${user.id}">
          ${tasks.length === 0 ? `
            <div class="empty-state" style="padding:20px">
              <div class="empty-state-text">${isFiltering ? 'No tasks match this view' : 'No tasks assigned'}</div>
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

  container.innerHTML = filteredStaffRows;

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
      rememberStaffSectionCollapsePrefs();

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
  document.getElementById('add-task-subtitle').textContent = `Start typing to filter projects, or browse and select below. Assigning to ${staffUser.display_name}`;

  const titleInput = document.getElementById('add-task-title-input');
  document.getElementById('add-task-notes-input').value = '';
  populatePrioritySelect(staffId);
  document.getElementById('add-task-due').value = '';
  titleInput.value = '';
  titleInput.placeholder = 'Task title / search projects...';
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
    if (!requireTextInput(titleInput, 'Enter a task title.')) return;
    const title = titleInput.value.trim();

    const payload = buildSharedTaskPayloadFromInput({
      title,
      notes: document.getElementById('add-task-notes-input').value,
      priorityValue: document.getElementById('add-task-priority').value,
      dueDate: document.getElementById('add-task-due').value,
      base: {
        project_id: selectedProjectId,
        assigned_to: staffId,
        created_by: currentUser.id,
        partner_id: project?.partner_id || currentUser.id,
      },
    });

    const button = document.getElementById('add-task-save');
    const outcome = await runUiAction(async () => {
      await window.api.createTask(payload);
      await loadAllData();
      await refreshAll();
    }, {
      button,
      pendingLabel: 'Adding...',
      successMessage: 'Task assigned.',
      errorMessage: 'Task could not be assigned.',
    });
    if (outcome.ok) close();
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
    document.getElementById('add-task-subtitle').textContent = 'Start typing to filter projects, or browse and select below';

    const titleInput = document.getElementById('add-task-title-input');
    document.getElementById('add-task-notes-input').value = '';
    populatePrioritySelect(currentUser.id);
    document.getElementById('add-task-due').value = '';
    titleInput.value = '';
    titleInput.placeholder = 'Task title / search projects...';
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
      if (!requireTextInput(titleInput, 'Enter a task title.')) return;
      const title = titleInput.value.trim();

      const payload = buildSharedTaskPayloadFromInput({
        title,
        notes: document.getElementById('add-task-notes-input').value,
        priorityValue: document.getElementById('add-task-priority').value,
        dueDate: document.getElementById('add-task-due').value,
        base: {
          project_id: selectedProjectId,
          assigned_to: currentUser.id,
          created_by: currentUser.id,
          partner_id: project?.partner_id || null,
        },
      });

      const button = document.getElementById('add-task-save');
      const outcome = await runUiAction(async () => {
        await window.api.createTask(payload);
        await loadAllData();
        await refreshAll();
      }, {
        button,
        pendingLabel: 'Adding...',
        successMessage: 'Task added.',
        errorMessage: 'Task could not be added.',
      });
      if (outcome.ok) close();
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
          <span class="subtask-title">${escapeHtml(subtask.title)}</span>
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

  const selectedStaffIds = activeTab === 'staff-view'
    ? (selectedReadonlyStaffIds.length ? selectedReadonlyStaffIds : (selectedStaffFilter ? [selectedStaffFilter] : []))
    : (selectedStaffFilter ? [selectedStaffFilter] : []);
  if (selectedStaffIds.length) return selectedStaffIds;

  if (task.assigned_to) return [task.assigned_to];
  if (task.owner_id) return [task.owner_id];
  return [];
}

function renderActionItemAssigneeChecklist(task, selectedAssigneeIds) {
  const assignedUsers = getTaskAssignees(task);
  const assignedIds = new Set(assignedUsers.map((user) => user.id));
  const unassignedUsers = getActiveStaffUsers().filter((user) => !assignedIds.has(user.id));

  const renderDivider = (label) => `
    <div class="dialog-checklist-divider">
      <div class="dialog-checklist-divider-line"></div>
      <span class="dialog-checklist-divider-label">${escapeHtml(label)}</span>
      <div class="dialog-checklist-divider-line"></div>
    </div>
  `;

  const renderUserRow = (user) => `
    <label class="dialog-checklist-row ${selectedAssigneeIds.has(user.id) ? 'active' : ''}" data-subtask-assignee-row="${user.id}">
      <input type="checkbox" value="${user.id}" ${selectedAssigneeIds.has(user.id) ? 'checked' : ''}>
      <span class="dialog-checklist-avatar" style="background:${user.avatar_color}">${escapeHtml(getInitials(user))}</span>
      <span class="dialog-checklist-name">${escapeHtml(user.display_name)}</span>
    </label>
  `;

  const sections = [];
  if (assignedUsers.length) {
    sections.push(renderDivider('Assigned'));
    sections.push(assignedUsers.map(renderUserRow).join(''));
  }
  if (unassignedUsers.length) {
    sections.push(renderDivider('Unassigned'));
    sections.push(unassignedUsers.map(renderUserRow).join(''));
  }
  return sections.join('');
}

function openAddSubtaskDialog(task, subtask = null, options = {}) {
  if (!canCurrentUserAddActionItems(task)) return;

  const overlay = document.getElementById('add-subtask-overlay');
  const ownerTask = getTaskThreadOwner(task) || task;
  const titleInput = document.getElementById('add-subtask-title');
  const assigneeList = document.getElementById('add-subtask-assignee-list');
  const saveButton = document.getElementById('add-subtask-save');
  const assigneeOptions = getActionItemAssigneeOptions(task);
  const selectedAssigneeIds = new Set(
    getPreferredActionItemAssigneeIds(task, subtask).filter((id) => assigneeOptions.some((user) => user.id === id))
  );

  overlay.classList.remove('hidden');
  document.getElementById('add-subtask-subtitle').textContent = task.title;
  saveButton.textContent = subtask ? 'Save Action Item' : 'Add Action Item';
  titleInput.value = subtask?.title || '';
  assigneeList.innerHTML = assigneeOptions.length === 0
    ? '<div class="detail-empty-copy">No staff available.</div>'
    : renderActionItemAssigneeChecklist(task, selectedAssigneeIds);

  assigneeList.querySelectorAll('[data-subtask-assignee-row]').forEach((row) => {
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox?.addEventListener('change', () => {
      row.classList.toggle('active', checkbox.checked);
    });
  });

  const focusTarget = options.focusAssignees
    ? assigneeList.querySelector('input[type="checkbox"]')
    : titleInput;
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
    const nextAssignedIds = [...assigneeList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);

    const outcome = await runUiAction(async () => {
      if (subtask) {
        await window.api.updateSubTask({
          id: subtask.id,
          title,
          assigned_to: nextAssignedIds[0] || null,
          assigned_to_ids: nextAssignedIds,
        });
      } else {
        await window.api.createSubTask({
          task_id: ownerTask.id,
          title,
          assigned_to: nextAssignedIds[0] || null,
          assigned_to_ids: nextAssignedIds,
        });
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

// ── Project Notes Dialog ────────────────────────────

async function openProjectDetailPanel(projectId) {
  if (hasUnsavedProjectDetailChanges()
    && String(projectId) === String(ACTIVE_PROJECT_DETAIL_DRAFT?.projectId)) {
    return false;
  }
  if (!(await confirmDiscardProjectDetailChanges(projectId))) return false;
  const project = getProjectById(projectId);
  if (!project) return;

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
  const actionItemTask = getProjectActionItemTask(project);
  const subtasks = actionItemTask ? getTaskActionItems(actionItemTask) : [];
  const canManageActionItems = Boolean(actionItemTask && canCurrentUserAddActionItems(actionItemTask));
  const statusLabel = getProjectSection(project).toUpperCase();

  const projectFullTitle = `${project.client || ''} | ${project.name || ''}`.trim();
  const header = document.getElementById('detail-header');
  header.innerHTML = `
    <div class="detail-header-copy">
      <h3 class="detail-title" id="detail-title" title="${escapeAttr(projectFullTitle)}">${escapeHtml(projectFullTitle)}</h3>
      <div class="detail-subtitle ${project.notes ? '' : 'is-empty'}">${project.notes ? escapeHtml(project.notes) : '&nbsp;'}</div>
    </div>
  `;

  const detailBody = document.getElementById('detail-body');
  detailBody.className = 'detail-body project-detail-body';
  detailBody.innerHTML = `
    <section class="detail-panel-section">
      <div class="detail-section-heading">Details</div>
      <div class="detail-summary-grid">
        <div class="detail-summary-item">
          <div class="detail-summary-label">Status</div>
          <div class="detail-field-value">${escapeHtml(statusLabel)}</div>
        </div>
      </div>
      <div class="project-detail-form">
        <div class="detail-field">
          <div class="detail-field-label">Client Name</div>
          <input type="text" class="input" id="project-detail-client" value="${escapeAttr(project.client || '')}">
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Project Name</div>
          <input type="text" class="input" id="project-detail-name" value="${escapeAttr(project.name || '')}">
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Scheduling Notes</div>
          <input type="text" class="input" id="project-detail-notes" value="${escapeAttr(project.notes || '')}" placeholder="Short note shown in Dashboard and project cards.">
        </div>
        <div class="detail-actions project-detail-actions">
          <span class="project-detail-save-state" id="project-detail-save-state" role="status">Saved</span>
          <button class="btn btn-primary btn-sm" id="project-detail-save" disabled>Save Changes</button>
        </div>
      </div>
    </section>

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

    <section class="detail-panel-section">
      <div class="detail-section-heading">Action Items</div>
      ${subtasks.length === 0 ? `
        <div class="detail-empty-copy">${actionItemTask ? 'No action items yet' : 'Create a task for this project before adding action items.'}</div>
      ` : subtasks.map((subtask) => `
        <div class="subtask-item ${subtask.completed ? 'completed' : ''}" data-subtask-id="${subtask.id}">
          <div class="task-checkbox ${subtask.completed ? 'checked' : ''}" data-subtask-id="${subtask.id}" tabindex="0" role="checkbox" aria-checked="${subtask.completed ? 'true' : 'false'}" aria-label="${subtask.completed ? 'Mark action item incomplete' : 'Mark action item complete'}"></div>
          <span class="subtask-title">${escapeHtml(subtask.title)}</span>
          ${renderActionItemAssignees(subtask)}
        </div>
      `).join('')}
      ${canManageActionItems ? '<button class="detail-add-link" id="project-add-subtask-btn" type="button">+ Add action item</button>' : ''}
    </section>
  `;

  document.getElementById('project-detail-project-notes').addEventListener('click', () => {
    window.api.openProjectNotesWindow(project.id);
  });

  const projectDetailInputs = [
    document.getElementById('project-detail-client'),
    document.getElementById('project-detail-name'),
    document.getElementById('project-detail-notes'),
  ];
  const originalProjectValues = [project.client || '', project.name || '', project.notes || ''];
  const projectSaveButton = document.getElementById('project-detail-save');
  const projectSaveState = document.getElementById('project-detail-save-state');
  ACTIVE_PROJECT_DETAIL_DRAFT = { projectId: project.id, dirty: false };

  const syncProjectDirtyState = () => {
    const dirty = projectDetailInputs.some((input, index) => input.value.trim() !== originalProjectValues[index]);
    ACTIVE_PROJECT_DETAIL_DRAFT = { projectId: project.id, dirty };
    projectSaveButton.disabled = !dirty;
    projectSaveState.textContent = dirty ? 'Unsaved changes' : 'Saved';
    projectSaveState.classList.toggle('is-dirty', dirty);
  };
  projectDetailInputs.forEach((input) => input.addEventListener('input', syncProjectDirtyState));

  document.getElementById('project-detail-save').addEventListener('click', async () => {
    const client = document.getElementById('project-detail-client').value.trim();
    const name = document.getElementById('project-detail-name').value.trim();
    const notes = document.getElementById('project-detail-notes').value.trim();
    if (!requireTextInput(document.getElementById('project-detail-client'), 'Enter a client name.')) return;
    if (!requireTextInput(document.getElementById('project-detail-name'), 'Enter a project name.')) return;

    const outcome = await runUiAction(async () => {
      await window.api.updateProject({
        id: project.id,
        client,
        name,
        notes,
      });
      ACTIVE_PROJECT_DETAIL_DRAFT = null;
      await loadAllData();
      renderMyProjects();
      await openProjectDetailPanel(project.id);
    }, {
      button: projectSaveButton,
      pendingLabel: 'Saving...',
      successMessage: 'Project changes saved.',
      errorMessage: 'Project changes could not be saved.',
    });
    if (!outcome.ok) syncProjectDirtyState();
  });

  const panel = document.getElementById('detail-panel');
  panel.querySelectorAll('.task-checkbox[data-subtask-id]').forEach((checkbox) => {
    checkbox.addEventListener('click', async () => {
      const subId = checkbox.dataset.subtaskId;
      await window.api.toggleSubTask(subId);
      await loadAllData();
      await refreshAll();
      await openProjectDetailPanel(project.id);
    });
    checkbox.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      checkbox.click();
    });
  });

  panel.querySelectorAll('.subtask-item[data-subtask-id]').forEach((item) => {
    item.addEventListener('contextmenu', (event) => {
      if (!canManageActionItems || !actionItemTask) return;
      const subtask = subtasks.find((candidate) => candidate.id === item.dataset.subtaskId);
      if (!subtask) return;
      event.preventDefault();
      event.stopPropagation();
      openActionItemContextMenu(event, actionItemTask, subtask, { returnToProjectId: project.id });
    });
  });

  document.getElementById('project-add-subtask-btn')?.addEventListener('click', () => {
    if (!actionItemTask) return;
    openAddSubtaskDialog(actionItemTask, null, { returnToProjectId: project.id });
  });

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
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      await activateTab(tab.dataset.tab, { preserveStaffFilter: false });
    });
  });
}

function syncActiveTabLayout() {
  const appShell = document.getElementById('app-shell');
  if (!appShell) return;

  const isReadOnlyStaffOverview = !isPartner() && activeTab === 'staff-view' && canCurrentUserUseStaffOverview();
  appShell.classList.toggle('staff-readonly-overview', isReadOnlyStaffOverview);
  applyStylePreferences();
}

async function activateTab(tabName, options = {}) {
  const { preserveStaffFilter = false } = options;
  const canUseStaffOverview = canCurrentUserUseStaffOverview();

  if (tabName === 'staff-view' && !canUseStaffOverview) {
    tabName = 'my-tasks';
  }

  if (tabName === 'my-projects' && !isPartner()) {
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

  const failureCount = status?.syncFailures?.count || 0;
  const text = failureCount > 0
    ? `${failureCount} sync issue${failureCount === 1 ? '' : 's'}`
    : formatStatusTimestamp(status?.lastSyncAt);

  const sharedPath = status?.sharedDrivePath || 'Not configured';
  const sharedState = status?.sharedDrivePath
    ? (status.sharedDriveReachable ? 'reachable' : 'unavailable')
    : 'not configured';

  const tooltip = `${text}\nShared folder: ${sharedPath}\nStatus: ${sharedState}`;
  indicator.querySelector('.sync-dot')?.classList.toggle('error', failureCount > 0 || sharedState === 'unavailable');
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

  if (!unreachable && !hasSyncFailures) {
    SYNC_BANNER_DISMISSED = false;
    banner.classList.add('hidden');
    return;
  }

  if (bannerText) {
    bannerText.textContent = unreachable
      ? "Can't reach the shared sync folder. Your changes are saved locally and will sync once it's back."
      : `${failureCount} sync change${failureCount === 1 ? '' : 's'} could not be applied. Your current data may be incomplete.`;
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
      await refreshRuntimeStatus();
    }, { button, pendingLabel: 'Retrying...', successMessage: 'Sync retry finished.' });
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
          : 'violet',
      };
      rememberStylePreferences();
      applyStylePreferences();
      renderPreferencesChoices();
      await refreshForThemeChange();
    });
  });

  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.addEventListener('click', async () => {
      STYLE_PREFERENCES = {
        ...STYLE_PREFERENCES,
        theme: ['dark', 'auto'].includes(button.dataset.themeChoice) ? button.dataset.themeChoice : 'light',
      };
      rememberStylePreferences();
      applyStylePreferences();
      renderPreferencesChoices();
      await refreshForThemeChange();
    });
  });
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
      await refreshRuntimeStatus();
      renderPreferencesSyncStatus();
    } catch (_) {
      setSyncIndicatorState('error');
    }
  });

  document.getElementById('preferences-check-updates')?.addEventListener('click', async () => {
    await window.api.checkForUpdates();
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
