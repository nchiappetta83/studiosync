function isPartner(actor) {
  return Boolean(actor && (actor.role === 'partner' || actor.is_admin === 1));
}

function canMutateTask(actor, task) {
  return Boolean(isPartner(actor) || (actor && task && (task.assigned_to === actor.id || task.created_by === actor.id)));
}

function canCreateTask(actor, data = {}) {
  if (!actor) return false;

  // Adding an existing project to one's own MyTasks list is controlled by
  // the explicit Dashboard Staff Management setting for every role.
  if (data.assigned_to === actor.id) {
    return actor.can_self_assign === 1 || actor.can_self_assign === true;
  }

  // Scheduling admins and partners retain their separate ability to assign
  // projects to other people during planning.
  return isPartner(actor);
}

function canMutateSubtask(actor, subtask, getTaskById) {
  return canMutateTask(actor, subtask && getTaskById(subtask.task_id));
}

module.exports = { isPartner, canMutateTask, canCreateTask, canMutateSubtask };
