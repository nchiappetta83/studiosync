(function attachSchedulingPriority(globalScope) {
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

  function getTaskPrioritySelectValue(taskData, customPriorities = []) {
    if (taskData?.priority === PRIORITY_WAIT) return 'wait';
    if (taskData?.priority === PRIORITY_CUSTOM) {
      const label = getCustomPriorityLabel(taskData.priority_label);
      const customPriority = customPriorities.find((item) => item.label === label);
      return customPriority ? `custom:${customPriority.id}` : 'clear';
    }
    if (typeof taskData?.priority === 'number' && taskData.priority >= 1) {
      return String(taskData.priority);
    }
    return 'clear';
  }

  function parseTaskPrioritySelectValue(value, customPriorities = []) {
    if (!value || value === 'clear') {
      return { priority: PRIORITY_NONE, priority_label: null };
    }

    if (value === 'wait') {
      return { priority: PRIORITY_WAIT, priority_label: null };
    }

    if (value.startsWith('custom:')) {
      const id = value.slice('custom:'.length);
      const customPriority = customPriorities.find((item) => item.id === id);
      return {
        priority: customPriority ? PRIORITY_CUSTOM : PRIORITY_NONE,
        priority_label: customPriority ? buildCustomPriorityLabel(customPriority.label) : null,
      };
    }

    const numericPriority = parseInt(value, 10);
    return {
      priority: Number.isFinite(numericPriority) ? numericPriority : PRIORITY_NONE,
      priority_label: null,
    };
  }

  function getPriorityMenuToken(task, customPriorities = []) {
    const priority = task?.priority;
    if (typeof priority === 'number' && priority >= 1) return 'numbered';
    if (priority === PRIORITY_WAIT) return 'wait';
    if (priority === PRIORITY_CUSTOM) {
      const label = getCustomPriorityLabel(task?.priority_label);
      const customPriority = customPriorities.find((item) => item.label === label);
      return customPriority ? `custom:${customPriority.id}` : 'clear';
    }
    return 'clear';
  }

  function getPriorityDisplayLabel(task) {
    const priority = task?.priority;
    if (!isPrioritySet(priority)) return '\u2013';
    if (priority === PRIORITY_WAIT) return 'W';
    if (priority === PRIORITY_CUSTOM && task?.priority_label) {
      return getCustomPriorityLabel(task.priority_label);
    }
    if (priority === PRIORITY_CUSTOM) return 'Custom';
    return String(priority).toUpperCase();
  }

  globalScope.SchedulingPriority = {
    PRIORITY_NONE,
    PRIORITY_WAIT,
    PRIORITY_CUSTOM,
    CUSTOM_PRIORITY_PREFIX,
    buildCustomPriorityLabel,
    getCustomPriorityLabel,
    isPrioritySet,
    getTaskPrioritySelectValue,
    parseTaskPrioritySelectValue,
    getPriorityMenuToken,
    getPriorityDisplayLabel,
  };
})(window);
