const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

function runBrowserScript(relativePath, windowObject = {}, globals = {}) {
  const filePath = path.join(repoRoot, relativePath);
  const code = fs.readFileSync(filePath, 'utf-8');
  const sandbox = {
    window: windowObject,
    console,
    setTimeout,
    clearTimeout,
    ...globals,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: relativePath });
  return sandbox.window;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function testDashboardPriority() {
  const win = runBrowserScript('sd-scheduling/renderer/lib/priority.js');
  const priority = win.SchedulingPriority;

  assert.equal(priority.PRIORITY_NONE, 0);
  assert.equal(priority.PRIORITY_WAIT, -1);
  assert.equal(priority.PRIORITY_CUSTOM, -2);
  assert.equal(priority.buildCustomPriorityLabel('Rush'), 'cp:Rush');
  assert.equal(priority.getCustomPriorityLabel('cp:Rush'), 'Rush');
  assert.equal(priority.getPriorityDisplayLabel({ priority: -1 }), 'W');
  assert.equal(priority.getPriorityDisplayLabel({ priority: -2, priority_label: 'cp:Rush' }), 'Rush');

  const customPriorities = [{ id: 'rush', label: 'Rush' }];
  assert.deepEqual(plain(priority.parseTaskPrioritySelectValue('custom:rush', customPriorities)), {
    priority: -2,
    priority_label: 'cp:Rush',
  });
  assert.equal(priority.getPriorityMenuToken({ priority: -2, priority_label: 'cp:Rush' }, customPriorities), 'custom:rush');
}

async function testDashboardNotesEditor() {
  const patchedTasks = [];
  const win = runBrowserScript(
    'sd-scheduling/renderer/components/taskNotesEditor.js',
    {
      api: {
        updateTask: async (payload) => ({ ...payload, notes: payload.notes }),
      },
    },
    {
      AppState: {
        isPartner: () => true,
        patchTask: (task, options) => patchedTasks.push({ task, options }),
      },
    },
  );
  const editor = win.TaskNotesEditor;

  assert.equal(editor.getDisplayValue({ id: 't1', notes: 'Saved note' }), 'Saved note');
  editor._setDraft('t1', 'Draft note');
  assert.equal(editor.getDisplayValue({ id: 't1', notes: 'Saved note' }), 'Draft note');

  await editor._save('t1', '  Draft note  ');
  assert.equal(editor.getDisplayValue({ id: 't1', notes: 'Draft note' }), 'Draft note');
  assert.equal(patchedTasks.length, 1);
  assert.deepEqual(plain(patchedTasks[0]), {
    task: { id: 't1', notes: 'Draft note' },
    options: { notify: false },
  });
}

function testMyTasksHelpers() {
  const win = runBrowserScript('sd-companion/renderer/lib/priority.js');
  runBrowserScript('sd-companion/renderer/lib/html.js', win);
  runBrowserScript('sd-companion/renderer/lib/priorityPresentation.js', win);
  runBrowserScript('sd-companion/renderer/lib/taskPayload.js', win);
  runBrowserScript('sd-companion/renderer/lib/permissions.js', win);
  runBrowserScript('sd-companion/renderer/lib/richNotes.js', win);
  runBrowserScript('sd-companion/renderer/lib/projectNotes.js', win);
  runBrowserScript('sd-companion/renderer/lib/projectDisplay.js', win);
  runBrowserScript('sd-companion/renderer/lib/actionItems.js', win);
  runBrowserScript('sd-companion/renderer/lib/taskDisplay.js', win);
  runBrowserScript('sd-companion/renderer/lib/taskOrdering.js', win);
  runBrowserScript('sd-companion/renderer/lib/commentDisplay.js', win);

  assert.deepEqual(plain(win.MyTasksPriority.parsePrioritySelectValue('w')), {
    priority: -1,
    priority_label: null,
  });
  assert.deepEqual(plain(win.MyTasksPriority.parsePrioritySelectValue('cp:Rush')), {
    priority: -2,
    priority_label: 'cp:Rush',
  });
  assert.equal(win.MyTasksPriority.getPrioritySelectValue({ priority: -2, priority_label: 'cp:Rush' }), 'cp:Rush');
  assert.equal(win.MyTasksHtml.escapeHtml(`Tom & "Studio" <Lead>`), 'Tom &amp; &quot;Studio&quot; &lt;Lead&gt;');
  assert.equal(win.MyTasksPriorityPresentation.withAlpha('#336699', 0.5, 'fallback'), 'rgba(51, 102, 153, 0.5)');
  assert.equal(win.MyTasksPriorityPresentation.withAlpha('not-a-color', 0.5, 'fallback'), 'fallback');
  assert.deepEqual(plain(win.MyTasksPriorityPresentation.getPriorityPresentation(
    { priority: -2, priority_label: 'cp:Rush' },
    {
      customPriorities: [{ label: 'Rush', color: '#336699' }],
      isPrioritySet: win.MyTasksPriority.isPrioritySet,
      getCustomPriorityLabel: win.MyTasksPriority.getCustomPriorityLabel,
      PRIORITY_WAIT: win.MyTasksPriority.PRIORITY_WAIT,
      PRIORITY_CUSTOM: win.MyTasksPriority.PRIORITY_CUSTOM,
    },
  )), {
    label: 'Rush',
    className: 'pcustom',
    inlineStyle: 'color:#336699;background:rgba(51, 102, 153, 0.14);border:1px solid rgba(51, 102, 153, 0.18);',
    shortLabel: 'RU',
  });

  assert.deepEqual(plain(win.MyTasksTaskPayload.buildTaskPayload({
    title: '  File extension  ',
    notes: '  waiting on client ',
    priorityValue: 'cp:Rush',
    dueDate: '',
    base: { assigned_to: 'u1' },
  })), {
    assigned_to: 'u1',
    title: 'File extension',
    notes: 'waiting on client',
    priority: -2,
    priority_label: 'cp:Rush',
    due_date: null,
  });

  assert.equal(win.MyTasksPermissions.canManageProjectFolder(
    { id: 'p1' },
    {
      isPartner: () => false,
      isProjectManagedByCurrentPartner: () => false,
      isCurrentUserAssignedToProject: (projectId) => projectId === 'p1',
    },
  ), true);

  const links = win.MyTasksRichNotes.findTextLinks('See www.example.com, then C:\\\\Client Files\\\\Acme');
  assert.equal(links.length, 2);
  assert.equal(links[0].raw, 'www.example.com');
  assert.equal(links[0].trailing, ',');
  assert.equal(win.MyTasksRichNotes.normalizeLinkTarget('www.example.com'), 'https://www.example.com');
  assert.equal(win.MyTasksRichNotes.getPlainTextFromRichNote('plain note'), 'plain note');

  const orderedNotes = win.MyTasksProjectNotes.orderProjectNotes([
    { id: 'older', title: 'Older', updated_at: '2026-01-01T00:00:00.000Z' },
    { id: 'newer', title: 'Newer', updated_at: '2026-02-01T00:00:00.000Z' },
  ]);
  assert.deepEqual(plain(orderedNotes).map((note) => note.id), ['newer', 'older']);

  const drafts = win.MyTasksProjectNotes.buildProjectNoteDrafts([{ id: 'n1', title: '', notes: 'body' }]);
  assert.equal(drafts.get('n1')._lastSavedTitle, 'Untitled Note');
  assert.equal(drafts.get('n1')._lastSavedNotes, 'body');
  assert.equal(win.MyTasksProjectNotes.hasProjectNotePersistedChanges({
    id: 'draft-1',
    isDraft: true,
    title: 'Untitled Note',
    notes: '',
  }), false);
  assert.equal(win.MyTasksProjectNotes.hasProjectNotePersistedChanges({
    id: 'n1',
    title: 'Changed',
    notes: 'body',
    _lastSavedTitle: 'Original',
    _lastSavedNotes: 'body',
  }), true);

  assert.deepEqual(plain(win.MyTasksProjectDisplay.getProjectPartnerIds({ partner_ids: '["p1","p2",""]' })), ['p1', 'p2']);
  assert.deepEqual(plain(win.MyTasksProjectDisplay.getProjectPartnerIds({ partner_ids: 'not-json' })), []);
  assert.equal(win.MyTasksProjectDisplay.getProjectSection({ status: 'active', category: 'future' }), 'future');
  assert.equal(win.MyTasksProjectDisplay.getProjectSection({ status: 'paused', category: 'current' }), 'inactive');
  assert.equal(win.MyTasksProjectDisplay.getProjectDisplayTitle({ client: 'Acme', name: 'Launch' }), 'Acme | Launch');
  assert.equal(win.MyTasksProjectDisplay.normalizeTaskDisplayTitle(' Acme - Launch '), 'Acme | Launch');
  assert.equal(win.MyTasksProjectDisplay.getTaskDisplayTitle({ title: 'Loose — Task' }), 'Loose | Task');

  assert.deepEqual(plain(win.MyTasksActionItems.parseAssignedUserIds('["u1","u2",""]')), ['u1', 'u2']);
  assert.deepEqual(plain(win.MyTasksActionItems.parseAssignedUserIds('', 'fallback')), ['fallback']);
  assert.deepEqual(plain(win.MyTasksActionItems.getSubtaskAssigneeIds({ assigned_to_ids: '["u2"]', assigned_to: 'u1' })), ['u2']);
  assert.equal(win.MyTasksActionItems.getTaskThreadKey({ id: 't1', project_id: 'p1' }), 'project:p1');
  const representativeTasks = win.MyTasksActionItems.getVisibleRepresentativeTasks(
    [
      { id: 't1', project_id: 'p1', assigned_to: 'u1', sort_order: 2 },
      { id: 't2', project_id: 'p1', assigned_to: 'u2', sort_order: 1 },
      { id: 't3', project_id: null, assigned_to: 'u3', sort_order: 1 },
    ],
    'u2',
    (task) => task.id === 't3' ? [{ assigned_to_ids: '["u2"]' }] : [],
    (tasks) => [...tasks].sort((a, b) => a.sort_order - b.sort_order),
  );
  assert.deepEqual(plain(representativeTasks).map((task) => task.id), ['t2', 't3']);

  const orderedTasks = win.MyTasksTaskOrdering.sortTasksLikeScheduling(
    [
      { id: 'done', completed: 1, priority: 1, sort_order: 1, title: 'Done' },
      { id: 'urgent', completed: 0, priority: 1, sort_order: 2, title: 'Urgent' },
      { id: 'later', completed: 0, priority: 3, sort_order: 1, title: 'Later' },
      { id: 'unconfirmed', confirmed: 0, completed: 0, priority: 1, sort_order: 1, title: 'Unconfirmed' },
    ],
    (priority) => priority,
  );
  assert.deepEqual(plain(orderedTasks).map((task) => task.id), ['urgent', 'later', 'done', 'unconfirmed']);

  assert.deepEqual(plain(win.MyTasksTaskDisplay.TASK_STATUS_OPTIONS).map((option) => option.value), [
    'not_started',
    'in_progress',
    'complete',
  ]);
  assert.equal(win.MyTasksTaskDisplay.getTaskStatusValue({ completed: 1, status: 'not_started' }), 'complete');
  assert.equal(win.MyTasksTaskDisplay.getTaskStatusValue({ completed: 0, status: 'in_review' }), 'in_progress');
  assert.equal(win.MyTasksTaskDisplay.getTaskStatusLabel({ completed: 0, status: 'in_progress' }), 'In progress');
  assert.equal(win.MyTasksTaskDisplay.isTaskOverdue({ completed: 0, due_date: '2000-01-01' }), true);
  assert.equal(win.MyTasksTaskDisplay.isTaskOverdue({ completed: 1, due_date: '2000-01-01' }), false);
  assert.equal(win.MyTasksTaskDisplay.formatDate('').cls, 'none');

  assert.equal(win.MyTasksCommentDisplay.getCommentStateSignature([]), '0');
  assert.equal(win.MyTasksCommentDisplay.getCommentStateSignature([
    { id: 'c1', created_at: '2026-01-01T10:00:00.000Z' },
    { id: 'c2', created_at: '2026-01-02T10:00:00.000Z' },
  ]), '2:c2:2026-01-02T10:00:00.000Z');
  assert.equal(win.MyTasksCommentDisplay.isCommentScrollAtBottom({
    scrollHeight: 100,
    scrollTop: 82,
    clientHeight: 0,
  }), true);
  assert.equal(win.MyTasksCommentDisplay.formatClockTime('not-a-date'), '');
}

async function main() {
  const target = process.argv[2] || 'all';
  if (target === 'all' || target === 'scheduling') {
    testDashboardPriority();
    await testDashboardNotesEditor();
  }
  if (target === 'all' || target === 'companion') {
    testMyTasksHelpers();
  }
  console.log(`Smoke tests passed (${target}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
