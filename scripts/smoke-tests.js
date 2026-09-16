const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

function assertFilesEqual(leftPath, rightPath) {
  assert.equal(readRepoFile(leftPath), readRepoFile(rightPath), `${leftPath} and ${rightPath} should stay mirrored`);
}

function listFilesRecursive(relativeDir, extension) {
  const rootDir = path.join(repoRoot, relativeDir);
  const results = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        results.push(path.relative(repoRoot, fullPath).replace(/\\/g, '/'));
      }
    }
  }

  walk(rootDir);
  return results;
}

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

function testDashboardShellGuards() {
  const indexHtml = readRepoFile('sd-scheduling/renderer/index.html');
  assert.match(indexHtml, /Content-Security-Policy/);
  assert.match(indexHtml, /script-src 'self'/);
  assert.match(indexHtml, /lib\/confirmDialog\.js/);
  assert.match(indexHtml, /styles\/interaction-system\.css/, 'Dashboard should load the shared interaction system');

  const files = listFilesRecursive('sd-scheduling/renderer', '.js')
    .filter((filePath) => filePath !== 'sd-scheduling/renderer/lib/confirmDialog.js');
  for (const filePath of files) {
    const code = readRepoFile(filePath);
    assert.doesNotMatch(code, /(^|[^\w.])(window\.)?(confirm|alert)\s*\(/, `${filePath} should use ConfirmDialog or Toast instead of native browser dialogs`);
  }

  assertFilesEqual('sd-scheduling/main/auth.js', 'sd-companion/main/auth.js');
  assertFilesEqual('sd-scheduling/main/logger.js', 'sd-companion/main/logger.js');
}

function testDashboardLayoutGuards() {
  const toolbar = readRepoFile('sd-scheduling/renderer/components/toolbar.js');
  const state = readRepoFile('sd-scheduling/renderer/lib/state.js');
  const dialogsCss = readRepoFile('sd-scheduling/renderer/styles/dialogs.css');
  const taskPanel = readRepoFile('sd-scheduling/renderer/components/taskPanel.js');

  assert.match(toolbar, /_buildRuntimeStatusMenuItems/, 'Dashboard sync menu should expose runtime details');
  assert.match(toolbar, /context-menu-info/, 'Dashboard context menu should support non-action info rows');
  assert.match(state, /DASHBOARD_VIEW_PREFS_KEY/, 'Dashboard should persist view preferences in AppState');
  assert.match(dialogsCss, /\.context-menu-item\.context-menu-info/, 'Dashboard should style sync detail rows quietly');
  assert.match(taskPanel, /carryoverReviewMode/, 'Dashboard should keep carryover review mode wired through the task panel');
  assert.match(readRepoFile('sd-scheduling/renderer/lib/dragDrop.js'), /toast-dismiss/, 'Dashboard notifications should provide the shared dismiss action');
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
  runBrowserScript('sd-companion/renderer/lib/projectFolderLink.js', win);
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

  assert.match(win.MyTasksProjectFolderLink.renderProjectFolderCard(
    { id: 'p1', client: 'Acme', name: 'Launch', folder_link: 'C:\\\\Acme' },
    true,
    {
      editState: null,
      getProjectDisplayTitle: win.MyTasksProjectDisplay.getProjectDisplayTitle,
    },
  ), /Acme \| Launch/);
  assert.match(win.MyTasksProjectFolderLink.renderProjectFolderCard(
    { id: 'p1', folder_link: '' },
    true,
    { editState: { projectId: 'p1', value: 'https://example.com' } },
  ), /detail-folder-link-input/);

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
  assert.deepEqual(plain(orderedTasks).map((task) => task.id), ['done', 'urgent', 'later', 'unconfirmed']);

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

function testMyTasksShellGuards() {
  for (const htmlPath of [
    'sd-companion/renderer/index.html',
    'sd-companion/renderer/project-notes.html',
  ]) {
    const html = readRepoFile(htmlPath);
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /script-src 'self'/);
    assert.match(html, /lib\/confirmDialog\.js/);
    assert.match(html, /styles\/project-notes\.css/);
    assert.match(html, /styles\/interaction-system\.css/, `${htmlPath} should load the shared interaction system last`);
  }

  const files = listFilesRecursive('sd-companion/renderer', '.js')
    .filter((filePath) => filePath !== 'sd-companion/renderer/lib/confirmDialog.js');
  for (const filePath of files) {
    const code = readRepoFile(filePath);
    assert.doesNotMatch(code, /(^|[^\w.])(window\.)?(confirm|alert)\s*\(/, `${filePath} should use MyTasksConfirmDialog or another app-native UI instead of native browser dialogs`);
  }
}

function testMyTasksLayoutGuards() {
  const indexHtml = readRepoFile('sd-companion/renderer/index.html');
  const appCode = readRepoFile('sd-companion/renderer/components/app.js');
  const mainCode = readRepoFile('sd-companion/main/index.js');
  const packageJson = readRepoFile('sd-companion/package.json');
  const installerScript = readRepoFile('sd-companion/build/installer.nsh');
  const notesWindowCode = readRepoFile('sd-companion/renderer/components/projectNotesWindow.js');
  const companionCss = readRepoFile('sd-companion/renderer/styles/companion.css');
  const notesCss = readRepoFile('sd-companion/renderer/styles/project-notes.css');
  assertFilesEqual(
    'sd-scheduling/renderer/styles/interaction-system.css',
    'sd-companion/renderer/styles/interaction-system.css',
  );

  assert.doesNotMatch(indexHtml, /project-notes-overlay/, 'MyTasks should use the standalone Project Notes window only');
  assert.doesNotMatch(appCode, /function openProjectNotesDialog/, 'Legacy embedded Project Notes dialog should stay removed');
  assert.match(indexHtml, /staff-overview-search-input/, 'Staff Overview should keep its search control');
  assert.match(indexHtml, /staff-due-today-toggle/, 'Staff Overview should keep its due-today focus toggle');
  assert.match(indexHtml, /preferences-overlay/, 'MyTasks should expose a real Preferences dialog');
  assert.match(indexHtml, /lib\/toast\.js/, 'MyTasks should load the shared toast feedback layer');
  assert.match(indexHtml, /lib\/modalManager\.js/, 'MyTasks should load accessible modal behavior');
  assert.match(indexHtml, /detail-pane-mode-options/, 'Preferences should include Staff detail pane style choices');
  assert.match(indexHtml, /theme-options/, 'Preferences should include theme preview choices');
  assert.doesNotMatch(indexHtml, /id="my-task-count"/, 'My Tasks header should not show a redundant inline task count');
  assert.match(appCode, /preview-detail/, 'Preferences should render diagram-style preview details');
  assert.match(companionCss, /@keyframes previewSlideDetail/, 'Slide-open preference preview should animate its detail pane');
  assert.match(appCode, /STAFF_OVERVIEW_DUE_TODAY_KEY/, 'Staff Overview due-today preference should be persisted');
  assert.match(appCode, /PROJECT_SECTION_COLLAPSE_KEY/, 'Project section collapse preference should be persisted');
  assert.match(appCode, /STYLE_PREFERENCES_KEY/, 'Style preferences should be persisted');
  assert.match(appCode, /shouldUseSlideDetailPane/, 'Staff slide-open details mode should stay wired');
  assert.match(appCode, /TASKS\.find\(t => String\(t\.id\) === String\(taskId\)\)/, 'Task detail lookup should tolerate DOM string ids');
  assert.match(appCode, /function toggleTaskDetailPanel/, 'Task cards should toggle the detail pane when clicked again');
  assert.match(appCode, /ACTIVE_PROJECT_DETAIL_DRAFT/, 'Project details should protect unsaved changes');
  assert.match(appCode, /actionLabel:\s*'Undo'/, 'Task completion feedback should offer undo');
  assert.match(mainCode, /syncFailures:\s*sync\?\.getFailureSummary/, 'Runtime status should expose sync failures');
  assert.match(readRepoFile('sd-companion/main/sync.js'), /nextRetryAt/, 'Failed sync files should use retry backoff');
  assert.match(appCode, /toggleTaskDetailPanel\(card\.dataset\.taskId\)/, 'Task card click handlers should use detail-pane toggle behavior');
  assert.match(appCode, /function getProjectPartners/, 'Task cards should have a defined project partner helper');
  assert.match(appCode, /function renderTaskStatusControl/, 'Task detail panel should have the status control renderer');
  assert.match(mainCode, /function getAppIconPath/, 'MyTasks should resolve a packaged external app icon');
  assert.match(packageJson, /"extraResources"[\s\S]*studiosync-mytasks\.ico/, 'MyTasks installer should include the icon as an external resource');
  assert.match(installerScript, /resources\\assets\\studiosync-mytasks\.ico/, 'MyTasks desktop shortcut should point directly at the packaged icon');
  assert.match(notesWindowCode, /applyStoredThemePreference/, 'Project Notes should inherit the MyTasks theme preference');
  assert.match(appCode, /getVisibleTaskCardsForActiveTab/, 'Task-card keyboard navigation should remain wired');
  assert.match(companionCss, /#view-staff-view[\s\S]*overflow-x:\s*hidden/, 'Staff Overview should guard against horizontal scrolling');
  assert.match(companionCss, /detail-slide-mode[\s\S]*:not\(\.detail-drawer-open\)[\s\S]*\.detail-panel[\s\S]*display:\s*none/, 'Closed slide detail mode should hide the detail panel');
  assert.doesNotMatch(companionCss, /detail-slide-mode[\s\S]{0,260}\.detail-panel[\s\S]{0,260}position:\s*absolute/, 'Open slide detail mode should use the normal split-pane layout');
  assert.match(readRepoFile('sd-companion/renderer/styles/tokens.css'), /body\.theme-dark/, 'MyTasks should keep dark mode theme variables');
  assert.match(companionCss, /\.staff-section-tasks\s+\.task-card[\s\S]*min-width:\s*0/, 'Partner Staff Overview task cards should shrink safely');
  assert.doesNotMatch(companionCss, /margin-right:\s*-\d+px/, 'Negative horizontal offsets should not be used to hide overflow in MyTasks');
  assert.doesNotMatch(notesCss, /project-notes-overlay/, 'Standalone Project Notes CSS should not carry legacy overlay styles');
}

function testMyTasksLinkSecurity() {
  const { getExternalTargetAction } = require(path.join(repoRoot, 'sd-companion/main/linkSecurity'));

  assert.deepEqual(getExternalTargetAction(''), {
    success: false,
    error: 'No link provided.',
  });
  assert.deepEqual(getExternalTargetAction('https://example.com'), {
    success: true,
    action: 'openExternal',
    target: 'https://example.com',
    protocol: 'https',
  });
  assert.deepEqual(getExternalTargetAction('MAILTO:test@example.com'), {
    success: true,
    action: 'openExternal',
    target: 'MAILTO:test@example.com',
    protocol: 'mailto',
  });
  assert.deepEqual(getExternalTargetAction('javascript:alert(1)'), {
    success: false,
    error: 'Links with the "javascript:" protocol are not allowed.',
  });
  assert.equal(getExternalTargetAction('C:\\\\Client Files\\\\Acme').action, 'openPath');
  assert.equal(getExternalTargetAction('\\\\\\\\server\\\\share').action, 'openPath');
}

function testMyTasksSyncRecovery() {
  const SyncEngine = require(path.join(repoRoot, 'sd-companion/main/sync'));
  const sharedPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-sync-'));
  const eventsPath = path.join(sharedPath, 'events');
  fs.mkdirSync(eventsPath, { recursive: true });

  let appliedCount = 0;
  const db = {
    getProcessedSyncFiles: () => [],
    getLastSyncTimestamp: () => null,
    markSyncFileProcessed: () => {},
    setLastSyncTimestamp: () => {},
    applyEvent: () => { appliedCount += 1; },
  };
  const sync = new SyncEngine(db, sharedPath, 'tester');
  const filename = '2026-09-16T12-00-00-000Z_test_task-created_deadbeef.json';
  const eventPath = path.join(eventsPath, filename);

  try {
    fs.writeFileSync(eventPath, '{broken', 'utf-8');
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      sync.pull();
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(sync.getFailureSummary().count, 1);
    assert.equal(sync.getFailureSummary().totalAttempts, 1);

    sync.pull();
    assert.equal(sync.getFailureSummary().totalAttempts, 1, 'Backoff should prevent an immediate retry loop');

    fs.writeFileSync(eventPath, JSON.stringify({ type: 'task-created', data: { id: 'task-1' } }), 'utf-8');
    sync.retryFailedFiles();
    assert.equal(appliedCount, 1);
    assert.equal(sync.getFailureSummary().count, 0);
  } finally {
    fs.rmSync(sharedPath, { recursive: true, force: true });
  }
}

async function main() {
  const target = process.argv[2] || 'all';
  if (target === 'all' || target === 'scheduling') {
    testDashboardPriority();
    testDashboardShellGuards();
    testDashboardLayoutGuards();
    await testDashboardNotesEditor();
  }
  if (target === 'all' || target === 'companion') {
    testMyTasksHelpers();
    testMyTasksShellGuards();
    testMyTasksLayoutGuards();
    testMyTasksLinkSecurity();
    testMyTasksSyncRecovery();
  }
  console.log(`Smoke tests passed (${target}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
