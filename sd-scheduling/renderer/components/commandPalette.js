/**
 * Command palette (Ctrl+K): one place to jump to a person, project or task and to run
 * commands or open a Settings section. Matching and ranking live in lib/paletteSearch.js.
 *
 * Accessibility: the input is a combobox that owns a listbox. Focus stays in the input and
 * aria-activedescendant points at the highlighted option. Escape closes the palette and
 * returns focus to wherever it was.
 */
const CommandPalette = {
  GROUPS: ['Actions', 'People', 'Projects', 'Tasks', 'Settings'],
  LIMITS: { Actions: 10, People: 8, Projects: 6, Tasks: 8, Settings: 8 },
  // With nothing typed, show the short lists. Projects, tasks and settings appear as you type.
  EMPTY_GROUPS: ['Actions', 'People'],

  SETTINGS_SECTIONS: [
    { section: 'staff', label: 'Manage Staff', keywords: 'people users partners accounts add edit' },
    { section: 'roles', label: 'Staff Roles', keywords: 'business roles job titles' },
    { section: 'priorities', label: 'Priorities', keywords: 'custom priority colours colors rollover' },
    { section: 'work-categories', label: 'Work Card Types', keywords: 'work cards categories calendar' },
    { section: 'paths', label: 'File Paths', keywords: 'excel shared drive export backup update folder' },
    { section: 'status', label: 'System Status', keywords: 'sync health diagnostics' },
    { section: 'devices', label: 'Trusted Devices', keywords: 'security enrolled computers' },
    { section: 'about', label: 'About', keywords: 'version updates' },
  ],

  ICONS: {
    command: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    project: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    task: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  },

  _overlay: null,
  _input: null,
  _list: null,
  _status: null,
  _items: [],
  _results: [],
  _active: -1,
  _opener: null,

  isOpen() {
    return Boolean(this._overlay);
  },

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  },

  open() {
    if (this._overlay) return;
    if (!AppState.get('currentUser')) return; // not signed in yet
    if (document.querySelector('.dialog-overlay:not(.hidden)')) return; // a dialog is already open

    if (typeof ContextMenu !== 'undefined') ContextMenu.dismiss();
    document.querySelectorAll('.priority-menu, .date-picker-popup').forEach((el) => el.remove());

    this._opener = document.activeElement;
    this._items = this._buildItems();

    const overlay = document.createElement('div');
    overlay.className = 'palette-overlay';
    overlay.innerHTML = `
      <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette-search">
          <span class="palette-search-icon" aria-hidden="true">${this.ICONS.search}</span>
          <input type="text" class="palette-input" id="palette-input" role="combobox"
            aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" aria-activedescendant=""
            aria-label="Search people, projects, tasks, or commands"
            placeholder="Search people, projects, tasks, or commands..." autocomplete="off" spellcheck="false">
        </div>
        <div class="palette-list" id="palette-list" role="listbox" aria-label="Results"></div>
        <div class="palette-footer" aria-hidden="true">
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> Navigate</span>
          <span><kbd>&crarr;</kbd> Open</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
        <div class="palette-sr" role="status" aria-live="polite"></div>
      </div>`;
    document.body.appendChild(overlay);

    this._overlay = overlay;
    this._input = overlay.querySelector('#palette-input');
    this._list = overlay.querySelector('#palette-list');
    this._status = overlay.querySelector('.palette-sr');

    this._input.addEventListener('input', () => this._render());
    overlay.addEventListener('keydown', (event) => this._onKeydown(event));
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) this.close();
    });
    // Keep focus in the input so typing and aria-activedescendant keep working.
    this._list.addEventListener('mousedown', (event) => event.preventDefault());
    this._list.addEventListener('click', (event) => {
      const row = event.target.closest('.palette-item');
      if (!row) return;
      this._setActive(Number(row.dataset.index), { scroll: false });
      this._runActive();
    });
    this._list.addEventListener('mousemove', (event) => {
      const row = event.target.closest('.palette-item');
      if (row && Number(row.dataset.index) !== this._active) {
        this._setActive(Number(row.dataset.index), { scroll: false });
      }
    });
    overlay.addEventListener('focusout', (event) => {
      if (event.relatedTarget && overlay.contains(event.relatedTarget)) return;
      setTimeout(() => {
        if (this._overlay === overlay && !overlay.contains(document.activeElement)) this._input.focus();
      }, 0);
    });

    this._render();
    this._input.focus();
  },

  close() {
    if (!this._overlay) return;
    const opener = this._opener;
    this._overlay.remove();
    this._overlay = null;
    this._input = null;
    this._list = null;
    this._status = null;
    this._results = [];
    this._active = -1;
    this._opener = null;
    if (opener && opener.isConnected && typeof opener.focus === 'function') {
      opener.focus({ preventScroll: true });
    }
  },

  // ── Keyboard ─────────────────────────────────────────

  _onKeydown(event) {
    if (event.isComposing) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this._move(1, true);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this._move(-1, true);
        break;
      case 'PageDown':
        event.preventDefault();
        this._move(5, false);
        break;
      case 'PageUp':
        event.preventDefault();
        this._move(-5, false);
        break;
      case 'Home':
        if (!event.ctrlKey) return;
        event.preventDefault();
        this._setActive(0);
        break;
      case 'End':
        if (!event.ctrlKey) return;
        event.preventDefault();
        this._setActive(this._results.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        this._runActive();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation(); // do not also trigger the app-wide Escape handling
        this.close();
        break;
      case 'Tab':
        event.preventDefault(); // modal: focus stays in the palette
        break;
      default:
        return;
    }
  },

  _move(delta, wrap) {
    const count = this._results.length;
    if (!count) return;
    let next = this._active + delta;
    if (wrap) next = (next + count) % count;
    else next = Math.max(0, Math.min(count - 1, next));
    this._setActive(next);
  },

  _setActive(index, { scroll = true } = {}) {
    const rows = this._list ? this._list.querySelectorAll('.palette-item') : [];
    rows.forEach((row) => {
      row.classList.remove('is-active');
      row.setAttribute('aria-selected', 'false');
    });
    this._active = index;
    const row = index >= 0 ? this._list.querySelector(`.palette-item[data-index="${index}"]`) : null;
    if (row) {
      row.classList.add('is-active');
      row.setAttribute('aria-selected', 'true');
      if (scroll) row.scrollIntoView({ block: 'nearest' });
    }
    this._input.setAttribute('aria-activedescendant', row ? row.id : '');
  },

  _runActive() {
    const result = this._results[this._active];
    if (!result) return;
    const { item } = result;
    this.close();
    // Run after focus has been handed back, so an action that opens a dialog or moves focus wins.
    setTimeout(() => item.run(), 0);
  },

  // ── Rendering ────────────────────────────────────────

  _esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _highlight(label, ranges) {
    const text = String(label ?? '');
    if (!ranges.length) return this._esc(text);
    let html = '';
    let cursor = 0;
    for (const [start, end] of ranges) {
      html += this._esc(text.slice(cursor, start));
      html += `<mark>${this._esc(text.slice(start, end))}</mark>`;
      cursor = end;
    }
    return html + this._esc(text.slice(cursor));
  },

  _render() {
    const query = this._input.value;
    this._results = PaletteSearch.filter(this._items, query, {
      groupOrder: this.GROUPS,
      limits: this.LIMITS,
      emptyGroups: this.EMPTY_GROUPS,
    });

    let html = '';
    let lastGroup = null;
    this._results.forEach((result, index) => {
      const group = result.item.group;
      if (group !== lastGroup) {
        if (lastGroup !== null) html += '</div>';
        const slug = group.toLowerCase();
        html += `<div class="palette-group" role="group" aria-labelledby="palette-group-${slug}">`
          + `<div class="palette-group-label" id="palette-group-${slug}">${this._esc(group)}</div>`;
        lastGroup = group;
      }
      html += this._itemHtml(result, index);
    });
    if (lastGroup !== null) html += '</div>';

    if (!this._results.length) {
      const trimmed = query.trim();
      html = `<div class="palette-empty">
        <div class="palette-empty-title">${trimmed ? `No results for “${this._esc(trimmed)}”` : 'Nothing to show'}</div>
        <div class="palette-empty-text">Try a person, a project, a task, or a command.</div>
      </div>`;
    }

    this._list.innerHTML = html;
    this._status.textContent = this._results.length
      ? `${this._results.length} result${this._results.length === 1 ? '' : 's'}`
      : 'No results';
    this._setActive(this._results.length ? 0 : -1, { scroll: false });
    this._list.scrollTop = 0;
  },

  _itemHtml(result, index) {
    const { item } = result;
    const keys = item.kbd
      ? `<span class="palette-item-kbd" aria-hidden="true">${item.kbd.map((key) => `<kbd>${this._esc(key)}</kbd>`).join('')}</span>`
      : '';
    const shortcut = item.kbd ? ` aria-keyshortcuts="${this._esc(item.kbd.map((key) => (key === 'Ctrl' ? 'Control' : key)).join('+'))}"` : '';
    const hint = item.hint ? `<span class="palette-item-hint">${this._esc(item.hint)}</span>` : '';
    return `<div class="palette-item" role="option" id="palette-option-${index}" data-index="${index}" aria-selected="false"${shortcut}>`
      + `<span class="palette-item-icon" aria-hidden="true">${item.iconHtml}</span>`
      + `<span class="palette-item-text"><span class="palette-item-label">${this._highlight(item.label, result.ranges)}</span>${hint}</span>`
      + `${keys}</div>`;
  },

  // ── Items ────────────────────────────────────────────

  _isVisible(id) {
    const el = document.getElementById(id);
    return Boolean(el) && el.style.display !== 'none' && !el.classList.contains('hidden');
  },

  _buildItems() {
    const items = [];
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    // Actions. Each one appears only when its control is available to this user right now.
    const action = (definition) => items.push({ group: 'Actions', iconHtml: this.ICONS.command, ...definition });
    const clickButton = (id) => () => document.getElementById(id)?.click();

    if (this._isVisible('btn-add-task')) {
      action({ label: 'Add Task', hint: 'Create a new task', kbd: ['Ctrl', 'N'], keywords: 'new create assignment', run: clickButton('btn-add-task') });
    }
    if (this._isVisible('btn-add-project')) {
      action({ label: 'New Project', hint: 'Add a project to the Current or Future list', keywords: 'add create client', run: clickButton('btn-add-project') });
    }
    if (this._isVisible('btn-project-more') && typeof ProjectPanel !== 'undefined') {
      action({ label: 'Import Projects from Excel', hint: 'Choose a workbook to import', keywords: 'xlsx spreadsheet', run: () => ProjectPanel._importProjects() });
    }
    if (AppState.isAdmin()) {
      action({ label: 'Refresh Excel', hint: 'Re-read the linked workbook', kbd: ['Ctrl', 'E'], keywords: 'xlsx spreadsheet sync import', run: () => App.refreshExcel() });
    }
    if (this._isVisible('btn-publish-rollover')) {
      action({ label: 'Publish Changes', hint: 'Publish scheduling changes to MyTasks', keywords: 'rollover weekly review', run: clickButton('btn-publish-rollover') });
    }
    if (this._isVisible('btn-carryover-review')) {
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
    const users = AppState.get('users') || [];
    users
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
          iconHtml: `<span class="palette-avatar" style="background:${this._esc(user.avatar_color || '#586F91')}">${this._esc(initials)}</span>`,
          run: () => this._selectPerson(user),
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
        iconHtml: this.ICONS.project,
        run: () => this._revealProject(project),
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
        iconHtml: this.ICONS.task,
        run: () => this._revealTask(task),
      });
    });

    // Settings sections
    if (this._isVisible('btn-settings')) {
      this.SETTINGS_SECTIONS.forEach(({ section, label, keywords }) => {
        items.push({ group: 'Settings', label, hint: 'Settings', keywords, iconHtml: this.ICONS.settings, run: () => SettingsDialog.show(section) });
      });
    }

    return items;
  },

  // ── Reveal helpers ───────────────────────────────────

  // The lists re-render a moment after state changes, so wait for the element to exist.
  _whenElement(selector, callback, { tries = 25, delay = 40, firstDelay = 60 } = {}) {
    let attempts = 0;
    const attempt = () => {
      const el = document.querySelector(selector);
      if (el) {
        callback(el);
        return;
      }
      if (++attempts < tries) setTimeout(attempt, delay);
    };
    setTimeout(attempt, firstDelay);
  },

  _focusEl(el) {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  },

  _flash(el) {
    el.classList.remove('palette-flash');
    void el.offsetWidth; // restart the animation if it is already running
    el.classList.add('palette-flash');
    setTimeout(() => el.classList.remove('palette-flash'), 1800);
  },

  _selectPerson(user) {
    AppState.batch(() => {
      if (user.role === 'partner') {
        AppState.set('selectedPartnerId', user.id);
        AppState.set('selectedStaffId', 'all');
      } else {
        AppState.set('selectedPartnerId', null);
        AppState.set('selectedStaffId', user.id);
      }
    });
    this._whenElement('#tasks-title', (el) => this._focusEl(el));
  },

  _revealTask(task) {
    // Clear everything that could hide the task, then scroll to it.
    AppState.batch(() => {
      const reset = { searchQuery: '', selectedPartnerId: null, selectedStaffId: 'all', filterPriority: null, carryoverReviewMode: false };
      Object.entries(reset).forEach(([key, value]) => {
        if (AppState.get(key) !== value) AppState.set(key, value);
      });
    });
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    this._whenElement(`.task-card[data-task-id="${CSS.escape(String(task.id))}"]`, (card) => {
      card.scrollIntoView({ block: 'center' });
      this._focusEl(card);
      this._flash(card);
    });
  },

  _revealProject(project) {
    const wantedTab = (project.category || 'current') === 'future' ? 'future' : 'active';
    if (typeof ProjectPanel !== 'undefined' && ProjectPanel._projectSearchQuery) ProjectPanel._closeSearch();
    if (AppState.get('projectTab') !== wantedTab) AppState.set('projectTab', wantedTab);
    // "Active Only" would hide an inactive project, so switch it off for this one.
    const activeOnly = document.getElementById('projects-active-only');
    if (project.status !== 'active' && activeOnly && activeOnly.checked) {
      activeOnly.checked = false;
      activeOnly.dispatchEvent(new Event('change'));
    }
    this._whenElement(`.project-card[data-project-id="${CSS.escape(String(project.id))}"]`, (card) => {
      card.scrollIntoView({ block: 'center' });
      this._focusEl(card);
      this._flash(card);
    });
  },
};
