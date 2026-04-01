/**
 * PTO Dialog — calendar-based date picker for selecting PTO dates.
 * Supports single click (toggle day), shift+click (range select).
 */

const PTODialog = {
  _selectedDates: new Set(),
  _lastClicked: null,

  async show(userId) {
    const user = AppState.getUserById(userId);
    if (!user) return;

    // Load existing PTO dates for this user
    const existingPTO = await window.api.getPTOForUser(userId);
    this._selectedDates = new Set(existingPTO?.dates || []);
    this._lastClicked = null;

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog dialog-pto">
        <div class="dialog-header">
          <div class="dialog-title">PTO for ${this._esc(user.display_name)}</div>
          <div class="dialog-subtitle">Click dates to toggle. Shift+click to select a range.</div>
        </div>
        <div class="dialog-body">
          <div class="pto-calendar-nav">
            <button class="btn btn-ghost pto-nav-prev" title="Previous month">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <span class="pto-calendar-month"></span>
            <button class="btn btn-ghost pto-nav-next" title="Next month">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
          <div class="pto-calendar-grid">
            <div class="pto-calendar-dow">Sun</div>
            <div class="pto-calendar-dow">Mon</div>
            <div class="pto-calendar-dow">Tue</div>
            <div class="pto-calendar-dow">Wed</div>
            <div class="pto-calendar-dow">Thu</div>
            <div class="pto-calendar-dow">Fri</div>
            <div class="pto-calendar-dow">Sat</div>
          </div>
          <div class="pto-calendar-days"></div>
          <div class="pto-selected-summary"></div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-ghost pto-clear-btn">Clear All</button>
          <div style="flex:1"></div>
          <button class="btn btn-ghost pto-cancel-btn">Cancel</button>
          <button class="btn btn-primary pto-save-btn">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => {
      document.removeEventListener('keydown', onEsc);
      overlay.remove();
    };

    // Start viewing the current month
    const now = new Date();
    let viewYear = now.getFullYear();
    let viewMonth = now.getMonth();

    const monthLabel = overlay.querySelector('.pto-calendar-month');
    const daysContainer = overlay.querySelector('.pto-calendar-days');
    const summary = overlay.querySelector('.pto-selected-summary');

    const renderCalendar = () => {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      monthLabel.textContent = `${monthNames[viewMonth]} ${viewYear}`;

      const firstDay = new Date(viewYear, viewMonth, 1);
      const lastDay = new Date(viewYear, viewMonth + 1, 0);
      const startDow = firstDay.getDay(); // 0=Sun

      const today = new Date();
      const todayStr = this._formatDate(today);

      let html = '';

      // Empty cells before first day
      for (let i = 0; i < startDow; i++) {
        html += '<div class="pto-day pto-day-empty"></div>';
      }

      // Days of the month
      for (let d = 1; d <= lastDay.getDate(); d++) {
        const date = new Date(viewYear, viewMonth, d);
        const dateStr = this._formatDate(date);
        const isSelected = this._selectedDates.has(dateStr);
        const isToday = dateStr === todayStr;
        const classes = ['pto-day'];
        if (isSelected) classes.push('pto-day-selected');
        if (isToday) classes.push('pto-day-today');

        html += `<div class="${classes.join(' ')}" data-date="${dateStr}">${d}</div>`;
      }

      daysContainer.innerHTML = html;
      this._updateSummary(summary);
    };

    renderCalendar();

    // Navigation
    overlay.querySelector('.pto-nav-prev').addEventListener('click', () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderCalendar();
    });

    overlay.querySelector('.pto-nav-next').addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderCalendar();
    });

    // Day click
    daysContainer.addEventListener('click', (e) => {
      const dayEl = e.target.closest('.pto-day:not(.pto-day-empty)');
      if (!dayEl) return;

      const dateStr = dayEl.dataset.date;

      if (e.shiftKey && this._lastClicked) {
        // Range select
        const start = new Date(this._lastClicked + 'T00:00:00');
        const end = new Date(dateStr + 'T00:00:00');
        const from = start < end ? start : end;
        const to = start < end ? end : start;

        const cursor = new Date(from);
        while (cursor <= to) {
          this._selectedDates.add(this._formatDate(cursor));
          cursor.setDate(cursor.getDate() + 1);
        }
      } else {
        // Toggle single date
        if (this._selectedDates.has(dateStr)) {
          this._selectedDates.delete(dateStr);
        } else {
          this._selectedDates.add(dateStr);
        }
      }

      this._lastClicked = dateStr;
      renderCalendar();
    });

    // Clear all
    overlay.querySelector('.pto-clear-btn').addEventListener('click', () => {
      this._selectedDates.clear();
      this._lastClicked = null;
      renderCalendar();
    });

    // Cancel
    overlay.querySelector('.pto-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Save
    overlay.querySelector('.pto-save-btn').addEventListener('click', async () => {
      const dates = [...this._selectedDates].sort();
      if (dates.length === 0) {
        await window.api.clearPTO(userId);
      } else {
        await window.api.setPTODates({ user_id: userId, dates });
      }
      AppState.refresh();
      close();
    });

    // Keyboard
    const onEsc = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onEsc);
  },

  _formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  _updateSummary(el) {
    const dates = [...this._selectedDates].sort();
    if (dates.length === 0) {
      el.textContent = 'No dates selected';
      return;
    }

    // Format as label
    const label = this._generateLabel(dates);
    el.textContent = `Selected: ${label} (${dates.length} day${dates.length !== 1 ? 's' : ''})`;
  },

  _generateLabel(dates) {
    if (!dates || dates.length === 0) return '';
    const sorted = [...dates].sort();
    const fmt = (d) => {
      const [y, m, day] = d.split('-');
      return `${parseInt(m)}/${parseInt(day)}`;
    };

    const ranges = [];
    let rangeStart = sorted[0];
    let rangeEnd = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(rangeEnd + 'T00:00:00');
      const curr = new Date(sorted[i] + 'T00:00:00');
      const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) {
        rangeEnd = sorted[i];
      } else {
        ranges.push([rangeStart, rangeEnd]);
        rangeStart = sorted[i];
        rangeEnd = sorted[i];
      }
    }
    ranges.push([rangeStart, rangeEnd]);

    return ranges.map(([s, e]) => s === e ? fmt(s) : `${fmt(s)}-${fmt(e)}`).join(', ');
  },

  _esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
