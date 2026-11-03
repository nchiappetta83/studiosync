(function attachMyTasksPermissions(globalScope) {
  function canAddActionItems(task, context) {
    const { currentUser, canPartnerManageTask } = context;
    return Boolean(
      task &&
      (
        canPartnerManageTask(task) ||
        (currentUser?.role === 'staff' && task.assigned_to === currentUser?.id)
      )
    );
  }

  function canManageOwnSharedTask(task, context) {
    const { currentUser, canPartnerManageTask, canCurrentUserAddOwnTasks } = context;
    return Boolean(
      task &&
      (
        canPartnerManageTask(task) ||
        (canCurrentUserAddOwnTasks() && task.assigned_to === currentUser?.id)
      )
    );
  }

  function canManageProjectFolder(project, context) {
    const { isPartner, isProjectManagedByCurrentPartner, isCurrentUserAssignedToProject } = context;
    if (!project) return false;
    if (isPartner()) return isProjectManagedByCurrentPartner(project);
    return isCurrentUserAssignedToProject(project.id);
  }

  globalScope.MyTasksPermissions = {
    canAddActionItems,
    canManageOwnSharedTask,
    canManageProjectFolder,
  };
})(window);
