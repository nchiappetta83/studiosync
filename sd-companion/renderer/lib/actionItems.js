(function attachMyTasksActionItems(globalScope) {
  function parseAssignedUserIds(value, fallback = null) {
    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === 'string' && item.trim());
    }

    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => typeof item === 'string' && item.trim());
        }
      } catch (_) {}
    }

    return fallback ? [fallback] : [];
  }

  function getSubtaskAssigneeIds(subtask) {
    return parseAssignedUserIds(subtask?.assigned_to_ids, subtask?.assigned_to || null);
  }

  function getTaskThreadKey(task) {
    if (!task) return '';
    return task.project_id ? `project:${task.project_id}` : `task:${task.id || ''}`;
  }

  function chooseRepresentativeTaskForUser(tasks, userId, sortTasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) return null;
    if (tasks.length === 1) return tasks[0];

    const directlyAssignedTasks = tasks.filter((task) => task.assigned_to === userId);
    const candidatePool = directlyAssignedTasks.length > 0 ? directlyAssignedTasks : tasks;
    const sortedPool = typeof sortTasks === 'function' ? sortTasks(candidatePool) : candidatePool;
    return sortedPool[0] || candidatePool[0] || tasks[0];
  }

  function getVisibleRepresentativeTasks(tasks, userId, getActionItems, sortTasks) {
    const allTasks = Array.isArray(tasks) ? tasks : [];
    // A person can have more than one task on the same project.  Collapsing
    // those into one card made a task disappear based on its due-date sort
    // order, including an overdue task assigned during a Tuesday meeting.
    // Keep every directly assigned task visible; only action-item-only work
    // needs a representative parent task.
    const directTasks = allTasks.filter((task) => task?.assigned_to === userId);
    const directTaskThreadKeys = new Set(directTasks.map(getTaskThreadKey));
    const actionItemTasks = allTasks.filter((task) => {
      if (!task || !userId) return false;
      if (task.assigned_to === userId) return false;
      if (directTaskThreadKeys.has(getTaskThreadKey(task))) return false;
      return (getActionItems(task) || []).some((subtask) => getSubtaskAssigneeIds(subtask).includes(userId));
    });

    const tasksByThread = new Map();
    for (const task of actionItemTasks) {
      const key = getTaskThreadKey(task);
      if (!tasksByThread.has(key)) {
        tasksByThread.set(key, []);
      }
      tasksByThread.get(key).push(task);
    }

    const actionItemRepresentatives = Array.from(tasksByThread.values())
      .map((threadTasks) => chooseRepresentativeTaskForUser(threadTasks, userId, sortTasks))
      .filter(Boolean);

    const visibleTasks = [...directTasks, ...actionItemRepresentatives];
    return typeof sortTasks === 'function' ? sortTasks(visibleTasks) : visibleTasks;
  }

  globalScope.MyTasksActionItems = {
    parseAssignedUserIds,
    getSubtaskAssigneeIds,
    getTaskThreadKey,
    chooseRepresentativeTaskForUser,
    getVisibleRepresentativeTasks,
  };
})(window);
