(function () {
  function sortTasksLikeScheduling(tasks, options = {}) {
    const config = typeof options === 'function'
      ? { getPrioritySortKey: (task) => options(task?.priority) }
      : (options || {});
    const prioritySort = typeof config.getPrioritySortKey === 'function'
      ? config.getPrioritySortKey
      : (priority) => priority ?? Number.MAX_SAFE_INTEGER;
    const compareClearedPriorityTasks = typeof config.compareClearedPriorityTasks === 'function'
      ? config.compareClearedPriorityTasks
      : null;

    return [...tasks].sort((a, b) => {
      const ac = a.confirmed ?? 1;
      const bc = b.confirmed ?? 1;
      if (ac !== bc) return bc - ac;

      const ap = prioritySort(a);
      const bp = prioritySort(b);
      if (ap !== bp) return ap - bp;

      if (compareClearedPriorityTasks) {
        const clearCompare = compareClearedPriorityTasks(a, b);
        if (clearCompare !== 0) return clearCompare;
      }

      const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;

      return (a.title || '').localeCompare(b.title || '');
    });
  }

  window.MyTasksTaskOrdering = {
    sortTasksLikeScheduling,
  };
})();
