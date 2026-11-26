/**
 * MyTasks data and actions for the command palette (the shared engine is commandPalette.js).
 * Loaded after app.js, whose state and functions are shared globals.
 */
(function registerMyTasksPalette() {
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const selectorId = (id) => CSS.escape(String(id));

  function clearMyTaskSearch() {
    myTaskSearchQuery = '';
    const input = document.getElementById('my-task-search-input');
    if (input) input.value = '';
    document.getElementById('my-task-search-clear')?.classList.add('hidden');
  }

  function clearMyProjectsSearch() {
    myProjectsSearchQuery = '';
    const input = document.getElementById('my-projects-search-input');
    if (input) input.value = '';
    document.getElementById('my-projects-search-clear')?.classList.add('hidden');
  }

  // Open the row the way a click would (the app's own route), then focus and highlight it.
  // Opening can re-render the list, so look the element up again afterwards.
  function openAndFlash(selector) {
    CommandPalette.whenElement(selector, (row) => {
      row.scrollIntoView({ block: 'center' });
      row.click();
      CommandPalette.whenElement(selector, (el) => {
        el.scrollIntoView({ block: 'nearest' });
        CommandPalette.focusEl(el);
        CommandPalette.flash(el);
      }, { firstDelay: 120 });
    });
  }

  // Waiting and Completed projects start collapsed; open the group that holds this one.
  function expandGroupFor(task) {
    const groups = getProjectListGroups([task], new Date(), getProjectListTaskName, sortTasksLikeScheduling);
    const byId = { due: groups.due, active: groups.active, wait: groups.waiting, completed: groups.completed };
    for (const [id, list] of Object.entries(byId)) {
      if (list.length && MY_PROJECT_GROUP_COLLAPSE[id]) {
        MY_PROJECT_GROUP_COLLAPSE[id] = false;
        rememberMyProjectGroupCollapsePrefs();
      }
    }
  }

  async function revealTaskRow(task, { isPrivate = false } = {}) {
    if (!(await activateTab('my-tasks', { preserveStaffFilter: false }))) return;
    clearMyTaskSearch();
    if (!isPrivate && !isActualPartner()) expandGroupFor(task);
    renderMyTasks();
    openAndFlash(`#my-task-list .task-card[data-task-id="${selectorId(task.id)}"]`);
  }

  async function revealManagedProject(project) {
    if (!(await activateTab('my-projects'))) return;
    clearMyProjectsSearch();
    const section = getProjectSection(project);
    if (PROJECT_SECTION_COLLAPSE[section]) {
      PROJECT_SECTION_COLLAPSE[section] = false;
      rememberProjectSectionCollapsePrefs();
    }
    renderMyProjects();
    openAndFlash(`.personal-project-card[data-project-id="${selectorId(project.id)}"]`);
  }

  async function selectStaff(user) {
    if (!canCurrentUserUseStaffOverview()) return;
    if (isPartner()) {
      selectedStaffFilter = user.id;
      rememberStaffFilter();
      renderSidebar();
      if (!(await activateTab('staff-view', { preserveStaffFilter: true }))) return;
    } else {
      selectedReadonlyStaffIds = [user.id];
      rememberReadonlyStaffSelection();
      if (!(await activateTab('staff-view'))) return;
    }
    renderStaffOverview();
    CommandPalette.whenElement('#view-staff-view .view-title', (el) => CommandPalette.focusEl(el));
  }

  function buildItems(palette) {
    const items = [];
    const action = (definition) => items.push({ group: 'Actions', iconHtml: palette.ICONS.command, ...definition });

    // Add: partners add a private task, staff add an office project to their own list.
    if (document.getElementById('add-private-task-btn') && (canCurrentUserAddOwnTasks() || isActualPartner())) {
      const partner = isActualPartner();
      const label = document.getElementById('add-private-task-label')?.textContent.trim() || (partner ? 'Add Private Task' : 'Add Project');
      action({
        label,
        hint: partner ? 'A task that stays on this computer' : 'Add an office project to your list',
        kbd: ['Ctrl', 'N'],
        keywords: 'new create',
        run: async () => {
          if (activeTab !== 'my-tasks' && !(await activateTab('my-tasks', { preserveStaffFilter: false }))) return;
          document.getElementById('add-private-task-btn')?.click();
        },
      });
    }
    if (isActualPartner()) {
      action({
        label: 'Add Project to Office List',
        hint: 'Create a project in the shared project list',
        keywords: 'new create client excel',
        run: async () => {
          if (!(await activateTab('my-projects'))) return;
          document.getElementById('add-project-btn')?.click();
        },
      });
    }

    // Go to a view
    document.querySelectorAll('#tab-bar .tab[data-tab]').forEach((tab) => {
      if (tab.classList.contains('hidden') || tab.style.display === 'none' || tab.dataset.tab === activeTab) return;
      const name = tab.textContent.trim();
      action({ label: `Go to ${name}`, hint: 'Switch view', keywords: 'open tab view', iconHtml: palette.ICONS.view, run: () => activateTab(tab.dataset.tab) });
    });

    action({ label: 'Search This View', hint: 'Jump to the search box', kbd: ['Ctrl', 'F'], keywords: 'find filter', run: () => focusActiveSearch() });
    if (palette.isVisible('sync-banner')) {
      action({ label: 'Retry Sync', hint: 'Try the shared sync folder again', keywords: 'connection shared folder offline', run: () => document.getElementById('sync-banner-retry')?.click() });
    }

    // People (staff overview)
    if (canCurrentUserUseStaffOverview()) {
      USERS.filter((user) => user.role === 'staff' && user.active !== 0).forEach((user) => {
        const projectCount = getScheduledProjectsForStaff(user.id).length;
        items.push({
          group: 'People',
          label: user.display_name,
          hint: `${user.business_role || 'Staff'} · ${plural(projectCount, 'project')}`,
          keywords: `${user.username || ''} ${user.business_role || ''}`,
          iconHtml: `<span class="palette-avatar" style="background:${palette.esc(user.avatar_color || '#586F91')}">${palette.esc(getInitials(user))}</span>`,
          run: () => selectStaff(user),
        });
      });
    }

    // Projects: the ones a partner manages, or the ones assigned to this person.
    if (isActualPartner()) {
      getProjectsForCurrentPartner({ includeFuture: true, includeInactive: true }).forEach((project) => {
        const section = getProjectSection(project);
        items.push({
          group: 'Projects',
          label: getProjectDisplayTitle(project),
          hint: section === 'future' ? 'Future' : (section === 'inactive' ? 'Inactive' : 'Active'),
          keywords: project.notes || '',
          iconHtml: palette.ICONS.project,
          run: () => revealManagedProject(project),
        });
      });
    } else if (currentUser) {
      getTasksForUser(currentUser.id).forEach((task) => {
        const project = getProjectById(task.project_id);
        if (!project) return;
        const due = typeof getProjectListDueChip === 'function' ? getProjectListDueChip(task) : null;
        items.push({
          group: 'Projects',
          label: getProjectDisplayTitle(project),
          hint: task.completed ? 'Done' : (due && due.label ? due.label : 'Assigned to you'),
          keywords: `${project.notes || ''} ${task.notes || ''}`,
          iconHtml: palette.ICONS.project,
          run: () => revealTaskRow(task),
        });
      });
    }

    // Private tasks (partners and senior staff)
    if (isPartner()) {
      PRIVATE_TASKS.forEach((task) => {
        items.push({
          group: 'Private Tasks',
          label: task.title,
          hint: task.completed ? 'Private · Done' : 'Private',
          keywords: task.notes || '',
          iconHtml: palette.ICONS.task,
          run: () => revealTaskRow(task, { isPrivate: true }),
        });
      });
    }

    // Preferences
    const preference = (definition) => items.push({ group: 'Preferences', iconHtml: palette.ICONS.settings, ...definition });
    preference({ label: 'Open Preferences', hint: 'Appearance, accent colour, details pane', keywords: 'settings options startup', run: () => openPreferencesDialog() });
    if (isPartner()) {
      preference({
        label: 'Edit Office Capacity',
        hint: 'Hours per day and per week',
        keywords: 'workload load hours',
        run: async () => {
          await openPreferencesDialog();
          document.getElementById('office-capacity-daily')?.focus();
        },
      });
    }
    [['light', 'Light Theme'], ['dark', 'Dark Theme'], ['auto', 'Match System Theme']].forEach(([theme, label]) => {
      if (STYLE_PREFERENCES.theme === theme) return;
      preference({ label, hint: 'Appearance', keywords: 'theme colour color appearance mode', run: () => setThemePreference(theme) });
    });

    return items;
  }

  CommandPalette.register({
    groups: ['Actions', 'People', 'Projects', 'Private Tasks', 'Preferences'],
    limits: { Actions: 10, People: 8, Projects: 8, 'Private Tasks': 6, Preferences: 8 },
    // With nothing typed, show the short lists. Projects and the rest appear as you type.
    emptyGroups: ['Actions', 'People'],
    placeholder: 'Search projects, people, or commands...',
    emptyHint: 'Try a project, a person, or a command.',
    canOpen() {
      if (!currentUser) return false; // not signed in yet
      return !document.querySelector('.dialog-overlay:not(.hidden), .rollover-review-overlay:not(.hidden)');
    },
    beforeOpen() {
      if (typeof ContextMenu !== 'undefined') ContextMenu.dismiss();
    },
    buildItems,
  });
})();
