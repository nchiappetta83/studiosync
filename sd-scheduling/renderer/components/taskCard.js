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
  render(task) {
    const isPartner = AppState.isPartner();
    const canEditNotes = isPartner;
    const completedClass = task.completed ? 'completed' : '';

    // Priority â€” V4 style: null/0 = unset, 1-4 = numeric, 'w' = wait
    const priority = task.priority;
    const prioritySet = priority !== null && priority !== undefined && priority !== '' && priority !== 0;
    const pLabel = this._priorityLabel(priority, prioritySet, task);
    const pClass = this._priorityClass(priority, prioritySet, task);

    // Due date
    const dueVal = task.due_date || '';
    const dueDisplay = dueVal ? this._formatDueDisplay(dueVal) : '';
    const dueColor = dueVal ? this._dueColorClass(dueVal) : 'due-empty';

    // Notes
    const notesVal = task.notes || '';

    // Confirmed / Last Week status (V4 weekly rollover)
    const isConfirmed = task.confirmed !== 0;
    const lastWeekClass = isConfirmed ? '' : 'task-last-week';
    const lastWeekBadge = isConfirmed ? '' :
      `<span class="badge badge-last-week">Last Week</span>`;
    const keepBtn = (!isConfirmed && isPartner) ?
      `<button class="task-keep-btn" data-task-id="${task.id}" title="Confirm task for this week">Keep</button>` : '';

    // Partner initials badge
    const partnerHtml = this._renderPartnerBadge(task, isPartner);

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
    let priorityInlineStyle = priorityCursor;
    if (pClass === 'priority-custom' && task.priority_label) {
      const cpLabel = task.priority_label.replace(/^cp:/, '');
      const cp = (AppState.get('customPriorities') || []).find(p => p.label === cpLabel);
      if (cp) {
        priorityInlineStyle += `color:${cp.color};background:${cp.color}18;`;
      }
    } else if (pClass === 'priority-numeric') {
      priorityInlineStyle += this._numericPriorityStyle(priority);
    }
    const priorityBadge = `<span class="task-priority-pill ${pClass}" data-task-id="${task.id}" style="${priorityInlineStyle}">${pLabel}</span>`;

    // Due date display (click opens calendar picker)
    const dueCursor = isPartner ? 'cursor:pointer;' : '';
    const dueHtml = dueDisplay
      ? `<span class="task-due-label ${dueColor}" data-task-id="${task.id}" style="${dueCursor}">${this._escapeHtml(dueDisplay)}</span>`
      : (isPartner ? `<span class="task-due-label due-empty" data-task-id="${task.id}" style="${dueCursor}">Due</span>` : '');

    return `
      <div class="task-card ${completedClass} ${lastWeekClass} ${isPartner ? 'task-card-draggable' : ''}" data-task-id="${task.id}">
        <div class="task-card-main">
          ${priorityBadge}
          <div class="task-title">${this._escapeHtml(task.title)}</div>
          ${lastWeekBadge}
          ${keepBtn}
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

    // â”€â”€ Notes: click to edit, blur/enter to save â”€â”€
    container.querySelectorAll('.task-notes-input').forEach(input => {
      const taskId = input.dataset.taskId;
      let original = input.value;

      input.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });

      input.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      if (!isPartner) {
        input.readOnly = true;
      }

      input.addEventListener('blur', async () => {
        const val = input.value.trim();
        if (!val) input.value = '';
        if (val !== original) {
          await window.api.updateTask({ id: taskId, notes: val });
          original = val;
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.value = original; input.blur(); }
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
    const allTasks = AppState.get('tasks') || [];
    const staffTasks = allTasks.filter(t => t.assigned_to === task.assigned_to);
    const n = Math.max(staffTasks.length, 1);
    const customPriorities = AppState.get('customPriorities') || [];

    const items = [];

    // Number priorities 1..N
    for (let i = 1; i <= n; i++) {
      items.push({ label: String(i), value: i, type: 'priority' });
    }
    items.push({ type: 'divider' });

    // W (Wait)
    items.push({ label: 'W (Wait)', value: 'w', type: 'priority' });

    // Custom priorities
    if (customPriorities.length > 0) {
      items.push({ type: 'divider' });
      for (const cp of customPriorities) {
        items.push({ label: cp.label, value: `cp:${cp.label}`, type: 'custom', color: cp.color });
      }
    }

    items.push({ type: 'divider' });
    items.push({ label: '\u2014 Clear', value: null, type: 'clear' });

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

        if (item.value === null) {
          // Clear
          await window.api.updateTask({ id: task.id, priority: 0, priority_label: null });
        } else if (item.value === 'w') {
          await window.api.updateTask({ id: task.id, priority: -1, priority_label: null });
        } else if (typeof item.value === 'string' && item.value.startsWith('cp:')) {
          // Custom priority: store -2 in priority column, label in priority_label
          await window.api.updateTask({ id: task.id, priority: -2, priority_label: item.value });
        } else {
          await window.api.updateTask({ id: task.id, priority: item.value, priority_label: null });
        }

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
    const staffUsers = users.filter(u => u.role === 'staff' && u.active !== 0 && u.id !== task.assigned_to);
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
    const allTasks = AppState.get('tasks') || [];
    const staffTasks = allTasks.filter(t => t.assigned_to === task.assigned_to);
    const n = Math.max(staffTasks.length, 1);
    const customPriorities = AppState.get('customPriorities') || [];
    const items = [];

    for (let i = 1; i <= n; i++) {
      items.push({
        label: String(i),
        color: this._numericPriorityTone(i).color,
        action: async () => {
          await window.api.updateTask({ id: task.id, priority: i, priority_label: null });
          AppState.refresh();
        }
      });
    }

    items.push({ divider: true });
    items.push({
      label: 'W (Wait)',
      color: 'var(--priority-w)',
      action: async () => {
        await window.api.updateTask({ id: task.id, priority: -1, priority_label: null });
        AppState.refresh();
      }
    });

    if (customPriorities.length > 0) {
      items.push({ divider: true });
      for (const cp of customPriorities) {
        items.push({
          label: cp.label,
          color: cp.color,
          action: async () => {
            await window.api.updateTask({ id: task.id, priority: -2, priority_label: `cp:${cp.label}` });
            AppState.refresh();
          }
        });
      }
    }

    items.push({ divider: true });
    items.push({
      label: '— Clear',
      action: async () => {
        await window.api.updateTask({ id: task.id, priority: 0, priority_label: null });
        AppState.refresh();
      }
    });

    return items;
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
    return String(p).toUpperCase();
  },

  _priorityClass(priority, isSet, task) {
    if (!isSet || priority === 0 || priority === null || priority === undefined) return 'priority-unset';
    const p = String(priority);
    if (typeof priority === 'number' && priority >= 1) return 'priority-numeric';
    if (p === '-1') return 'priority-w';
    if (p === '-2' && task?.priority_label) return 'priority-custom';
    return 'priority-unset';
  },

  _numericPriorityTone(priority) {
    if (priority <= 1) return { color: 'var(--priority-1)', background: 'var(--priority-bg-1)' };
    if (priority === 2) return { color: 'var(--priority-2)', background: 'var(--priority-bg-2)' };
    if (priority === 3) return { color: 'var(--priority-3)', background: 'var(--priority-bg-3)' };
    return { color: 'var(--priority-4)', background: 'var(--priority-bg-4)' };
  },

  _numericPriorityStyle(priority) {
    const tone = this._numericPriorityTone(priority);
    return `color:${tone.color};background:${tone.background};`;
  },

  _formatDueDisplay(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;

    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const today = new Date();
    today.setHours(0,0,0,0);

    // Show weekday names for dates in the current Sunday-Saturday week.
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek); // Sunday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Saturday

    if (date >= weekStart && date <= weekEnd) {
      // This week: show day name
      const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      return dayNames[date.getDay()];
    }

    // Beyond this week: show M/D/YYYY
    return `${date.getMonth()+1}/${date.getDate()}/${date.getFullYear()}`;
  },

  _parseDueInput(val) {
    if (!val) return null;
    const today = new Date();
    today.setHours(0,0,0,0);
    const lv = val.toLowerCase().trim();

    // Day names
    const dayMap = { 'sun':0, 'sunday':0, 'mon':1, 'monday':1, 'tue':2, 'tuesday':2, 'wed':3, 'wednesday':3, 'thu':4, 'thursday':4, 'fri':5, 'friday':5, 'sat':6, 'saturday':6 };
    if (dayMap[lv] !== undefined) {
      const target = dayMap[lv];
      let diff = (target - today.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      const d = new Date(today);
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    // M/D or M/D/YYYY
    const slashMatch = val.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (slashMatch) {
      const m = parseInt(slashMatch[1]);
      const d = parseInt(slashMatch[2]);
      let y = slashMatch[3] ? parseInt(slashMatch[3]) : today.getFullYear();
      if (y < 100) y += 2000;
      return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;

    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
    }

    return null;
  },

  _dueColorClass(dateStr) {
    if (!dateStr) return 'due-empty';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return 'due-normal';
    const due = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const today = new Date();
    today.setHours(0,0,0,0);
    const days = Math.floor((due - today) / 86400000);
    if (days <= 0) return 'due-overdue';
    if (days <= 3) return 'due-soon';
    return 'due-normal';
  },

  // â”€â”€ Partner Badge on Task Card â”€â”€

  _renderPartnerBadge(task, isPartner) {
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

  _showPartnerMenu(anchor, task) {
    const users = AppState.get('users') || [];
    const partners = users.filter(u => u.role === 'partner' && u.active !== 0);

    const items = [];
    for (const p of partners) {
      const initials = this._getInitials(p.display_name);
      items.push({
        label: `${initials} â€” ${p.display_name}`,
        action: async () => {
          await window.api.updateTask({ id: task.id, partner_id: p.id });
          AppState.refresh();
        }
      });
    }
    if (task.partner_id) {
      items.push({ divider: true });
      items.push({
        label: 'Clear Partner',
        action: async () => {
          await window.api.updateTask({ id: task.id, partner_id: null });
          AppState.refresh();
        }
      });
    }

    const menu = ContextMenu.create(items);
    const rect = anchor.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = rect.left + 'px';

    requestAnimationFrame(() => {
      const menuRect = menu.getBoundingClientRect();
      if (menuRect.bottom > window.innerHeight - 8) menu.style.top = (rect.top - menuRect.height - 4) + 'px';
      if (menuRect.right > window.innerWidth - 8) menu.style.left = (window.innerWidth - menuRect.width - 8) + 'px';
    });
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
