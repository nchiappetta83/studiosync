/**
 * Task Dialog - create/edit tasks. Also includes project creation.
 */

(function attachTaskDialog(globalScope) {
const {
  PRIORITY_NONE,
  getTaskPrioritySelectValue,
  parseTaskPrioritySelectValue,
} = globalScope.SchedulingPriority;

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
            <div class="dialog-task-search-field">
              <svg class="dialog-task-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="16.5" y1="16.5" x2="21" y2="21"></line>
              </svg>
              <input type="text" class="input" id="dialog-task-title" value="${this._esc(taskData.title || '')}" placeholder="${isEdit ? 'Enter task description...' : 'Task title / search projects...'}">
              ${isEdit ? '' : '<button class="dialog-task-search-clear hidden" id="dialog-task-title-clear" type="button" aria-label="Clear selected project" title="Clear selected project">&times;</button>'}
            </div>
          </div>
          ${!isEdit ? `
          <div class="form-group">
            <div class="dialog-project-picker" id="dialog-project-picker"></div>
          </div>
          ` : ''}
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

    let selectedProjectId = isEdit ? (taskData.project_id || null) : null;
    if (!isEdit) {
      this._bindAddTaskProjectPicker({
        overlay,
        projects,
        titleInput: overlay.querySelector('#dialog-task-title'),
        clearButton: overlay.querySelector('#dialog-task-title-clear'),
        picker: overlay.querySelector('#dialog-project-picker'),
        onProjectChange: (projectId) => {
          selectedProjectId = projectId || null;
        },
      });
    }

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
      else if (!isEdit) data.project_id = selectedProjectId || null;

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
    const initialProjectType = createAsFuture ? 'future' : 'current';

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
          <section class="dialog-project-identity">
            <div class="dialog-project-identity-row">
              <div class="form-group">
                <label>Client Name</label>
                <input type="text" class="input" id="dialog-project-client" value="${this._esc(projectData.client || '')}" placeholder="e.g. Acme Corp">
              </div>
              <div class="form-group">
                <label>Project Name</label>
                <input type="text" class="input" id="dialog-project-name" value="${this._esc(projectData.name || '')}" placeholder="e.g. Annual Audit">
              </div>
            </div>
          </section>
          ${!isEdit ? `
            <div class="dialog-project-type-row">
              <span class="dialog-project-type-label">Project Type</span>
              <div class="dialog-project-type-toggle" role="radiogroup" aria-label="Project type">
                <button class="dialog-project-type-option ${initialProjectType === 'current' ? 'active' : ''}" type="button" data-project-type="current" role="radio" aria-checked="${initialProjectType === 'current' ? 'true' : 'false'}">Current</button>
                <button class="dialog-project-type-option ${initialProjectType === 'future' ? 'active' : ''}" type="button" data-project-type="future" role="radio" aria-checked="${initialProjectType === 'future' ? 'true' : 'false'}">Future</button>
              </div>
            </div>
          ` : ''}
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
        </div>
        <div class="dialog-footer">
          ${isEdit ? '<button class="btn btn-danger" id="dialog-delete">Delete Project</button>' : ''}
          ${!isEdit ? '<span class="dialog-project-preview dialog-project-footer-preview hidden" id="dialog-project-preview"></span>' : ''}
          <div style="flex:1"></div>
          <button class="btn btn-ghost" id="dialog-cancel">Cancel</button>
          <button class="btn btn-primary" id="dialog-submit">${submitLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('dialog-project-client').focus(), 50);
    let projectType = initialProjectType;

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

    const clientInput = overlay.querySelector('#dialog-project-client');
    const nameInput = overlay.querySelector('#dialog-project-name');
    const previewEl = overlay.querySelector('#dialog-project-preview');
    const syncProjectPreview = () => {
      if (!previewEl) return;
      const rawClient = clientInput?.value.trim() || '';
      const rawName = nameInput?.value.trim() || '';
      const hasPreviewText = Boolean(rawClient || rawName);
      previewEl.classList.toggle('hidden', !hasPreviewText);
      if (!hasPreviewText) {
        previewEl.textContent = '';
        return;
      }
      const client = rawClient || 'Client';
      const name = rawName || 'Project Name';
      previewEl.textContent = `${client} | ${name}`;
      previewEl.classList.toggle('is-placeholder', !rawClient || !rawName);
    };

    clientInput?.addEventListener('input', syncProjectPreview);
    nameInput?.addEventListener('input', syncProjectPreview);
    syncProjectPreview();

    const syncProjectType = () => {
      overlay.querySelectorAll('[data-project-type]').forEach((button) => {
        const isActive = button.dataset.projectType === projectType;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-checked', isActive ? 'true' : 'false');
      });
    };

    overlay.querySelectorAll('[data-project-type]').forEach((button) => {
      button.addEventListener('click', () => {
        projectType = button.dataset.projectType === 'future' ? 'future' : 'current';
        syncProjectType();
      });
    });
    syncProjectType();

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
        const confirmed = await ConfirmDialog.show({
          title: 'Delete project?',
          message: 'Delete this project? Tasks linked to it will remain but lose the project link.',
          confirmLabel: 'Delete',
          tone: 'danger',
        });
        if (!confirmed) return;
        await window.api.deleteProject(projectData.id);
        closeDialog();
        await AppState.refresh();
        await restoreWindowFocus();
        Toast.show('Project deleted', 'success');
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
        data.category = projectType;
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

  _bindAddTaskProjectPicker({ overlay, projects, titleInput, clearButton, picker, onProjectChange }) {
    if (!picker || !titleInput) return;

    let selectedProjectId = null;
    let activePickerTab = 'active';
    let searchQuery = '';
    let freeformTitle = titleInput.value || '';

    const getProjectSection = (project) => {
      if (project?.category === 'future' || project?.status === 'future') return 'future';
      return project?.status === 'active' ? 'active' : 'inactive';
    };

    const getProjectDisplayTitle = (project) => {
      if (!project) return '';
      return project.client ? `${project.client} | ${project.name}` : (project.name || '');
    };

    const getProjectSearchText = (project) => `${project.client || ''} ${project.name || ''}`.toLowerCase();
    const getTabProjects = (tab) => projects.filter((project) => getProjectSection(project) === tab);
    const getVisibleProjects = () => {
      const query = searchQuery.trim().toLowerCase();
      const source = query ? projects : getTabProjects(activePickerTab);
      return source
        .filter((project) => !query || getProjectSearchText(project).includes(query))
        .sort((a, b) => {
          const clientCompare = String(a.client || '').localeCompare(String(b.client || ''), undefined, { sensitivity: 'base' });
          if (clientCompare !== 0) return clientCompare;
          return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
        });
    };

    const setTitleInputForProject = (project) => {
      if (project) {
        titleInput.value = getProjectDisplayTitle(project);
        titleInput.readOnly = true;
        titleInput.dataset.projectLocked = 'true';
        titleInput.classList.add('task-title-locked');
      } else {
        if (titleInput.dataset.projectLocked === 'true') {
          titleInput.value = freeformTitle;
        }
        titleInput.readOnly = false;
        titleInput.dataset.projectLocked = 'false';
        titleInput.classList.remove('task-title-locked');
      }
    };

    const applySelection = (projectId) => {
      selectedProjectId = projectId || null;
      const project = selectedProjectId ? projects.find((candidate) => candidate.id === selectedProjectId) : null;
      setTitleInputForProject(project);
      clearButton?.classList.toggle('hidden', !project);
      titleInput.closest('.dialog-task-search-field')?.classList.toggle('has-clear', Boolean(project));
      onProjectChange?.(selectedProjectId, project);
      renderPicker();
    };

    const renderPicker = () => {
      const isFiltering = Boolean(searchQuery.trim());
      const visibleProjects = getVisibleProjects();
      const pickerLabel = isFiltering
        ? (visibleProjects.length > 0 ? 'Matching projects' : 'No matches')
        : 'Project';

      picker.innerHTML = `
        <div class="dialog-project-picker-header">
          <span class="dialog-project-picker-label">${pickerLabel}</span>
          <div class="dialog-project-picker-tabs ${isFiltering ? 'is-disabled' : ''}" role="tablist" aria-label="Project status">
            ${['active', 'inactive', 'future'].map((tab) => `
              <button class="dialog-project-picker-tab ${activePickerTab === tab ? 'active' : ''}" type="button" data-project-tab="${tab}" ${isFiltering ? 'disabled' : ''}>
                ${tab[0].toUpperCase()}${tab.slice(1)}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="dialog-project-picker-list">
          ${isFiltering ? `
            <button class="dialog-project-picker-freeform ${selectedProjectId ? '' : 'selected'}" type="button" id="dialog-project-picker-freeform">
              <span class="pp-name">No Project - Freeform Task</span>
              <span class="pp-freeform-title">${this._esc(freeformTitle.trim() || 'Task title')}</span>
            </button>
            <div class="dialog-project-picker-divider" aria-hidden="true"></div>
          ` : ''}
          ${visibleProjects.length === 0 ? `
            <div class="dialog-project-picker-empty">${isFiltering ? 'No projects found.' : `No ${activePickerTab} projects are available right now.`}</div>
          ` : visibleProjects.map((project) => {
            const section = getProjectSection(project);
            return `
              <button class="dialog-project-picker-item ${selectedProjectId === project.id ? 'selected' : ''}" type="button" data-project-id="${project.id}">
                <span class="pp-client">${this._esc(project.client || 'Project')}</span>
                <span class="pp-name">${this._esc(project.name || '')}</span>
                <span class="pp-status ${section}">${section}</span>
              </button>
            `;
          }).join('')}
        </div>
      `;

      picker.querySelector('#dialog-project-picker-freeform')?.addEventListener('click', () => {
        applySelection(null);
      });

      picker.querySelectorAll('[data-project-tab]').forEach((button) => {
        button.addEventListener('click', () => {
          activePickerTab = button.dataset.projectTab;
          renderPicker();
        });
      });

      picker.querySelectorAll('[data-project-id]').forEach((button) => {
        button.addEventListener('click', () => {
          const nextProjectId = button.dataset.projectId;
          applySelection(selectedProjectId === nextProjectId ? null : nextProjectId);
        });
      });
    };

    titleInput.addEventListener('input', () => {
      if (titleInput.dataset.projectLocked === 'true') return;
      freeformTitle = titleInput.value;
      searchQuery = titleInput.value;
      renderPicker();
    });

    clearButton?.addEventListener('click', () => {
      applySelection(null);
      searchQuery = freeformTitle;
      renderPicker();
      titleInput.focus();
      titleInput.selectionStart = titleInput.value.length;
      titleInput.selectionEnd = titleInput.value.length;
    });

    renderPicker();
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
    return getTaskPrioritySelectValue(taskData, customPriorities);
  },

  _parseTaskPrioritySelectValue(value) {
    return parseTaskPrioritySelectValue(value, AppState.get('customPriorities') || []);
  }
};
globalScope.TaskDialog = TaskDialog;
})(window);
