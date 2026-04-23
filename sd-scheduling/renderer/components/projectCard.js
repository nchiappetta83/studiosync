/**
 * ProjectCard — individual project card with drag-to-assign capability.
 */

const ProjectCard = {
  render(project) {
    const isPartner = AppState.isPartner();
    const statusLabel = project.status === 'active' ? 'ACTIVE' : 'INACTIVE';
    const statusClass = project.status === 'active' ? 'badge-active' : 'badge-inactive';
    const statusDotColor = project.status === 'active' ? 'var(--badge-bg)' : 'var(--text-tertiary)';

    // Partner badge
    const partnerLabel = this._getProjectPartnerLabel(project);
    const partnerBadge = partnerLabel
      ? `<span class="project-partner-badge">${this._escapeHtml(partnerLabel)}</span>`
      : '';

    // Task count for this project
    const tasks = AppState.get('tasks') || [];
    const projectTasks = tasks.filter(t => t.project_id === project.id);
    const taskCountText = projectTasks.length > 0
      ? `${projectTasks.length} task${projectTasks.length !== 1 ? 's' : ''}`
      : '';

    // Notes — editable for partners, read-only for staff
    const notesHtml = isPartner
      ? `<input type="text" class="project-card-notes" value="${this._escapeAttr(project.notes || '')}"
              placeholder="Add notes..." data-project-id="${project.id}" data-field="notes">`
      : (project.notes ? `<div class="project-card-notes" style="cursor:default">${this._escapeHtml(project.notes)}</div>` : '');

    const inactiveClass = project.status !== 'active' ? 'project-inactive' : '';

    return `
      <div class="project-card ${inactiveClass}" data-project-id="${project.id}" draggable="false">
        <div class="project-card-header">
          <div class="project-card-title">${this._escapeHtml(project.client ? `${project.client} | ${project.name}` : project.name)}</div>
          ${partnerBadge}
        </div>
        ${notesHtml}
        <div class="project-card-footer">
          <span class="badge badge-status ${statusClass} ${isPartner ? 'project-status' : ''}"
                data-project-id="${project.id}" data-field="status"
                ${isPartner ? 'title="Click to toggle status"' : ''}><span style="width:6px;height:6px;border-radius:50%;background:${statusDotColor};display:inline-block;margin-right:4px;vertical-align:middle;"></span>${statusLabel}</span>
          <span class="project-task-count">${taskCountText}</span>
        </div>
      </div>
    `;
  },

  bindEvents(container) {
    const isPartner = AppState.isPartner();

    // Drag to assign (mousedown-based for custom drag chip)
    container.querySelectorAll('.project-card').forEach(card => {
      let startX, startY, isDragging = false;

      card.addEventListener('mousedown', (e) => {
        // Don't start drag on input fields
        if (e.target.tagName === 'INPUT') return;
        if (!isPartner) return;

        startX = e.clientX;
        startY = e.clientY;

        const onMove = (moveE) => {
          const dx = moveE.clientX - startX;
          const dy = moveE.clientY - startY;

          // Only start drag after 5px movement
          if (!isDragging && Math.sqrt(dx * dx + dy * dy) > 5) {
            isDragging = true;
            const projectId = card.dataset.projectId;
            const project = AppState.get('projects').find(p => p.id === projectId);
            if (project) {
              card.classList.add('dragging');
              DragDrop.start(moveE, project);
            }
            document.removeEventListener('mousemove', onMove);
          }
        };

        const onUp = () => {
          isDragging = false;
          card.classList.remove('dragging');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      // Double-click to edit project (partner only)
      if (isPartner) {
        card.addEventListener('dblclick', (e) => {
          if (e.target.tagName === 'INPUT') return;
          const projectId = card.dataset.projectId;
          const project = AppState.get('projects').find(p => p.id === projectId);
          if (project) TaskDialog.showProjectDialog(project, true);
        });
      }
    });

    // Inline notes editing (partner only)
    if (isPartner) {
      container.querySelectorAll('.project-card-notes[data-field="notes"]').forEach(input => {
        let debounce;
        input.addEventListener('input', () => {
          clearTimeout(debounce);
          debounce = setTimeout(async () => {
            await window.api.updateProject({
              id: input.dataset.projectId,
              notes: input.value
            });
          }, 500);
        });
      });
    }

    // Status toggle (partner only)
    if (isPartner) {
      container.querySelectorAll('.project-status[data-field="status"]').forEach(badge => {
        badge.addEventListener('click', async () => {
          const projectId = badge.dataset.projectId;
          const project = AppState.get('projects').find(p => p.id === projectId);
          if (!project) return;

          const newStatus = project.status === 'active' ? 'inactive' : 'active';
          const activeOnly = document.getElementById('projects-active-only')?.checked ?? true;
          ProjectPanel.prepareAnchorNearProject(projectId, {
            preferNeighbor: activeOnly && newStatus !== 'active',
          });
          await window.api.updateProject({ id: projectId, status: newStatus });
          AppState.refresh();
        });
      });
    }

    // Right-click context menu (partner only)
    if (isPartner) {
      container.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const projectId = card.dataset.projectId;
          const project = AppState.get('projects').find(p => p.id === projectId);
          if (project) this._showContextMenu(e, project);
        });
      });
    }
  },

  _showContextMenu(e, project) {
    const users = AppState.get('users') || [];
    const partners = users
      .filter(u => u.role === 'partner' && u.active !== 0)
      .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || ''), undefined, { sensitivity: 'base' }));
    const projectCategory = project.category || 'current';

    const items = [];

    // Edit Project
    items.push({
      label: 'Edit Project...',
      action: () => TaskDialog.showProjectDialog(project, true)
    });

    items.push({ divider: true });

    // Set Status
    items.push({
      label: project.status === 'active' ? '✓ Active' : 'Set Active',
      action: async () => {
        if (project.status !== 'active') {
          ProjectPanel.prepareAnchorNearProject(project.id);
          await window.api.updateProject({ id: project.id, status: 'active' });
          AppState.refresh();
        }
      }
    });
    items.push({
      label: project.status === 'inactive' ? '✓ Inactive' : 'Set Inactive',
      action: async () => {
        if (project.status !== 'inactive') {
          const activeOnly = document.getElementById('projects-active-only')?.checked ?? true;
          ProjectPanel.prepareAnchorNearProject(project.id, {
            preferNeighbor: activeOnly,
          });
          await window.api.updateProject({ id: project.id, status: 'inactive' });
          AppState.refresh();
        }
      }
    });

    if (projectCategory === 'future') {
      items.push({
        label: 'Move To Current',
        action: async () => {
          ProjectPanel.prepareAnchorNearProject(project.id, { preferNeighbor: true });
          await window.api.updateProject({ id: project.id, category: 'current' });
          AppState.refresh();
        }
      });
    }

    // Assign Partner
    if (partners.length > 0) {
      const assignedPartnerIds = this._getProjectPartnerIds(project);
      items.push({ divider: true });
      items.push({
        label: 'Partners',
        submenu: [
          {
            label: assignedPartnerIds.length === 0 ? '✓ No Partner' : 'No Partner',
            action: async () => {
              await window.api.updateProject({
                id: project.id,
                partner_id: null,
                partner_ids: [],
                partner_initials: ''
              });
              AppState.refresh();
            }
          },
          ...partners.map((partner) => {
            const initials = this._getInitials(partner.display_name);
            const isAssigned = assignedPartnerIds.includes(partner.id);
            return {
              label: `${isAssigned ? '✓ ' : ''}${partner.display_name} (${initials})`,
              action: async () => {
                const nextPartnerIds = isAssigned
                  ? assignedPartnerIds.filter((id) => id !== partner.id)
                  : [...assignedPartnerIds, partner.id];

                const nextPartners = partners.filter((item) => nextPartnerIds.includes(item.id));
                await window.api.updateProject({
                  id: project.id,
                  partner_id: nextPartnerIds[0] || null,
                  partner_ids: nextPartnerIds,
                  partner_initials: nextPartners.map((item) => this._getInitials(item.display_name)).join('/')
                });
                AppState.refresh();
              }
            };
          })
        ]
      });
    }

    items.push({ divider: true });

    // Delete Project
    items.push({
      label: 'Delete Project',
      danger: true,
      action: async () => {
        if (confirm(`Delete project "${project.client ? project.client + ' — ' : ''}${project.name}"?`)) {
          await window.api.deleteProject(project.id);
          AppState.refresh();
          Toast.show('Project deleted', 'success');
        }
      }
    });

    const menu = ContextMenu.create(items);
    menu.style.top = e.clientY + 'px';
    menu.style.left = e.clientX + 'px';

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 8) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
      if (rect.right > window.innerWidth - 8) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    });
  },

  _getProjectPartnerLabel(project) {
    if (project.partner_initials) return project.partner_initials;
    const partner = project.partner_id ? AppState.getUserById(project.partner_id) : null;
    return partner ? this._getInitials(partner.display_name) : '';
  },

  _getProjectPartnerIds(project) {
    try {
      const parsed = JSON.parse(project?.partner_ids || '[]');
      const partnerIds = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      if (partnerIds.length > 0) return partnerIds;
    } catch (_) {}

    return project?.partner_id ? [project.partner_id] : [];
  },

  _getInitials(name) {
    if (!name) return '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  },

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  _escapeAttr(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};
