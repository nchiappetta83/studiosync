/**
 * Task Dialog - create/edit tasks. Also includes project creation.
 */

const TaskDialog = {
  show(taskData = {}, isEdit = false) {
    const users = AppState.get('users') || [];
    const projects = AppState.get('projects') || [];
    const priorityOptions = this._buildTaskPriorityOptions(taskData);

    const title = isEdit ? 'Edit Task' : 'New Task';
    const submitLabel = isEdit ? 'Save Changes' : 'Create Task';

    const staffUsers = users
      .filter((u) => u.role !== 'partner' && u.active !== 0)
      .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || ''), undefined, { sensitivity: 'base' }));
    const userOptions = staffUsers.map((u) =>
      `<option value="${u.id}" ${u.id === taskData.assigned_to ? 'selected' : ''}>${u.display_name}</option>`
    ).join('');

    const partners = users
      .filter((u) => u.role === 'partner' && u.active !== 0)
      .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || ''), undefined, { sensitivity: 'base' }));
    const partnerOptions = partners.map((u) =>
      `<option value="${u.id}" ${u.id === taskData.partner_id ? 'selected' : ''}>${u.display_name}</option>`
    ).join('');

    const projectOptions = isEdit ? projects.map((p) =>
      `<option value="${p.id}" ${p.id === taskData.project_id ? 'selected' : ''}>${p.client ? `${p.client} - ` : ''}${p.name}</option>`
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
              <select class="select" id="dialog-task-priority">${priorityOptions}</select>
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
          ${isEdit ? `
            <label class="dialog-checkbox-row">
              <input type="checkbox" id="dialog-task-completed" ${taskData.completed ? 'checked' : ''}>
              <span class="dialog-checkbox-copy">
                <span class="dialog-checkbox-label">Mark Task Complete</span>
                <span class="dialog-checkbox-help">Completed tasks stay visible until the next weekly rollover.</span>
              </span>
            </label>
          ` : ''}
        </div>
        <div class="dialog-footer">
          <button class="btn btn-ghost" id="dialog-cancel">Cancel</button>
          <button class="btn btn-primary" id="dialog-submit">${submitLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('dialog-task-title').focus(), 50);

    const closeDialog = () => {
      document.removeEventListener('keydown', onEsc);
      overlay.remove();
    };

    overlay.querySelector('#dialog-cancel').addEventListener('click', closeDialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDialog();
    });

    overlay.querySelector('#dialog-submit').addEventListener('click', async () => {
      const titleVal = document.getElementById('dialog-task-title').value.trim();
      if (!titleVal) {
        document.getElementById('dialog-task-title').style.borderColor = 'var(--danger)';
        return;
      }

      const projectEl = document.getElementById('dialog-task-project');
      const priorityValue = this._parseTaskPrioritySelectValue(document.getElementById('dialog-task-priority').value);
      const data = {
        title: titleVal,
        assigned_to: document.getElementById('dialog-task-assignee').value || null,
        priority: priorityValue.priority,
        priority_label: priorityValue.priority_label,
        due_date: document.getElementById('dialog-task-due').value || null,
        partner_id: document.getElementById('dialog-task-partner').value || null,
        notes: document.getElementById('dialog-task-notes').value.trim(),
        completed: document.getElementById('dialog-task-completed')?.checked ? 1 : 0
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

    document.getElementById('dialog-task-title').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        overlay.querySelector('#dialog-submit').click();
      }
    });

    const onEsc = (e) => {
      if (e.key === 'Escape') closeDialog();
    };
    document.addEventListener('keydown', onEsc);
  },

  showProjectDialog(projectData = {}, isEdit = false, options = {}) {
    const users = AppState.get('users') || [];
    const partners = users
      .filter((u) => u.role === 'partner' && u.active !== 0)
      .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || ''), undefined, { sensitivity: 'base' }));
    const defaultCategory = options.defaultCategory || projectData.category || 'current';
    const createAsFuture = defaultCategory === 'future';
    const selectedPartnerIds = this._getProjectPartnerSelection(projectData);

    const title = isEdit ? 'Edit Project' : 'New Project';
    const submitLabel = isEdit ? 'Save Changes' : 'Create Project';

    const partnerChecklist = partners.length === 0
      ? '<div class="dialog-checklist-empty">No active partners available.</div>'
      : partners.map((u) => `
        <label class="dialog-checklist-item">
          <input type="checkbox" class="dialog-project-partner-checkbox" value="${u.id}" ${selectedPartnerIds.includes(u.id) ? 'checked' : ''}>
          <span class="dialog-checklist-copy">
            <span class="dialog-checklist-title">${this._esc(u.display_name)}</span>
          </span>
        </label>
      `).join('');

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
            <label>Partners</label>
            <div class="dialog-checklist-shell">
              <div class="dialog-checklist-header">
                <span>Select one or more partners</span>
                <span class="dialog-checklist-count" id="dialog-project-partner-count">${selectedPartnerIds.length} selected</span>
              </div>
              <div class="dialog-checklist" id="dialog-project-partners">
                ${partnerChecklist}
              </div>
            </div>
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

    const partnerCountEl = overlay.querySelector('#dialog-project-partner-count');
    const syncPartnerCount = () => {
      if (!partnerCountEl) return;
      const selectedCount = overlay.querySelectorAll('.dialog-project-partner-checkbox:checked').length;
      partnerCountEl.textContent = `${selectedCount} selected`;
    };

    overlay.querySelectorAll('.dialog-project-partner-checkbox').forEach((input) => {
      input.addEventListener('change', syncPartnerCount);
    });

    syncPartnerCount();

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

    overlay.querySelector('#dialog-submit').addEventListener('click', async () => {
      const name = document.getElementById('dialog-project-name').value.trim();
      if (!name) {
        document.getElementById('dialog-project-name').style.borderColor = 'var(--danger)';
        return;
      }

      const data = {
        client: document.getElementById('dialog-project-client').value.trim(),
        name,
        notes: document.getElementById('dialog-project-notes').value.trim()
      };

      const partnerIds = Array.from(overlay.querySelectorAll('.dialog-project-partner-checkbox:checked'))
        .map((input) => input.value)
        .filter(Boolean);
      data.partner_id = partnerIds[0] || null;
      data.partner_ids = partnerIds;
      data.partner_initials = this._getPartnerInitialsForIds(partnerIds, users);

      if (!isEdit) {
        data.category = document.getElementById('dialog-project-future')?.checked ? 'future' : 'current';
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

  _getProjectPartnerSelection(projectData) {
    const parsedIds = this._parsePartnerIds(projectData.partner_ids);
    const merged = parsedIds.length > 0
      ? parsedIds
      : (projectData.partner_id ? [projectData.partner_id] : []);
    return [...new Set(merged.filter(Boolean))];
  },

  _getUserInitials(user) {
    if (!user) return '';
    const firstName = String(user.first_name || '').trim();
    const lastName = String(user.last_name || '').trim();
    if (firstName || lastName) {
      return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
    }

    const parts = String(user.display_name || '').trim().split(/\s+/).filter(Boolean);
    return parts.map((part) => part[0]).join('').toUpperCase();
  },

  _getPartnerInitialsForIds(partnerIds, users) {
    if (!Array.isArray(partnerIds) || partnerIds.length === 0) return '';

    return partnerIds
      .map((id) => users.find((user) => user.id === id))
      .filter(Boolean)
      .map((user) => this._getUserInitials(user))
      .filter(Boolean)
      .join('/');
  },

  _buildTaskPriorityOptions(taskData) {
    const customPriorities = AppState.get('customPriorities') || [];
    const selectedValue = this._getTaskPrioritySelectValue(taskData, customPriorities);
    const options = [];

    for (const token of this._getTaskPriorityTokens(customPriorities)) {
      if (token === 'clear') {
        options.push({ value: 'clear', label: '-- None --' });
        continue;
      }

      if (token === 'numbered') {
        options.push(
          { value: '1', label: '1 - Urgent' },
          { value: '2', label: '2 - High' },
          { value: '3', label: '3 - Normal' },
          { value: '4', label: '4 - Low' }
        );
        continue;
      }

      if (token === 'wait') {
        options.push({ value: 'wait', label: 'W - Wait' });
        continue;
      }

      if (token.startsWith('custom:')) {
        const customPriority = customPriorities.find((item) => item.id === token.slice('custom:'.length));
        if (customPriority) {
          options.push({
            value: `custom:${customPriority.id}`,
            label: customPriority.label,
          });
        }
      }
    }

    return options.map((option) =>
      `<option value="${option.value}" ${option.value === selectedValue ? 'selected' : ''}>${this._esc(option.label)}</option>`
    ).join('');
  },

  _getTaskPriorityTokens(customPriorities) {
    const validTokens = [
      'numbered',
      ...customPriorities.map((item) => `custom:${item.id}`),
      'wait',
      'clear',
    ];
    const savedTokens = Array.isArray(AppState.get('priorityMenuOrder'))
      ? AppState.get('priorityMenuOrder')
      : [];
    const orderedTokens = [];

    for (const token of savedTokens) {
      if (validTokens.includes(token) && !orderedTokens.includes(token)) {
        orderedTokens.push(token);
      }
    }

    for (const token of validTokens) {
      if (!orderedTokens.includes(token)) {
        orderedTokens.push(token);
      }
    }

    return orderedTokens;
  },

  _getTaskPrioritySelectValue(taskData, customPriorities) {
    if (taskData.priority === -1) return 'wait';
    if (taskData.priority === -2) {
      const label = String(taskData.priority_label || '').replace(/^cp:/, '');
      const customPriority = customPriorities.find((item) => item.label === label);
      return customPriority ? `custom:${customPriority.id}` : 'clear';
    }
    if (typeof taskData.priority === 'number' && taskData.priority >= 1) {
      return String(taskData.priority);
    }
    return 'clear';
  },

  _parseTaskPrioritySelectValue(value) {
    if (!value || value === 'clear') {
      return { priority: 0, priority_label: null };
    }

    if (value === 'wait') {
      return { priority: -1, priority_label: null };
    }

    if (value.startsWith('custom:')) {
      const id = value.slice('custom:'.length);
      const customPriority = (AppState.get('customPriorities') || []).find((item) => item.id === id);
      return {
        priority: customPriority ? -2 : 0,
        priority_label: customPriority ? `cp:${customPriority.label}` : null,
      };
    }

    const numericPriority = parseInt(value, 10);
    return {
      priority: Number.isFinite(numericPriority) ? numericPriority : 0,
      priority_label: null,
    };
  }
};
