(function attachMyTasksTaskPayload(globalScope) {
  function buildTaskPayload(options = {}) {
    const {
      title = '',
      notes = '',
      priorityValue = '',
      dueDate = null,
      base = {},
      includePriorityLabel = true,
    } = options;

    const parsedPriority = globalScope.MyTasksPriority.parsePrioritySelectValue(priorityValue);
    const payload = {
      ...base,
      title: String(title || '').trim(),
      notes: String(notes || '').trim(),
      priority: parsedPriority.priority,
      due_date: dueDate || null,
    };

    if (includePriorityLabel) {
      payload.priority_label = parsedPriority.priority_label;
    }

    return payload;
  }

  globalScope.MyTasksTaskPayload = {
    buildTaskPayload,
  };
})(window);
