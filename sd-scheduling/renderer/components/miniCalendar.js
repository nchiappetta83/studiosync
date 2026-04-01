/**
 * MiniCalendar — display-only calendar in the sidebar.
 * Shows current month with today highlighted and the current work week indicated.
 * Matches the v4 PyQt6 design.
 */

const MiniCalendar = {
  init() {
    this._el = document.getElementById('mini-calendar');
    this.render();
  },

  render() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const dayOfWeek = now.getDay(); // 0=Sun

    // Get the current week (Sun-Sat)
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - dayOfWeek);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);

    const sunStr = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const satStr = saturday.getDate().toString();

    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const weekRange = `${sunStr}\u2013${satStr}`;

    // Build calendar grid
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Figure out which dates are in the current Sun-Sat week
    const weekSunday = new Date(year, month, now.getDate() - dayOfWeek);
    const weekSaturday = new Date(year, month, now.getDate() - dayOfWeek + 6);

    // Day headers
    const dayHeaders = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    let headersHtml = dayHeaders.map(d =>
      `<div class="cal-day-header">${d}</div>`
    ).join('');

    // Day cells
    let cellsHtml = '';

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      cellsHtml += '<div class="cal-day empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const isToday = d === today;

      // Check if this date is in the current Sun-Sat week
      const dateTime = date.getTime();
      const isInWeek = dateTime >= weekSunday.getTime() && dateTime <= weekSaturday.getTime();

      let cls = 'cal-day';
      if (isToday) cls += ' today';
      else if (isInWeek) cls += ' this-week';

      cellsHtml += `<div class="${cls}">${d}</div>`;
    }

    this._el.innerHTML = `
      <div class="cal-header">
        <span class="cal-month">${monthName}</span>
        <span class="cal-week-range">${weekRange}</span>
      </div>
      <div class="cal-grid">
        ${headersHtml}
        ${cellsHtml}
      </div>
    `;
  }
};
