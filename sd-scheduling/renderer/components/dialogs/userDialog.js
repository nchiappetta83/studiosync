/**
 * Manage Staff Dialog — tabbed Staff/Partners list with add/edit forms.
 * Admin access only. Username auto-generated from first initial + last name.
 */

const UserDialog = {
  _overlay: null,
  _activeTab: 'staff', // 'staff' or 'partners'
  _pendingRole: 'staff',
  _onEsc: null,

  show() {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    this._overlay = overlay;

    overlay.innerHTML = `
      <div class="dialog dialog-staff">
        <div class="dialog-header">
          <div class="dialog-title">Manage Staff</div>
          <div class="dialog-subtitle">Add or manage team members.</div>
        </div>
        <div class="dialog-body" style="padding:0;">
          <div id="bootstrap-admin-panel"></div>
          <div class="staff-tabs">
            <button class="staff-tab active" data-tab="staff">Staff</button>
            <button class="staff-tab" data-tab="partners">Partners</button>
          </div>
          <div class="staff-list-container">
            <div class="staff-list" id="staff-list">
              <!-- Rendered by JS -->
            </div>
            <button class="btn btn-ghost btn-sm staff-add-btn" id="staff-add-btn">+ Add Staff</button>
          </div>
          <div class="staff-add-form hidden" id="staff-add-form">
            <div class="staff-form-header">
              <span class="staff-form-title" id="staff-form-title">Add Staff</span>
            </div>
            <div class="staff-form-body">
              <div class="staff-form-row">
                <div class="form-group" style="flex:1;">
                  <label>First Name</label>
                  <input type="text" class="input" id="staff-first-name" placeholder="e.g. John">
                </div>
                <div class="form-group" style="flex:1;">
                  <label>Last Name</label>
                  <input type="text" class="input" id="staff-last-name" placeholder="e.g. Smith">
                </div>
              </div>
              <div class="staff-username-preview" id="staff-username-preview">
                Username: <strong>—</strong>
              </div>
              <div class="form-group" id="staff-role-group">
                <label>Role</label>
                <select class="select" id="staff-business-role">
                  <option value="">— No role assigned —</option>
                </select>
              </div>
              <div class="form-group" id="staff-admin-group" style="margin-top:4px;">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                  <input type="checkbox" id="staff-admin-access">
                  <span>Admin Access</span>
                </label>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">
                  Allows this staff member to access admin-only controls in the app.
                </div>
              </div>
              <input type="hidden" id="staff-edit-id" value="">
              <div class="staff-form-actions">
                <button class="btn btn-ghost" id="staff-form-cancel">Cancel</button>
                <button class="btn btn-primary" id="staff-form-save">Save</button>
              </div>
            </div>
          </div>
        </div>
        <div class="dialog-footer staff-list-footer" id="staff-list-footer">
          <button class="btn btn-primary" id="dialog-close">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Tab switching
    overlay.querySelectorAll('.staff-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        overlay.querySelectorAll('.staff-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._activeTab = tab.dataset.tab;
        this._hideForm();
        this._refreshList();
        this._updateAddButton();
      });
    });

    // Add button
    overlay.querySelector('#staff-add-btn').addEventListener('click', () => {
      this._showAddForm();
    });

    // Form cancel
    overlay.querySelector('#staff-form-cancel').addEventListener('click', () => {
      this._hideForm();
    });

    // Form save
    overlay.querySelector('#staff-form-save').addEventListener('click', () => {
      this._saveForm();
    });

    // Auto-generate username preview
    const firstInput = overlay.querySelector('#staff-first-name');
    const lastInput = overlay.querySelector('#staff-last-name');
    const updatePreview = () => {
      const first = firstInput.value.trim();
      const last = lastInput.value.trim();
      const preview = overlay.querySelector('#staff-username-preview strong');
      if (first && last) {
        preview.textContent = (first[0] + last).toLowerCase().replace(/\s+/g, '');
      } else {
        preview.textContent = '—';
      }
    };
    firstInput.addEventListener('input', updatePreview);
    lastInput.addEventListener('input', updatePreview);

    // Enter to save from name fields
    [firstInput, lastInput].forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._saveForm();
      });
    });

    // Close button
    overlay.querySelector('#dialog-close').addEventListener('click', () => {
      this._close();
    });

    // Close handlers (overlay click + Escape)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._close();
    });

    this._onEsc = (e) => {
      if (e.key === 'Escape') this._close();
    };
    document.addEventListener('keydown', this._onEsc);

    this._refreshList();
    this._updateAddButton();
    this._renderBootstrapPanel();
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

  _getFilteredUsers() {
    const users = AppState.get('users') || [];
    if (this._activeTab === 'partners') {
      return users.filter(u => u.role === 'partner');
    }
    return users.filter(u => u.role === 'staff');
  },

  _updateAddButton() {
    const btn = this._overlay.querySelector('#staff-add-btn');
    if (this._activeTab === 'partners') {
      btn.textContent = '+ Add Partner';
    } else {
      btn.textContent = '+ Add Staff';
    }
  },

  _refreshList() {
    const listEl = this._overlay.querySelector('#staff-list');
    if (!listEl) return;
    const users = this._getFilteredUsers();
    listEl.innerHTML = this._renderUserList(users);
    this._bindUserListEvents();
  },

  _renderBootstrapPanel() {
    const panel = this._overlay.querySelector('#bootstrap-admin-panel');
    if (!panel) return;

    const currentUser = AppState.get('currentUser');
    if (!currentUser || currentUser.role !== 'bootstrap') {
      panel.innerHTML = '';
      return;
    }

    panel.innerHTML = `
      <div style="margin:16px 16px 0;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--bg-secondary);display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div>
          <div style="font-weight:700;color:var(--text-primary);margin-bottom:4px;">Admin Setup Account</div>
          <div style="font-size:13px;color:var(--text-secondary);">You are signed in as the bootstrap admin. Add yourself to the team when you're ready to become Staff or Partner.</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="bootstrap-add-staff">Add Me As Staff</button>
          <button class="btn btn-primary btn-sm" id="bootstrap-add-partner">Add Me As Partner</button>
        </div>
      </div>
    `;

    panel.querySelector('#bootstrap-add-staff')?.addEventListener('click', () => {
      this._showConvertSelfForm('staff');
    });
    panel.querySelector('#bootstrap-add-partner')?.addEventListener('click', () => {
      this._showConvertSelfForm('partner');
    });
  },

  _renderUserList(users) {
    if (users.length === 0) {
      const label = this._activeTab === 'partners' ? 'partners' : 'staff members';
      return `<div class="empty-section" style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px;">No ${label} yet.</div>`;
    }

    const businessRoles = AppState.get('businessRoles') || [];

    return users.map(user => {
      const initials = this._getInitials(user.display_name);
      const businessRole = user.business_role_id
        ? businessRoles.find(r => r.id === user.business_role_id)
        : null;
      const roleLabel = businessRole ? businessRole.name : '';
      let adminBadge = '';
      if (user.role === 'partner') {
        adminBadge = '<span class="user-list-role admin">Partner Admin</span>';
      } else if (user.is_admin) {
        adminBadge = '<span class="user-list-role admin">Admin</span>';
      }

      return `
        <div class="user-list-item" data-user-id="${user.id}">
          <div class="user-list-avatar" style="background:${user.avatar_color}">${initials}</div>
          <div class="user-list-info">
            <div class="user-list-name">${this._esc(user.display_name)}</div>
            <div class="user-list-username">${this._esc(user.username)}${roleLabel ? ' &middot; ' + this._esc(roleLabel) : ''}</div>
          </div>
          ${adminBadge}
          <div class="user-list-actions">
            <button class="task-action-btn" data-action="edit-user" data-user-id="${user.id}" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="task-action-btn" data-action="delete-user" data-user-id="${user.id}" title="Remove">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  _bindUserListEvents() {
    const container = this._overlay.querySelector('#staff-list');
    if (!container) return;

    container.querySelectorAll('[data-action="edit-user"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const user = AppState.getUserById(btn.dataset.userId);
        if (!user) return;
        this._showEditForm(user);
      });
    });

    container.querySelectorAll('[data-action="delete-user"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const user = AppState.getUserById(btn.dataset.userId);
        if (!user) return;

        if (confirm(`Remove ${user.display_name}? All their assigned tasks will be deleted.`)) {
          await window.api.deleteUser(user.id);
          await AppState.refresh();
          this._refreshList();
          Toast.show(`${user.display_name} removed`, 'success');
        }
      });
    });
  },

  _showAddForm() {
    const form = this._overlay.querySelector('#staff-add-form');
    const listContainer = this._overlay.querySelector('.staff-list-container');
    const titleEl = this._overlay.querySelector('#staff-form-title');
    const saveBtn = this._overlay.querySelector('#staff-form-save');

    // Clear form
    this._pendingRole = this._activeTab === 'partners' ? 'partner' : 'staff';
    this._overlay.querySelector('#staff-first-name').value = '';
    this._overlay.querySelector('#staff-last-name').value = '';
    this._overlay.querySelector('#staff-edit-id').value = '';
    this._overlay.querySelector('#staff-username-preview strong').textContent = '—';
    this._overlay.querySelector('#staff-admin-access').checked = false;

    // Populate business roles dropdown
    this._populateRoleDropdown();

    // Show/hide staff-only fields
    const roleGroup = this._overlay.querySelector('#staff-role-group');
    const adminGroup = this._overlay.querySelector('#staff-admin-group');
    const showStaffFields = this._activeTab !== 'partners';
    roleGroup.style.display = showStaffFields ? '' : 'none';
    adminGroup.style.display = showStaffFields ? '' : 'none';

    const label = this._activeTab === 'partners' ? 'Partner' : 'Staff';
    titleEl.textContent = `Add ${label}`;
    saveBtn.textContent = 'Save';

    listContainer.classList.add('hidden');
    form.classList.remove('hidden');
    this._overlay.querySelector('#staff-list-footer').classList.add('hidden');

    this._overlay.querySelector('#staff-first-name').focus();
  },

  _showEditForm(user) {
    const form = this._overlay.querySelector('#staff-add-form');
    const listContainer = this._overlay.querySelector('.staff-list-container');
    const titleEl = this._overlay.querySelector('#staff-form-title');
    const saveBtn = this._overlay.querySelector('#staff-form-save');

    this._pendingRole = user.role === 'partner' ? 'partner' : 'staff';
    this._overlay.querySelector('#staff-first-name').value = user.first_name || '';
    this._overlay.querySelector('#staff-last-name').value = user.last_name || '';
    this._overlay.querySelector('#staff-edit-id').value = user.id;
    this._overlay.querySelector('#staff-admin-access').checked = !!user.is_admin;

    // Update username preview
    const first = user.first_name || '';
    const last = user.last_name || '';
    const preview = this._overlay.querySelector('#staff-username-preview strong');
    if (first && last) {
      preview.textContent = (first[0] + last).toLowerCase().replace(/\s+/g, '');
    } else {
      preview.textContent = user.username || '—';
    }

    // Populate business roles dropdown
    this._populateRoleDropdown(user.business_role_id);

    // Show/hide staff-only fields
    const roleGroup = this._overlay.querySelector('#staff-role-group');
    const adminGroup = this._overlay.querySelector('#staff-admin-group');
    const showStaffFields = user.role !== 'partner';
    roleGroup.style.display = showStaffFields ? '' : 'none';
    adminGroup.style.display = showStaffFields ? '' : 'none';

    titleEl.textContent = `Edit ${user.display_name}`;
    saveBtn.textContent = 'Save';

    listContainer.classList.add('hidden');
    form.classList.remove('hidden');
    this._overlay.querySelector('#staff-list-footer').classList.add('hidden');

    this._overlay.querySelector('#staff-first-name').focus();
  },

  _showConvertSelfForm(role) {
    const currentUser = AppState.get('currentUser');
    if (!currentUser) return;

    this._activeTab = role === 'partner' ? 'partners' : 'staff';
    this._pendingRole = role;
    this._overlay.querySelectorAll('.staff-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === this._activeTab);
    });

    const form = this._overlay.querySelector('#staff-add-form');
    const listContainer = this._overlay.querySelector('.staff-list-container');
    const titleEl = this._overlay.querySelector('#staff-form-title');
    const saveBtn = this._overlay.querySelector('#staff-form-save');

    this._overlay.querySelector('#staff-first-name').value = currentUser.first_name || '';
    this._overlay.querySelector('#staff-last-name').value = currentUser.last_name || '';
    this._overlay.querySelector('#staff-edit-id').value = currentUser.id;

    const preview = this._overlay.querySelector('#staff-username-preview strong');
    preview.textContent = currentUser.username || '—';
    this._overlay.querySelector('#staff-admin-access').checked = !!currentUser.is_admin;

    this._populateRoleDropdown(currentUser.business_role_id);
    const roleGroup = this._overlay.querySelector('#staff-role-group');
    const adminGroup = this._overlay.querySelector('#staff-admin-group');
    const showStaffFields = role !== 'partner';
    roleGroup.style.display = showStaffFields ? '' : 'none';
    adminGroup.style.display = showStaffFields ? '' : 'none';

    titleEl.textContent = role === 'partner' ? 'Add Me As Partner' : 'Add Me As Staff';
    saveBtn.textContent = role === 'partner' ? 'Become Partner' : 'Become Staff';

    listContainer.classList.add('hidden');
    form.classList.remove('hidden');
    this._overlay.querySelector('#staff-list-footer').classList.add('hidden');
    this._overlay.querySelector('#staff-first-name').focus();
  },

  _hideForm() {
    const form = this._overlay.querySelector('#staff-add-form');
    const listContainer = this._overlay.querySelector('.staff-list-container');
    form.classList.add('hidden');
    listContainer.classList.remove('hidden');
    this._overlay.querySelector('#staff-list-footer').classList.remove('hidden');
  },

  _populateRoleDropdown(selectedId) {
    const select = this._overlay.querySelector('#staff-business-role');
    const roles = AppState.get('businessRoles') || [];
    select.innerHTML = '<option value="">— No role assigned —</option>' +
      roles.map(r => `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${this._esc(r.name)}</option>`).join('');
  },

  async _saveForm() {
    const firstName = this._overlay.querySelector('#staff-first-name').value.trim();
    const lastName = this._overlay.querySelector('#staff-last-name').value.trim();
    const editId = this._overlay.querySelector('#staff-edit-id').value;
    const businessRoleId = this._overlay.querySelector('#staff-business-role').value || null;
    const adminAccess = this._overlay.querySelector('#staff-admin-access').checked;

    if (!firstName) {
      this._overlay.querySelector('#staff-first-name').style.borderColor = 'var(--danger)';
      return;
    }
    if (!lastName) {
      this._overlay.querySelector('#staff-last-name').style.borderColor = 'var(--danger)';
      return;
    }

    // Reset border colors
    this._overlay.querySelector('#staff-first-name').style.borderColor = '';
    this._overlay.querySelector('#staff-last-name').style.borderColor = '';

    const existingUsers = AppState.get('users') || [];
    const currentUser = AppState.get('currentUser');
    const existingUser = editId
      ? (existingUsers.find(u => u.id === editId) || (currentUser && currentUser.id === editId ? currentUser : null))
      : null;

    const displayName = `${firstName} ${lastName}`;
    const username = (firstName[0] + lastName).toLowerCase().replace(/\s+/g, '');
    const role = this._pendingRole || (this._activeTab === 'partners' ? 'partner' : 'staff');

    try {
      if (editId) {
        // Update existing user
        const updateData = {
          id: editId,
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
          username: username,
          role: role,
          is_admin: role === 'partner' ? 1 : (adminAccess ? 1 : 0),
        };
        // Only set business_role_id for staff
        if (role === 'staff') {
          updateData.business_role_id = businessRoleId;
        } else {
          updateData.business_role_id = null;
        }
        await window.api.updateUser(updateData);
        Toast.show(`${displayName} updated`, 'success');
      } else {
        // Create new user
        const createData = {
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
          username: username,
          role: role,
          is_admin: role === 'partner' ? 1 : (adminAccess ? 1 : 0),
        };
        if (role === 'staff') {
          createData.business_role_id = businessRoleId;
        }
        await window.api.createUser(createData);
        Toast.show(`${displayName} added`, 'success');
      }

      await AppState.refresh();
      this._hideForm();
      this._refreshList();
      this._renderBootstrapPanel();
    } catch (err) {
      Toast.show('Failed: ' + err.message, 'error');
    }
  },

  _getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  },

  _esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
