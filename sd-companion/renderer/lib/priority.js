(function attachMyTasksPriority(globalScope) {
  const PRIORITY_NONE = 0;
  const PRIORITY_WAIT = -1;
  const PRIORITY_CUSTOM = -2;
  const CUSTOM_PRIORITY_PREFIX = 'cp:';

  function buildCustomPriorityLabel(label) {
    return `${CUSTOM_PRIORITY_PREFIX}${label}`;
  }

  function getCustomPriorityLabel(priorityLabel) {
    const value = String(priorityLabel || '');
    return value.startsWith(CUSTOM_PRIORITY_PREFIX)
      ? value.slice(CUSTOM_PRIORITY_PREFIX.length)
      : value;
  }

  function isPrioritySet(priority) {
    return priority !== null && priority !== undefined && priority !== '' && priority !== PRIORITY_NONE;
  }

  function getPrioritySortKey(priority) {
    if (typeof priority === 'number' && priority >= 1) return priority;
    if (priority === PRIORITY_CUSTOM) return 50;
    if (priority === PRIORITY_NONE || priority === null || priority === undefined) return 100;
    if (priority === PRIORITY_WAIT) return 1000;
    return 150;
  }

  function parsePrioritySelectValue(value) {
    if (value === 'w') {
      return { priority: PRIORITY_WAIT, priority_label: null };
    }

    if (String(value || '').startsWith(CUSTOM_PRIORITY_PREFIX)) {
      return { priority: PRIORITY_CUSTOM, priority_label: value };
    }

    const numericPriority = parseInt(value || String(PRIORITY_NONE), 10);
    return {
      priority: Number.isFinite(numericPriority) ? numericPriority : PRIORITY_NONE,
      priority_label: null,
    };
  }

  function getPrioritySelectValue(task) {
    if (task?.priority === PRIORITY_WAIT) return 'w';
    if (task?.priority === PRIORITY_CUSTOM && task?.priority_label) return task.priority_label;
    return String(task?.priority || '');
  }

  globalScope.MyTasksPriority = {
    PRIORITY_NONE,
    PRIORITY_WAIT,
    PRIORITY_CUSTOM,
    CUSTOM_PRIORITY_PREFIX,
    buildCustomPriorityLabel,
    getCustomPriorityLabel,
    isPrioritySet,
    getPrioritySortKey,
    parsePrioritySelectValue,
    getPrioritySelectValue,
  };
})(window);
