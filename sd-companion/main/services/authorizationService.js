function isPartner(actor) {
  return Boolean(actor && (actor.role === 'partner' || actor.is_admin === 1));
}

function canMutateTask(actor, task) {
  return Boolean(isPartner(actor) || (actor && task && (task.assigned_to === actor.id || task.created_by === actor.id)));
}

function canCreateTask(actor, data = {}) {
  return Boolean(isPartner(actor) || (actor && (data.assigned_to === actor.id || (!data.assigned_to && actor.can_self_assign === 1))));
}

function canMutateSubtask(actor, subtask, getTaskById) {
  return canMutateTask(actor, subtask && getTaskById(subtask.task_id));
}

module.exports = { isPartner, canMutateTask, canCreateTask, canMutateSubtask };
