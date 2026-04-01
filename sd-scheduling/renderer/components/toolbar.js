/**
 * Toolbar component — search, filter, print, manage users, current user badge.
 */

const Toolbar = {
  init() {
    this._searchInput = document.getElementById('search-input');
    this._filterBtn = document.getElementById('btn-filter');
    this._filterBadge = document.getElementById('filter-badge');
    this._printBtn = document.getElementById('btn-print');
    this._manageUsersBtn = document.getElementById('btn-manage-users');
    this._settingsBtn = document.getElementById('btn-settings');
    this._userBadge = document.getElementById('current-user-badge');
    this._syncIndicator = document.getElementById('sync-indicator');

    // Search with debounce
    let searchTimeout;
    this._searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        AppState.set('searchQuery', e.target.value);
      }, 200);
    });

    // Clear search on Escape
    this._searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._searchInput.value = '';
        AppState.set('searchQuery', '');
        this._searchInput.blur();
      }
    });

    // Print button
    this._printBtn.addEventListener('click', () => {
      PrintDialog.show();
    });

    // Manage users button
    this._manageUsersBtn.addEventListener('click', () => {
      UserDialog.show();
    });

    // Settings button
    this._settingsBtn.addEventListener('click', () => {
      SettingsDialog.show();
    });

    // Filter button
    this._filterBtn.addEventListener('click', (e) => {
      this._showFilterMenu(e);
    });

    // Update user badge when current user changes
    AppState.on('currentUser', () => this._updateUserBadge());
    this._updateUserBadge();
  },

  _updateUserBadge() {
    const user = AppState.get('currentUser');
    if (!user) return;

    const avatar = this._userBadge.querySelector('.user-avatar-small');
    const name = this._userBadge.querySelector('.user-badge-name');

    const initials = Sidebar._getInitials(user.display_name);
    avatar.textContent = initials;
    avatar.style.background = user.avatar_color;
    name.textContent = user.display_name;
  },

  _showFilterMenu(e) {
    const menu = ContextMenu.create([
      { label: 'All Priorities', action: () => this._setFilter('priority', null) },
      { divider: true },
      { label: 'Priority 1 — Urgent', action: () => this._setFilter('priority', 1), color: 'var(--priority-1)' },
      { label: 'Priority 2 — High', action: () => this._setFilter('priority', 2), color: 'var(--priority-2)' },
      { label: 'Priority 3 — Normal', action: () => this._setFilter('priority', 3), color: 'var(--priority-3)' },
      { label: 'Priority 4 — Low', action: () => this._setFilter('priority', 4), color: 'var(--priority-4)' },
    ]);

    const rect = this._filterBtn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';
    menu.style.left = 'auto';
  },

  _setFilter(type, value) {
    // Simple priority filter — stored in state
    AppState.set('filterPriority', value);
    this._updateFilterBadge();
  },

  _updateFilterBadge() {
    const priority = AppState.get('filterPriority');
    if (priority !== null && priority !== undefined) {
      this._filterBadge.textContent = '1';
      this._filterBadge.classList.remove('hidden');
      this._filterBtn.classList.add('filter-active');
    } else {
      this._filterBadge.classList.add('hidden');
      this._filterBtn.classList.remove('filter-active');
    }
  },

  showSyncing() {
    const dot = this._syncIndicator.querySelector('.sync-dot');
    dot.classList.add('syncing');
    dot.classList.remove('error');
    this._syncIndicator.title = 'Syncing...';
  },

  showSynced() {
    const dot = this._syncIndicator.querySelector('.sync-dot');
    dot.classList.remove('syncing', 'error');
    this._syncIndicator.title = 'Synced';
  },

  showSyncError() {
    const dot = this._syncIndicator.querySelector('.sync-dot');
    dot.classList.remove('syncing');
    dot.classList.add('error');
    this._syncIndicator.title = 'Sync error';
  }
};

/**
 * Context menu utility
 */
const ContextMenu = {
  _current: null,

  create(items) {
    this.dismiss();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    this._appendItems(menu, items);

    document.body.appendChild(menu);
    this._current = menu;

    // Dismiss on click outside
    setTimeout(() => {
      document.addEventListener('click', this._onOutsideClick);
      document.addEventListener('keydown', this._onEscape);
    }, 0);

    return menu;
  },

  _appendItems(container, items) {
    for (const item of items) {
      if (item.divider) {
        const div = document.createElement('div');
        div.className = 'context-menu-divider';
        container.appendChild(div);
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

      btn.innerHTML = `${iconHtml}<span class="context-menu-label">${item.label}</span>${chevronHtml}`;

      if (item.submenu) {
        const submenu = document.createElement('div');
        submenu.className = 'context-menu context-submenu';
        this._appendItems(submenu, item.submenu);
        btn.appendChild(submenu);

        const positionSubmenu = () => {
          requestAnimationFrame(() => {
            const rect = submenu.getBoundingClientRect();
            const overflowRight = rect.right > window.innerWidth - 8;
            const overflowBottom = rect.bottom > window.innerHeight - 8;
            btn.classList.toggle('open-left', overflowRight);
            btn.classList.toggle('open-up', overflowBottom);
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

  _onOutsideClick: function(e) {
    if (ContextMenu._current && !ContextMenu._current.contains(e.target)) {
      ContextMenu.dismiss();
    }
  },

  _onEscape: function(e) {
    if (e.key === 'Escape') {
      ContextMenu.dismiss();
    }
  }
};
