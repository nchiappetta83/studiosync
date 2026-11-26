/**
 * Dashboard data and actions for the command palette (the shared engine is commandPalette.js).
 */
(function registerDashboardPalette() {
  const SETTINGS_SECTIONS = [
    { section: 'staff', label: 'Manage Staff', keywords: 'people users partners accounts add edit' },
    { section: 'roles', label: 'Staff Roles', keywords: 'business roles job titles' },
    { section: 'priorities', label: 'Priorities', keywords: 'custom priority colours colors rollover' },
    { section: 'work-categories', label: 'Work Card Types', keywords: 'work cards categories calendar' },
    { section: 'paths', label: 'File Paths', keywords: 'excel shared drive export backup update folder' },
    { section: 'status', label: 'System Status', keywords: 'sync health diagnostics' },
    { section: 'devices', label: 'Trusted Devices', keywords: 'security enrolled computers' },
    { section: 'about', label: 'About', keywords: 'version updates' },
  ];

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function selectPerson(user) {
    AppState.batch(() => {
      if (user.role === 'partner') {
        AppState.set('selectedPartnerId', user.id);
        AppState.set('selectedStaffId', 'all');
      } else {
        AppState.set('selectedPartnerId', null);
        AppState.set('selectedStaffId', user.id);
      }
    });
    CommandPalette.whenElement('#tasks-title', (el) => CommandPalette.focusEl(el));
  }

  function revealTask(task) {
    // Clear everything that could hide the task, then scroll to it.
    AppState.batch(() => {
      const reset = { searchQuery: '', selectedPartnerId: null, selectedStaffId: 'all', filterPriority: null, carryoverReviewMode: false };
      Object.entries(reset).forEach(([key, value]) => {
        if (AppState.get(key) !== value) AppState.set(key, value);
      });
    });
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    CommandPalette.whenElement(`.task-card[data-task-id="${CSS.escape(String(task.id))}"]`, (card) => {
      card.scrollIntoView({ block: 'center' });
      CommandPalette.focusEl(card);
      CommandPalette.flash(card);
    });
  }

  function revealProject(project) {
    const wantedTab = (project.category || 'current') === 'future' ? 'future' : 'active';
    if (typeof ProjectPanel !== 'undefined' && ProjectPanel._projectSearchQuery) ProjectPanel._closeSearch();
    if (AppState.get('projectTab') !== wantedTab) AppState.set('projectTab', wantedTab);
    // "Active Only" would hide an inactive project, so switch it off for this one.
    const activeOnly = document.getElementById('projects-active-only');
    if (project.status !== 'active' && activeOnly && activeOnly.checked) {
      activeOnly.checked = false;
      activeOnly.dispatchEvent(new Event('change'));
    }
    CommandPalette.whenElement(`.project-card[data-project-id="${CSS.escape(String(project.id))}"]`, (card) => {
      card.scrollIntoView({ block: 'center' });
      CommandPalette.focusEl(card);
      CommandPalette.flash(card);
    });
  }

  function buildItems(palette) {
    const items = [];
    const visible = (id) => palette.isVisible(id);

    // Actions. Each one appears only when its control is available to this user right now.
    const action = (definition) => items.push({ group: 'Actions', iconHtml: palette.ICONS.command, ...definition });
    const clickButton = (id) => () => document.getElementById(id)?.click();

    if (visible('btn-add-task')) {
      action({ label: 'Add Task', hint: 'Create a new task', kbd: ['Ctrl', 'N'], keywords: 'new create assignment', run: clickButton('btn-add-task') });
    }
    if (visible('btn-add-project')) {
      action({ label: 'New Project', hint: 'Add a project to the Current or Future list', keywords: 'add create client', run: clickButton('btn-add-project') });
    }
    if (visible('btn-project-more') && typeof ProjectPanel !== 'undefined') {
      action({ label: 'Import Projects from Excel', hint: 'Choose a workbook to import', keywords: 'xlsx spreadsheet', run: () => ProjectPanel._importProjects() });
    }
    if (AppState.isAdmin()) {
      action({ label: 'Refresh Excel', hint: 'Re-read the linked workbook', kbd: ['Ctrl', 'E'], keywords: 'xlsx spreadsheet sync import', run: () => App.refreshExcel() });
    }
    if (visible('btn-publish-rollover')) {
      action({ label: 'Publish Changes', hint: 'Publish scheduling changes to MyTasks', keywords: 'rollover weekly review', run: clickButton('btn-publish-rollover') });
    }
    if (visible('btn-carryover-review')) {
      action({ label: 'Review Carryover Tasks', hint: 'Show only tasks carried over from last week', keywords: 'rollover keep delete', run: clickButton('btn-carryover-review') });
    }
    action({ label: 'Print / Export Schedule', hint: 'Export as PDF or HTML', kbd: ['Ctrl', 'P'], keywords: 'pdf html report', run: () => PrintDialog.show() });
    action({ label: 'Search Tasks and People', hint: 'Filter the task list as you type', kbd: ['Ctrl', 'F'], keywords: 'find filter', run: () => document.getElementById('search-input')?.focus() });
    action({
      label: 'Show All Staff',
      hint: 'Clear the staff, partner, and search filters',
      keywords: 'reset clear everyone',
      run: () => {
        AppState.batch(() => {
          AppState.set('selectedPartnerId', null);
          AppState.set('selectedStaffId', 'all');
          AppState.set('searchQuery', '');
        });
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = '';
      },
    });
    action({ label: 'Show Current Projects', hint: 'Projects panel', keywords: 'active tab', run: () => AppState.set('projectTab', 'active') });
    action({ label: 'Show Future Projects', hint: 'Projects panel', keywords: 'upcoming tab', run: () => AppState.set('projectTab', 'future') });

    // People
    (AppState.get('users') || [])
      .filter((user) => user.active !== 0 || AppState.getTaskCountForUser(user.id) > 0)
      .forEach((user) => {
        const businessRole = user.business_role_id ? AppState.getBusinessRoleById(user.business_role_id) : null;
        const roleLabel = user.role === 'partner' ? 'Partner' : (businessRole ? businessRole.name : 'Staff');
        const count = AppState.getTaskCountForUser(user.id);
        const initials = typeof Sidebar !== 'undefined' ? Sidebar._getInitials(user.display_name) : '?';
        items.push({
          group: 'People',
          label: user.display_name,
          hint: `${roleLabel} · ${plural(count, 'task')}`,
          keywords: `${user.username || ''} ${roleLabel}`,
          iconHtml: `<span class="palette-avatar" style="background:${palette.esc(user.avatar_color || '#586F91')}">${palette.esc(initials)}</span>`,
          run: () => selectPerson(user),
        });
      });

    // Projects
    (AppState.get('projects') || []).forEach((project) => {
      const title = project.client ? `${project.client} | ${project.name}` : project.name;
      const category = (project.category || 'current') === 'future' ? 'Future' : 'Current';
      const status = project.status === 'active' ? 'Active' : 'Inactive';
      items.push({
        group: 'Projects',
        label: title,
        hint: `${category} · ${status}`,
        keywords: project.notes || '',
        iconHtml: palette.ICONS.project,
        run: () => revealProject(project),
      });
    });

    // Tasks
    (AppState.get('tasks') || []).forEach((task) => {
      const assignee = AppState.getUserById(task.assigned_to);
      const title = typeof TaskCard !== 'undefined' ? TaskCard._getTaskDisplayTitle(task) : task.title;
      const due = task.due_date && typeof TaskCard !== 'undefined' ? TaskCard._formatDueDisplay(task.due_date) : '';
      const bits = [assignee ? assignee.display_name : 'Unassigned'];
      if (due) bits.push(`Due ${due}`);
      if (task.completed) bits.push('Done');
      items.push({
        group: 'Tasks',
        label: title,
        hint: bits.join(' · '),
        keywords: `${task.notes || ''} ${assignee ? assignee.display_name : ''}`,
        iconHtml: palette.ICONS.task,
        run: () => revealTask(task),
      });
    });

    // Settings sections
    if (visible('btn-settings')) {
      SETTINGS_SECTIONS.forEach(({ section, label, keywords }) => {
        items.push({ group: 'Settings', label, hint: 'Settings', keywords, iconHtml: palette.ICONS.settings, run: () => SettingsDialog.show(section) });
      });
    }

    return items;
  }

  CommandPalette.register({
    groups: ['Actions', 'People', 'Projects', 'Tasks', 'Settings'],
    limits: { Actions: 10, People: 8, Projects: 6, Tasks: 8, Settings: 8 },
    // With nothing typed, show the short lists. Projects, tasks and settings appear as you type.
    emptyGroups: ['Actions', 'People'],
    placeholder: 'Search people, projects, tasks, or commands...',
    emptyHint: 'Try a person, a project, a task, or a command.',
    canOpen() {
      if (!AppState.get('currentUser')) return false; // not signed in yet
      return !document.querySelector('.dialog-overlay:not(.hidden):not(.is-leaving)'); // a dialog is already open
    },
    beforeOpen() {
      if (typeof ContextMenu !== 'undefined') ContextMenu.dismiss();
      document.querySelectorAll('.priority-menu, .date-picker-popup').forEach((el) => el.remove());
    },
    buildItems,
  });
})();
