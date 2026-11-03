function buildActivity(task, action, actorId, details) {
  return {
    task_id: task.id,
    project_id: task.project_id || null,
    action,
    actor_id: actorId || null,
    details,
  };
}

function changedFields(before, after, payload) {
  return Object.keys(payload || {}).filter((key) => key !== 'id' && before?.[key] !== after?.[key]);
}

function queue(db, sync, type, data) {
  db.queueSyncEvent(sync.createEvent(type, data));
}

function createTaskCommand({ db, sync, actor, data }) {
  let task;
  let activity;
  db.runInTransaction(() => {
    task = db.createTask(data);
    activity = db.addTaskActivity(buildActivity(task, 'created', actor?.id, { title: task.title, assignedTo: task.assigned_to || null }));
    queue(db, sync, 'task-created', task);
    queue(db, sync, 'task-activity-added', activity);
  });
  sync.flushOutbox();
  return { task, activity };
}

function updateTaskCommand({ db, sync, actor, data, existing }) {
  let task;
  let activity = null;
  db.runInTransaction(() => {
    task = db.updateTask(data);
    const fields = changedFields(existing, task, data);
    if (fields.length > 0) {
      const action = task.completed && !existing?.completed ? 'completed' : (!task.completed && existing?.completed ? 'reopened' : 'updated');
      activity = db.addTaskActivity(buildActivity(task, action, actor?.id, {
        fields,
        before: Object.fromEntries(fields.map((key) => [key, existing?.[key] ?? null])),
        after: Object.fromEntries(fields.map((key) => [key, task?.[key] ?? null])),
      }));
    }
    queue(db, sync, 'task-updated', task);
    if (activity) queue(db, sync, 'task-activity-added', activity);
  });
  sync.flushOutbox();
  return { task, activity };
}

function deleteTaskCommand({ db, sync, actor, task }) {
  let activity;
  let tombstone;
  db.runInTransaction(() => {
    activity = db.addTaskActivity(buildActivity(task, 'deleted', actor?.id, { title: task.title || '' }));
    tombstone = db.recordTaskDeletion(task.id);
    db.deleteTask(task.id);
    queue(db, sync, 'task-deleted', {
      id: task.id,
      deleted_at: tombstone.deleted_at,
      title: task.title || '',
      assigned_to: task.assigned_to || null,
      project_id: task.project_id || null,
    });
    queue(db, sync, 'task-activity-added', activity);
  });
  sync.flushOutbox();
  return { activity };
}

module.exports = { createTaskCommand, updateTaskCommand, deleteTaskCommand };
