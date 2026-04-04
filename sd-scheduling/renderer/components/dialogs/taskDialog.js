/**
 * Task Dialog — create/edit tasks. Also includes project creation.
 */

const TaskDialog = {
  show(taskData = {}, isEdit = false) {
    const users = AppState.get('users') || [];
    const projects = AppState.get('projects') || [];

    const title = isEdit ? 'Edit Task' : 'New Task';
    const submitLabel = isEdit ? 'Save Changes' : 'Create Task';

    // Build user options (staff only — partners don't get tasks)
    const staffUsers = users.filter(u => u.role !== 'partner' && u.active !== 0);
    const userOptions = staffUsers.map(u =>
      `<option value="${u.id}" ${u.id === taskData.assigned_to ? 'selected' : ''}>${u.display_name}</option>`
    ).join('');

    // Build partner options
    const partners = users.filter(u => u.role === 'partner' && u.active !== 0);
    const partnerOptions = partners.map(u =>
      `<option value="${u.id}" ${u.id === taskData.partner_id ? 'selected' : ''}>${u.display_name}</option>`
    ).join('');

    // Project options only used in edit mode
    const projectOptions = isEdit ? projects.map(p =>
      `<option value="${p.id}" ${p.id === taskData.project_id ? 'selected' : ''}>${p.client ? p.client + ' — ' : ''}${p.name}</option>`
    ).join('') : '';

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <div class="dialog-title">${title}</div>
          <div class="dialog-subtitle">${isEdit ? 'Update task details' : 'Assign a new task to a staff member'}</div>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>Task Title</label>
            <input type="text" class="input" id="dialog-task-title" value="${this._esc(taskData.title || '')}" placeholder="Enter task description...">
          </div>
          <div class="form-group">
            <label>Assign To</label>
            <select class="select" id="dialog-task-assignee">
              <option value="">Select staff member...</option>
              ${userOptions}
            </select>
          </div>
          <div style="display:flex;gap:12px;">
            <div class="form-group" style="flex:1">
              <label>Priority</label>
              <select class="select" id="dialog-task-priority">
                <option value="0" ${!taskData.priority || taskData.priority === 0 ? 'selected' : ''}>— None —</option>
                <option value="1" ${taskData.priority === 1 ? 'selected' : ''}>1 — Urgent</option>
                <option value="2" ${taskData.priority === 2 ? 'selected' : ''}>2 — High</option>
                <option value="3" ${taskData.priority === 3 ? 'selected' : ''}>3 — Normal</option>
                <option value="4" ${taskData.priority === 4 ? 'selected' : ''}>4 — Low</option>
                <option value="-1" ${taskData.priority === -1 ? 'selected' : ''}>W — Wait</option>
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label>Due Date</label>
              <input type="date" class="input" id="dialog-task-due" value="${taskData.due_date || ''}">
            </div>
          </div>
          ${isEdit ? `<div class="form-group">
            <label>Project</label>
            <select class="select" id="dialog-task-project">
              <option value="">No project</option>
              ${projectOptions}
            </select>
          </div>` : ''}
          <div class="form-group">
            <label>Partner</label>
            <select class="select" id="dialog-task-partner">
              <option value="">None</option>
              ${partnerOptions}
            </select>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea class="input" id="dialog-task-notes" rows="2" placeholder="Optional notes...">${this._esc(taskData.notes || '')}</textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-ghost" id="dialog-cancel">Cancel</button>
          <button class="btn btn-primary" id="dialog-submit">${submitLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Focus title input
    setTimeout(() => document.getElementById('dialog-task-title').focus(), 50);

    const closeDialog = () => {
      document.removeEventListener('keydown', onEsc);
      overlay.remove();
    };

    // Cancel
    overlay.querySelector('#dialog-cancel').addEventListener('click', closeDialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDialog();
    });

    // Submit
    overlay.querySelector('#dialog-submit').addEventListener('click', async () => {
      const titleVal = document.getElementById('dialog-task-title').value.trim();
      if (!titleVal) {
        document.getElementById('dialog-task-title').style.borderColor = 'var(--danger)';
        return;
      }

      const projectEl = document.getElementById('dialog-task-project');
      const data = {
        title: titleVal,
        assigned_to: document.getElementById('dialog-task-assignee').value || null,
        priority: parseInt(document.getElementById('dialog-task-priority').value),
        due_date: document.getElementById('dialog-task-due').value || null,
        partner_id: document.getElementById('dialog-task-partner').value || null,
        notes: document.getElementById('dialog-task-notes').value.trim()
      };
      if (projectEl) data.project_id = projectEl.value || null;

      if (isEdit) {
        data.id = taskData.id;
        await window.api.updateTask(data);
      } else {
        const currentUser = AppState.get('currentUser');
        data.created_by = currentUser?.id || null;
        await window.api.createTask(data);
      }

      closeDialog();
      await AppState.refresh();
      Toast.show(isEdit ? 'Task updated' : 'Task created', 'success');
    });

    // Submit on Enter in title field
    document.getElementById('dialog-task-title').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        overlay.querySelector('#dialog-submit').click();
      }
    });

    // Escape to close
    const onEsc = (e) => {
      if (e.key === 'Escape') closeDialog();
    };
    document.addEventListener('keydown', onEsc);
  },

  showProjectDialog(projectData = {}, isEdit = false, options = {}) {
    const users = AppState.get('users') || [];
    const partners = users.filter(u => u.role === 'partner');
    const defaultCategory = options.defaultCategory || projectData.category || 'current';
    const createAsFuture = defaultCategory === 'future';

    const title = isEdit ? 'Edit Project' : 'New Project';
    const submitLabel = isEdit ? 'Save Changes' : 'Create Project';

    const partnerOptions = partners.map(u =>
      `<option value="${u.id}" ${u.id === projectData.partner_id ? 'selected' : ''}>${u.display_name}</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <div class="dialog-title">${title}</div>
          <div class="dialog-subtitle">${isEdit ? 'Update project details' : 'Add a new project'}</div>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>Client Name</label>
            <input type="text" class="input" id="dialog-project-client" value="${this._esc(projectData.client || '')}" placeholder="e.g. Acme Corp">
          </div>
          <div class="form-group">
            <label>Project Name</label>
            <input type="text" class="input" id="dialog-project-name" value="${this._esc(projectData.name || '')}" placeholder="e.g. Annual Audit">
          </div>
          <div class="form-group">
            <label>Partner</label>
            <select class="select" id="dialog-project-partner">
              <option value="">No partner assigned</option>
              ${partnerOptions}
            </select>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea class="input" id="dialog-project-notes" rows="2" placeholder="Optional notes...">${this._esc(projectData.notes || '')}</textarea>
          </div>
          ${!isEdit ? `
            <label class="dialog-checkbox-row">
              <input type="checkbox" id="dialog-project-future" ${createAsFuture ? 'checked' : ''}>
              <span class="dialog-checkbox-copy">
                <span class="dialog-checkbox-label">Add To Future Projects</span>
                <span class="dialog-checkbox-help">Leave unchecked to add this project to the current list.</span>
              </span>
            </label>
          ` : ''}
        </div>
        <div class="dialog-footer">
          ${isEdit ? '<button class="btn btn-danger" id="dialog-delete">Delete Project</button>' : ''}
          <div style="flex:1"></div>
          <button class="btn btn-ghost" id="dialog-cancel">Cancel</button>
          <button class="btn btn-primary" id="dialog-submit">${submitLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('dialog-project-client').focus(), 50);

    const closeDialog = () => {
      document.removeEventListener('keydown', onEsc);
      ContextMenu.dismiss();
      overlay.remove();
    };

    const restoreWindowFocus = async () => {
      if (typeof window.api.focusWindow === 'function') {
        await window.api.focusWindow();
      }
    };

    overlay.querySelector('#dialog-cancel').addEventListener('click', closeDialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDialog();
    });

    // Delete
    if (isEdit) {
      overlay.querySelector('#dialog-delete').addEventListener('click', async () => {
        if (confirm('Delete this project? Tasks linked to it will remain but lose the project link.')) {
          await window.api.deleteProject(projectData.id);
          closeDialog();
          await AppState.refresh();
          await restoreWindowFocus();
          Toast.show('Project deleted', 'success');
        }
      });
    }

    // Submit
    overlay.querySelector('#dialog-submit').addEventListener('click', async () => {
      const name = document.getElementById('dialog-project-name').value.trim();
      if (!name) {
        document.getElementById('dialog-project-name').style.borderColor = 'var(--danger)';
        return;
      }

      const data = {
        client: document.getElementById('dialog-project-client').value.trim(),
        name: name,
        partner_id: document.getElementById('dialog-project-partner').value || null,
        notes: document.getElementById('dialog-project-notes').value.trim()
      };

      if (!isEdit) {
        data.category = document.getElementById('dialog-project-future')?.checked ? 'future' : 'current';
      }

      const selectedPartnerId = data.partner_id;
      const existingPartnerIds = this._parsePartnerIds(projectData.partner_ids);
      const hasMultiplePartners = existingPartnerIds.length > 1;
      const partnerChanged = selectedPartnerId !== (projectData.partner_id || null);

      if (!isEdit || !hasMultiplePartners || partnerChanged) {
        const selectedPartner = selectedPartnerId ? users.find(u => u.id === selectedPartnerId) : null;
        data.partner_ids = selectedPartner ? [selectedPartner.id] : [];
        data.partner_initials = selectedPartner ? this._getUserInitials(selectedPartner) : '';
      }

      if (isEdit) {
        data.id = projectData.id;
        await window.api.updateProject(data);
      } else {
        await window.api.createProject(data);
      }

      closeDialog();
      await AppState.refresh();
      await restoreWindowFocus();
      Toast.show(isEdit ? 'Project updated' : 'Project created', 'success');
    });

    const onEsc = (e) => {
      if (e.key === 'Escape') closeDialog();
    };
    document.addEventListener('keydown', onEsc);
  },

  _esc(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  _parsePartnerIds(partnerIds) {
    if (Array.isArray(partnerIds)) return partnerIds.filter(Boolean);
    if (!partnerIds) return [];

    try {
      const parsed = JSON.parse(partnerIds);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  },

  _getUserInitials(user) {
    if (!user) return '';
    const firstName = String(user.first_name || '').trim();
    const lastName = String(user.last_name || '').trim();
    if (firstName || lastName) {
      return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
    }

    const parts = String(user.display_name || '').trim().split(/\s+/).filter(Boolean);
    return parts.map(part => part[0]).join('').toUpperCase();
  }
};
