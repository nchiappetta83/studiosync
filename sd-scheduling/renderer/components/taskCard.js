/**
 * TaskCard â€” renders individual task cards matching V4 behavior.
 *
 * Layout:
 *   TOP ROW:  [Priority pill] [Task name] [Due date] [ðŸ“…] [Ã—]
 *   BOTTOM:   [Notes (italic, indented)]
 *
 * Interactions (partner only):
 *   - Priority badge: click â†’ popup menu (1..N, W, custom, Clear)
 *   - Due date: click to type inline, ðŸ“… to open calendar picker
 *   - Task name: double-click â†’ edit dialog
 *   - Notes: click to edit inline
 *   - Ã— : delete (shown on hover)
 *   - Drag: mousedown+move â†’ drag to another staff member
 *   - Right-click: context menu with edit, priority, move-to, delete
 */

const TaskCard = {
  _noteDrafts: new Map(),

  render(task) {
    const isPartner = AppState.isPartner();
    const canEditNotes = isPartner;
    const completedClass = task.completed ? 'completed' : '';

    // Priority â€” V4 style: null/0 = unset, 1-4 = numeric, 'w' = wait
    const priority = task.priority;
    const prioritySet = priority !== null && priority !== undefined && priority !== '' && priority !== 0;
    const priorityPresentation = this._getPriorityPresentation(task, priority, prioritySet);

    // Due date
    const dueVal = task.due_date || '';
    const dueDisplay = dueVal ? this._formatDueDisplay(dueVal) : '';
    const dueColor = dueVal ? this._dueColorClass(dueVal) : 'due-none';

    // Notes
    const notesVal = this._noteDrafts.has(task.id)
      ? this._noteDrafts.get(task.id)
      : (task.notes || '');

    // Confirmed / Last Week status (V4 weekly rollover)
    const isConfirmed = task.confirmed !== 0;
    const lastWeekClass = isConfirmed ? '' : 'task-last-week';
    const lastWeekOverlay = (!isConfirmed && isPartner)
      ? '<span class="task-last-week-overlay">Last Week</span>'
      : '';
    const keepBtn = (!isConfirmed && isPartner) ?
      `<button class="task-keep-btn" data-task-id="${task.id}" title="Confirm task for this week">Keep</button>` : '';
    const carryDeleteBtn = (!isConfirmed && isPartner)
      ? `<button class="task-carry-delete-btn" data-task-id="${task.id}" title="Delete carry-over task">Delete</button>`
      : '';
    const rolloverActions = (!isConfirmed && isPartner) ? `
      <div class="task-rollover-actions">
        ${keepBtn}
        ${carryDeleteBtn}
      </div>
    ` : '';
    const completeBtn = (isPartner && task.completed)
      ? `<button class="task-complete-btn task-complete-btn-active" data-task-id="${task.id}" title="Mark task incomplete">Undo</button>`
      : '';

    // Partner initials badge
    const partnerHtml = this._renderPartnerBadge(task);

    // Delete button (visible on hover for partners)
    const deleteBtn = isPartner
      ? `<span class="task-delete-btn" data-task-id="${task.id}" title="Delete task">&times;</span>`
      : '';

    // Calendar icon (partner only)
    const calIcon = isPartner
      ? `<span class="task-cal-icon" data-task-id="${task.id}" title="Pick from calendar">&#x1F4C5;</span>`
      : '';

    // Priority badge â€” custom priorities get inline color from their definition
    const priorityCursor = isPartner ? 'cursor:pointer;' : '';
    const priorityInlineStyle = `${priorityPresentation.inlineStyle || ''}${priorityCursor}`;
    const priorityBadge = `<span class="task-priority-pill ${priorityPresentation.className}" data-task-id="${task.id}" style="${priorityInlineStyle}">${this._escapeHtml(priorityPresentation.label)}</span>`;

    // Due date display (click opens calendar picker)
    const dueCursor = isPartner ? 'cursor:pointer;' : '';
    const dueHtml = dueDisplay
      ? `<span class="task-due-label ${dueColor}" data-task-id="${task.id}" style="${dueCursor}">${this._escapeHtml(dueDisplay)}</span>`
      : (isPartner ? `<span class="task-due-label due-none" data-task-id="${task.id}" style="${dueCursor}">No due date</span>` : '');

    return `
      <div class="task-card ${completedClass} ${lastWeekClass} ${isPartner ? 'task-card-draggable' : ''}" data-task-id="${task.id}">
        ${rolloverActions}
        ${lastWeekOverlay}
        <div class="task-card-main">
          ${priorityBadge}
          <div class="task-title-group">
            <div class="task-title">${this._escapeHtml(task.title)}</div>
            ${isConfirmed ? completeBtn : ''}
          </div>
          ${dueHtml}
          ${calIcon}
          ${deleteBtn}
        </div>
        <div class="task-card-bottom">
          <input type="text" class="task-notes-input ${canEditNotes ? 'task-notes-input-editable' : ''}" data-task-id="${task.id}"
            value="${this._escapeAttr(notesVal)}" placeholder="Note" ${canEditNotes ? '' : 'readonly'}>
          ${partnerHtml}
        </div>
      </div>
    `;
  },

  bindEvents(container) {
    const isPartner = AppState.isPartner();

    // â”€â”€ Keep button (weekly rollover) â”€â”€
    if (isPartner) {
      container.querySelectorAll('.task-keep-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const taskId = btn.dataset.taskId;
          await window.api.confirmTask(taskId);
          AppState.refresh();
        });
      });
    }

    if (isPartner) {
      container.querySelectorAll('.task-complete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const taskId = btn.dataset.taskId;
          const task = AppState.get('tasks').find(t => t.id === taskId);
          if (!task) return;

          await window.api.updateTask({ id: taskId, completed: task.completed ? 0 : 1 });
          AppState.refresh();
        });
      });
    }

    if (isPartner) {
      container.querySelectorAll('.task-carry-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const taskId = btn.dataset.taskId;
          const task = AppState.get('tasks').find(t => t.id === taskId);
          if (!task) return;

          if (confirm(`Delete '${task.title}' from carry-over?`)) {
            await window.api.deleteTask(taskId);
            AppState.refresh();
          }
        });
      });
    }


    // â”€â”€ Priority badge click â†’ menu â”€â”€
    if (isPartner) {
      container.querySelectorAll('.task-priority-pill').forEach(badge => {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          const taskId = badge.dataset.taskId;
          const task = AppState.get('tasks').find(t => t.id === taskId);
          if (task) this._showPriorityMenu(badge, task);
        });
      });
    }

    // â”€â”€ Due date label click â†’ calendar picker â”€â”€
    if (isPartner) {
      container.querySelectorAll('.task-due-label').forEach(label => {
        label.addEventListener('click', (e) => {
          e.stopPropagation();
          this._showDatePicker(label, label.dataset.taskId);
        });
      });

      container.querySelectorAll('.task-cal-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
          e.stopPropagation();
          this._showDatePicker(icon, icon.dataset.taskId);
        });
      });
    }

    // â”€â”€ Double-click card â†’ edit dialog â”€â”€
    if (isPartner) {
      container.querySelectorAll('.task-card').forEach(card => {
        card.addEventListener('dblclick', (e) => {
          if (e.target.tagName === 'INPUT' || e.target.closest('.task-priority-pill') ||
              e.target.closest('.task-cal-icon') || e.target.closest('.task-delete-btn') ||
              e.target.closest('.task-partner-badge') || e.target.closest('.task-keep-btn') ||
              e.target.closest('.task-carry-delete-btn') ||
              e.target.closest('.task-complete-btn') ||
              e.target.closest('.task-due-label')) return;
          const taskId = card.dataset.taskId;
          const task = AppState.get('tasks').find(t => t.id === taskId);
          if (task) TaskDialog.show(task, true);
        });
      });
    }

    // â”€â”€ Right-click context menu on task cards â”€â”€
    if (isPartner) {
      container.querySelectorAll('.task-card').forEach(card => {
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const taskId = card.dataset.taskId;
          const task = AppState.get('tasks').find(t => t.id === taskId);
          if (task) this._showTaskContextMenu(e, task);
        });
      });
    }

    // â”€â”€ Task card drag (move between staff) â”€â”€
    if (isPartner) {
      container.querySelectorAll('.task-card').forEach(card => {
        let startX, startY, isDragging = false;

        card.addEventListener('mousedown', (e) => {
          if (e.target.tagName === 'INPUT' || e.target.closest('.task-priority-pill') ||
              e.target.closest('.task-cal-icon') || e.target.closest('.task-delete-btn') ||
              e.target.closest('.task-keep-btn') || e.target.closest('.task-carry-delete-btn') ||
              e.target.closest('.task-complete-btn') ||
              e.button !== 0) return;

          startX = e.clientX;
          startY = e.clientY;

          const onMove = (moveE) => {
            const dx = moveE.clientX - startX;
            const dy = moveE.clientY - startY;
            if (!isDragging && Math.sqrt(dx * dx + dy * dy) > 5) {
              isDragging = true;
              const taskId = card.dataset.taskId;
              const task = AppState.get('tasks').find(t => t.id === taskId);
              if (task) {
                TaskDrag.start(moveE, task, card);
              }
              document.removeEventListener('mousemove', onMove);
            }
          };

          const onUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };

          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      });
    }

    // â”€â”€ Notes: click to edit, debounce/blur to save â”€â”€
    container.querySelectorAll('.task-notes-input').forEach(input => {
      const taskId = input.dataset.taskId;
      let original = input.value;
      let saveTimer = null;
      let saveQueue = Promise.resolve();

      const queueSave = (nextValue) => {
        saveQueue = saveQueue.then(async () => {
          const trimmedValue = nextValue.trim();
          if (trimmedValue === original) return;

          await window.api.updateTask({ id: taskId, notes: trimmedValue });
          original = trimmedValue;

          const currentDraft = this._noteDrafts.get(taskId);
          if (currentDraft !== undefined && currentDraft.trim() === trimmedValue) {
            this._noteDrafts.delete(taskId);
          }
        }).catch((err) => {
          console.error('Task note save failed:', err);
        });

        return saveQueue;
      };

      input.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });

      input.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      if (!isPartner) {
        input.readOnly = true;
      }

      if (isPartner) {
        input.addEventListener('input', () => {
          this._noteDrafts.set(taskId, input.value);
          clearTimeout(saveTimer);
          saveTimer = setTimeout(() => {
            queueSave(input.value);
          }, 450);
        });
      }

      input.addEventListener('blur', () => {
        clearTimeout(saveTimer);
        const val = input.value.trim();
        if (!val) input.value = '';
        if (isPartner) {
          if (val) {
            this._noteDrafts.set(taskId, val);
          } else {
            this._noteDrafts.delete(taskId);
          }
          void queueSave(val);
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
          clearTimeout(saveTimer);
          this._noteDrafts.delete(taskId);
          input.value = original;
          input.blur();
        }
      });
    });

    // â”€â”€ Delete button â”€â”€
    if (isPartner) {
      container.querySelectorAll('.task-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const taskId = btn.dataset.taskId;
          const task = AppState.get('tasks').find(t => t.id === taskId);
          if (task && confirm(`Delete '${task.title}'?`)) {
            await window.api.deleteTask(taskId);
            AppState.refresh();
          }
        });
      });
    }
  },

  // â”€â”€ Priority Menu (V4 style) â”€â”€

  _showPriorityMenu(badge, task) {
    const items = this._buildPriorityMenuEntries(task);
    this._showPriorityPopup(badge, items, task);
  },

  _showPriorityPopup(anchor, items, task) {
    const existing = document.querySelector('.priority-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'priority-menu';

    for (const item of items) {
      if (item.type === 'divider') {
        const div = document.createElement('div');
        div.className = 'context-menu-divider';
        menu.appendChild(div);
        continue;
      }

      const btn = document.createElement('button');
      btn.className = 'context-menu-item';
      if (item.type === 'clear') btn.style.color = 'var(--text-tertiary)';

      // Color dot for numbered priorities
      if (item.type === 'priority' && typeof item.value === 'number') {
        const color = this._numericPriorityTone(item.value).color;
        btn.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>${item.label}`;
      } else if (item.value === 'w') {
        btn.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:var(--priority-w);flex-shrink:0;"></span>${item.label}`;
      } else if (item.type === 'custom') {
        btn.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${item.color};flex-shrink:0;"></span>${item.label}`;
      } else {
        btn.textContent = item.label;
      }

      btn.addEventListener('click', async () => {
        menu.remove();
        document.removeEventListener('click', dismiss);
        await this._applyPriorityMenuValue(task.id, item.value);
        AppState.refresh();
      });

      menu.appendChild(btn);
    }

    document.body.appendChild(menu);

    const rect = anchor.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = rect.left + 'px';

    // Keep in viewport
    requestAnimationFrame(() => {
      const menuRect = menu.getBoundingClientRect();
      if (menuRect.bottom > window.innerHeight - 8) {
        menu.style.top = (rect.top - menuRect.height - 4) + 'px';
      }
      if (menuRect.right > window.innerWidth - 8) {
        menu.style.left = (window.innerWidth - menuRect.width - 8) + 'px';
      }
    });

    const dismiss = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor) {
        menu.remove();
        document.removeEventListener('click', dismiss);
      }
    };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  },

  // â”€â”€ Task Right-Click Context Menu (V4 style) â”€â”€

  _showTaskContextMenu(e, task) {
    const users = AppState.get('users') || [];
    const staffUsers = users
      .filter(u => u.role === 'staff' && u.active !== 0 && u.id !== task.assigned_to)
      .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || ''), undefined, { sensitivity: 'base' }));
    const items = [
      {
        label: 'Edit Task...',
        action: () => TaskDialog.show(task, true)
      },
      { divider: true },
      {
        label: 'Set Priority',
        submenu: this._buildPriorityContextItems(task)
      }
    ];

    if (staffUsers.length > 0) {
      items.push({
        label: 'Move To',
        submenu: staffUsers.map((user) => ({
          label: user.display_name,
          action: async () => {
            await window.api.updateTask({ id: task.id, assigned_to: user.id });
            AppState.refresh();
            Toast.show(`Task moved to ${user.display_name}`, 'success');
          }
        }))
      });
    }

    items.push({ divider: true });

    // Duplicate
    items.push({
      label: 'Duplicate Task',
      action: async () => {
        await window.api.createTask({
          project_id: task.project_id,
          assigned_to: task.assigned_to,
          title: task.title,
          notes: task.notes || '',
          priority: 0,
          due_date: task.due_date,
        });
        AppState.refresh();
        Toast.show('Task duplicated', 'success');
      }
    });

    // Delete
    items.push({
      label: 'Delete Task',
      danger: true,
      action: async () => {
        if (confirm(`Delete '${task.title}'?`)) {
          await window.api.deleteTask(task.id);
          AppState.refresh();
        }
      }
    });

    const menu = ContextMenu.create(items);
    menu.style.top = e.clientY + 'px';
    menu.style.left = e.clientX + 'px';

    // Keep in viewport
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 8) {
        menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
      }
      if (rect.right > window.innerWidth - 8) {
        menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
      }
    });
  },

  _buildPriorityContextItems(task) {
    return this._buildPriorityMenuEntries(task).map((item) => {
      if (item.type === 'divider') return { divider: true };

      return {
        label: item.label,
        color: this._priorityMenuItemColor(item),
        action: async () => {
          await this._applyPriorityMenuValue(task.id, item.value);
          AppState.refresh();
        }
      };
    });
  },

  _buildPriorityMenuEntries(task) {
    const allTasks = AppState.get('tasks') || [];
    const staffTasks = allTasks.filter(t => t.assigned_to === task.assigned_to);
    const n = Math.max(staffTasks.length, 1);
    const customPriorities = AppState.get('customPriorities') || [];
    const tokens = this._priorityMenuTokens(customPriorities);
    const groups = [];

    for (const token of tokens) {
      if (token === 'numbered') {
        groups.push(Array.from({ length: n }, (_unused, index) => ({
          label: String(index + 1),
          value: index + 1,
          type: 'priority'
        })));
        continue;
      }

      if (token === 'wait') {
        groups.push([{ label: 'W (Wait)', value: 'w', type: 'priority' }]);
        continue;
      }

      if (token === 'clear') {
        groups.push([{ label: '\u2014 Clear', value: null, type: 'clear' }]);
        continue;
      }

      if (token.startsWith('custom:')) {
        const customPriority = customPriorities.find((item) => item.id === token.slice('custom:'.length));
        if (customPriority) {
          groups.push([{
            label: customPriority.label,
            value: `cp:${customPriority.label}`,
            type: 'custom',
            color: customPriority.color
          }]);
        }
      }
    }

    const items = [];
    groups.forEach((group, index) => {
      items.push(...group);
      if (index < groups.length - 1) {
        items.push({ type: 'divider' });
      }
    });

    return items;
  },

  _priorityMenuTokens(customPriorities) {
    const validTokens = [
      'numbered',
      ...customPriorities.map((item) => `custom:${item.id}`),
      'wait',
      'clear',
    ];
    const savedTokens = Array.isArray(AppState.get('priorityMenuOrder'))
      ? AppState.get('priorityMenuOrder')
      : [];
    const ordered = [];

    for (const token of savedTokens) {
      if (!validTokens.includes(token) || ordered.includes(token)) continue;
      ordered.push(token);
    }

    for (const token of validTokens) {
      if (!ordered.includes(token)) {
        ordered.push(token);
      }
    }

    return ordered;
  },

  _priorityMenuItemColor(item) {
    if (item.type === 'custom') return item.color;
    if (item.value === 'w') return this._priorityStyleForToken('wait').color;
    if (item.type === 'priority' && typeof item.value === 'number') {
      return this._priorityStyleForToken('numbered').color;
    }
    if (item.type === 'clear') return this._priorityStyleForToken('clear').color;
    return null;
  },

  async _applyPriorityMenuValue(taskId, value) {
    if (value === null) {
      await window.api.updateTask({ id: taskId, priority: 0, priority_label: null });
      return;
    }

    if (value === 'w') {
      await window.api.updateTask({ id: taskId, priority: -1, priority_label: null });
      return;
    }

    if (typeof value === 'string' && value.startsWith('cp:')) {
      await window.api.updateTask({ id: taskId, priority: -2, priority_label: value });
      return;
    }

    await window.api.updateTask({ id: taskId, priority: value, priority_label: null });
  },

  // â”€â”€ Date Picker Popup (V4 style) â”€â”€

  _showDatePicker(anchor, taskId) {
    const existing = document.querySelector('.date-picker-popup');
    if (existing) existing.remove();

    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const popup = document.createElement('div');
    popup.className = 'date-picker-popup';

    const renderMonth = () => {
      const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      let html = `
        <div class="dp-nav">
          <span class="dp-nav-btn" data-dir="-1">&#x25C2;</span>
          <span class="dp-nav-label">${monthNames[month]} ${year}</span>
          <span class="dp-nav-btn" data-dir="1">&#x25B8;</span>
        </div>
        <div class="dp-dow">${dayNames.map(d => `<span class="dp-dow-cell">${d}</span>`).join('')}</div>
        <div class="dp-grid">
      `;

      for (let i = 0; i < firstDay; i++) html += `<span class="dp-cell dp-empty"></span>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const dayDate = new Date(year, month, d);
        const isToday = dayDate.getTime() === today.getTime();
        html += `<span class="${isToday ? 'dp-cell dp-today' : 'dp-cell'}" data-date="${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}">${d}</span>`;
      }

      html += `</div>
        <div class="dp-quick">
          <span class="dp-quick-btn" data-pick="today">Today</span>
          <span class="dp-quick-btn" data-pick="fri">Fri</span>
          <span class="dp-quick-btn" data-pick="+1w">+1w</span>
          <span class="dp-quick-btn dp-clear-btn" data-pick="clear">Clear</span>
        </div>`;

      popup.innerHTML = html;

      popup.querySelectorAll('.dp-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          month += parseInt(btn.dataset.dir);
          if (month > 11) { month = 0; year++; }
          if (month < 0) { month = 11; year--; }
          renderMonth();
        });
      });

      popup.querySelectorAll('.dp-cell[data-date]').forEach(cell => {
        cell.addEventListener('click', (e) => { e.stopPropagation(); selectDate(cell.dataset.date); });
      });

      popup.querySelectorAll('.dp-quick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const pick = btn.dataset.pick;
          if (pick === 'clear') selectDate(null);
          else if (pick === 'today') selectDate(fmtISO(today));
          else if (pick === 'fri') {
            const d = new Date(today); d.setDate(d.getDate() + ((5 - today.getDay() + 7) % 7 || 7));
            selectDate(fmtISO(d));
          } else if (pick === '+1w') {
            const d = new Date(today); d.setDate(d.getDate() + 7); selectDate(fmtISO(d));
          }
        });
      });
    };

    const fmtISO = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    const selectDate = async (dateStr) => {
      popup.remove();
      document.removeEventListener('click', dismissPicker);
      await window.api.updateTask({ id: taskId, due_date: dateStr });
      AppState.refresh();
    };

    renderMonth();
    document.body.appendChild(popup);

    const rect = anchor.getBoundingClientRect();
    popup.style.top = (rect.bottom + 4) + 'px';
    popup.style.left = (rect.right - 240) + 'px';

    requestAnimationFrame(() => {
      const pr = popup.getBoundingClientRect();
      if (pr.left < 8) popup.style.left = '8px';
      if (pr.bottom > window.innerHeight - 8) popup.style.top = (rect.top - pr.height - 4) + 'px';
    });

    const dismissPicker = (e) => {
      if (!popup.contains(e.target) && e.target !== anchor) {
        popup.remove();
        document.removeEventListener('click', dismissPicker);
      }
    };
    setTimeout(() => document.addEventListener('click', dismissPicker), 0);
  },

  // â”€â”€ Helpers â”€â”€

  _priorityLabel(p, isSet, task) {
    if (!isSet || p === 0 || p === null || p === undefined) return '\u2013';
    if (p === -1) return 'W';
    if (p === -2 && task?.priority_label) {
      // Custom priority â€” extract label from "cp:OG" format
      return task.priority_label.replace(/^cp:/, '');
    }
    if (p === -2) return 'Custom';
    return String(p).toUpperCase();
  },

  _priorityClass(priority, isSet, task) {
    if (!isSet || priority === 0 || priority === null || priority === undefined) return 'priority-unset';
    const p = String(priority);
    if (typeof priority === 'number' && priority >= 1) return 'priority-numeric';
    if (p === '-1') return 'priority-w';
    if (p === '-2') return 'priority-custom';
    return 'priority-unset';
  },

  _getPriorityPresentation(task, priority, isSet) {
    return {
      label: this._priorityLabel(priority, isSet, task),
      className: this._priorityClass(priority, isSet, task),
      inlineStyle: this._priorityInlineStyle(task, priority, isSet),
    };
  },

  _numericPriorityTone(priority) {
    return this._priorityStyleForToken('numbered');
  },

  _numericPriorityStyle(priority) {
    const tone = this._numericPriorityTone(priority);
    return `color:${tone.color};background:${tone.background};`;
  },

  _priorityInlineStyle(task, priority, isSet) {
    const styles = this._priorityDisplayStyles();
    if (!isSet || priority === 0 || priority === null || priority === undefined) {
      const clearTone = this._priorityStyleForToken('clear');
      return `color:${clearTone.color};background:${clearTone.background};border:1px solid ${clearTone.border};`;
    }

    if (priority === -1) {
      const waitTone = this._priorityStyleForToken('wait');
      return `color:${waitTone.color};background:${waitTone.background};border:1px solid ${waitTone.border};`;
    }

    if (priority === -2) {
      const customLabel = String(task?.priority_label || '').replace(/^cp:/, '');
      const customPriority = (AppState.get('customPriorities') || []).find((item) => item.label === customLabel);
      const customColor = customPriority?.color || styles.customDefault?.color || '#5C6B75';
      const background = this._withAlpha(customColor, 0.14, '#EEF1F4');
      const border = this._withAlpha(customColor, 0.18, '#E4EAF0');
      return `color:${customColor};background:${background};border:1px solid ${border};`;
    }

    if (typeof priority === 'number' && priority >= 1) {
      const numericTone = this._priorityStyleForToken('numbered');
      return `color:${numericTone.color};background:${numericTone.background};border:1px solid ${numericTone.border};`;
    }

    return '';
  },

  _priorityDisplayStyles() {
    const saved = AppState.get('priorityDisplayStyles');
    return {
      numbered: { color: '#4D4AD5', ...(saved?.numbered || {}) },
      wait: { color: '#6E7680', ...(saved?.wait || {}) },
      clear: { color: '#9CA6B4', ...(saved?.clear || {}) },
      customDefault: { color: '#5C6B75', ...(saved?.customDefault || {}) },
    };
  },

  _priorityStyleForToken(token) {
    const styles = this._priorityDisplayStyles();
    const color = styles[token]?.color || '#5C6B75';
    return {
      color,
      background: this._withAlpha(color, token === 'clear' ? 0.08 : 0.14, '#EEF1F4'),
      border: this._withAlpha(color, token === 'clear' ? 0.12 : 0.18, '#E4EAF0'),
    };
  },

  _withAlpha(color, alpha, fallback) {
    const value = String(color || '').trim();
    const hexMatch = value.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!hexMatch) return fallback;

    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split('').map((char) => char + char).join('')
      : hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },

  _formatDueDisplay(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;

    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const today = new Date();
    today.setHours(0,0,0,0);

    // Show weekday names for dates in the current Monday-Sunday week.
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Sunday

    if (date >= weekStart && date <= weekEnd) {
      // This week: show day name
      const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      return dayNames[date.getDay()];
    }

    // Beyond this week: show M/D/YYYY
    return `${date.getMonth()+1}/${date.getDate()}/${date.getFullYear()}`;
  },

  _dueColorClass(dateStr) {
    if (!dateStr) return 'due-none';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return 'due-normal';
    const due = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const today = new Date();
    today.setHours(0,0,0,0);
    const days = Math.floor((due - today) / 86400000);
    if (days <= 0) return 'due-urgent';
    if (days <= 3) return 'due-warn';
    if (days <= 14) return 'due-future';
    return 'due-normal';
  },

  // â”€â”€ Partner Badge on Task Card â”€â”€

  _renderPartnerBadge(task) {
    const partnerLabel = this._getTaskPartnerLabel(task);
    if (!partnerLabel) return '';
    return `<span class="task-partner-badge" data-task-id="${task.id}" title="${this._escapeAttr(partnerLabel)}">${this._escapeHtml(partnerLabel)}</span>`;
  },

  _getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  },

  _getTaskPartnerLabel(task) {
    const projects = AppState.get('projects') || [];
    const users = AppState.get('users') || [];
    const project = task.project_id ? projects.find(p => p.id === task.project_id) : null;

    if (project?.partner_initials) return project.partner_initials;

    const partnerId = task.partner_id || project?.partner_id;
    const partner = partnerId ? users.find(u => u.id === partnerId) : null;
    return partner ? this._getInitials(partner.display_name) : '';
  },

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  _escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};
