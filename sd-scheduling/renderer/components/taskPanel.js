/**
 * Task panel — renders staff sections with their task cards.
 */

const TaskPanel = {
  init() {
    this._container = document.getElementById('tasks-container');
    this._title = document.getElementById('tasks-title');
    this._subtitle = document.getElementById('tasks-subtitle');
    this._addBtn = document.getElementById('btn-add-task');

    this._addBtn.addEventListener('click', () => {
      const selectedId = AppState.get('selectedStaffId');
      TaskDialog.show({ assigned_to: selectedId !== 'all' ? selectedId : null });
    });

    AppState.on('tasks', () => this.render());
    AppState.on('users', () => this.render());
    AppState.on('selectedStaffId', () => this.render());
    AppState.on('selectedPartnerId', () => this.render());
    AppState.on('searchQuery', () => this.render());
    AppState.on('pto', () => this.render());
    AppState.on('filterPriority', () => this.render());

    this.render();
  },

  render() {
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
    if (selectedId === 'all') {
      sortedUsers = users.filter(u => u.active !== 0 && u.role !== 'partner');
    } else if (Array.isArray(selectedId)) {
      sortedUsers = users.filter(u => selectedId.includes(u.id) && u.role !== 'partner');
    } else {
      const user = users.find(u => u.id === selectedId);
      sortedUsers = (user && user.role !== 'partner') ? [user] : [];
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

    // Bind task card events
    TaskCard.bindEvents(this._container);

    // Bind staff section menu events
    this._container.querySelectorAll('.staff-section-menu').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showStaffMenu(e, btn.dataset.userId);
      });
    });
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
