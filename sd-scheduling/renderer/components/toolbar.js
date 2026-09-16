/**
 * Toolbar component - search, print, settings, current user badge.
 */

const Toolbar = {
  init() {
    this._searchInput = document.getElementById('search-input');
    this._printBtn = document.getElementById('btn-print');
    this._settingsBtn = document.getElementById('btn-settings');
    this._carryoverReviewBtn = document.getElementById('btn-carryover-review');
    this._carryoverReviewCount = document.getElementById('carryover-review-count');
    this._userBadge = document.getElementById('current-user-badge');
    this._syncIndicator = document.getElementById('sync-indicator');
    this._syncStatusText = document.getElementById('sync-status-text');
    this._lastRuntimeStatus = null;

    let searchTimeout;
    this._searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        AppState.set('searchQuery', e.target.value);
      }, 200);
    });

    this._searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._searchInput.value = '';
        AppState.set('searchQuery', '');
        this._searchInput.blur();
      }
    });

    this._printBtn.addEventListener('click', () => {
      PrintDialog.show();
    });

    this._settingsBtn.addEventListener('click', () => {
      SettingsDialog.show();
    });

    this._syncIndicator?.addEventListener('click', (event) => this._showSyncMenu(event));

    this._carryoverReviewBtn?.addEventListener('click', () => {
      AppState.set('carryoverReviewMode', !AppState.get('carryoverReviewMode'));
    });

    AppState.on('currentUser', () => this._updateUserBadge());
    AppState.on('tasks', () => this._updateCarryoverReviewButton());
    AppState.on('selectedPartnerId', () => this._updateCarryoverReviewButton());
    AppState.on('carryoverReviewMode', () => this._updateCarryoverReviewButton());
    this._updateUserBadge();
    this._updateCarryoverReviewButton();
    this._bindRuntimeStatus();
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

  _getCarryoverTasks() {
    const tasks = AppState.get('tasks') || [];
    const selectedPartnerId = AppState.get('selectedPartnerId');
    return tasks.filter((task) => {
      if ((task.confirmed ?? 1) !== 0) return false;
      if (!selectedPartnerId) return true;
      return AppState._matchesSelectedPartner(task, selectedPartnerId);
    });
  },

  _updateCarryoverReviewButton() {
    if (!this._carryoverReviewBtn || !this._carryoverReviewCount) return;

    const count = this._getCarryoverTasks().length;
    const isActive = AppState.get('carryoverReviewMode') === true;
    this._carryoverReviewBtn.classList.toggle('hidden', count === 0);
    this._carryoverReviewBtn.classList.toggle('filter-active', isActive);
    this._carryoverReviewBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    this._carryoverReviewCount.textContent = String(count);

    if (count === 0 && isActive) {
      AppState.set('carryoverReviewMode', false);
    }
  },

  async _bindRuntimeStatus() {
    const status = await window.api.getRuntimeStatus();
    this._applyRuntimeStatus(status);

    window.api.onRuntimeStatusChanged((nextStatus) => {
      this._applyRuntimeStatus(nextStatus);
    });
  },

  _applyRuntimeStatus(status) {
    if (!this._syncIndicator || !this._syncStatusText) return;
    this._lastRuntimeStatus = status || null;

    const syncText = this._formatRuntimeTimestamp(status?.lastSyncAt, 'No recent sync');
    this._syncStatusText.textContent = syncText;

    const lines = [
      syncText,
      `Shared folder: ${status?.sharedDrivePath || 'Not configured'}`,
      `Excel file: ${status?.excelPath || 'Not configured'}`,
    ];

    if (status?.lastExcelWriteAt) {
      lines.push(`Excel updated: ${this._formatRuntimeTimestamp(status.lastExcelWriteAt, 'Never').replace('Synced ', '')}`);
    } else {
      lines.push('Excel updated: Never');
    }

    if (status?.updateAvailable && status?.latestVersion) {
      lines.push(`Update available: ${status.latestVersion}`);
    }

    this._syncIndicator.title = lines.join('\n');
  },

  _formatRuntimeTimestamp(isoStr, fallback = 'Never') {
    if (!isoStr) return fallback;
    const date = new Date(isoStr);
    if (Number.isNaN(date.getTime())) return fallback;
    return `Synced ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  },

  _buildRuntimeStatusMenuItems(status) {
    const items = [
      { type: 'label', label: this._formatRuntimeTimestamp(status?.lastSyncAt, 'No recent sync') },
      { type: 'label', label: `Shared folder: ${status?.sharedDriveReachable ? 'reachable' : status?.sharedDrivePath ? 'unavailable' : 'not configured'}` },
    ];

    if (status?.sharedDrivePath) {
      items.push({ type: 'label', label: status.sharedDrivePath });
    }

    items.push({
      type: 'label',
      label: `Excel updated: ${status?.lastExcelWriteAt ? this._formatRuntimeTimestamp(status.lastExcelWriteAt, 'Never').replace('Synced ', '') : 'Never'}`,
    });

    if (status?.excelPath) {
      items.push({ type: 'label', label: status.excelPath });
    }

    if (status?.updateAvailable && status?.latestVersion) {
      items.push({ type: 'label', label: `Update available: ${status.latestVersion}` });
    }

    items.push({ divider: true });
    return items;
  },

  _showSyncMenu(event) {
    if (!this._syncIndicator) return;

    event.preventDefault();
    event.stopPropagation();

    const items = [
      ...this._buildRuntimeStatusMenuItems(this._lastRuntimeStatus),
      {
        label: 'Sync Now',
        action: async () => {
          try {
            this.showSyncing();
            await window.api.forceSync();
            this._applyRuntimeStatus(await window.api.getRuntimeStatus());
          } catch (_) {
            this.showSyncError();
          }
        }
      },
      {
        label: 'Refresh Excel',
        action: async () => {
          try {
            this.showSyncing();
            const result = await window.api.refreshExcel();
            if (result && !result.error) {
              await AppState.refresh();
              Toast.show(`Excel refreshed: ${result.imported || 0} new, ${result.updated || 0} updated`, 'success');
            } else if (result?.error) {
              Toast.show(result.error, 'error');
            }
            this._applyRuntimeStatus(await window.api.getRuntimeStatus());
          } catch (_) {
            this.showSyncError();
          }
        }
      },
    ];

    const menu = ContextMenu.create(items);
    const rect = this._syncIndicator.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.left = `${Math.max(8, rect.right - 180)}px`;

    requestAnimationFrame(() => {
      const menuRect = menu.getBoundingClientRect();
      if (menuRect.right > window.innerWidth - 8) {
        menu.style.left = `${Math.max(8, window.innerWidth - menuRect.width - 8)}px`;
      }
      if (menuRect.bottom > window.innerHeight - 8) {
        menu.style.top = `${Math.max(8, rect.top - menuRect.height - 8)}px`;
      }
    });
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

      const isLabel = item.type === 'label';
      const btn = document.createElement(item.submenu || isLabel ? 'div' : 'button');
      if (!item.submenu && !isLabel) btn.type = 'button';
      btn.className = `context-menu-item ${item.danger ? 'danger' : ''}${item.submenu ? ' has-submenu' : ''}${isLabel ? ' context-menu-info' : ''}`;

      let iconHtml = '';
      if (item.icon) {
        iconHtml = item.icon;
      }

      if (iconHtml) {
        const icon = document.createElement('span');
        icon.innerHTML = iconHtml;
        btn.appendChild(icon);
      } else if (item.color) {
        const dot = document.createElement('span');
        dot.style.width = '10px';
        dot.style.height = '10px';
        dot.style.borderRadius = '50%';
        dot.style.background = item.color;
        dot.style.flexShrink = '0';
        btn.appendChild(dot);
      }

      const label = document.createElement('span');
      label.className = 'context-menu-label';
      label.textContent = item.label || '';
      btn.appendChild(label);

      if (item.submenu) {
        const chevron = document.createElement('span');
        chevron.className = 'context-menu-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.innerHTML = '&#8250;';
        btn.appendChild(chevron);
      }

      if (item.submenu) {
        const submenu = document.createElement('div');
        submenu.className = 'context-menu context-submenu';
        this._appendItems(submenu, item.submenu);
        btn.appendChild(submenu);

        const positionSubmenu = () => {
          const previousDisplay = submenu.style.display;
          const previousVisibility = submenu.style.visibility;
          const previousPointerEvents = submenu.style.pointerEvents;

          submenu.style.display = 'block';
          submenu.style.visibility = 'hidden';
          submenu.style.pointerEvents = 'none';

          btn.classList.remove('open-left', 'open-up');

          const btnRect = btn.getBoundingClientRect();
          const submenuWidth = submenu.offsetWidth;
          const submenuHeight = submenu.offsetHeight;
          const overflowRight = (btnRect.right - 4 + submenuWidth) > (window.innerWidth - 8);
          const overflowBottom = (btnRect.top - 6 + submenuHeight) > (window.innerHeight - 8);

          btn.classList.toggle('open-left', overflowRight);
          btn.classList.toggle('open-up', overflowBottom);

          submenu.style.display = previousDisplay;
          submenu.style.visibility = previousVisibility;
          submenu.style.pointerEvents = previousPointerEvents;
        };

        btn.addEventListener('mouseenter', positionSubmenu);
        btn.addEventListener('focusin', positionSubmenu);
      } else if (!isLabel) {
        btn.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.dismiss();
          if (item.action) {
            Promise.resolve(item.action()).catch((error) => {
              console.error('Context menu action failed:', error);
            });
          }
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
