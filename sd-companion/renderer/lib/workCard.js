(function attachWorkCardUtilities(globalScope) {
  const VALID_STATUSES = new Set(['todo', 'in_progress', 'done']);

  function getWorkCardStatus(card = {}) {
    if (VALID_STATUSES.has(card.status)) return card.status;
    return card.completed ? 'done' : 'todo';
  }

  function transitionWorkCard(card = {}, action, now = new Date().toISOString()) {
    const status = getWorkCardStatus(card);
    const next = { status, paused: 0, paused_at: null, completed: status === 'done' ? 1 : 0 };
    if (action === 'start' || action === 'reopen') return { ...next, status: 'in_progress', completed: 0 };
    if (action === 'pause' && status === 'in_progress') return { ...next, status: 'in_progress', paused: 1, paused_at: now, completed: 0 };
    if (action === 'resume' && status === 'in_progress') return { ...next, status: 'in_progress', completed: 0 };
    if (action === 'stop') return { ...next, status: 'todo', completed: 0 };
    if (action === 'complete') return { ...next, status: 'done', completed: 1 };
    return next;
  }

  function moveWorkCardToStatus(card = {}, status, now = new Date().toISOString()) {
    if (status === 'todo') return transitionWorkCard(card, 'stop', now);
    if (status === 'in_progress') return transitionWorkCard(card, 'start', now);
    if (status === 'done') return transitionWorkCard(card, 'complete', now);
    return transitionWorkCard(card, 'noop', now);
  }

  function localDate(value) {
    if (!value) return null;
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    if (![year, month, day].every(Number.isFinite)) return null;
    return new Date(year, month - 1, day, 12);
  }

  function dayDiff(left, right) {
    const a = localDate(left);
    const b = right instanceof Date ? new Date(right.getFullYear(), right.getMonth(), right.getDate(), 12) : localDate(right);
    if (!a || !b) return null;
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }

  function formatDateRange(start, end) {
    const first = localDate(start || end);
    const last = localDate(end || start);
    if (!first || !last) return 'No date';
    const months = new Intl.DateTimeFormat('en-US', { month: 'short' });
    const left = `${months.format(first)} ${first.getDate()}`;
    if (first.getTime() === last.getTime()) return left;
    return first.getMonth() === last.getMonth()
      ? `${left} – ${last.getDate()}`
      : `${left} – ${months.format(last)} ${last.getDate()}`;
  }

  function getDateChip(card = {}, now = new Date()) {
    const label = formatDateRange(card.start_date, card.end_date);
    const status = getWorkCardStatus(card);
    if (!card.start_date && !card.end_date) return { label: 'Flexible', tone: 'neutral' };
    if (status === 'done') return { label, tone: 'done' };
    const due = card.end_date || card.start_date;
    const diff = dayDiff(due, now);
    if (diff === null) return { label, tone: 'neutral' };
    if (diff < 0) return { label: `${label} · ${Math.abs(diff)}d late`, tone: 'overdue' };
    if (diff === 0) return { label: `${label} · due today`, tone: 'soon' };
    if (diff === 1) return { label: `${label} · due tomorrow`, tone: 'soon' };
    return { label, tone: 'neutral' };
  }

  // Schedule progress: elapsed portion of the card's planned date range. It
  // intentionally does not track or infer staff time.
  function getScheduleProgress(card = {}, now = new Date()) {
    // Work cards always belong to a scheduling week. Use that Monday as the
    // baseline when a card has a deadline but no explicit start date, so the
    // schedule bar remains meaningful without staff entering extra dates.
    const start = localDate(card.start_date || card.week_of || card.end_date);
    const end = localDate(card.end_date || card.start_date);
    if (!start || !end) return { percent: 0, isLate: false };
    if (getWorkCardStatus(card) === 'done') return { percent: 100, isLate: false };
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const total = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const elapsed = Math.max(0, Math.round((today - start) / 86400000) + 1);
    return { percent: Math.min(100, Math.round((elapsed / total) * 100)), isLate: today > end };
  }

  function formatPlannedHours(minutes) {
    const hours = Math.max(0, Number(minutes || 0)) / 60;
    return `${Number.isInteger(hours) ? hours : Math.round(hours * 100) / 100}h`;
  }

  function getProjectWorkCardSummary(cards = []) {
    const allCards = Array.isArray(cards) ? cards : [];
    if (allCards.length === 0) {
      return { text: 'No Task Cards', tone: 'empty', activeCount: 0, plannedMinutes: 0 };
    }

    const activeCards = allCards.filter((card) => getWorkCardStatus(card) !== 'done');
    if (activeCards.length === 0) {
      return { text: 'All cards done', tone: 'done', activeCount: 0, plannedMinutes: 0 };
    }

    const plannedMinutes = activeCards.reduce((total, card) => total + Math.max(0, Number(card.planned_minutes || 0)), 0);
    const taskLabel = `${activeCards.length} Task${activeCards.length === 1 ? '' : 's'}`;
    const hoursLabel = plannedMinutes > 0 ? ` | ${formatPlannedHours(plannedMinutes)}` : '';
    return { text: `${taskLabel}${hoursLabel}`, tone: 'active', activeCount: activeCards.length, plannedMinutes };
  }

  function toIsoDate(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : localDate(value);
    if (!date || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function addDays(isoDate, amount) {
    const date = localDate(isoDate);
    if (!date) return '';
    date.setDate(date.getDate() + amount);
    return toIsoDate(date);
  }

  function isWorkingDay(isoDate) {
    const date = localDate(isoDate);
    return Boolean(date) && date.getDay() >= 1 && date.getDay() <= 5;
  }

  function getWorkingDatesInRange(startDate, endDate) {
    const start = localDate(startDate);
    const end = localDate(endDate);
    if (!start || !end) return [];
    const first = start <= end ? start : end;
    const last = start <= end ? end : start;
    const dates = [];
    const cursor = new Date(first);
    while (cursor <= last) {
      const isoDate = toIsoDate(cursor);
      if (isWorkingDay(isoDate)) dates.push(isoDate);
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  function getWeekWorkingDates(weekOf) {
    return Array.from({ length: 5 }, (_, index) => addDays(weekOf, index));
  }

  function getWorkCardDailyLoad(card = {}, weekOf) {
    if (getWorkCardStatus(card) === 'done' || !weekOf) return {};
    const start = card.start_date || card.end_date;
    const end = card.end_date || card.start_date;
    if (!start || !end) return {};
    const allWorkingDates = getWorkingDatesInRange(start, end);
    const plannedHours = Math.max(0, Number(card.planned_minutes || 0)) / 60;
    if (!allWorkingDates.length || !plannedHours) return {};
    const perDay = plannedHours / allWorkingDates.length;
    const weekDates = new Set(getWeekWorkingDates(weekOf));
    return allWorkingDates.reduce((result, date) => {
      if (weekDates.has(date)) result[date] = perDay;
      return result;
    }, {});
  }

  function getWorkCardsDailyLoad(cards = [], weekOf) {
    const totals = Object.fromEntries(getWeekWorkingDates(weekOf).map((date) => [date, 0]));
    for (const card of Array.isArray(cards) ? cards : []) {
      const dailyLoad = getWorkCardDailyLoad(card, weekOf);
      for (const [date, hours] of Object.entries(dailyLoad)) totals[date] = (totals[date] || 0) + hours;
    }
    return totals;
  }

  function getWorkCardWeeklyHours(cards = []) {
    return (Array.isArray(cards) ? cards : [])
      .filter((card) => getWorkCardStatus(card) !== 'done')
      .reduce((total, card) => total + Math.max(0, Number(card.planned_minutes || 0)) / 60, 0);
  }

  function getLoadState(hours, capacityHours) {
    const normalizedHours = Math.max(0, Number(hours || 0));
    const capacity = Math.max(0, Number(capacityHours || 0));
    if (!normalizedHours) return { key: 'none', label: 'No work', ratio: 0 };
    const ratio = capacity ? normalizedHours / capacity : 0;
    if (ratio < 0.5) return { key: 'available', label: 'Available', ratio };
    if (ratio <= 1) return { key: 'target', label: 'On target', ratio };
    return { key: 'over', label: 'Over capacity', ratio };
  }

  function getStaffLoadState(hours, projectCount, capacityHours) {
    const normalizedProjectCount = Math.max(0, Number(projectCount || 0));
    if (!normalizedProjectCount) return { key: 'none', label: 'No projects', ratio: 0 };

    const load = getLoadState(hours, capacityHours);
    if (!Number(hours || 0)) return { ...load, label: 'Unscheduled' };
    return load;
  }

  function normalizeWorkCardDates(startDate, endDate) {
    let start = String(startDate || '').trim();
    let end = String(endDate || '').trim();
    if (start && !end) end = start;
    if (end && !start) start = end;
    if (start && end && end < start) [start, end] = [end, start];
    return { start_date: start || null, end_date: end || null };
  }

  function getStaffProjectPopupCards(cards = [], staffId, projectId) {
    const statusOrder = { in_progress: 0, todo: 2, done: 3 };
    return (Array.isArray(cards) ? cards : [])
      .filter((card) => String(card.project_id) === String(projectId) && (card.assignee_ids || []).some((id) => String(id) === String(staffId)))
      .sort((left, right) => {
        const leftStatus = getWorkCardStatus(left);
        const rightStatus = getWorkCardStatus(right);
        const leftOrder = leftStatus === 'in_progress' && left.paused ? 1 : statusOrder[leftStatus] ?? 2;
        const rightOrder = rightStatus === 'in_progress' && right.paused ? 1 : statusOrder[rightStatus] ?? 2;
        return leftOrder - rightOrder || String(left.title || '').localeCompare(String(right.title || ''));
      });
  }

  globalScope.MyTasksWorkCard = { getWorkCardStatus, transitionWorkCard, moveWorkCardToStatus, getDateChip, getScheduleProgress, formatDateRange, getProjectWorkCardSummary, getWorkCardDailyLoad, getWorkCardsDailyLoad, getWorkCardWeeklyHours, getLoadState, getStaffLoadState, normalizeWorkCardDates, getStaffProjectPopupCards };
})(window);
