// ── SD Companion App ────────────────────────────────
// Connected to real backend via IPC

let currentUser = null;
let selectedTaskId = null;
let selectedProjectId = null;
let selectedStaffFilter = null;
let activeFilter = null; // 'pending' | 'completed' | 'overdue' | null
let activeTab = 'my-tasks';

// ── Local data cache (populated from backend) ───────
let USERS = [];
let TASKS = [];
let PRIVATE_TASKS = [];
let PROJECTS = [];
let PTO_DATA = [];
let CUSTOM_PRIORITIES = [];
let PROJECT_NOTES_CACHE = {}; // projectId -> notes string
let SUBTASK_CACHE = {};       // taskId -> subtask[]
let COMMENT_CACHE = {};       // taskId -> comment[]
let UPDATE_UI_BOUND = false;
let WINDOW_CHROME_BOUND = false;
let SYNC_STATUS_RESET_TIMER = null;
let RESIZE_PERF_TIMER = null;
const STAFF_SECTION_COLLAPSE = {};
const PROJECT_SECTION_COLLAPSE = { active: false, future: true, inactive: true };

// ── Data Loading ────────────────────────────────────

async function loadAllData() {
  [USERS, TASKS, PROJECTS, PTO_DATA, CUSTOM_PRIORITIES] = await Promise.all([
    window.api.getUsers(),
    window.api.getTasks(),
    window.api.getProjects(),
    window.api.getPTO(),
    window.api.getCustomPriorities(),
  ]);

  if (currentUser && currentUser.role === 'partner') {
    PRIVATE_TASKS = await window.api.getPrivateTasks();
  } else {
    PRIVATE_TASKS = [];
  }

  // Load project notes
  const allNotes = await window.api.getAllProjectNotes();
  PROJECT_NOTES_CACHE = {};
  for (const pn of allNotes) {
    PROJECT_NOTES_CACHE[pn.project_id] = pn.notes;
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

// ── Helpers ─────────────────────────────────────────

function getInitials(user) {
  if (!user) return '??';
  const f = user.first_name || user.display_name?.split(' ')[0] || '';
  const l = user.last_name || user.display_name?.split(' ').slice(1).join(' ') || '';
  return ((f[0] || '') + (l[0] || '')).toUpperCase() || '??';
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

function canCurrentUserAddActionItems(task) {
  return Boolean(
    task &&
    (
      canPartnerManageTask(task) ||
      (canCurrentUserAddOwnTasks() && task.assigned_to === currentUser?.id)
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

function getPriorityTone(priority) {
  if (priority <= 1) return { color: 'var(--priority-1)', background: 'var(--priority-bg-1)' };
  if (priority === 2) return { color: 'var(--priority-2)', background: 'var(--priority-bg-2)' };
  if (priority === 3) return { color: 'var(--priority-3)', background: 'var(--priority-bg-3)' };
  return { color: 'var(--priority-4)', background: 'var(--priority-bg-4)' };
}

function getPriorityInlineStyle(priority) {
  const tone = getPriorityTone(priority);
  return tone ? `color:${tone.color};background:${tone.background};` : '';
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
    return { label: '–', className: 'punset', inlineStyle: '' };
  }

  if (priority === -1) {
    return { label: 'W', className: 'pw', inlineStyle: '' };
  }

  if (priority === -2 && task.priority_label) {
    const customLabel = task.priority_label.replace(/^cp:/, '');
    const customPriority = CUSTOM_PRIORITIES.find((item) => item.label === customLabel);
    const inlineStyle = customPriority
      ? `color:${customPriority.color};background:${customPriority.color}18;`
      : '';
    return { label: customLabel, className: 'pcustom', inlineStyle };
  }

  if (typeof priority === 'number' && priority >= 1) {
    return { label: String(priority), className: 'pnumeric', inlineStyle: getPriorityInlineStyle(priority) };
  }

  return { label: '–', className: 'punset', inlineStyle: '' };
}

function formatDate(dateStr) {
  if (!dateStr) return { text: '', cls: '' };
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((d - today) / 86400000);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const isCurrentWeek = d >= weekStart && d <= weekEnd;
  const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const text = isCurrentWeek ? weekday : formatted;

  if (diff < 0) return { text, cls: 'overdue' };
  if (diff <= 3) return { text, cls: 'soon' };
  return { text, cls: '' };
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

function buildPriorityMenuItems(task) {
  const maxPriority = getSharedPriorityTaskCount(task.assigned_to);
  const items = [];

  for (let i = 1; i <= maxPriority; i++) {
    items.push({
      label: String(i),
      color: getPriorityTone(i).color,
      action: async () => {
        await window.api.updateTask({ id: task.id, priority: i, priority_label: null });
        await refreshAfterTaskChange(task.id);
      }
    });
  }

  items.push({ divider: true });
  items.push({
    label: 'W (Wait)',
    color: 'var(--priority-w)',
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
  if (!confirm(`Delete '${task.title}'?`)) return;
  await window.api.deleteTask(task.id);
  await refreshAfterTaskChange(task.id);
}

function openEditSharedTaskDialog(task) {
  const project = getProjectById(task.project_id);
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
          <select class="select" id="edit-task-assignee">
            ${staffOptions}
          </select>
        </div>
        <div style="display:flex;gap:12px">
          <div class="form-group" style="flex:1">
            <label>Priority</label>
            <select class="select" id="edit-task-priority">
              <option value="0" ${!task.priority ? 'selected' : ''}>None</option>
              <option value="1" ${task.priority === 1 ? 'selected' : ''}>1 - Urgent</option>
              <option value="2" ${task.priority === 2 ? 'selected' : ''}>2 - High</option>
              <option value="3" ${task.priority === 3 ? 'selected' : ''}>3 - Medium</option>
              <option value="4" ${task.priority === 4 ? 'selected' : ''}>4 - Low</option>
              <option value="w" ${task.priority === -1 ? 'selected' : ''}>W - Wait</option>
              ${CUSTOM_PRIORITIES.map((priority) => `
                <option value="cp:${escapeAttr(priority.label)}" ${task.priority === -2 && task.priority_label === `cp:${priority.label}` ? 'selected' : ''}>${escapeHtml(priority.label)}</option>
              `).join('')}
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
        <button class="btn btn-danger" id="edit-task-delete">Delete Task</button>
        <div style="flex:1"></div>
        <button class="btn btn-ghost" id="edit-task-cancel">Cancel</button>
        <button class="btn btn-primary" id="edit-task-save">Save Changes</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

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

  overlay.querySelector('#edit-task-delete').addEventListener('click', async () => {
    close();
    await deleteSharedTask(task);
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
  const moveTargets = getActiveStaffUsers(task.assigned_to).map((user) => ({
    label: user.display_name,
    action: async () => {
      await window.api.updateTask({ id: task.id, assigned_to: user.id });
      await refreshAfterTaskChange(task.id);
    }
  }));

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
  items.push({
    label: 'Delete Task',
    danger: true,
    action: async () => {
      await deleteSharedTask(task);
    }
  });

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
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const subtitleEl = document.getElementById('login-subtitle');
  const titleEl = document.getElementById('login-title');
  const usersEl = document.getElementById('login-users');
  const errorEl = document.getElementById('login-error');

  function setLoginHeading(title, subtitle) {
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
  }

  function resetLoginState() {
    usersEl.innerHTML = '';
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
    errorEl.innerHTML = '';
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
  const config = await window.api.getConfig();
  if (!config || !config.sharedDrivePath) {
    resetLoginState();
    setLoginHeading('Connect', 'Select the StudioSync folder or its data folder to connect.');
    usersEl.innerHTML = `
      <button class="btn btn-primary" id="setup-btn">Select Shared Drive Folder</button>
    `;
    document.getElementById('setup-btn').addEventListener('click', async () => {
      const folderPath = await window.api.selectFolder();
      await initializeSelectedFolder(folderPath);
    });
    return;
  }

  const existingUsers = await window.api.getUsers();
  if (existingUsers.length === 0) {
    resetLoginState();
    setLoginHeading('Connect', 'Select the StudioSync folder or its data folder to connect.');
    errorEl.classList.remove('hidden');
    errorEl.textContent = 'No users were found in the configured shared folder yet.';
    usersEl.innerHTML = `
      <button class="btn btn-primary" id="setup-btn">Select Shared Drive Folder</button>
    `;
    document.getElementById('setup-btn').addEventListener('click', async () => {
      const folderPath = await window.api.selectFolder();
      await initializeSelectedFolder(folderPath);
    });
    return;
  }

  // Show username login form
  resetLoginState();
  setLoginHeading('Sign In', 'Enter your username to continue.');
  usersEl.innerHTML = `
    <div class="login-form">
      <input type="text" id="login-username" class="input" placeholder="e.g. nchiappetta" autocomplete="off" spellcheck="false">
      <button class="btn btn-primary auth-submit-btn" id="login-submit">Sign In</button>
    </div>
  `;
  errorEl.classList.add('hidden');

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

  // Listen for sync updates
  window.api.onDataUpdated(async () => {
    flashSyncIndicator();
    await loadAllData();
    syncCurrentUserUI();
    renderStatsBar();
    const searchValue = document.getElementById('search-input').value;
    if (activeTab === 'my-projects') renderMyProjects();
    else if (activeTab === 'staff-view') renderStaffOverview();
    else renderMyTasks(searchValue);
    if (isPartner()) {
      renderSidebar();
      if (activeTab === 'staff-view') renderStaffOverview();
      if (activeTab === 'my-projects') renderMyProjects();
    }
    if (selectedTaskId) await openDetailPanel(selectedTaskId);
    if (selectedProjectId) await openProjectDetailPanel(selectedProjectId);
  });
}

function syncCurrentUserUI() {
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

  if (isPartner()) {
    document.getElementById('tab-bar')?.classList.remove('hidden');
    document.getElementById('sidebar')?.classList.remove('hidden');
    document.getElementById('add-private-task-btn')?.classList.remove('hidden');
    document.getElementById('my-tasks-private-badge')?.classList.remove('hidden');
  } else {
    document.getElementById('tab-bar')?.classList.add('hidden');
    document.getElementById('sidebar')?.classList.add('hidden');
    if (canCurrentUserAddOwnTasks()) {
      document.getElementById('add-self-task-btn')?.classList.remove('hidden');
    }
  }
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
        <span class="staff-name">${user.display_name}${pto ? ' <span class="badge badge-pto" style="font-size:8px;padding:1px 5px;margin-left:4px">' + pto.label + '</span>' : ''}</span>
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

  container.innerHTML = tasks.map(t => renderTaskCard(t, { isPrivate: isPartner() })).join('');
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
        ` : items.map(project => `
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
  const { showAssignee = false, isPrivate = false } = options;
  const due = formatDate(task.due_date);
  const project = getProjectById(task.project_id);
  const partnerLabel = getTaskPartnerLabel(task, project);
  const subtasks = isPrivate ? (SUBTASK_CACHE[task.id] || []) : getTaskActionItems(task);
  const comments = isPrivate ? (COMMENT_CACHE[task.id] || []) : getTaskComments(task);
  const completedSubs = subtasks.filter(s => s.completed).length;
  const assignee = showAssignee ? getUserById(task.assigned_to) : null;
  const canManageSharedTask = !isPrivate && canPartnerManageTask(task);
  const canManagePriority = !isPrivate && canCurrentUserManageTaskPriority(task);

  const priority = getPriorityPresentation(task);

  return `
    <div class="task-card ${task.completed ? 'completed' : ''} ${selectedTaskId === task.id ? 'selected' : ''}" data-task-id="${task.id}" ${isPrivate ? 'data-private="true"' : ''}>
      <div class="task-check">
        <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-task-id="${task.id}" ${isPrivate ? 'data-private="true"' : ''}></div>
      </div>
      <div class="task-body">
        <div class="task-top-row">
          <span class="task-priority ${priority.className} ${canManagePriority ? 'task-priority-interactive' : ''}" style="${priority.inlineStyle}" ${canManagePriority ? `data-priority-task-id="${task.id}"` : ''}>${priority.label}</span>
          <span class="task-title">${escapeHtml(task.title)}</span>
          ${due.text ? `<span class="task-due ${due.cls}">${due.text}</span>` : ''}
          ${canManageSharedTask ? `<span class="task-delete-btn" data-delete-task-id="${task.id}" title="Delete task">&times;</span>` : ''}
        </div>
        ${(task.notes || canManageSharedTask || (!isPrivate && partnerLabel) || (showAssignee && assignee)) ? `
        <div class="task-bottom-row">
          ${canManageSharedTask ? `
            <input type="text" class="task-notes-input task-notes-input-editable" data-notes-task-id="${task.id}" value="${escapeAttr(task.notes || '')}" placeholder="Note">
          ` : `
            <div class="task-notes">${escapeHtml(task.notes || '')}</div>
          `}
          <div class="task-bottom-right">
            ${!isPrivate && partnerLabel ? `
              <span class="task-partner-badge">
                ${escapeHtml(partnerLabel)}
              </span>
            ` : ''}
            ${showAssignee && assignee ? `
              <span class="task-partner-badge">
                <span class="avatar-mini" style="background: ${assignee.avatar_color}">${getInitials(assignee)}</span>
                ${escapeHtml(assignee.first_name || assignee.display_name)}
              </span>
            ` : ''}
          </div>
        </div>
        ` : ''}
        <div class="task-meta">
          ${subtasks.length > 0 ? `
            <span class="task-subtask-count">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              ${completedSubs}/${subtasks.length}
            </span>
          ` : ''}
          ${comments.length > 0 ? `
            <span class="task-comment-count">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              ${comments.length}
            </span>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

// ── Attach Task Card Click Events ───────────────────

function attachTaskCardEvents(container) {
  container.querySelectorAll('.task-checkbox').forEach(cb => {
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
          await window.api.updateTask({ id: taskId, completed: task.completed ? 0 : 1 });
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

  container.querySelectorAll('.task-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const task = getSharedTaskById(btn.dataset.deleteTaskId);
      if (task && canPartnerManageTask(task)) {
        await deleteSharedTask(task);
      }
    });
  });

  container.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.task-checkbox, .task-priority-interactive, .task-notes-input, .task-delete-btn')) return;
      openDetailPanel(card.dataset.taskId);
    });

    card.addEventListener('dblclick', (e) => {
      const task = getSharedTaskById(card.dataset.taskId);
      if (!task || !canPartnerManageTask(task)) return;
      if (e.target.closest('.task-checkbox, .task-priority-interactive, .task-notes-input, .task-delete-btn')) return;
      openEditSharedTaskDialog(task);
    });

    card.addEventListener('contextmenu', (e) => {
      const task = getSharedTaskById(card.dataset.taskId);
      if (!task || !canPartnerManageTask(task)) return;
      e.preventDefault();
      e.stopPropagation();
      openSharedTaskContextMenu(e, task);
    });
  });
}

// ── Refresh all views ───────────────────────────────

async function refreshAll() {
  renderStatsBar();
  if (activeTab === 'my-projects') renderMyProjects();
  else if (activeTab === 'staff-view') renderStaffOverview();
  else renderMyTasks(document.getElementById('search-input').value);
  if (isPartner()) {
    renderSidebar();
    if (activeTab === 'staff-view') renderStaffOverview();
    if (activeTab === 'my-projects') renderMyProjects();
  }
}

// ── Staff Overview (Partner) ────────────────────────

function renderStaffOverview() {
  const container = document.getElementById('staff-overview');
  let staffUsers = USERS.filter(u => u.role === 'staff' && u.active !== 0);

  if (selectedStaffFilter) {
    staffUsers = staffUsers.filter(u => u.id === selectedStaffFilter);
  }

  container.innerHTML = staffUsers.map(user => {
    const tasks = sortTasksLikeScheduling(getTasksForUser(user.id));
    const pending = tasks.filter(t => !t.completed);
    const pto = getPTOForUser(user.id);
    const isCollapsed = selectedStaffFilter
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
              <div class="empty-state-text">No tasks assigned</div>
            </div>
          ` : tasks.map(t => renderTaskCard(t)).join('')}
          <div class="add-task-inline" data-staff-id="${user.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add task
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.staff-section-tasks').forEach(section => {
    attachTaskCardEvents(section);
  });

  container.querySelectorAll('[data-staff-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const staffId = button.dataset.staffToggle;
      STAFF_SECTION_COLLAPSE[staffId] = !(STAFF_SECTION_COLLAPSE[staffId] ?? true);
      renderStaffOverview();
    });
  });

  container.querySelectorAll('.add-task-inline').forEach(btn => {
    btn.addEventListener('click', () => {
      openAddStaffTaskDialog(btn.dataset.staffId);
    });
  });
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

  const header = document.getElementById('detail-header');
  header.innerHTML = `
    <h3 class="detail-title" id="detail-title">${task.title}</h3>
    <button class="detail-close" id="detail-close">&times;</button>
  `;

  document.getElementById('detail-close').addEventListener('click', () => {
    selectedTaskId = null;
    document.querySelectorAll('.task-card').forEach(c => c.classList.remove('selected'));
    showDetailEmptyState();
  });

  const assignee = getUserById(task.assigned_to || task.owner_id);
  const assignees = isPrivateTask ? (assignee ? [assignee] : []) : getTaskAssignees(task);
  const project = getProjectById(task.project_id);
  const partnerLabel = getTaskPartnerLabel(task, project);
  const partner = getUserById(task.partner_id || project?.partner_id);
  const subtasks = isPrivateTask ? (SUBTASK_CACHE[task.id] || []) : getTaskActionItems(task);
  const comments = isPrivateTask ? (COMMENT_CACHE[task.id] || []) : getTaskComments(task);
  const due = formatDate(task.due_date);
  const projectNotes = project ? (PROJECT_NOTES_CACHE[project.id] || '') : '';
  const canManageThisTask = canCurrentUserAddActionItems(task);
  const canEditProjectNotes = Boolean(project && canPartnerManageTask(task));

  const priority = getPriorityPresentation(task);
  const priorityHTML = `<span class="task-priority ${priority.className}" style="font-size:11px;padding:3px 10px;${priority.inlineStyle}">${priority.label}</span>`;

  document.getElementById('detail-body').innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">
      ${priorityHTML}
      ${due.text ? `<span class="task-due ${due.cls}" style="font-size:12px">${due.text}</span>` : '<span style="font-size:12px;color:var(--text-tertiary)">No due date</span>'}
    </div>

    ${task.notes ? `
    <div class="detail-field">
      <div class="detail-field-label">Scheduling Notes</div>
      <div class="detail-field-value" style="font-style:italic;color:var(--text-secondary)">${escapeHtml(task.notes)}</div>
    </div>
    ` : ''}

    <div style="display:flex;gap:24px;margin-bottom:20px">
      ${project ? `
      <div class="detail-field" style="margin-bottom:0">
        <div class="detail-field-label">Project</div>
        <span class="task-project-label">${escapeHtml(project.client)} | ${escapeHtml(project.name)}</span>
      </div>
      ` : ''}
    </div>

    ${project ? `
    <div class="detail-field">
      <div class="detail-field-label">Project Notes</div>
      ${canEditProjectNotes
        ? `
          <textarea class="dialog-textarea" id="task-project-notes" rows="5" placeholder="Shared notes that staff can see on this project.">${escapeHtml(projectNotes)}</textarea>
          <div class="detail-actions" style="margin-top:10px">
            <button class="btn btn-primary btn-sm" id="save-task-project-notes">Save Project Notes</button>
          </div>
        `
        : `<div class="detail-field-value">${projectNotes ? escapeHtml(projectNotes).replace(/\n/g, '<br>') : '<span style="color:var(--text-tertiary)">No project notes yet</span>'}</div>`}
    </div>
    ` : ''}

    ${(assignees.length > 0 || partnerLabel) ? `
    <div style="display:flex;gap:24px;margin-bottom:8px">
      ${assignees.length > 0 ? `
      <div class="detail-field">
        <div class="detail-field-label">Assigned To</div>
        <div class="detail-person-list">
          ${assignees.map((user) => `
            <span class="detail-person-pill">
              <span class="avatar-mini" style="background:${user.avatar_color};width:20px;height:20px;font-size:8px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:700">${getInitials(user)}</span>
              ${escapeHtml(user.display_name)}
            </span>
          `).join('')}
        </div>
      </div>
      ` : ''}
      ${partnerLabel ? `
      <div class="detail-field">
        <div class="detail-field-label">Partner</div>
        <div class="detail-field-value" style="display:flex;align-items:center;gap:8px">
          ${partner && !project?.partner_initials ? `<span class="avatar-mini" style="background:${partner.avatar_color};width:20px;height:20px;font-size:8px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:700">${getInitials(partner)}</span>` : ''}
          ${partnerLabel}
        </div>
      </div>
      ` : ''}
    </div>
    ` : ''}

    <!-- Subtasks -->
    <div class="detail-subtasks">
      <div class="detail-section-title">
        Action Items ${subtasks.length > 0 ? `(${subtasks.filter(s => s.completed).length}/${subtasks.length})` : ''}
        ${canManageThisTask ? '<span class="add-btn" id="add-subtask-btn">+ Add</span>' : ''}
      </div>
      ${subtasks.length === 0 ? `
        <div style="font-size:12px;color:var(--text-tertiary);padding:8px 0">No action items yet</div>
      ` : subtasks.map(s => `
        <div class="subtask-item ${s.completed ? 'completed' : ''}">
          <div class="task-checkbox ${s.completed ? 'checked' : ''}" data-subtask-id="${s.id}"></div>
          <span class="subtask-title">${s.title}</span>
          ${s.assigned_to ? `<span class="subtask-assignee">${getUserById(s.assigned_to)?.first_name || getUserById(s.assigned_to)?.display_name || ''}</span>` : ''}
        </div>
      `).join('')}
    </div>

    ${!isPrivateTask ? `
    <!-- Comments (scrollable) -->
    <div class="detail-comments">
      <div class="detail-section-title">Comments (${comments.length})</div>
      <div class="comment-list-scroll">
        <div class="comment-list">
          ${comments.length === 0 ? `
            <div style="font-size:12px;color:var(--text-tertiary);padding:8px 0">No comments yet</div>
          ` : comments.map(c => {
            const author = getUserById(c.author_id);
            const authorName = author?.display_name || c.author_name || 'Unknown';
            const authorColor = author?.avatar_color || c.author_color || '#5856A6';
            const authorInitials = author ? getInitials(author) : getInitials({ display_name: authorName });
            return `
              <div class="comment-item">
                <span class="avatar-mini" style="background:${authorColor}">${authorInitials}</span>
                <div class="comment-body">
                  <span class="comment-author">${authorName}<span class="comment-time">${timeAgo(c.created_at)}</span></span>
                  <div class="comment-text">${escapeHtml(c.body)}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <div class="comment-input-row">
        <textarea placeholder="Add a comment..." rows="1" id="comment-textarea"></textarea>
        <button class="btn btn-primary btn-sm" id="send-comment-btn">Send</button>
      </div>
    </div>
    ` : ''}
  `;

  // ── Event Listeners ─────────────────────────────

  const panel = document.getElementById('detail-panel');
  panel.querySelectorAll('.task-checkbox[data-subtask-id]').forEach(cb => {
    cb.addEventListener('click', async () => {
      const subId = cb.dataset.subtaskId;
      await window.api.toggleSubTask(subId);
      await loadAllData();
      await openDetailPanel(taskId);
      await refreshAll();
    });
  });

  document.getElementById('send-comment-btn')?.addEventListener('click', async () => {
    const textarea = document.getElementById('comment-textarea');
    const body = textarea.value.trim();
    if (!body) return;
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

  document.getElementById('save-task-project-notes')?.addEventListener('click', async () => {
    const notes = document.getElementById('task-project-notes').value.trim();
    await window.api.updateProjectNotes({
      project_id: project.id,
      notes,
      updated_by: currentUser?.id || null,
    });
    PROJECT_NOTES_CACHE[project.id] = notes;
    await loadAllData();
    await openDetailPanel(taskId);
    await refreshAll();
  });

  document.getElementById('add-subtask-btn')?.addEventListener('click', () => {
    openAddSubtaskDialog(task);
  });
}

// ── Add Subtask Dialog ──────────────────────────────

function openAddSubtaskDialog(task) {
  if (!canCurrentUserAddActionItems(task)) return;

  const overlay = document.getElementById('add-subtask-overlay');
  overlay.classList.remove('hidden');

  document.getElementById('add-subtask-subtitle').textContent = task.title;
  const titleInput = document.getElementById('add-subtask-title');
  titleInput.value = '';
  setTimeout(() => titleInput.focus(), 50);

  const close = () => {
    document.removeEventListener('keydown', escHandler);
    overlay.classList.add('hidden');
  };
  document.getElementById('add-subtask-close').onclick = close;
  document.getElementById('add-subtask-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  document.getElementById('add-subtask-save').onclick = async () => {
    const title = titleInput.value.trim();
    if (!title) return;
    const ownerTask = getTaskThreadOwner(task) || task;
    await window.api.createSubTask({
      task_id: ownerTask.id,
      title,
      assigned_to: task.assigned_to || task.owner_id,
    });
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
  overlay.classList.remove('hidden');

  document.getElementById('project-notes-title').textContent = 'Project Notes';
  document.getElementById('project-notes-subtitle').textContent = `${project.client} | ${project.name}`;

  const textarea = document.getElementById('project-notes-textarea');
  textarea.value = PROJECT_NOTES_CACHE[project.id] || '';
  textarea.focus();

  const close = () => {
    document.removeEventListener('keydown', escHandler);
    overlay.classList.add('hidden');
  };
  document.getElementById('project-notes-close').onclick = close;
  document.getElementById('project-notes-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  document.getElementById('project-notes-save').onclick = async () => {
    const notes = textarea.value.trim();
    await window.api.updateProjectNotes({
      project_id: project.id,
      notes,
      updated_by: currentUser.id,
    });
    PROJECT_NOTES_CACHE[project.id] = notes;
    close();
    if (selectedTaskId) await openDetailPanel(selectedTaskId);
  };

  const escHandler = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', escHandler);
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

  const sharedProjectNotes = PROJECT_NOTES_CACHE[project.id] || '';
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
      <textarea class="dialog-textarea" id="project-detail-project-notes" rows="6" placeholder="Shared project details visible in task detail for staff and partners.">${escapeHtml(sharedProjectNotes)}</textarea>
    </div>
    <div class="detail-actions">
      <button class="btn btn-primary btn-sm" id="project-detail-save">Save Changes</button>
    </div>
  `;

  document.getElementById('project-detail-save').addEventListener('click', async () => {
    const client = document.getElementById('project-detail-client').value.trim();
    const name = document.getElementById('project-detail-name').value.trim();
    const notes = document.getElementById('project-detail-notes').value.trim();
    const projectDetailNotes = document.getElementById('project-detail-project-notes').value.trim();
    if (!client || !name) return;

    await window.api.updateProject({
      id: project.id,
      client,
      name,
      notes,
    });
    await window.api.updateProjectNotes({
      project_id: project.id,
      notes: projectDetailNotes,
      updated_by: currentUser?.id || null,
    });
    PROJECT_NOTES_CACHE[project.id] = projectDetailNotes;
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

function activateTab(tabName, options = {}) {
  const { preserveStaffFilter = false } = options;
  if (tabName === 'staff-view' && activeTab !== 'staff-view' && !preserveStaffFilter) {
    selectedStaffFilter = null;
    if (isPartner()) renderSidebar();
  }

  activeTab = tabName;
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
    renderStaffOverview();
    if (selectedTaskId) {
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

function flashSyncIndicator() {
  setSyncIndicatorState('syncing');
  SYNC_STATUS_RESET_TIMER = setTimeout(() => {
    setSyncIndicatorState('synced');
  }, 1200);
}

function setupSettingsMenu() {
  document.getElementById('settings-btn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const menu = ContextMenu.create([
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
      { divider: true },
      {
        label: 'Sign Out',
        action: async () => {
          await window.api.logout();
          await window.api.setWindowMode('login');
          window.location.reload();
        }
      }
    ]);

    const rect = e.currentTarget.getBoundingClientRect();
    positionMenu(menu, rect.right - 220, rect.bottom + 6);
  });
}

// ── Init ────────────────────────────────────────────

initApp();
