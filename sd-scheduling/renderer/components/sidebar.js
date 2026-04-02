/**
 * Sidebar component — staff list with avatars, task count badges, and selection.
 * V4 style: Partners and Staff shown in separate collapsible sections.
 * Partner click filters projects panel by that partner.
 * Staff click shows that staff member's tasks.
 * Ctrl+click for multi-select. Sort toggle for name/task count.
 * Right-click context menus on staff/partner items.
 */

const Sidebar = {
  _collapsed: { partners: false, staff: false },

  init() {
    this._list = document.getElementById('sidebar-list');
    this._allBtn = document.getElementById('sidebar-all-staff');
    this._sortBtn = document.getElementById('sidebar-sort-btn');

    this._allBtn.addEventListener('click', () => {
      AppState.set('selectedStaffId', 'all');
      AppState.set('selectedPartnerId', null);
    });

    // Sort toggle button
    if (this._sortBtn) {
      this._sortBtn.addEventListener('click', (e) => {
        this._showSortMenu(e);
      });
    }

    this._renderListener = this._renderListener || (() => this.render());
    AppState.on('users', this._renderListener);
    AppState.on('tasks', this._renderListener);
    AppState.on('pto', this._renderListener);
    AppState.on('selectedStaffId', this._renderListener);
    AppState.on('selectedPartnerId', this._renderListener);
    AppState.on('sidebarSort', this._renderListener);

    this.render();
  },

  render() {
    const users = AppState.get('users') || [];
    const selectedId = AppState.get('selectedStaffId');
    const selectedPartnerId = AppState.get('selectedPartnerId');
    const sortMode = AppState.get('sidebarSort') || 'default';
    const shouldShowUser = (user) => user && (user.active !== 0 || AppState.getTaskCountForUser(user.id) > 0);

    const partners = users.filter((u) => u.role === 'partner' && shouldShowUser(u));
    let staff = users.filter((u) => u.role === 'staff' && shouldShowUser(u));

    // Sort staff based on sort mode
    if (sortMode === 'role') {
      const roles = AppState.get('businessRoles') || [];
      const roleOrder = {};
      roles.forEach((r, i) => { roleOrder[r.id] = i; });
      staff = [...staff].sort((a, b) => {
        const ra = a.business_role_id ? (roleOrder[a.business_role_id] ?? 999) : 999;
        const rb = b.business_role_id ? (roleOrder[b.business_role_id] ?? 999) : 999;
        if (ra !== rb) return ra - rb;
        return a.display_name.localeCompare(b.display_name);
      });
    } else {
      // Default: A-Z by name
      staff = [...staff].sort((a, b) => a.display_name.localeCompare(b.display_name));
    }

    const chevron = `<svg class="sidebar-section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

    let html = '';

    // "All Staff" item
    const allSelected = selectedId === 'all' && !selectedPartnerId;
    html += `
      <div class="sidebar-item sidebar-item-all ${allSelected ? 'selected' : ''}"
           data-user-id="all">
        <div class="sidebar-avatar" style="background: var(--sidebar-pill)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--sidebar-text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        </div>
        <span class="sidebar-item-name">All Staff</span>
        <span class="sidebar-item-badge has-tasks">${AppState.get('tasks')?.length || 0}</span>
      </div>
    `;

    // Partners section (collapsible)
    if (partners.length > 0) {
      const pCollapsed = this._collapsed.partners;
      html += `<div class="sidebar-section-label ${pCollapsed ? 'collapsed' : ''}" data-section="partners">${chevron}Partners</div>`;
      html += `<div class="sidebar-section-items ${pCollapsed ? 'collapsed' : ''}" data-section-items="partners">`;
      for (const user of partners) {
        const isSelected = selectedPartnerId === user.id;
        html += this._renderUserItem(user, isSelected);
      }
      html += `</div>`;
    }

    // Staff section (collapsible)
    if (staff.length > 0) {
      const sCollapsed = this._collapsed.staff;
      html += `<div class="sidebar-section-label ${sCollapsed ? 'collapsed' : ''}" data-section="staff">${chevron}Staff</div>`;
      html += `<div class="sidebar-section-items ${sCollapsed ? 'collapsed' : ''}" data-section-items="staff">`;
      for (const user of staff) {
        const isSelected = AppState.isStaffSelected(user.id) && !selectedPartnerId;
        html += this._renderUserItem(user, isSelected);
      }
      html += `</div>`;
    }

    this._list.innerHTML = html;

    // Bind section collapse toggles
    this._list.querySelectorAll('.sidebar-section-label').forEach(label => {
      label.addEventListener('click', () => {
        const section = label.dataset.section;
        this._collapsed[section] = !this._collapsed[section];
        label.classList.toggle('collapsed');
        const items = this._list.querySelector(`[data-section-items="${section}"]`);
        if (items) items.classList.toggle('collapsed');
      });
    });

    // Bind click events on items
    this._list.querySelectorAll('.sidebar-item').forEach(item => {
      const userId = item.dataset.userId;

      item.addEventListener('click', (e) => {
        if (userId === 'all') {
          AppState.set('selectedStaffId', 'all');
          AppState.set('selectedPartnerId', null);
          return;
        }

        const user = AppState.getUserById(userId);
        if (!user) return;

        if (user.role === 'partner') {
          AppState.set('selectedPartnerId', userId);
          AppState.set('selectedStaffId', 'all');
        } else {
          if (e.ctrlKey || e.metaKey) {
            const current = AppState.get('selectedStaffId');
            let selection;
            if (current === 'all') {
              selection = [userId];
            } else if (Array.isArray(current)) {
              if (current.includes(userId)) {
                selection = current.filter(id => id !== userId);
                if (selection.length === 0) selection = 'all';
                else if (selection.length === 1) selection = selection[0];
              } else {
                selection = [...current, userId];
              }
            } else {
              if (current === userId) {
                selection = 'all';
              } else {
                selection = [current, userId];
              }
            }
            AppState.set('selectedPartnerId', null);
            AppState.set('selectedStaffId', selection);
          } else {
            AppState.set('selectedPartnerId', null);
            AppState.set('selectedStaffId', userId);
          }
        }
      });

      // Right-click context menu
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (userId === 'all') return;
        const user = AppState.getUserById(userId);
        if (user) this._showContextMenu(e, user);
      });
    });

    // Update sort button indicator
    if (this._sortBtn) {
      this._sortBtn.classList.toggle('active-sort', sortMode === 'role');
    }
  },

  _renderUserItem(user, isSelected) {
    const taskCount = AppState.getTaskCountForUser(user.id);
    const initials = this._getInitials(user.display_name);
    const shortName = this._getShortName(user.display_name);
    const badgeClass = taskCount > 0 ? 'has-tasks' : '';
    const pto = AppState.getPTOForUser(user.id);
    const ptoHtml = pto
      ? `<span class="sidebar-pto-badge" title="${this._escapeAttr(pto.label)}">${this._escapeHtml(pto.label)}</span>`
      : '';

    return `
      <div class="sidebar-item ${isSelected ? 'selected' : ''}"
           data-user-id="${user.id}" title="${this._escapeAttr(user.display_name)}">
        <div class="sidebar-avatar" style="background: ${user.avatar_color}">${initials}</div>
        <span class="sidebar-item-name">${this._escapeHtml(shortName)}</span>
        ${ptoHtml}
        <span class="sidebar-item-badge ${badgeClass}">${taskCount > 0 ? taskCount : ''}</span>
      </div>
    `;
  },

  /** "John Smith" → "John S." */
  _getShortName(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return parts[0] + ' ' + parts[parts.length - 1][0] + '.';
    }
    return parts[0];
  },

  _showSortMenu(e) {
    const current = AppState.get('sidebarSort') || 'name';
    const checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    const emptyIcon = '<span style="width:14px;height:14px;display:inline-block;"></span>';

    const menu = ContextMenu.create([
      { label: 'A–Z', action: () => AppState.set('sidebarSort', 'name'), icon: current === 'name' ? checkIcon : emptyIcon },
      { label: 'By Role', action: () => AppState.set('sidebarSort', 'role'), icon: current === 'role' ? checkIcon : emptyIcon },
    ]);

    const rect = this._sortBtn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = rect.left + 'px';
  },

  _showContextMenu(e, user) {
    const isPartner = AppState.isPartner();
    if (!isPartner) return;

    const items = [];
    const pto = AppState.getPTOForUser(user.id);

    items.push({
      label: 'Jump To',
      action: () => {
        AppState.set('selectedStaffId', user.id);
        AppState.set('selectedPartnerId', null);
        setTimeout(() => {
          const section = document.querySelector(`.staff-section[data-user-id="${user.id}"]`);
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    });

    if (user.role === 'staff') {
      items.push({ divider: true });

      if (pto) {
        items.push({
          label: `Edit PTO: ${pto.label}`,
          action: () => this._editPTO(user.id)
        });
        items.push({
          label: 'Clear PTO',
          danger: true,
          action: () => this._clearPTO(user.id)
        });
      } else {
        items.push({
          label: 'Set PTO...',
          action: () => this._editPTO(user.id)
        });
      }

      const userTasks = AppState.getTasksForUser(user.id);
      if (userTasks.length > 0) {
        items.push({ divider: true });
        items.push({
          label: 'Clear All Priorities',
          action: async () => {
            for (const task of userTasks) {
              await window.api.updateTask({ id: task.id, priority: 0 });
            }
            AppState.refresh();
            Toast.show('Priorities cleared', 'success');
          }
        });
        items.push({
          label: 'Clear All Tasks',
          danger: true,
          action: async () => {
            if (confirm(`Remove all ${userTasks.length} tasks for ${user.display_name}?`)) {
              for (const task of userTasks) {
                await window.api.deleteTask(task.id);
              }
              AppState.refresh();
              Toast.show('Tasks cleared', 'success');
            }
          }
        });
      }
    }

    const menu = ContextMenu.create(items);
    menu.style.top = e.clientY + 'px';
    menu.style.left = e.clientX + 'px';

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 8) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
      if (rect.right > window.innerWidth - 8) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    });
  },

  async _editPTO(userId) {
    PTODialog.show(userId);
  },

  async _clearPTO(userId) {
    await window.api.clearPTO(userId);
    AppState.refresh();
  },

  _getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  _escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
};
