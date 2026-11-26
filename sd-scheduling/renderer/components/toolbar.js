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
    this._publishRolloverBtn = document.getElementById('btn-publish-rollover');
    this._bulkActionsBtn = document.getElementById('btn-bulk-actions');
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

    document.getElementById('btn-command-palette')?.addEventListener('click', () => CommandPalette.open());

    this._settingsBtn.addEventListener('click', () => {
      SettingsDialog.show();
    });

    this._syncIndicator?.addEventListener('click', (event) => this._showSyncMenu(event));

    this._carryoverReviewBtn?.addEventListener('click', () => {
      AppState.set('carryoverReviewMode', !AppState.get('carryoverReviewMode'));
    });

    this._publishRolloverBtn?.addEventListener('click', () => this._publishRolloverChanges());
    this._bulkActionsBtn?.addEventListener('click', () => this._showBulkActions());
    document.addEventListener('bulk-selection-changed', (event) => {
      const count = event.detail?.count || 0;
      this._bulkActionsBtn?.classList.toggle('hidden', count === 0);
      if (this._bulkActionsBtn) this._bulkActionsBtn.textContent = `Bulk Actions (${count})`;
    });

    AppState.on('currentUser', () => this._updateUserBadge());
    AppState.on('tasks', () => {
      this._updateCarryoverReviewButton();
      this._updateRolloverPublishButton();
    });
    AppState.on('selectedPartnerId', () => this._updateCarryoverReviewButton());
    AppState.on('selectedStaffId', () => this._updateCarryoverReviewButton());
    AppState.on('carryoverReviewMode', () => this._updateCarryoverReviewButton());
    this._updateUserBadge();
    this._updateCarryoverReviewButton();
    this._updateRolloverPublishButton();
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

  _showBulkActions() {
    const ids = window.TaskPanel?.getBulkTaskIds?.() || [];
    if (!ids.length) return;
    const users = (AppState.get('users') || []).filter((user) => user.role !== 'partner' && user.active !== 0);
    const escape = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `<div class="dialog"><div class="dialog-header"><div class="dialog-title">Bulk Actions</div><div class="dialog-subtitle">Update ${ids.length} selected task${ids.length === 1 ? '' : 's'}</div></div><div class="dialog-body"><div class="form-group"><label>Assign to</label><select class="select" id="bulk-assignee"><option value="">Leave unchanged</option>${users.map((user) => `<option value="${escape(user.id)}">${escape(user.display_name)}</option>`).join('')}</select></div><div class="form-group"><label>Due date</label><input class="input" id="bulk-due-date" type="date"></div><div class="form-group"><label>Priority</label><select class="select" id="bulk-priority"><option value="">Leave unchanged</option><option value="0">Clear</option>${[1,2,3,4,5,6,7,8,9,10].map((value) => `<option value="${value}">${value}</option>`).join('')}</select></div></div><div class="dialog-footer"><button class="btn btn-ghost" type="button" data-bulk-cancel>Cancel</button><button class="btn btn-primary" type="button" data-bulk-apply>Apply Changes</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-bulk-cancel]').addEventListener('click', () => overlay.remove());
    overlay.querySelector('[data-bulk-apply]').addEventListener('click', async () => {
      const assignee = overlay.querySelector('#bulk-assignee').value;
      const dueDate = overlay.querySelector('#bulk-due-date').value;
      const priority = overlay.querySelector('#bulk-priority').value;
      const changes = {};
      if (assignee) changes.assigned_to = assignee;
      if (dueDate) changes.due_date = dueDate;
      if (priority !== '') { changes.priority = Number(priority); changes.priority_label = null; }
      if (!Object.keys(changes).length) { overlay.remove(); return; }
      const button = overlay.querySelector('[data-bulk-apply]');
      button.disabled = true;
      await Promise.all(ids.map((id) => window.api.updateTask({ id, ...changes })));
      overlay.remove();
      window.TaskPanel.clearBulkSelection();
      await AppState.refresh();
      Toast.show(`Updated ${ids.length} task${ids.length === 1 ? '' : 's'}`, 'success');
    });
  },

  _getCarryoverTasks() {
    const tasks = AppState.get('tasks') || [];
    const selectedPartnerId = AppState.get('selectedPartnerId');
    const selectedStaffId = AppState.get('selectedStaffId');
    const visibleStaffIds = new Set((AppState.get('users') || [])
      .filter((user) => user.role !== 'partner' && (user.active !== 0 || AppState.getTaskCountForUser(user.id) > 0))
      .map((user) => user.id));

    return tasks.filter((task) => {
      if ((task.confirmed ?? 1) !== 0) return false;
      if (!visibleStaffIds.has(task.assigned_to)) return false;
      if (selectedPartnerId && !AppState._matchesSelectedPartner(task, selectedPartnerId)) return false;
      if (Array.isArray(selectedStaffId)) return selectedStaffId.includes(task.assigned_to);
      return selectedStaffId === 'all' || task.assigned_to === selectedStaffId;
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

  async _updateRolloverPublishButton() {
    if (!this._publishRolloverBtn) return;
    const state = await window.api.getRolloverPublicationState();
    const visible = state?.active && state?.hasUnpublishedChanges;
    this._publishRolloverBtn.classList.toggle('hidden', !visible);
    this._publishRolloverBtn.title = state?.notReviewedCount > 0
      ? `Publish changes; ${state.notReviewedCount} task${state.notReviewedCount === 1 ? '' : 's'} will remain Not Reviewed`
      : 'Publish scheduling changes to MyTasks';
  },

  async _publishRolloverChanges() {
    const state = await window.api.getRolloverPublicationState();
    if (!state?.hasUnpublishedChanges) return;

    const confirmed = await ConfirmDialog.show({
      title: state.published ? 'Publish scheduling changes?' : 'Publish weekly schedule?',
      message: state.notReviewedCount > 0
        ? `${state.notReviewedCount} task${state.notReviewedCount === 1 ? '' : 's'} will remain marked Not Reviewed in MyTasks.`
        : 'MyTasks will receive these scheduling changes in one update.',
      confirmLabel: 'Publish Changes',
    });
    if (!confirmed) return;

    this._setPublishingState(true);
    // Give the overlay a paint before the main process performs synchronous
    // shared-drive writes. This keeps the app visibly responsive on slow
    // network folders.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const result = await window.api.publishRolloverChanges();
      if (result?.published) {
        const taskLabel = `${result.taskCount || 0} task${result.taskCount === 1 ? '' : 's'}`;
        const deletedLabel = result.deletedCount ? `, ${result.deletedCount} removed` : '';
        const reviewLabel = result.notReviewedCount
          ? `, ${result.notReviewedCount} Not Reviewed`
          : '';
        Toast.show(`Published ${taskLabel}${deletedLabel}${reviewLabel}`, result.compatibilityPending ? 'warning' : 'success');
      } else {
        Toast.show(result?.error || 'Scheduling changes could not be published', 'error');
      }
    } finally {
      this._setPublishingState(false);
      await this._updateRolloverPublishButton();
    }
  },

  _setPublishingState(active) {
    document.body.classList.toggle('rollover-publishing-active', active);
    const overlay = document.getElementById('rollover-publishing-overlay');
    if (overlay) {
      overlay.classList.toggle('hidden', !active);
      overlay.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (this._publishRolloverBtn) this._publishRolloverBtn.disabled = active;
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

    // "Syncing" is only a temporary manual-action state. A completed runtime
    // status must always clear it; otherwise the dot keeps flashing yellow
    // even after Dashboard has successfully finished the shared sync.
    this._syncIndicator.querySelector('.sync-dot')?.classList.remove('syncing');

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

    if ((status?.syncOutbox?.pending || 0) > 0) {
      items.push({ type: 'label', label: `${status.syncOutbox.pending} local change${status.syncOutbox.pending === 1 ? '' : 's'} waiting to publish` });
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
/**
 * Keyboard behaviour shared by the pop-up menus (context menu, priority and lead menus).
 * Focus moves into a menu only when it was opened from the keyboard, so mouse use is unchanged.
 * Arrow keys, Home and End move between items, Right and Left open and close submenus,
 * and Escape or Tab close the menu and return focus to the control that opened it.
 */
const PopupKeyboard = {
  usingKeyboard: false,

  init() {
    document.addEventListener('keydown', () => { PopupKeyboard.usingKeyboard = true; }, true);
    document.addEventListener('pointerdown', () => { PopupKeyboard.usingKeyboard = false; }, true);
  },

  focusFirst(menu, itemSelector) {
    if (!PopupKeyboard.usingKeyboard) return;
    requestAnimationFrame(() => {
      const first = [...menu.children].find((el) => el.matches(itemSelector));
      if (first) first.focus({ preventScroll: true });
    });
  },

  returnFocus(returnTo) {
    if (returnTo && returnTo.isConnected && typeof returnTo.focus === 'function') {
      returnTo.focus({ preventScroll: true });
    }
  },

  attach(menu, { itemSelector = '.context-menu-item:not(.context-menu-info)', close, returnTo = null }) {
    menu.addEventListener('keydown', (e) => {
      const current = document.activeElement;
      if (!current || !menu.contains(current)) return;
      const container = current.closest('.context-menu, .priority-menu');
      if (!container) return;
      const items = [...container.children].filter((el) => el.matches(itemSelector));
      const index = items.indexOf(current);
      const go = (target) => {
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();
        target.focus({ preventScroll: true });
      };
      const openSubmenu = () => {
        const submenu = current.classList.contains('has-submenu') ? current.querySelector('.context-submenu') : null;
        if (submenu) go([...submenu.children].find((el) => el.matches(itemSelector)));
      };

      switch (e.key) {
        case 'ArrowDown': if (items.length) go(items[(index + 1) % items.length]); break;
        case 'ArrowUp': if (items.length) go(items[(index - 1 + items.length) % items.length]); break;
        case 'Home': go(items[0]); break;
        case 'End': go(items[items.length - 1]); break;
        case 'ArrowRight': openSubmenu(); break;
        case 'Enter':
        case ' ':
          if (current === e.target && current.classList.contains('has-submenu')) openSubmenu();
          break;
        case 'ArrowLeft':
          if (container.classList.contains('context-submenu')) go(container.parentElement);
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          close();
          PopupKeyboard.returnFocus(returnTo);
          break;
        case 'Tab':
          close();
          PopupKeyboard.returnFocus(returnTo);
          break;
        default:
          break;
      }
    });
  }
};
PopupKeyboard.init();

const ContextMenu = {
  _current: null,
  _opener: null,

  create(items) {
    const active = document.activeElement;
    const opener = active && active !== document.body && !active.closest('.context-menu') ? active : null;
    this.dismiss();
    this._opener = opener;

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.setAttribute('role', 'menu');
    this._appendItems(menu, items);

    document.body.appendChild(menu);
    this._current = menu;

    PopupKeyboard.attach(menu, { close: () => ContextMenu.dismiss(), returnTo: opener });
    PopupKeyboard.focusFirst(menu, '.context-menu-item:not(.context-menu-info)');

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
        div.setAttribute('role', 'separator');
        container.appendChild(div);
        continue;
      }

      const isLabel = item.type === 'label';
      const btn = document.createElement(item.submenu || isLabel ? 'div' : 'button');
      if (!item.submenu && !isLabel) btn.type = 'button';
      btn.className = `context-menu-item ${item.danger ? 'danger' : ''}${item.submenu ? ' has-submenu' : ''}${isLabel ? ' context-menu-info' : ''}`;
      if (isLabel) {
        btn.setAttribute('role', 'presentation');
      } else {
        btn.setAttribute('role', 'menuitem');
        if (item.submenu) {
          btn.tabIndex = 0;
          btn.setAttribute('aria-haspopup', 'menu');
        }
      }

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
        submenu.setAttribute('role', 'menu');
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
        // Keyboard activation: Enter or Space runs the item, like a pointer press.
        btn.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          const opener = this._opener;
          this.dismiss();
          PopupKeyboard.returnFocus(opener);
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
      const opener = ContextMenu._opener;
      ContextMenu.dismiss();
      if (PopupKeyboard.usingKeyboard) PopupKeyboard.returnFocus(opener);
    }
  }
};
