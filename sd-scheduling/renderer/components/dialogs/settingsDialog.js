/**
 * Settings Dialog — sidebar nav with sections for Roles, Priorities, Paths, About.
 */

const SettingsDialog = {
  _overlay: null,
  _activeSection: 'roles',
  _onEsc: null,

  // SVG icons for up/down arrows
  _upArrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="18 15 12 9 6 15"></polyline></svg>',
  _downArrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="6 9 12 15 18 9"></polyline></svg>',

  show() {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    this._overlay = overlay;

    overlay.innerHTML = `
      <div class="dialog dialog-settings">
        <div class="settings-layout">
          <nav class="settings-nav">
            <div class="settings-nav-title">Settings</div>
            <button class="settings-nav-item active" data-section="roles">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Staff Roles
            </button>
            <button class="settings-nav-item" data-section="priorities">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Priorities
            </button>
            <button class="settings-nav-item" data-section="paths">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              File Paths
            </button>
            <button class="settings-nav-item" data-section="status">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>
              System Status
            </button>
            <button class="settings-nav-item" data-section="about">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              About
            </button>
          </nav>
          <div class="settings-content" id="settings-content">
            <!-- Rendered by JS -->
          </div>
        </div>
        <div class="dialog-footer" style="border-top:1px solid var(--border-light);">
          <button class="btn btn-ghost" id="settings-close">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Nav switching
    overlay.querySelectorAll('.settings-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._activeSection = btn.dataset.section;
        this._renderSection();
      });
    });

    // Close
    overlay.querySelector('#settings-close').addEventListener('click', () => this._close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._close();
    });
    this._onEsc = (e) => {
      if (e.key === 'Escape') this._close();
    };
    document.addEventListener('keydown', this._onEsc);

    this._renderSection();
  },

  _close() {
    if (this._onEsc) {
      document.removeEventListener('keydown', this._onEsc);
      this._onEsc = null;
    }
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  },

  _renderSection() {
    const content = this._overlay.querySelector('#settings-content');
    switch (this._activeSection) {
      case 'roles': return this._renderRoles(content);
      case 'priorities': return this._renderPriorities(content);
      case 'paths': return this._renderPaths(content);
      case 'status': return this._renderStatus(content);
      case 'about': return this._renderAbout(content);
    }
  },

  // ── Staff Roles Section ──────────────────────────────

  _renderRoles(container) {
    const roles = AppState.get('businessRoles') || [];

    container.innerHTML = `
      <div class="settings-section">
        <h2 class="settings-section-title">Staff Roles</h2>
        <p class="settings-section-desc">Define roles that can be assigned to staff members (e.g. Senior Designer, Designer, Intern). Order indicates seniority.</p>
        <div class="settings-list" id="settings-roles-list">
          ${roles.length === 0
            ? '<div class="settings-empty">No roles defined yet.</div>'
            : roles.map((r, i) => `
              <div class="settings-list-item" data-id="${r.id}">
                <div class="settings-reorder-btns">
                  <button class="settings-arrow-btn${i === 0 ? ' disabled' : ''}" data-action="move-role-up" data-id="${r.id}" title="Move up"${i === 0 ? ' disabled' : ''}>${this._upArrow}</button>
                  <button class="settings-arrow-btn${i === roles.length - 1 ? ' disabled' : ''}" data-action="move-role-down" data-id="${r.id}" title="Move down"${i === roles.length - 1 ? ' disabled' : ''}>${this._downArrow}</button>
                </div>
                <span class="settings-list-label">${this._esc(r.name)}</span>
                <div class="settings-list-actions">
                  <button class="task-action-btn" data-action="edit-role" data-id="${r.id}" title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  <button class="task-action-btn" data-action="delete-role" data-id="${r.id}" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            `).join('')
          }
        </div>
        <div class="settings-add-row">
          <input type="text" class="input" id="settings-role-input" placeholder="e.g. Senior Designer" style="flex:1;">
          <button class="btn btn-primary btn-sm" id="settings-role-add">Add Role</button>
        </div>
      </div>
    `;

    // Add role
    const addBtn = container.querySelector('#settings-role-add');
    const input = container.querySelector('#settings-role-input');
    const doAdd = async () => {
      const name = input.value.trim();
      if (!name) { input.style.borderColor = 'var(--danger)'; return; }
      input.style.borderColor = '';
      await window.api.createBusinessRole({ name });
      await AppState.refresh();
      input.value = '';
      this._renderRoles(container);
    };
    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

    // Move up/down
    container.querySelectorAll('[data-action="move-role-up"]').forEach(btn => {
      btn.addEventListener('click', () => this._moveRole(roles, btn.dataset.id, -1, container));
    });
    container.querySelectorAll('[data-action="move-role-down"]').forEach(btn => {
      btn.addEventListener('click', () => this._moveRole(roles, btn.dataset.id, 1, container));
    });

    // Edit role
    container.querySelectorAll('[data-action="edit-role"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const role = AppState.getBusinessRoleById(id);
        if (!role) return;
        const item = container.querySelector(`.settings-list-item[data-id="${id}"]`);
        item.innerHTML = `
          <input type="text" class="input settings-inline-edit" id="edit-role-name" value="${this._esc(role.name)}" style="flex:1;">
          <div class="settings-list-actions">
            <button class="btn btn-ghost btn-sm" id="edit-role-cancel">Cancel</button>
            <button class="btn btn-primary btn-sm" id="edit-role-save">Save</button>
          </div>
        `;
        const nameInput = item.querySelector('#edit-role-name');
        nameInput.focus();
        nameInput.select();

        item.querySelector('#edit-role-cancel').addEventListener('click', () => this._renderRoles(container));
        item.querySelector('#edit-role-save').addEventListener('click', async () => {
          const newName = nameInput.value.trim();
          if (!newName) return;
          await window.api.updateBusinessRole({ id, name: newName });
          await AppState.refresh();
          this._renderRoles(container);
        });
        nameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') item.querySelector('#edit-role-save').click();
          if (e.key === 'Escape') this._renderRoles(container);
        });
      });
    });

    // Delete role
    container.querySelectorAll('[data-action="delete-role"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const role = AppState.getBusinessRoleById(id);
        if (!role) return;
        if (confirm(`Delete role "${role.name}"? Staff with this role will have it cleared.`)) {
          await window.api.deleteBusinessRole(id);
          await AppState.refresh();
          this._renderRoles(container);
        }
      });
    });
  },

  async _moveRole(roles, id, direction, container) {
    const idx = roles.findIndex(r => r.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= roles.length) return;

    const orders = roles.map((r, i) => {
      if (i === idx) return { id: r.id, sort_order: swapIdx };
      if (i === swapIdx) return { id: r.id, sort_order: idx };
      return { id: r.id, sort_order: i };
    });

    await window.api.reorderBusinessRoles(orders);
    await AppState.refresh();
    this._renderRoles(container);
  },

  // ── Custom Priorities Section ────────────────────────

  _renderPriorities(container) {
    const priorities = AppState.get('customPriorities') || [];
    const rows = this._buildPriorityOrderRows(priorities);

    container.innerHTML = `
      <div class="settings-section">
        <h2 class="settings-section-title">Priorities</h2>
        <p class="settings-section-desc">Set the order shown in priority menus. Numbered priority is represented as one line here, then expands to the right number of slots on each staff list.</p>
        <div class="settings-list" id="settings-priorities-list">
          ${rows.map((row, i) => `
              <div class="settings-list-item" data-token="${row.token}">
                <div class="settings-reorder-btns">
                  <button class="settings-arrow-btn${i === 0 ? ' disabled' : ''}" data-action="move-priority-up" data-token="${row.token}" title="Move up"${i === 0 ? ' disabled' : ''}>${this._upArrow}</button>
                  <button class="settings-arrow-btn${i === rows.length - 1 ? ' disabled' : ''}" data-action="move-priority-down" data-token="${row.token}" title="Move down"${i === rows.length - 1 ? ' disabled' : ''}>${this._downArrow}</button>
                </div>
                ${row.swatch}
                <span class="settings-list-label">${this._esc(row.label)}</span>
                <div class="settings-list-actions">
                  ${row.styleKey ? `
                  <input
                    type="color"
                    value="${this._esc(row.color || '#4D4AD5')}"
                    data-action="priority-style-color"
                    data-style-key="${row.styleKey}"
                    title="Choose ${this._esc(row.label)} color"
                    style="width:32px;height:32px;padding:2px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;"
                  >
                  ` : ''}
                  ${row.editable ? `
                  <button class="task-action-btn" data-action="edit-priority" data-id="${row.id}" title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  <button class="task-action-btn" data-action="delete-priority" data-id="${row.id}" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                  ` : (!row.styleKey ? '<span class="settings-priority-built-in">Built-in</span>' : '')}
                </div>
              </div>
            `).join('')}
        </div>
        <div class="settings-add-row">
          <input type="color" id="settings-priority-color" value="#4D4AD5" style="width:36px;height:36px;padding:2px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;">
          <input type="text" class="input" id="settings-priority-input" placeholder="e.g. Rush" style="flex:1;">
          <button class="btn btn-primary btn-sm" id="settings-priority-add">Add Priority</button>
        </div>
      </div>
    `;

    // Add priority
    const addBtn = container.querySelector('#settings-priority-add');
    const input = container.querySelector('#settings-priority-input');
    const colorInput = container.querySelector('#settings-priority-color');
    const doAdd = async () => {
      const label = input.value.trim();
      if (!label) { input.style.borderColor = 'var(--danger)'; return; }
      input.style.borderColor = '';
      await window.api.createCustomPriority({ label, color: colorInput.value });
      await AppState.refresh();
      input.value = '';
      this._renderPriorities(container);
    };
    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

    // Move up/down
    container.querySelectorAll('[data-action="move-priority-up"]').forEach(btn => {
      btn.addEventListener('click', () => this._movePriority(rows, btn.dataset.token, -1, container));
    });
    container.querySelectorAll('[data-action="move-priority-down"]').forEach(btn => {
      btn.addEventListener('click', () => this._movePriority(rows, btn.dataset.token, 1, container));
    });

    // Edit priority
    container.querySelectorAll('[data-action="edit-priority"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const pri = (AppState.get('customPriorities') || []).find(p => p.id === id);
        if (!pri) return;
        const item = btn.closest('.settings-list-item');
        item.innerHTML = `
          <input type="color" id="edit-priority-color" value="${pri.color}" style="width:36px;height:36px;padding:2px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;">
          <input type="text" class="input settings-inline-edit" id="edit-priority-label" value="${this._esc(pri.label)}" style="flex:1;">
          <div class="settings-list-actions">
            <button class="btn btn-ghost btn-sm" id="edit-priority-cancel">Cancel</button>
            <button class="btn btn-primary btn-sm" id="edit-priority-save">Save</button>
          </div>
        `;
        const labelInput = item.querySelector('#edit-priority-label');
        labelInput.focus();
        labelInput.select();

        item.querySelector('#edit-priority-cancel').addEventListener('click', () => this._renderPriorities(container));
        item.querySelector('#edit-priority-save').addEventListener('click', async () => {
          const newLabel = labelInput.value.trim();
          if (!newLabel) return;
          const newColor = item.querySelector('#edit-priority-color').value;
          await window.api.updateCustomPriority({ id, label: newLabel, color: newColor });
          await AppState.refresh();
          this._renderPriorities(container);
        });
        labelInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') item.querySelector('#edit-priority-save').click();
          if (e.key === 'Escape') this._renderPriorities(container);
        });
      });
    });

    // Delete priority
    container.querySelectorAll('[data-action="delete-priority"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const pri = (AppState.get('customPriorities') || []).find(p => p.id === id);
        if (!pri) return;
        if (confirm(`Delete priority "${pri.label}"?`)) {
          await window.api.deleteCustomPriority(id);
          await AppState.refresh();
          this._renderPriorities(container);
        }
      });
    });

    container.querySelectorAll('[data-action="priority-style-color"]').forEach((input) => {
      input.addEventListener('change', async () => {
        await this._savePriorityStyleColor(input.dataset.styleKey, input.value);
        await AppState.refresh();
        this._renderPriorities(container);
      });
    });
  },

  async _movePriority(rows, token, direction, container) {
    const idx = rows.findIndex(row => row.token === token);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= rows.length) return;

    const reordered = [...rows];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(swapIdx, 0, moved);

    await window.api.setPriorityMenuOrder(reordered.map((row) => row.token));
    await AppState.refresh();
    this._renderPriorities(container);
  },

  _buildPriorityOrderRows(priorities) {
    const validTokens = [
      'numbered',
      ...priorities.map((priority) => `custom:${priority.id}`),
      'wait',
      'clear',
    ];
    const savedTokens = Array.isArray(AppState.get('priorityMenuOrder'))
      ? AppState.get('priorityMenuOrder')
      : [];
    const orderedTokens = [];

    for (const token of savedTokens) {
      if (!validTokens.includes(token) || orderedTokens.includes(token)) continue;
      orderedTokens.push(token);
    }

    for (const token of validTokens) {
      if (!orderedTokens.includes(token)) {
        orderedTokens.push(token);
      }
    }

    return orderedTokens.map((token) => this._priorityOrderRowFromToken(token, priorities)).filter(Boolean);
  },

  _priorityOrderRowFromToken(token, priorities) {
    const styles = this._getPriorityDisplayStyles();

    if (token === 'numbered') {
      return {
        token,
        label: 'Numbered Priority',
        swatch: `<span class="settings-priority-line settings-priority-line-numbered" aria-hidden="true" style="background:${this._esc(styles.numbered.color)}"></span>`,
        editable: false,
        styleKey: 'numbered',
        color: styles.numbered.color,
      };
    }

    if (token === 'wait') {
      return {
        token,
        label: 'W (Wait)',
        swatch: `<span class="settings-priority-dot" style="background:${this._esc(styles.wait.color)}"></span>`,
        editable: false,
        styleKey: 'wait',
        color: styles.wait.color,
      };
    }

    if (token === 'clear') {
      return {
        token,
        label: 'Clear',
        swatch: '<span class="settings-priority-clear" aria-hidden="true">—</span>',
        editable: false,
        swatch: `<span class="settings-priority-clear" aria-hidden="true" style="color:${this._esc(styles.clear.color)}">—</span>`,
        styleKey: 'clear',
        color: styles.clear.color,
      };
    }

    if (token.startsWith('custom:')) {
      const priority = priorities.find((item) => item.id === token.slice('custom:'.length));
      if (!priority) return null;

      return {
        token,
        id: priority.id,
        label: priority.label,
        swatch: `<span class="settings-priority-dot" style="background:${priority.color}"></span>`,
        editable: true,
      };
    }

    return null;
  },

  _getPriorityDisplayStyles() {
    const saved = AppState.get('priorityDisplayStyles');
    return {
      numbered: { color: '#4D4AD5', ...(saved?.numbered || {}) },
      wait: { color: '#6E7680', ...(saved?.wait || {}) },
      clear: { color: '#9CA6B4', ...(saved?.clear || {}) },
    };
  },

  async _savePriorityStyleColor(styleKey, color) {
    if (!styleKey) return;
    const styles = this._getPriorityDisplayStyles();
    await window.api.setPriorityDisplayStyles({
      ...styles,
      [styleKey]: {
        ...(styles[styleKey] || {}),
        color,
      },
    });
  },

  // ── File Paths Section ───────────────────────────────

  async _renderPaths(container) {
    const config = await window.api.getConfig();
    const excelPath = await window.api.getExcelPath();
    const exportPath = await window.api.getExportPath();
    const updateFolderPath = await window.api.getUpdateFolderPath();

    container.innerHTML = `
      <div class="settings-section">
        <h2 class="settings-section-title">File Paths</h2>
        <p class="settings-section-desc">Configure storage, import, and export locations.</p>

        <div class="settings-path-group">
          <label class="settings-path-label">Shared Drive (Database & Sync)</label>
          <div class="settings-path-row">
            <span class="settings-path-value">${this._esc(config?.sharedDrivePath || 'Not configured')}</span>
            <button class="btn btn-ghost btn-sm" id="settings-change-shared">Change</button>
          </div>
        </div>

        <div class="settings-path-group">
          <label class="settings-path-label">Excel Project Import</label>
          <div class="settings-path-row">
            <span class="settings-path-value">${this._esc(excelPath || 'Not configured')}</span>
            <button class="btn btn-ghost btn-sm" id="settings-change-excel">Import New</button>
          </div>
        </div>

        <div class="settings-path-group">
          <label class="settings-path-label">Auto-Export Folder</label>
          <p class="settings-path-desc">When set, the weekly schedule HTML is auto-exported here whenever data changes.</p>
          <div class="settings-path-row">
            <span class="settings-path-value">${this._esc(exportPath || 'Not configured')}</span>
            <button class="btn btn-ghost btn-sm" id="settings-change-export">${exportPath ? 'Change' : 'Set Folder'}</button>
            ${exportPath ? '<button class="btn btn-ghost btn-sm" id="settings-clear-export" style="color:var(--danger);">Clear</button>' : ''}
          </div>
        </div>

        <div class="settings-path-group">
          <label class="settings-path-label">Global Update Folder</label>
          <p class="settings-path-desc">Choose the shared folder that stores the latest installer EXEs. StudioSync MyTasks apps will receive this path through sync and check it automatically for newer versions.</p>
          <div class="settings-path-row">
            <span class="settings-path-value">${this._esc(updateFolderPath || 'Not configured')}</span>
            <button class="btn btn-ghost btn-sm" id="settings-change-update">${updateFolderPath ? 'Change' : 'Set Folder'}</button>
            <button class="btn btn-ghost btn-sm" id="settings-check-update">Check Now</button>
            ${updateFolderPath ? '<button class="btn btn-ghost btn-sm" id="settings-clear-update" style="color:var(--danger);">Clear</button>' : ''}
          </div>
        </div>

        <div class="settings-path-group">
          <label class="settings-path-label">HTML Auto-Reload Interval</label>
          <p class="settings-path-desc">How often the exported HTML page refreshes itself (in seconds).</p>
          <div class="settings-path-row">
            <input type="number" class="input" id="settings-reload-interval" value="${config?.htmlReloadInterval || 60}" min="10" max="600" style="width:80px;text-align:center;">
            <span style="font-size:12px;color:var(--text-tertiary);">seconds</span>
            <button class="btn btn-ghost btn-sm" id="settings-save-interval">Save</button>
          </div>
        </div>
      </div>
    `;

    // Change shared drive
    container.querySelector('#settings-change-shared').addEventListener('click', async () => {
      const folderPath = await window.api.selectFolder();
      if (!folderPath) return;
      const cfg = await window.api.getConfig() || {};
      cfg.sharedDrivePath = folderPath;
      await window.api.saveConfig(cfg);
      Toast.show('Shared drive path updated. Restart the app to apply.', 'info');
      this._renderPaths(container);
    });

    // Import new excel
    container.querySelector('#settings-change-excel').addEventListener('click', async () => {
      const result = await window.api.importExcel();
      if (result) {
        Toast.show(`Excel imported: ${result.imported || 0} new, ${result.updated || 0} updated`, 'success');
        await AppState.refresh();
        this._renderPaths(container);
      }
    });

    // Change export folder
    container.querySelector('#settings-change-export').addEventListener('click', async () => {
      const folderPath = await window.api.selectExportFolder();
      if (!folderPath) return;
      await window.api.setExportPath(folderPath);
      Toast.show('Auto-export folder set. Schedule will update automatically.', 'success');
      this._renderPaths(container);
    });

    // Clear export folder
    const clearBtn = container.querySelector('#settings-clear-export');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        await window.api.setExportPath(null);
        Toast.show('Auto-export disabled.', 'info');
        this._renderPaths(container);
      });
    }

    // Change update folder
    container.querySelector('#settings-change-update').addEventListener('click', async () => {
      const folderPath = await window.api.selectFolder();
      if (!folderPath) return;
      await window.api.setUpdateFolderPath(folderPath);
      Toast.show('Global update folder saved. StudioSync MyTasks apps will pick it up on their next sync.', 'success');
      this._renderPaths(container);
    });

    // Clear update folder
    const clearUpdateBtn = container.querySelector('#settings-clear-update');
    if (clearUpdateBtn) {
      clearUpdateBtn.addEventListener('click', async () => {
        await window.api.setUpdateFolderPath(null);
        Toast.show('Global update folder cleared.', 'info');
        this._renderPaths(container);
      });
    }

    // Manual update check
    container.querySelector('#settings-check-update').addEventListener('click', async () => {
      await window.api.checkForUpdates();
    });

    // Save reload interval
    container.querySelector('#settings-save-interval').addEventListener('click', async () => {
      const val = parseInt(container.querySelector('#settings-reload-interval').value);
      if (isNaN(val) || val < 10) {
        container.querySelector('#settings-reload-interval').style.borderColor = 'var(--danger)';
        return;
      }
      const cfg = await window.api.getConfig() || {};
      cfg.htmlReloadInterval = val;
      await window.api.saveConfig(cfg);
      Toast.show(`Reload interval set to ${val} seconds`, 'success');
    });
  },

  // ── About Section ────────────────────────────────────

  async _renderStatus(container) {
    const status = await window.api.getRuntimeStatus();
    const syncLabel = this._formatTimestamp(status?.lastSyncAt);
    const excelLabel = this._formatTimestamp(status?.lastExcelWriteAt);
    const updateLabel = status?.updateAvailable
      ? `Ready: ${this._esc(status.latestVersion || 'new version')}`
      : 'No pending update';

    container.innerHTML = `
      <div class="settings-section">
        <h2 class="settings-section-title">System Status</h2>
        <p class="settings-section-desc">Live operational status for this Dashboard installation.</p>

        <div class="settings-status-grid">
          <div class="settings-status-card">
            <div class="settings-status-label">App Version</div>
            <div class="settings-status-value">${this._esc(status?.appVersion || 'Unknown')}</div>
          </div>
          <div class="settings-status-card">
            <div class="settings-status-label">Last Sync</div>
            <div class="settings-status-value">${this._esc(syncLabel)}</div>
          </div>
          <div class="settings-status-card">
            <div class="settings-status-label">Last Excel Update</div>
            <div class="settings-status-value">${this._esc(excelLabel)}</div>
          </div>
          <div class="settings-status-card">
            <div class="settings-status-label">Update Status</div>
            <div class="settings-status-value">${this._esc(updateLabel)}</div>
          </div>
        </div>

        <div class="settings-status-list">
          ${this._renderStatusRow('Shared Folder', status?.sharedDrivePath, status?.sharedDriveReachable)}
          ${this._renderStatusRow('Excel File', status?.excelPath, status?.excelReachable)}
          ${this._renderStatusRow('Export Folder', status?.exportPath, status?.exportReachable)}
          ${this._renderStatusRow('Update Folder', status?.updateFolderPath, status?.updateFolderReachable)}
          ${status?.lastExcelWriteError ? `
            <div class="settings-status-row settings-status-row-warning">
              <div>
                <div class="settings-status-row-label">Last Excel Error</div>
                <div class="settings-status-row-path">${this._esc(status.lastExcelWriteError)}</div>
              </div>
              <span class="settings-status-pill warning">Needs Attention</span>
            </div>
          ` : ''}
        </div>

        <div class="settings-add-row" style="margin-top:16px;">
          <button class="btn btn-ghost btn-sm" id="settings-refresh-status">Refresh Status</button>
        </div>
      </div>
    `;

    container.querySelector('#settings-refresh-status')?.addEventListener('click', () => {
      this._renderStatus(container);
    });
  },

  async _renderAbout(container) {
    const version = await window.api.getAppVersion();
    container.innerHTML = `
      <div class="settings-section">
        <h2 class="settings-section-title">About</h2>
        <div class="settings-about">
          <div class="settings-about-name">StudioSync</div>
          <div class="settings-about-version">Version ${this._esc(version || 'Unknown')}</div>
          <p class="settings-about-desc">A desktop scheduling tool for managing staff task assignments, project tracking, and team coordination.</p>
        </div>
      </div>
    `;
  },

  _formatTimestamp(isoStr) {
    if (!isoStr) return 'Not yet';
    const date = new Date(isoStr);
    if (Number.isNaN(date.getTime())) return 'Not yet';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  },

  _renderStatusRow(label, pathValue, isReachable) {
    const configured = Boolean(pathValue);
    const pillLabel = !configured ? 'Not Set' : (isReachable ? 'Available' : 'Unavailable');
    const pillClass = !configured ? 'muted' : (isReachable ? 'success' : 'warning');

    return `
      <div class="settings-status-row">
        <div>
          <div class="settings-status-row-label">${label}</div>
          <div class="settings-status-row-path">${this._esc(pathValue || 'Not configured')}</div>
        </div>
        <span class="settings-status-pill ${pillClass}">${pillLabel}</span>
      </div>
    `;
  },

  _esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
