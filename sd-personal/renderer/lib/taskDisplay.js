(function () {
  const TASK_STATUS_OPTIONS = [
    { value: 'not_started', label: 'Not started' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'complete', label: 'Complete' },
  ];

  function formatDate(dateStr) {
    if (!dateStr) return { text: '', cls: 'none', isCurrentWeek: false, isToday: false };
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((d - today) / 86400000);
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const isCurrentWeek = d >= weekStart && d <= weekEnd;
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    const text = isCurrentWeek ? weekday : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

    if (diff <= 0) return { text, cls: 'urgent', isCurrentWeek, isToday: diff === 0 };
    if (diff <= 3) return { text, cls: 'warn', isCurrentWeek, isToday: false };
    if (diff <= 14) return { text, cls: 'future', isCurrentWeek: false, isToday: false };
    return { text, cls: 'normal', isCurrentWeek: false, isToday: false };
  }

  function getTaskStatusValue(task) {
    if (!task) return 'not_started';
    if (task.completed) return 'complete';
    const status = String(task.status || '').trim();
    if (status === 'in_review') return 'in_progress';
    if (TASK_STATUS_OPTIONS.some((option) => option.value === status)) {
      return status;
    }
    return 'not_started';
  }

  function getTaskStatusLabel(task) {
    const value = getTaskStatusValue(task);
    return TASK_STATUS_OPTIONS.find((option) => option.value === value)?.label || 'Not started';
  }

  function isTaskOverdue(task) {
    if (task.completed || !task.due_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(task.due_date + 'T00:00:00') < today;
  }

  window.MyTasksTaskDisplay = {
    TASK_STATUS_OPTIONS,
    formatDate,
    getTaskStatusValue,
    getTaskStatusLabel,
    isTaskOverdue,
  };
})();
