(function () {
  function sortTasksLikeScheduling(tasks, getPrioritySortKey) {
    const prioritySort = typeof getPrioritySortKey === 'function'
      ? getPrioritySortKey
      : (priority) => priority ?? Number.MAX_SAFE_INTEGER;

    return [...tasks].sort((a, b) => {
      const ac = a.confirmed ?? 1;
      const bc = b.confirmed ?? 1;
      if (ac !== bc) return bc - ac;

      if (a.completed !== b.completed) return a.completed ? 1 : -1;

      const ap = prioritySort(a.priority);
      const bp = prioritySort(b.priority);
      if (ap !== bp) return ap - bp;

      const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;

      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;

      return (a.title || '').localeCompare(b.title || '');
    });
  }

  window.MyTasksTaskOrdering = {
    sortTasksLikeScheduling,
  };
})();
