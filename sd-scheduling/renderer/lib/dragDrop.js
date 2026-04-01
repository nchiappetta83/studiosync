/**
 * Drag-and-drop system for project → staff assignment.
 * Creates a floating chip that follows the cursor and highlights drop targets.
 */

const DragDrop = {
  _active: false,
  _project: null,
  _chip: null,
  _currentDropTarget: null,

  // Stable bound references for add/removeEventListener
  _boundMouseMove: null,
  _boundMouseUp: null,

  start(event, project) {
    this._active = true;
    this._project = project;

    // Create floating chip — small, client name only, centered on cursor
    this._chip = document.createElement('div');
    this._chip.className = 'drag-chip';
    this._chip.textContent = project.client || project.name;
    document.body.appendChild(this._chip);

    this._updateChipPosition(event);

    // Create stable bound references
    this._boundMouseMove = (e) => this._onMouseMove(e);
    this._boundMouseUp = (e) => this._onMouseUp(e);

    // Add global listeners
    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);
    document.body.style.cursor = 'grabbing';
    document.body.classList.add('dragging');
  },

  _onMouseMove(e) {
    this._updateChipPosition(e);
    this._updateDropTargets(e);
  },

  _onMouseUp(e) {
    if (!this._active) return;

    const target = this._currentDropTarget;
    if (target) {
      this._handleDrop(target);
    }

    this._cleanup();
  },

  _updateChipPosition(e) {
    if (this._chip) {
      // Center the chip on the cursor (matching V4 behavior)
      this._chip.style.left = (e.clientX - 90) + 'px';
      this._chip.style.top = (e.clientY - 15) + 'px';
    }
  },

  _updateDropTargets(e) {
    // Check sidebar items (skip "all" — only real user IDs are drop targets)
    const sidebarItems = document.querySelectorAll('.sidebar-item[data-user-id]');
    let foundTarget = null;

    for (const item of sidebarItems) {
      const userId = item.dataset.userId;
      if (userId === 'all') continue; // Can't drop onto "All Staff"

      const rect = item.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        item.classList.add('drag-over');
        foundTarget = { type: 'sidebar', userId, element: item };
      } else {
        item.classList.remove('drag-over');
      }
    }

    // Check task panel staff sections
    const staffSections = document.querySelectorAll('.staff-section[data-user-id]');
    for (const section of staffSections) {
      const rect = section.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        if (!foundTarget) {
          foundTarget = { type: 'section', userId: section.dataset.userId, element: section };
        }
        // Show ghost indicator
        this._showGhost(section);
      } else {
        this._hideGhost(section);
      }
    }

    if (this._currentDropTarget && this._currentDropTarget.element !== foundTarget?.element) {
      this._currentDropTarget.element.classList.remove('drag-over');
    }
    this._currentDropTarget = foundTarget;
  },

  _showGhost(section) {
    const tasksContainer = section.querySelector('.staff-tasks');
    if (!tasksContainer) return;

    // Hide "No tasks assigned" empty message
    const emptyMsg = tasksContainer.querySelector('.empty-section');
    if (emptyMsg) emptyMsg.style.display = 'none';

    if (!tasksContainer.querySelector('.ghost-drop')) {
      const ghost = document.createElement('div');
      ghost.className = 'ghost-drop';
      ghost.textContent = 'Drop to assign';
      tasksContainer.appendChild(ghost);
    }
  },

  _hideGhost(section) {
    const ghost = section.querySelector('.ghost-drop');
    if (ghost) ghost.remove();

    // Restore "No tasks assigned" empty message
    const tasksContainer = section.querySelector('.staff-tasks');
    if (tasksContainer) {
      const emptyMsg = tasksContainer.querySelector('.empty-section');
      if (emptyMsg) emptyMsg.style.display = '';
    }
  },

  async _handleDrop(target) {
    const project = this._project;
    const currentUser = AppState.get('currentUser');

    if (!project || !target.userId || target.userId === 'all') return;

    try {
      await window.api.createTask({
        project_id: project.id,
        assigned_to: target.userId,
        created_by: currentUser?.id || null,
        title: project.client ? `${project.client} — ${project.name}` : project.name,
        priority: 0,
      });

      AppState.refresh();
      Toast.show('Task assigned', 'success');
    } catch (err) {
      console.error('Drop failed:', err);
      Toast.show('Failed to assign task', 'error');
    }
  },

  _cleanup() {
    this._active = false;
    this._project = null;

    // Fade out chip
    if (this._chip) {
      const chip = this._chip;
      chip.style.transition = 'opacity 0.15s, transform 0.15s';
      chip.style.opacity = '0';
      chip.style.transform = 'scale(0.9)';
      setTimeout(() => chip.remove(), 150);
      this._chip = null;
    }

    // Fade out ghosts
    document.querySelectorAll('.ghost-drop').forEach(el => {
      el.style.transition = 'opacity 0.15s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 150);
    });

    // Remove all highlights
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

    if (this._boundMouseMove) {
      document.removeEventListener('mousemove', this._boundMouseMove);
      this._boundMouseMove = null;
    }
    if (this._boundMouseUp) {
      document.removeEventListener('mouseup', this._boundMouseUp);
      this._boundMouseUp = null;
    }
    document.body.style.cursor = '';
    document.body.classList.remove('dragging');

    this._currentDropTarget = null;
  },

  isActive() {
    return this._active;
  }
};

// ── Task Drag System (move tasks between staff) ──────

const TaskDrag = {
  _active: false,
  _task: null,
  _chip: null,
  _currentDropTarget: null,
  _boundMouseMove: null,
  _boundMouseUp: null,
  _sourceCard: null,

  start(event, task, sourceCard) {
    this._active = true;
    this._task = task;
    this._sourceCard = sourceCard || null;

    this._chip = document.createElement('div');
    this._chip.className = 'drag-chip';
    this._chip.textContent = task.title;
    document.body.appendChild(this._chip);

    // Hide the original card while dragging
    if (this._sourceCard) {
      this._sourceCard.classList.add('dragging');
    }

    this._updateChipPosition(event);

    this._boundMouseMove = (e) => this._onMouseMove(e);
    this._boundMouseUp = (e) => this._onMouseUp(e);

    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);
    document.body.style.cursor = 'grabbing';
    document.body.classList.add('dragging');
  },

  _onMouseMove(e) {
    this._updateChipPosition(e);
    this._updateDropTargets(e);
  },

  _onMouseUp(e) {
    if (!this._active) return;
    const target = this._currentDropTarget;
    if (target) this._handleDrop(target);
    this._cleanup();
  },

  _updateChipPosition(e) {
    if (this._chip) {
      this._chip.style.left = (e.clientX - 90) + 'px';
      this._chip.style.top = (e.clientY - 15) + 'px';
    }
  },

  _updateDropTargets(e) {
    const sidebarItems = document.querySelectorAll('.sidebar-item[data-user-id]');
    let foundTarget = null;

    for (const item of sidebarItems) {
      const userId = item.dataset.userId;
      if (userId === 'all') continue;

      const rect = item.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        item.classList.add('drag-over');
        foundTarget = { type: 'sidebar', userId, element: item };
      } else {
        item.classList.remove('drag-over');
      }
    }

    // Staff sections in task panel — allow same section for reorder
    const staffSections = document.querySelectorAll('.staff-section[data-user-id]');
    for (const section of staffSections) {
      const userId = section.dataset.userId;
      const isSameUser = userId === this._task?.assigned_to;

      const rect = section.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        if (!foundTarget) {
          if (isSameUser) {
            // Find insertion position among task cards
            const insertIdx = this._findInsertIndex(section, e.clientY);
            foundTarget = { type: 'reorder', userId, element: section, insertIndex: insertIdx };
          } else {
            foundTarget = { type: 'section', userId, element: section };
          }
        }
        this._showGhostAtPosition(section, e.clientY);
      } else {
        this._hideGhost(section);
      }
    }

    if (this._currentDropTarget && this._currentDropTarget.element !== foundTarget?.element) {
      this._currentDropTarget.element.classList.remove('drag-over');
    }
    this._currentDropTarget = foundTarget;
  },

  _findInsertIndex(section, mouseY) {
    const tasksContainer = section.querySelector('.staff-tasks');
    if (!tasksContainer) return 0;
    const cards = [...tasksContainer.querySelectorAll('.task-card:not(.dragging)')];
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (mouseY < midY) return i;
    }
    return cards.length;
  },

  _showGhostAtPosition(section, mouseY) {
    const tasksContainer = section.querySelector('.staff-tasks');
    if (!tasksContainer) return;

    const emptyMsg = tasksContainer.querySelector('.empty-section');
    if (emptyMsg) emptyMsg.style.display = 'none';

    // Remove existing ghost
    const existingGhost = tasksContainer.querySelector('.ghost-drop');
    if (existingGhost) existingGhost.remove();

    const ghost = document.createElement('div');
    ghost.className = 'ghost-drop';
    const isSameUser = section.dataset.userId === this._task?.assigned_to;
    ghost.textContent = isSameUser ? 'Reorder here' : 'Drop to move here';

    const cards = [...tasksContainer.querySelectorAll('.task-card:not(.dragging)')];
    let inserted = false;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (mouseY < midY) {
        tasksContainer.insertBefore(ghost, cards[i]);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      tasksContainer.appendChild(ghost);
    }
  },

  _showGhost(section) {
    // Fallback for simple ghost (used by sidebar drops)
    this._showGhostAtPosition(section, Infinity);
  },

  _hideGhost(section) {
    const ghost = section.querySelector('.ghost-drop');
    if (ghost) ghost.remove();
    const tasksContainer = section.querySelector('.staff-tasks');
    if (tasksContainer) {
      const emptyMsg = tasksContainer.querySelector('.empty-section');
      if (emptyMsg) emptyMsg.style.display = '';
    }
  },

  async _handleDrop(target) {
    const task = this._task;
    if (!task || !target.userId || target.userId === 'all') return;

    try {
      if (target.type === 'reorder' && target.userId === task.assigned_to) {
        // Reorder within same staff
        const allTasks = AppState.get('tasks') || [];
        const staffTasks = allTasks
          .filter(t => t.assigned_to === task.assigned_to)
          .sort((a, b) => a.sort_order - b.sort_order);

        // Remove dragged task from list
        const filtered = staffTasks.filter(t => t.id !== task.id);
        // Insert at new position
        const insertIdx = Math.min(target.insertIndex, filtered.length);
        filtered.splice(insertIdx, 0, task);

        // Build new order
        const orders = filtered.map((t, i) => ({ id: t.id, sort_order: i + 1 }));
        await window.api.reorderTasks(orders);
        AppState.refresh();
      } else if (target.userId !== task.assigned_to) {
        // Move to different staff
        await window.api.updateTask({ id: task.id, assigned_to: target.userId });
        AppState.refresh();
        const user = AppState.getUserById(target.userId);
        Toast.show(`Task moved to ${user?.display_name || 'staff'}`, 'success');
      }
    } catch (err) {
      console.error('Task drag failed:', err);
      Toast.show('Failed to move task', 'error');
    }
  },

  _cleanup() {
    this._active = false;
    this._task = null;

    if (this._sourceCard) {
      this._sourceCard.classList.remove('dragging');
      this._sourceCard = null;
    }

    // Fade out chip
    if (this._chip) {
      const chip = this._chip;
      chip.style.transition = 'opacity 0.15s, transform 0.15s';
      chip.style.opacity = '0';
      chip.style.transform = 'scale(0.9)';
      setTimeout(() => chip.remove(), 150);
      this._chip = null;
    }

    // Fade out ghosts
    document.querySelectorAll('.ghost-drop').forEach(el => {
      el.style.transition = 'opacity 0.15s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 150);
    });

    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    if (this._boundMouseMove) { document.removeEventListener('mousemove', this._boundMouseMove); this._boundMouseMove = null; }
    if (this._boundMouseUp) { document.removeEventListener('mouseup', this._boundMouseUp); this._boundMouseUp = null; }
    document.body.style.cursor = '';
    document.body.classList.remove('dragging');
    this._currentDropTarget = null;
  },

  isActive() { return this._active; }
};

// ── Toast Notification System ─────────────────────────

const Toast = {
  _container: null,

  _ensureContainer() {
    if (!this._container) {
      this._container = document.createElement('div');
      this._container.className = 'toast-container';
      document.body.appendChild(this._container);
    }
  },

  show(message, type = 'info', duration = 3000) {
    this._ensureContainer();

    const icons = {
      success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
      error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
      info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;

    this._container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'opacity 0.2s, transform 0.2s';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }
};
