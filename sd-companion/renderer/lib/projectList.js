(function attachMyTasksProjectList(globalScope) {
  function startOfLocalDay(value = new Date()) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getProjectListDueChip(task, now = new Date()) {
    if (task?.completed) return { label: '✓ Done', tone: 'done', title: 'Project complete' };
    const dueDate = parseDate(task?.due_date);
    if (!dueDate) return null;

    const today = startOfLocalDay(now);
    const diff = Math.round((startOfLocalDay(dueDate) - today) / 86400000);
    const fullDate = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (diff < 0) return { label: `Overdue · ${Math.abs(diff)}d`, tone: 'overdue', title: `Due ${fullDate}` };
    if (diff === 0) return { label: 'Due today', tone: 'overdue', title: `Due ${fullDate}` };
    if (diff === 1) return { label: 'Due tomorrow', tone: 'soon', title: `Due ${fullDate}` };
    if (diff <= 3) return { label: `Due ${dueDate.toLocaleDateString('en-US', { weekday: 'short' })}`, tone: 'soon', title: `Due ${fullDate}` };
    if (diff <= 6) return { label: `Due ${dueDate.toLocaleDateString('en-US', { weekday: 'short' })}`, tone: 'neutral', title: `Due ${fullDate}` };
    return { label: `Due ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, tone: 'neutral', title: `Due ${fullDate}` };
  }

  function isDone(card) {
    return Boolean(card?.completed) || card?.status === 'done';
  }

  function formatHours(minutes) {
    const hours = Math.round((Number(minutes || 0) / 60) * 10) / 10;
    return String(hours);
  }

  function getProjectListWorkSummary(cards = []) {
    if (!cards.length) return { text: 'No Task Cards', tone: 'empty', plannedMinutes: 0 };
    const openCards = cards.filter((card) => !isDone(card));
    if (!openCards.length) return { text: 'All cards done', tone: 'done', plannedMinutes: 0 };

    const plannedMinutes = openCards.reduce((total, card) => total + Number(card.planned_minutes || 0), 0);
    const taskLabel = `${openCards.length} Task${openCards.length === 1 ? '' : 's'}`;
    const hoursLabel = plannedMinutes > 0 ? ` | ${formatHours(plannedMinutes)}h` : '';
    return { text: `${taskLabel}${hoursLabel}`, tone: 'active', plannedMinutes };
  }

  function getProjectListPriorityValue(task) {
    return typeof task?.priority === 'number' && task.priority >= 1 ? task.priority : Number.MAX_SAFE_INTEGER;
  }

  function isWaitingProject(task) {
    // Scheduled projects retain the V1 W designation as priority -1. Accept
    // the legacy text value too, so an older synced record is still kept out
    // of the active workload.
    return task?.priority === -1 || String(task?.priority || '').trim().toLowerCase() === 'w';
  }

  function getProjectListSortValue(task) {
    const due = parseDate(task?.due_date);
    return due ? due.getTime() : Number.MAX_SAFE_INTEGER;
  }

  function sortProjectListRows(tasks = [], getName = (task) => task?.title || '') {
    return [...tasks].sort((a, b) => {
      const dueDelta = getProjectListSortValue(a) - getProjectListSortValue(b);
      if (dueDelta !== 0) return dueDelta;
      const priorityDelta = getProjectListPriorityValue(a) - getProjectListPriorityValue(b);
      if (priorityDelta !== 0) return priorityDelta;
      return String(getName(a) || '').localeCompare(String(getName(b) || ''), undefined, { sensitivity: 'base' });
    });
  }

  function getProjectListGroups(tasks = [], now = new Date(), getName, sortRows = null) {
    const today = startOfLocalDay(now);
    const due = [];
    const active = [];
    const waiting = [];
    const completed = [];

    tasks.forEach((task) => {
      if (task?.completed) {
        completed.push(task);
        return;
      }
      if (isWaitingProject(task)) {
        waiting.push(task);
        return;
      }
      const dueDate = parseDate(task?.due_date);
      if (dueDate && startOfLocalDay(dueDate) <= today) due.push(task);
      else active.push(task);
    });

    const sorter = (items) => (typeof sortRows === 'function'
      ? sortRows(items)
      : sortProjectListRows(items, getName));
    return {
      due: sorter(due),
      active: sorter(active),
      waiting: sorter(waiting),
      completed: sorter(completed),
    };
  }

  function getProjectListHeaderSummary(groups = {}) {
    const dueCount = groups.due?.length || 0;
    const activeCount = groups.active?.length || 0;
    const waitingCount = groups.waiting?.length || 0;
    const completedCount = groups.completed?.length || 0;
    return {
      dueCount,
      activeCount,
      waitingCount,
      completedCount,
      text: [
        dueCount ? `${dueCount} due today or overdue` : '',
        `${activeCount} active`,
        waitingCount ? `${waitingCount} waiting` : '',
        `${completedCount} completed`,
      ].filter(Boolean).join(' · '),
    };
  }

  function getProjectListAssignees(users = [], currentUserId = null, limit = 3) {
    const all = users.filter(Boolean);
    const others = all.filter((user) => String(user.id) !== String(currentUserId));
    const visible = others.slice(0, limit);
    const hiddenCount = Math.max(0, others.length - visible.length);
    const names = all.map((user) => String(user.id) === String(currentUserId) ? 'You' : user.display_name).filter(Boolean);
    return { visible, hiddenCount, title: names.length ? `Assigned: ${names.join(', ')}` : '' };
  }

  globalScope.MyTasksProjectList = {
    getProjectListDueChip,
    getProjectListWorkSummary,
    isWaitingProject,
    sortProjectListRows,
    getProjectListGroups,
    getProjectListHeaderSummary,
    getProjectListAssignees,
  };
})(window);
