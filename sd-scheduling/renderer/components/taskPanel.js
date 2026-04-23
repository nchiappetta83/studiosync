/**
 * Task panel — renders staff sections with their task cards.
 */

const TaskPanel = {
  init() {
    this._container = document.getElementById('tasks-container');
    this._title = document.getElementById('tasks-title');
    this._subtitle = document.getElementById('tasks-subtitle');
    this._addBtn = document.getElementById('btn-add-task');
    this._scroller = document.getElementById('tasks-scroll');
    this._staffRail = document.getElementById('tasks-staff-rail');

    this._addBtn.addEventListener('click', () => {
      const selectedId = AppState.get('selectedStaffId');
      TaskDialog.show({ assigned_to: selectedId !== 'all' ? selectedId : null });
    });

    this._staffRail?.addEventListener('click', (event) => {
      const button = event.target.closest('.staff-jump-rail-btn');
      if (!button) return;
      this._jumpToStaff(button.dataset.userId);
    });

    if (this._scroller) {
      this._scroller.addEventListener('scroll', () => {
        if (this._scrollRafId) return;
        this._scrollRafId = requestAnimationFrame(() => {
          this._scrollRafId = null;
          this._updateRailThumb();
        });
      }, { passive: true });
    }

    this._handleResize = this._handleResize || (() => this._updateRailThumb());
    window.addEventListener('resize', this._handleResize);

    this._renderListener = this._renderListener || (() => this.render());
    AppState.on('tasks', this._renderListener);
    AppState.on('users', this._renderListener);
    AppState.on('selectedStaffId', this._renderListener);
    AppState.on('selectedPartnerId', this._renderListener);
    AppState.on('searchQuery', this._renderListener);
    AppState.on('pto', this._renderListener);
    AppState.on('filterPriority', this._renderListener);
    AppState.on('customPriorities', this._renderListener);
    AppState.on('priorityMenuOrder', this._renderListener);
    AppState.on('priorityDisplayStyles', this._renderListener);

    this.render();
  },

  render() {
    const activeElement = document.activeElement;
    const activeNoteTaskId = activeElement?.classList?.contains('task-notes-input')
      ? activeElement.dataset.taskId
      : null;
    const activeNoteSelection = activeNoteTaskId
      ? {
          start: activeElement.selectionStart,
          end: activeElement.selectionEnd,
        }
      : null;

    const selectedId = AppState.get('selectedStaffId');
    const selectedPartnerId = AppState.get('selectedPartnerId');
    const users = AppState.get('users') || [];
    const searchQuery = AppState.get('searchQuery')?.toLowerCase() || '';
    const filterPriority = AppState.get('filterPriority');

    // Update header
    if (selectedPartnerId) {
      const partner = AppState.getUserById(selectedPartnerId);
      this._title.textContent = partner ? `${partner.display_name} Tasks` : 'Partner Tasks';
    } else if (selectedId === 'all') {
      this._title.textContent = 'All Tasks';
    } else if (Array.isArray(selectedId)) {
      const names = selectedId.map(id => AppState.getUserById(id)?.display_name).filter(Boolean);
      this._title.textContent = names.length <= 2 ? names.join(' & ') : `${names.length} Staff Selected`;
    } else {
      const user = AppState.getUserById(selectedId);
      this._title.textContent = user ? user.display_name : 'Tasks';
    }

    // Get date string
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Get grouped tasks
    const groups = AppState.getTasksByStaffGrouped();
    let totalTasks = 0;

    let html = '';

    let sortedUsers;
    const shouldShowUser = (user) => user && user.role !== 'partner' && (user.active !== 0 || AppState.getTaskCountForUser(user.id) > 0);
    if (selectedId === 'all') {
      sortedUsers = users.filter((u) => shouldShowUser(u));
    } else if (Array.isArray(selectedId)) {
      sortedUsers = users.filter((u) => selectedId.includes(u.id) && shouldShowUser(u));
    } else {
      const user = users.find(u => u.id === selectedId);
      sortedUsers = shouldShowUser(user) ? [user] : [];
    }

    sortedUsers = [...sortedUsers].sort((a, b) => a.display_name.localeCompare(b.display_name));

    for (const user of sortedUsers) {
      const group = groups[user.id];
      if (!group) continue;

      let tasks = group.tasks;

      // Apply search filter
      if (searchQuery) {
        tasks = tasks.filter(t =>
          t.title.toLowerCase().includes(searchQuery) ||
          (t.notes && t.notes.toLowerCase().includes(searchQuery))
        );
      }

      // Apply priority filter
      if (filterPriority !== null && filterPriority !== undefined) {
        tasks = tasks.filter(t => t.priority === filterPriority);
      }

      totalTasks += tasks.length;

      // PTO badge
      const pto = AppState.getPTOForUser(user.id);
      const ptoBadge = pto
        ? `<span class="badge badge-pto">${pto.label}</span>`
        : '';

      // Menu button (partner only)
      const isPartner = AppState.isPartner();
      const menuBtn = isPartner
        ? `<button class="staff-section-menu partner-only" data-user-id="${user.id}" title="PTO & options">\u22EF</button>`
        : '';

      html += `
        <div class="staff-section" data-user-id="${user.id}">
          <div class="staff-section-header">
            <span class="staff-section-name">${user.display_name}</span>
            <span class="badge badge-green">${tasks.length} TASKS</span>
            ${ptoBadge}
            ${menuBtn}
          </div>
          <div class="staff-tasks">
      `;

      if (tasks.length === 0) {
        html += `<div class="empty-section">No tasks assigned</div>`;
      } else {
        for (const task of tasks) {
          html += TaskCard.render(task);
        }
      }

      html += `</div></div>`;
    }

    if (sortedUsers.length === 0) {
      html = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <div class="empty-state-title">No staff members yet</div>
          <div class="empty-state-text">Add team members using the Manage Users button in the toolbar.</div>
        </div>
      `;
    }

    this._subtitle.textContent = `${dateStr} \u2014 ${totalTasks} tasks scheduled`;
    this._container.innerHTML = html;
    this._renderStaffRail(sortedUsers);
    requestAnimationFrame(() => this._updateRailThumb());

    // Bind task card events
    TaskCard.bindEvents(this._container);

    if (activeNoteTaskId) {
      const restoredInput = this._container.querySelector(`.task-notes-input[data-task-id="${activeNoteTaskId}"]`);
      if (restoredInput) {
        restoredInput.focus({ preventScroll: true });
        if (
          activeNoteSelection &&
          typeof activeNoteSelection.start === 'number' &&
          typeof activeNoteSelection.end === 'number'
        ) {
          restoredInput.setSelectionRange(activeNoteSelection.start, activeNoteSelection.end);
        }
      }
    }

    // Bind staff section menu events
    this._container.querySelectorAll('.staff-section-menu').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showStaffMenu(e, btn.dataset.userId);
      });
    });
  },

  _renderStaffRail(sortedUsers) {
    if (!this._staffRail) return;

    if (!Array.isArray(sortedUsers) || sortedUsers.length < 2) {
      this._staffRail.classList.add('hidden');
      this._staffRail.innerHTML = '';
      return;
    }

    this._staffRail.classList.remove('hidden');
    this._staffRail.innerHTML = `
      <div class="staff-jump-rail-track">
        ${sortedUsers.map((user, index) => {
          const initials = this._getStaffInitials(user.display_name);
          const button = `
            <button
              type="button"
              class="staff-jump-rail-btn"
              data-user-id="${user.id}"
              data-index="${index}"
              title="${this._esc(user.display_name)}"
              aria-label="Jump to ${this._esc(user.display_name)}"
            >
              ${this._esc(initials)}
            </button>
          `;
          const dot = index < sortedUsers.length - 1
            ? `<div class="staff-jump-rail-dot" data-after-index="${index}" aria-hidden="true"></div>`
            : '';
          return `${button}${dot}`;
        }).join('')}
      </div>
      <div class="staff-jump-scrollbar" aria-hidden="true">
        <div class="staff-jump-scrollbar-thumb"></div>
      </div>
    `;
  },

  _updateRailThumb() {
    if (!this._staffRail || this._staffRail.classList.contains('hidden') || !this._scroller) return;

    const scrollbar = this._staffRail.querySelector('.staff-jump-scrollbar');
    const thumb = this._staffRail.querySelector('.staff-jump-scrollbar-thumb');
    const buttons = Array.from(this._staffRail.querySelectorAll('.staff-jump-rail-btn'));
    const sections = Array.from(this._container.querySelectorAll('.staff-section'));
    if (!scrollbar || !thumb || !buttons.length || !sections.length) return;

    buttons.forEach((button) => button.classList.remove('is-current'));

    const viewTop = this._scroller.scrollTop;
    const viewHeight = this._scroller.clientHeight;
    const contentHeight = this._scroller.scrollHeight;
    const maxScrollTop = Math.max(0, contentHeight - viewHeight);
    const currentSection = sections.find((section) => section.offsetTop + section.offsetHeight > viewTop) || sections[sections.length - 1];

    if (!currentSection) {
      thumb.style.opacity = '0';
      return;
    }

    thumb.style.opacity = '1';
    const currentUserId = currentSection.dataset.userId;
    const currentButton = buttons.find((button) => button.dataset.userId === currentUserId);
    currentButton?.classList.add('is-current');

    const trackHeight = scrollbar.clientHeight;
    if (!trackHeight || contentHeight <= viewHeight) {
      thumb.style.top = '0px';
      thumb.style.height = `${trackHeight}px`;
      return;
    }

    const thumbHeight = Math.max(18, trackHeight * (viewHeight / contentHeight));
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = maxScrollTop > 0 ? (viewTop / maxScrollTop) * maxThumbTop : 0;

    thumb.style.top = `${thumbTop}px`;
    thumb.style.height = `${thumbHeight}px`;
  },

  _jumpToStaff(userId) {
    const target = this._container.querySelector(`.staff-section[data-user-id="${userId}"]`);
    if (!target || !this._scroller) return;

    const scrollerRect = this._scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextScrollTop = this._scroller.scrollTop + (targetRect.top - scrollerRect.top) - 8;
    this._scroller.scrollTo({ top: Math.max(0, nextScrollTop), behavior: 'smooth' });
  },

  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _getStaffInitials(name) {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  },

  _showStaffMenu(e, userId) {
    const user = AppState.getUserById(userId);
    if (!user) return;

    const pto = AppState.getPTOForUser(userId);

    const items = [];
    if (pto) {
      items.push({ label: `Edit PTO: ${pto.label}`, action: () => this._editPTO(userId) });
      items.push({ label: 'Clear PTO', action: () => this._clearPTO(userId), danger: true });
    } else {
      items.push({ label: 'Set PTO', action: () => this._editPTO(userId) });
    }

    const menu = ContextMenu.create(items);
    const rect = e.target.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = (rect.left) + 'px';
  },

  async _editPTO(userId) {
    PTODialog.show(userId);
  },

  async _clearPTO(userId) {
    await window.api.clearPTO(userId);
    AppState.refresh();
  }
};
