/**
 * SubTasks component — checklist of sub-tasks within an expanded task card.
 * Both partners and staff can create/toggle sub-tasks.
 */

const SubTasks = {
  render(taskId, subtasks) {
    const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

    let itemsHtml = '';
    for (const sub of subtasks) {
      const completedClass = sub.completed ? 'completed' : '';
      const checkedClass = sub.completed ? 'checked' : '';

      itemsHtml += `
        <div class="subtask-item ${completedClass}" data-subtask-id="${sub.id}">
          <div class="subtask-checkbox ${checkedClass}" data-action="toggle-subtask" data-subtask-id="${sub.id}">
            ${checkSvg}
          </div>
          <span class="subtask-title">${this._escapeHtml(sub.title)}</span>
          <button class="subtask-delete" data-action="delete-subtask" data-subtask-id="${sub.id}" title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;
    }

    const completedCount = subtasks.filter(s => s.completed).length;
    const progressText = subtasks.length > 0
      ? `(${completedCount}/${subtasks.length})`
      : '';

    return `
      <div class="subtask-section">
        <div class="subtask-header">
          <span class="subtask-label">Sub-tasks ${progressText}</span>
          <button class="subtask-add-btn" data-action="show-subtask-input" data-task-id="${taskId}">+ Add</button>
        </div>
        <div class="subtask-list" id="subtask-list-${taskId}">
          ${itemsHtml}
        </div>
        <input type="text" class="subtask-add-input hidden" id="subtask-input-${taskId}"
               placeholder="Type sub-task and press Enter..." data-task-id="${taskId}">
      </div>
    `;
  },

  bindEvents(container, taskId) {
    // Toggle sub-task completion
    container.querySelectorAll('[data-action="toggle-subtask"]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.api.toggleSubTask(el.dataset.subtaskId);
        this._reloadDetail(taskId);
      });
    });

    // Delete sub-task
    container.querySelectorAll('[data-action="delete-subtask"]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.api.deleteSubTask(el.dataset.subtaskId);
        this._reloadDetail(taskId);
      });
    });

    // Show add input
    container.querySelectorAll('[data-action="show-subtask-input"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const input = document.getElementById(`subtask-input-${taskId}`);
        if (input) {
          input.classList.remove('hidden');
          input.focus();
          btn.classList.add('hidden');
        }
      });
    });

    // Add sub-task on Enter
    const input = document.getElementById(`subtask-input-${taskId}`);
    if (input) {
      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          const currentUser = AppState.get('currentUser');
          await window.api.createSubTask({
            task_id: taskId,
            title: input.value.trim(),
            created_by: currentUser?.id || null
          });
          input.value = '';
          this._reloadDetail(taskId);
        } else if (e.key === 'Escape') {
          input.classList.add('hidden');
          input.value = '';
          const addBtn = container.querySelector('[data-action="show-subtask-input"]');
          if (addBtn) addBtn.classList.remove('hidden');
        }
      });

      input.addEventListener('blur', () => {
        if (!input.value.trim()) {
          input.classList.add('hidden');
          const addBtn = container.querySelector('[data-action="show-subtask-input"]');
          if (addBtn) addBtn.classList.remove('hidden');
        }
      });
    }
  },

  async _reloadDetail(taskId) {
    const detailEl = document.getElementById(`task-detail-${taskId}`);
    if (detailEl) {
      const [subtasks, comments] = await Promise.all([
        window.api.getSubTasks(taskId),
        window.api.getComments(taskId)
      ]);

      let html = '';
      html += this.render(taskId, subtasks);
      html += Comments.render(taskId, comments);

      detailEl.innerHTML = html;
      this.bindEvents(detailEl, taskId);
      Comments.bindEvents(detailEl, taskId);
    }
    // Also refresh task counts in sidebar
    AppState.refresh();
  },

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
