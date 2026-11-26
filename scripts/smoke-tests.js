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

function testDashboardPaletteSearch() {
  const win = runBrowserScript('sd-scheduling/renderer/lib/paletteSearch.js');
  const search = win.PaletteSearch;

  // Tokens: case, accents and the "Client | Project" separator are ignored.
  assert.deepEqual(plain(search.tokenize('  Maple | CIVIC  ')), ['maple', 'civic']);
  assert.equal(search.normalize('José'), 'jose');

  // A prefix beats a word start, which beats a mid-word match, which beats a hint-only match.
  const tokens = search.tokenize('com');
  const prefix = search.scoreItem({ label: 'Commons' }, tokens);
  const wordStart = search.scoreItem({ label: 'Maple Commons' }, tokens);
  const midWord = search.scoreItem({ label: 'Income' }, tokens);
  const hintOnly = search.scoreItem({ label: 'Harbor', hint: 'Community project' }, tokens);
  assert.ok(prefix > wordStart && wordStart > midWord && midWord > hintOnly && hintOnly > 0, 'ranking order');

  // Every word has to match; one missing word rejects the item.
  assert.equal(search.scoreItem({ label: 'Maple Commons' }, search.tokenize('maple harbor')), -1);
  assert.ok(search.scoreItem({ label: 'Maple Civic Partners | Maple Commons' }, search.tokenize('civic commons')) > 0);

  // Ties go to the shorter, more specific label.
  assert.ok(search.scoreItem({ label: 'Add' }, search.tokenize('add')) > search.scoreItem({ label: 'Add Task' }, search.tokenize('add')));

  // Highlight ranges are merged and cover only the matching text.
  assert.deepEqual(plain(search.highlightRanges('Maple Commons', search.tokenize('ma com'))), [[0, 2], [6, 9]]);
  assert.deepEqual(plain(search.highlightRanges('Maple', search.tokenize('ap pl'))), [[1, 4]]);

  // filter(): group order, per-group limits, and the groups shown for an empty query.
  const items = [
    { group: 'Tasks', label: 'Plan review' },
    { group: 'Tasks', label: 'Plan kickoff' },
    { group: 'Tasks', label: 'Plan budget' },
    { group: 'People', label: 'Planner Pat' },
    { group: 'Actions', label: 'Plan the week' },
  ];
  const options = { groupOrder: ['Actions', 'People', 'Projects', 'Tasks'], limits: { Tasks: 2 }, emptyGroups: ['Actions', 'People'] };
  const results = search.filter(items, 'plan', options);
  assert.deepEqual(plain(results.map((r) => r.item.group)), ['Actions', 'People', 'Tasks', 'Tasks'], 'groups ordered and limited');
  assert.deepEqual(plain(search.filter(items, '', options).map((r) => r.item.group)), ['Actions', 'People'], 'empty query shows only the short groups');
  assert.equal(search.filter(items, 'zzz', options).length, 0);
  assert.deepEqual(plain(results[0].ranges), [[0, 4]]);
}

function testDashboardShellGuards() {
  const indexHtml = readRepoFile('sd-scheduling/renderer/index.html');
  const installerScript = readRepoFile('sd-scheduling/build/installer.nsh');
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
  assertFilesEqual('sd-scheduling/renderer/lib/scrollSmoothing.js', 'sd-companion/renderer/lib/scrollSmoothing.js');
  // The command palette engine, its matching and its styles are shared; each app only supplies paletteItems.js.
  assertFilesEqual('sd-scheduling/renderer/lib/paletteSearch.js', 'sd-companion/renderer/lib/paletteSearch.js');
  assertFilesEqual('sd-scheduling/renderer/components/commandPalette.js', 'sd-companion/renderer/components/commandPalette.js');
  assertFilesEqual('sd-scheduling/renderer/styles/palette.css', 'sd-companion/renderer/styles/palette.css');
  for (const app of ['sd-scheduling', 'sd-companion']) {
    const html = readRepoFile(`${app}/renderer/index.html`);
    assert.match(html, /lib\/paletteSearch\.js/, `${app} should load the palette search`);
    assert.match(html, /components\/commandPalette\.js/, `${app} should load the command palette`);
    assert.match(html, /components\/paletteItems\.js/, `${app} should register its palette items`);
    assert.match(html, /styles\/palette\.css/, `${app} should load the palette styles`);
    assert.match(html, /id="btn-command-palette"/, `${app} should show the Ctrl K hint`);
  }
  assert.match(readRepoFile('sd-scheduling/renderer/index.html'), /lib\/scrollSmoothing\.js/, 'Dashboard should load the shared adaptive scroll smoother');
  assert.match(readRepoFile('sd-companion/renderer/index.html'), /lib\/scrollSmoothing\.js/, 'MyTasks should load the shared adaptive scroll smoother');
  assert.match(installerScript, /!include "getProcessInfo\.nsh"/, 'Dashboard installer should include the process-info helper used by its override');
  assert.match(installerScript, /!macro customCheckAppRunning/, 'Dashboard installer should override the path-prefix process check');
  assert.match(installerScript, /StrCpy \$IsPowerShellAvailable 1[\s\S]*!insertmacro _CHECK_APP_RUNNING/, 'Dashboard installer should use exact executable-name shutdown');
}

function testDashboardLayoutGuards() {
  const toolbar = readRepoFile('sd-scheduling/renderer/components/toolbar.js');
  const state = readRepoFile('sd-scheduling/renderer/lib/state.js');
  const dialogsCss = readRepoFile('sd-scheduling/renderer/styles/dialogs.css');
  const interactionCss = readRepoFile('sd-scheduling/renderer/styles/interaction-system.css');
  const projectCard = readRepoFile('sd-scheduling/renderer/components/projectCard.js');
  const taskPanel = readRepoFile('sd-scheduling/renderer/components/taskPanel.js');
  const taskDialog = readRepoFile('sd-scheduling/renderer/components/dialogs/taskDialog.js');
  const taskCard = readRepoFile('sd-scheduling/renderer/components/taskCard.js');
  const database = readRepoFile('sd-scheduling/main/database.js');
  const mainCode = readRepoFile('sd-scheduling/main/index.js');
  const toolbarCode = readRepoFile('sd-scheduling/renderer/components/toolbar.js');
  const indexHtml = readRepoFile('sd-scheduling/renderer/index.html');

  assert.match(toolbar, /_buildRuntimeStatusMenuItems/, 'Dashboard sync menu should expose runtime details');
  assert.match(toolbar, /context-menu-info/, 'Dashboard context menu should support non-action info rows');
  assert.match(state, /DASHBOARD_VIEW_PREFS_KEY/, 'Dashboard should persist view preferences in AppState');
  assert.match(dialogsCss, /\.context-menu-item\.context-menu-info/, 'Dashboard should style sync detail rows quietly');
  assert.match(taskPanel, /carryoverReviewMode/, 'Dashboard should keep carryover review mode wired through the task panel');
  assert.match(readRepoFile('sd-scheduling/renderer/lib/dragDrop.js'), /toast-dismiss/, 'Dashboard notifications should provide the shared dismiss action');
  assert.match(interactionCss, /box-shadow:\s*0 0 0 2px var\(--ui-focus-ring\)/, 'Text controls should use the subtle shared focus halo');
  assert.doesNotMatch(interactionCss, /input:focus-visible,[\s\S]{0,120}outline:\s*2px solid/, 'Text controls should not stack the heavy keyboard outline');
  assert.doesNotMatch(projectCard, /<input[^>]+project-card-notes/, 'Project-list notes should not be inline-editable');
  assert.match(projectCard, /project\.notes \|\| 'Note'/, 'Project-list notes should remain visible as display text');
  assert.doesNotMatch(database, /DELETE FROM tasks WHERE completed = 1/, 'Weekly rollover should retain completed tasks');
  assert.match(database, /SET category = 'last_week',[\s\S]*confirmed = 0,[\s\S]*completed = 0,[\s\S]*status = 'not_started'/, 'Weekly rollover should return every task to carryover review');
  assert.match(taskDialog, /Completed tasks return as Not Reviewed/, 'The completed-task guidance should explain publication behavior');
  assert.doesNotMatch(taskDialog, /dialog-task-partner/, 'Partners should be assigned from the project editor, not the task editor');
  assert.match(taskCard, /Lead: \$\{lead \? this\._getLastName\(lead\) : 'None'\}/, 'Dashboard task cards should display the current Project Lead by last name');
  assert.match(taskCard, /_showLeadMenu/, 'Dashboard task cards should offer a quick Project Lead selector');
  assert.doesNotMatch(mainCode, /sync\.pushEvent\('weekly-rollover'/, 'Starting rollover should remain local until publication');
  assert.match(mainCode, /sync\.pushEvent\('rollover-published'/, 'Dashboard should publish rollover changes as one batch');
  assert.match(mainCode, /publicationId/, 'Rollover publications must have a durable idempotency key');
  assert.match(mainCode, /originalTaskIds = new Set/, 'Initial publication must still track rollover-start task IDs');
  assert.match(mainCode, /originalTaskIds\.has\(task\.id\) \|\| pendingTaskIds\.has\(task\.id\)/, 'Initial publication must include tasks created while the review was in progress');
  assert.match(mainCode, /rolloverPublicationId: publicationId/, 'Legacy compatibility events must identify their authoritative publication');
  assert.match(mainCode, /publishedAt = state\.publishedAt \|\| new Date\(\)\.toISOString\(\)/, 'Rollover retries must retain their original publication timestamp');
  assert.match(mainCode, /deleted_at: publishedAt/, 'Rollover compatibility deletions must carry their original timestamp');
  assert.match(database, /recordTaskDeletion\(taskId, data\.publishedAt/, 'Dashboard rollover deletions must record a durable tombstone');
  assert.match(database, /applied_rollover_publications/, 'Dashboard must persist applied publication IDs');
  assert.doesNotMatch(database, /existing\.updated_at > baseUpdatedAt/, 'Dashboard rollover conflicts must compare parsed timestamps, not mixed-format strings');
  assert.match(database, /_getNextTaskTimestamp\(data\.id\)/, 'Dashboard local task edits must be stamped after the version they replace');
  assert.match(database, /ORDER BY julianday\(created_at\), rowid LIMIT/, 'Dashboard outbox must flush in creation order, including events created within the same second');
  assert.doesNotMatch(database, /ORDER BY datetime\(created_at\), event_id/, 'Dashboard outbox must not order same-second events by random event ID');
  assert.match(mainCode, /Publish Changes & Close[\s\S]*Close & Unlock MyTasks[\s\S]*Continue Editing/, 'Closing with unpublished work should explicitly unlock MyTasks');
  assert.match(indexHtml, /id="btn-publish-rollover"/, 'Dashboard should expose an explicit rollover publish action');
  assert.match(toolbarCode, /publishRolloverChanges/, 'The rollover publish control should call the publication API');
  assert.match(indexHtml, /id="rollover-publishing-overlay"/, 'Dashboard should show a publication progress overlay');
  assert.match(toolbarCode, /_setPublishingState\(true\)/, 'Dashboard should activate publication progress before writing shared events');
  assert.match(toolbarCode, /requestAnimationFrame/, 'Dashboard should paint publication progress before synchronous shared-drive work');
  assert.match(mainCode, /rollover-review-started/, 'Dashboard should notify MyTasks when the meeting review starts');
  assert.match(mainCode, /rollover-review-ended/, 'Dashboard should release MyTasks when an unpublished review closes');
  assert.match(mainCode, /getSharedWeeklyRolloverStatus/, 'Dashboard should recognize an already-published shared rollover before starting another one');
  assert.doesNotMatch(mainCode, /const rolloverResult = performWeeklyRollover\(\{ source: 'startup' \}\)/, 'Dashboard must not start rollover before anyone signs in');
  assert.match(readRepoFile('sd-scheduling/renderer/app.js'), /if \(!AppState\.isAdmin\(\)\) return;/, 'Only a scheduling administrator may start weekly rollover');
  assert.match(database, /CREATE TABLE IF NOT EXISTS task_activity/, 'Dashboard should persist immutable task activity');
  assert.match(mainCode, /task-activity-added/, 'Dashboard should sync task activity as append-only events');
  assert.match(projectCard, /View Activity\.\.\./, 'Dashboard project menu should expose project activity');
  assert.match(mainCode, /openProjectActivityWindow/, 'Dashboard should open project activity in a separate window');
  assert.match(readRepoFile('sd-scheduling/renderer/project-activity.html'), /PROJECT HISTORY/, 'Dashboard should provide a project activity window');
  assert.match(database, /task_tombstones/, 'Dashboard must preserve task deletion tombstones');
  assert.match(mainCode, /recordTaskDeletion\(taskId\)/, 'Dashboard task deletion must create a tombstone before removing local data');
  assert.match(mainCode, /result\.createdProjects[\s\S]{0,120}project-created/, 'Startup Excel imports must publish newly created projects');
  assert.match(mainCode, /result\.updatedProjects[\s\S]{0,120}project-updated/, 'Startup Excel imports must publish changed projects');
  assert.match(database, /getSharedTaskDueDate/, 'Dashboard should look up a matching assignment due date when creating a task');
  assert.match(mainCode, /db\.getSharedTaskDueDate\(normalizedTaskData\.project_id, normalizedTaskData\.title\)/, 'New Dashboard assignments should inherit a matching shared due date');
  assert.match(toolbarCode, /visibleStaffIds/, 'Carryover counts should match reviewable staff assignments');
  assert.match(readRepoFile('sd-scheduling/renderer/lib/confirmDialog.js'), /function choose\(/, 'Shared due dates should use the compact choice dialog');
}

function testRolloverReviewRelease() {
  const Database = require(path.join(repoRoot, 'sd-companion/main/database'));
  const DashboardSync = require(path.join(repoRoot, 'sd-scheduling/main/sync'));
  const MyTasksSync = require(path.join(repoRoot, 'sd-companion/main/sync'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studiosync-rollover-release-'));
  const db = new Database(path.join(root, 'mytasks.db'));

  try {
    db.initialize();
    db.startRolloverReview({ week: '2026-11-09', startedAt: new Date().toISOString() });
    assert.equal(db.getRolloverReviewState().active, true, 'MyTasks should lock during an active scheduling review');
    db.applyEvent({ type: 'rollover-review-ended', data: { week: '2026-11-09', endedAt: '2026-11-09T10:00:00.000Z' } });
    assert.equal(db.getRolloverReviewState().active, false, 'An unpublished Dashboard close should release the MyTasks review lock');

    db.startRolloverReview({ week: '2026-11-09', startedAt: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString() });
    assert.equal(db.getRolloverReviewState().active, false, 'A review its Dashboard abandoned must not lock MyTasks indefinitely');

    for (const SyncEngine of [DashboardSync, MyTasksSync]) {
      const sync = new SyncEngine({}, root, 'tester');
      assert.doesNotThrow(
        () => sync._validateEvent({ type: 'rollover-review-ended', data: { week: '2026-11-09', endedAt: '2026-11-09T10:00:00.000Z' } }, 'rollover-review-ended.json'),
        'Both apps should accept the rollover review release event',
      );
    }
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testReviewRegressions(appFolder) {
  const Database = require(path.join(repoRoot, appFolder, 'main/database'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studiosync-review-regressions-'));
  const db = new Database(path.join(root, 'review.db'));

  try {
    db.initialize();
    db.createUser({ id: 'senior-1', username: 'seniorone', display_name: 'Senior One', role: 'staff', is_senior_staff: 1, active: 1 });
    db.createUser({ id: 'staff-1', username: 'staffone', display_name: 'Staff One', role: 'staff', active: 1 });
    db.createProject({ id: 'project-1', client: 'Client', name: 'Project' });

    // A deleted default category must stay deleted, even after a card is saved.
    db.deleteWorkCardCategory('work-card-zoning');
    const card = db.createWorkCard({ project_id: 'project-1', week_of: '2026-11-23', title: 'Card', created_by: 'staff-1' });
    db.updateWorkCard({ id: card.id, title: 'Card renamed' });
    assert.equal(db.getWorkCardCategoryById('work-card-zoning'), undefined, 'A deleted default work-card type must not be re-seeded');

    // A lead who later loses senior status must not make synced events fail.
    db.createTask({ id: 'task-1', project_id: 'project-1', assigned_to: 'staff-1', lead_id: 'senior-1', title: 'Assignment' });
    db.updateUser({ id: 'senior-1', is_senior_staff: 0 });
    assert.doesNotThrow(
      () => db.applyEvent({ type: 'task-updated', timestamp: new Date().toISOString(), data: { ...db.getTaskById('task-1'), notes: 'edited elsewhere', lead_id: 'senior-1', updated_at: new Date(Date.now() + 1000).toISOString() } }),
      'A synced task update that keeps a demoted lead must still apply',
    );
    assert.throws(
      () => db.updateTask({ id: 'task-1', lead_id: 'staff-1' }),
      /senior staff/,
      'A local edit must still reject a lead who is not senior staff',
    );

    // A colour published by Dashboard is stored exactly as received.
    db.applyEvent({ type: 'user-created', timestamp: new Date().toISOString(), data: { id: 'synced-1', username: 'syncedone', display_name: 'Synced One', role: 'staff', avatar_color: '#112233', active: 1 } });
    assert.equal(db.getUserById('synced-1').avatar_color, '#112233', 'A synced avatar colour must not be re-derived locally');
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testDashboardSharedTaskDueDate() {
  const Database = require(path.join(repoRoot, 'sd-scheduling/main/database'));
  const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studiosync-due-date-')), 'schedule.db');
  const db = new Database(databasePath);

  try {
    db.initialize();
    db.createUser({ id: 'staff-1', username: 'staffone', display_name: 'Staff One', role: 'staff', active: 1 });
    db.createUser({ id: 'staff-2', username: 'stafftwo', display_name: 'Staff Two', role: 'staff', active: 1 });
    db.createUser({ id: 'staff-3', username: 'staffthree', display_name: 'Staff Three', role: 'staff', active: 1 });
    db.createUser({ id: 'staff-4', username: 'stafffour', display_name: 'Staff Four', role: 'staff', active: 1 });
    db.createProject({ id: 'project-1', client: 'Client', name: 'Project' });
    db.createTask({ id: 'first', project_id: 'project-1', assigned_to: 'staff-1', title: 'Review package', due_date: '2026-11-06' });
    db.createTask({ id: 'second', project_id: 'project-1', assigned_to: 'staff-2', title: '  review PACKAGE  ', due_date: '2026-11-08' });
    db.createTask({ id: 'project-label', project_id: 'project-1', assigned_to: 'staff-4', title: 'Client — Project', due_date: '2026-11-12' });
    db.createTask({ id: 'other', project_id: 'project-1', assigned_to: 'staff-3', title: 'Different task', due_date: '2026-11-10' });

    assert.equal(db.getSharedTaskDueDate('project-1', 'Review package'), '2026-11-08', 'Matching task lookups should return the latest shared due date');
    assert.equal(db.getSharedTaskDueDate('project-1', 'Client | Project'), '2026-11-12', 'Project task labels should match across Dashboard display separators');
    assert.equal(db.getSharedTaskDueDate('project-1', 'Different task'), '2026-11-10');
    assert.equal(db.getSharedTaskDueDate('project-2', 'Review package'), null, 'Due dates should not cross project boundaries');
  } finally {
    db.close();
    fs.rmSync(path.dirname(databasePath), { recursive: true, force: true });
  }
}

function testSharedWorkCards(appName) {
  const Database = require(path.join(repoRoot, `${appName}/main/database`));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `studiosync-work-cards-${appName}-`));
  const databasePath = path.join(root, 'work-cards.db');
  const db = new Database(databasePath);

  try {
    db.initialize();
    assert.equal(db.getWorkCardCategories().length, 6, `${appName} should seed the standard work-card categories`);
    assert.equal(db.getWorkCardCategories().every((category) => category.show_on_team_calendar === 1), true, `${appName} should show seeded work-card categories on the Team Calendar by default`);
    const hiddenCategory = db.updateWorkCardCategory({ id: 'work-card-planning', show_on_team_calendar: false });
    assert.equal(hiddenCategory.show_on_team_calendar, 0, `${appName} should persist the Team Calendar visibility setting for a work-card category`);
    db.createUser({ id: 'manager-1', username: 'manager', windows_username: 'manager', display_name: 'Project Manager', role: 'partner', active: 1 });
    db.createUser({ id: 'staff-1', username: 'staffone', windows_username: 'staffone', display_name: 'Staff One', role: 'staff', active: 1 });
    db.createUser({ id: 'staff-2', username: 'stafftwo', windows_username: 'stafftwo', display_name: 'Staff Two', role: 'staff', active: 1 });
    db.createUser({ id: 'lead-1', username: 'leadone', windows_username: 'leadone', display_name: 'Lead One', role: 'staff', is_senior_staff: 1, active: 1 });
    assert.equal(db.getUserById('lead-1').is_senior_staff, 1, `${appName} should persist the senior-staff project-lead designation`);
    db.createProject({ id: 'project-1', client: 'Client', name: 'Shared Project' });
    db.createTask({ id: 'assignment-1', project_id: 'project-1', assigned_to: 'staff-1', lead_id: 'lead-1', title: 'Shared Project' });
    db.createTask({ id: 'assignment-2', project_id: 'project-1', assigned_to: 'staff-2', title: 'Shared Project' });
    assert.equal(db.getTaskById('assignment-1').lead_id, 'lead-1', `${appName} should persist a Project Lead on the scheduled task`);
    assert.equal(db.getTaskById('assignment-2').lead_id, null, `${appName} should default a scheduled task to No Lead`);
    assert.throws(
      () => db.updateTask({ id: 'assignment-1', lead_id: 'staff-1' }),
      /designated senior staff/i,
      `${appName} should only permit designated senior staff as a Project Lead`,
    );

    const card = db.createWorkCard({
      id: 'work-card-1', project_id: 'project-1', week_of: '2026-11-09',
      title: 'Coordinate elevations', description: 'Share the CD review.',
      planned_minutes: 120, start_date: '2026-11-09', end_date: '2026-11-10',
      created_by: 'manager-1', updated_by: 'manager-1', assignee_ids: ['staff-1', 'staff-2'],
    });
    assert.deepEqual(card.assignee_ids, ['staff-1', 'staff-2'], `${appName} should preserve all work-card assignees`);
    assert.equal(card.category_id, 'work-card-planning', `${appName} should assign Planning to new work cards by default`);
    assert.equal(card.lead_id, null, `${appName} should leave new work cards without a card-specific lead`);
    assert.equal(card.status, 'todo', `${appName} should create work cards in To do`);
    assert.equal(db.getWorkCards({ assignee_id: 'staff-1', week_of: '2026-11-09' }).length, 1, `${appName} should give each assignee the shared card`);
    assert.equal(db.getProjectParticipants('project-1').length, 2, `${appName} should identify every staff assignment on the project`);
    assert.equal(db.setWorkCardFocus('staff-1', 'work-card-1').id, 'work-card-1', `${appName} should maintain a personal active-work selection`);
    assert.equal(db.getWorkCardFocus('staff-2'), null, `${appName} should not share one person's active-work selection`);
    assert.throws(() => db.setWorkCardFocus('manager-1', 'work-card-1'), /assignee/i, `${appName} should prevent non-assignees from activating a card`);
    const updated = db.updateWorkCard({ id: 'work-card-1', status: 'done', assignee_ids: ['staff-2'], updated_by: 'manager-1' });
    assert.equal(updated.completed, true, `${appName} should preserve a shared completion state`);
    assert.equal(db.getTaskById('assignment-1').lead_id, 'lead-1', `${appName} should retain the scheduled task's Project Lead through work-card edits`);
    assert.deepEqual(updated.assignee_ids, ['staff-2'], `${appName} should replace assignees during an update`);
    const staleCardEvent = {
      ...updated,
      status: 'todo',
      completed: 0,
      paused: 0,
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    db.applyEvent({ type: 'work-card-updated', data: staleCardEvent, timestamp: staleCardEvent.updated_at });
    assert.equal(db.getWorkCardById('work-card-1').status, 'done', `${appName} should not let an older sync event reopen a completed work card`);
    assert.equal(db.getWorkCardFocus('staff-1'), null, `${appName} should clear an active selection if that person is unassigned`);
    assert.doesNotThrow(() => db.applyEvent({
      type: 'work-card-focus-set',
      data: { user_id: 'staff-1', work_card_id: 'work-card-1', updated_at: '2026-11-09T12:00:00.000Z' },
      timestamp: '2026-11-09T12:00:00.000Z',
    }), `${appName} should accept an out-of-order focus sync event without rejecting the whole sync file`);
    assert.doesNotThrow(() => db.applyEvent({
      type: 'work-card-completed',
      data: { id: 'work-card-1', project_id: 'project-1', completed_by: 'staff-2', completed_at: '2026-11-09T12:05:00.000Z' },
      timestamp: '2026-11-09T12:05:00.000Z',
    }), `${appName} should accept work-card completion notifications without changing the completed card`);
    db.db.prepare('UPDATE work_cards SET category_id = NULL WHERE id = ?').run('work-card-1');
    db.db.prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'").run(appName === 'sd-scheduling' ? '22' : '24');
    db.close();
    db.initialize();
    assert.equal(db.getWorkCardById('work-card-1').category_id, 'work-card-planning', `${appName} should migrate existing work cards to Planning`);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testWorkCardStatusAndDateHelpers() {
  // Share Date with the script: it checks `instanceof Date`, which is false for a
  // Date created outside the vm context this helper is loaded into.
  const win = runBrowserScript('sd-companion/renderer/lib/workCard.js', {}, { Date });
  const workCards = win.MyTasksWorkCard;
  const base = { status: 'todo', completed: 0 };
  assert.deepEqual(plain(workCards.transitionWorkCard(base, 'start')), { status: 'in_progress', paused: 0, paused_at: null, completed: 0 });
  assert.deepEqual(plain(workCards.transitionWorkCard({ status: 'in_progress' }, 'pause', '2026-11-09T10:00:00.000Z')), { status: 'in_progress', paused: 1, paused_at: '2026-11-09T10:00:00.000Z', completed: 0 });
  assert.deepEqual(plain(workCards.transitionWorkCard({ status: 'in_progress', paused: 1 }, 'resume')), { status: 'in_progress', paused: 0, paused_at: null, completed: 0 });
  assert.deepEqual(plain(workCards.transitionWorkCard({ status: 'in_progress', paused: 1 }, 'stop')), { status: 'todo', paused: 0, paused_at: null, completed: 0 });
  assert.deepEqual(plain(workCards.transitionWorkCard({ status: 'in_progress' }, 'complete')), { status: 'done', paused: 0, paused_at: null, completed: 1 });
  assert.deepEqual(plain(workCards.transitionWorkCard({ status: 'done', completed: 1 }, 'reopen')), { status: 'in_progress', paused: 0, paused_at: null, completed: 0 });
  assert.deepEqual(plain(workCards.moveWorkCardToStatus({ status: 'in_progress', paused: 1 }, 'todo')), { status: 'todo', paused: 0, paused_at: null, completed: 0 }, 'Dragging to To do should clear pause state');
  assert.deepEqual(plain(workCards.moveWorkCardToStatus({ status: 'todo' }, 'in_progress')), { status: 'in_progress', paused: 0, paused_at: null, completed: 0 }, 'Dragging to In progress should start the card');
  assert.deepEqual(plain(workCards.moveWorkCardToStatus({ status: 'in_progress', paused: 1 }, 'done')), { status: 'done', paused: 0, paused_at: null, completed: 1 }, 'Dragging to Done should complete and clear pause state');
  assert.deepEqual(plain(workCards.getDateChip({ start_date: '2026-11-11', end_date: '2026-11-13', status: 'todo' }, new Date(2026, 10, 12))), { label: 'Nov 11 – 13 · due tomorrow', tone: 'soon' });
  assert.deepEqual(plain(workCards.getDateChip({ start_date: '2026-11-04', end_date: '2026-11-06', status: 'in_progress' }, new Date(2026, 10, 9))), { label: 'Nov 4 – 6 · 3d late', tone: 'overdue' });
  assert.deepEqual(plain(workCards.getDateChip({ start_date: '2026-11-29', end_date: '2026-12-02', status: 'done' }, new Date(2026, 10, 9))), { label: 'Nov 29 – Dec 2', tone: 'done' });
  assert.equal(workCards.getScheduleProgress({ start_date: '2026-11-09', end_date: '2026-11-13', status: 'in_progress' }, new Date(2026, 10, 11)).percent, 60, 'Schedule progress should use elapsed due-date range, not time tracking');
  assert.equal(workCards.getScheduleProgress({ week_of: '2026-11-09', end_date: '2026-11-13', status: 'todo' }, new Date(2026, 10, 11)).percent, 60, 'Schedule progress should remain visible for deadline-only cards');
  assert.deepEqual(plain(workCards.getProjectWorkCardSummary([])), { text: 'No Task Cards', tone: 'empty', activeCount: 0, plannedMinutes: 0 });
  assert.deepEqual(plain(workCards.getProjectWorkCardSummary([{ status: 'done', planned_minutes: 120 }])), { text: 'All cards done', tone: 'done', activeCount: 0, plannedMinutes: 0 });
  assert.deepEqual(plain(workCards.getProjectWorkCardSummary([
    { status: 'in_progress', planned_minutes: 360 },
    { status: 'in_progress', paused: 1, planned_minutes: 120 },
    { status: 'todo', planned_minutes: 240 },
    { status: 'done', planned_minutes: 480 },
  ])), { text: '3 Tasks | 12h', tone: 'active', activeCount: 3, plannedMinutes: 720 });
  assert.deepEqual(plain(workCards.getProjectWorkCardSummary([{ status: 'todo', planned_minutes: 0 }])), {
    text: '1 Task', tone: 'active', activeCount: 1, plannedMinutes: 0,
  });
  assert.deepEqual(plain(workCards.getWorkCardsDailyLoad([
    { status: 'todo', start_date: '2026-11-09', end_date: '2026-11-11', planned_minutes: 360 },
    { status: 'in_progress', paused: 1, start_date: '2026-11-10', end_date: '2026-11-11', planned_minutes: 240 },
    { status: 'done', start_date: '2026-11-09', end_date: '2026-11-13', planned_minutes: 400 },
  ], '2026-11-09')), {
    '2026-11-09': 2,
    '2026-11-10': 4,
    '2026-11-11': 4,
    '2026-11-12': 0,
    '2026-11-13': 0,
  }, 'Daily load should spread active and paused card hours across working days while excluding done cards');
  assert.equal(workCards.getWorkCardWeeklyHours([{ status: 'todo', planned_minutes: 120 }, { status: 'done', planned_minutes: 240 }, { status: 'in_progress', paused: 1, planned_minutes: 60 }]), 3, 'Weekly load should include paused cards but exclude done cards');
  assert.deepEqual(plain(workCards.getLoadState(0, 40)), { key: 'none', label: 'No work', ratio: 0 });
  assert.equal(workCards.getLoadState(19.5, 40).label, 'Available');
  assert.equal(workCards.getLoadState(20, 40).label, 'On target');
  assert.equal(workCards.getLoadState(41, 40).label, 'Over capacity');
  assert.deepEqual(plain(workCards.getStaffLoadState(0, 2, 40)), { key: 'none', label: 'Unscheduled', ratio: 0 }, 'Staff with assigned projects but no planned hours should be marked Unscheduled');
  assert.deepEqual(plain(workCards.getStaffLoadState(0, 0, 40)), { key: 'none', label: 'No projects', ratio: 0 }, 'Staff without assigned projects should be marked No projects');
  assert.deepEqual(plain(workCards.normalizeWorkCardDates('2026-11-13', '2026-11-10')), { start_date: '2026-11-10', end_date: '2026-11-13' });
  assert.deepEqual(plain(workCards.normalizeWorkCardDates('2026-11-10', '')), { start_date: '2026-11-10', end_date: '2026-11-10' });
  assert.deepEqual(plain(workCards.normalizeWorkCardDates('', '')), { start_date: null, end_date: null });
  assert.deepEqual(plain(workCards.getStaffProjectPopupCards([
    { id: 'done', project_id: 'p1', assignee_ids: ['s1'], status: 'done', title: 'Done' },
    { id: 'paused', project_id: 'p1', assignee_ids: ['s1'], status: 'in_progress', paused: 1, title: 'Paused' },
    { id: 'progress', project_id: 'p1', assignee_ids: ['s1'], status: 'in_progress', title: 'Progress' },
    { id: 'todo', project_id: 'p1', assignee_ids: ['s1'], status: 'todo', title: 'Todo' },
    { id: 'other-user', project_id: 'p1', assignee_ids: ['s2'], status: 'todo', title: 'Other user' },
    { id: 'other-project', project_id: 'p2', assignee_ids: ['s1'], status: 'todo', title: 'Other project' },
  ], 's1', 'p1')).map((card) => card.id), ['progress', 'paused', 'todo', 'done'], 'Staff popup cards should filter by person and project, then order by workflow status');
}

function testWorkCardSchemaUpgrade(appName, previousSchemaVersion) {
  const Database = require(path.join(repoRoot, `${appName}/main/database`));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `studiosync-work-card-upgrade-${appName}-`));
  const databasePath = path.join(root, 'upgrade.db');
  let db = new Database(databasePath);

  try {
    db.initialize();
    // Recreate the state of the immediately preceding V1.2 schema while
    // retaining normal existing data. The next initialize must add only the
    // V1.3 tables rather than requiring a new local cache.
    db.db.exec(`
      DROP TABLE IF EXISTS work_card_focus;
      DROP TABLE IF EXISTS work_card_assignees;
      DROP TABLE IF EXISTS work_cards;
      UPDATE meta SET value = '${previousSchemaVersion}' WHERE key = 'schema_version';
    `);
    db.close();
    db = new Database(databasePath);
    db.initialize();
    assert.deepEqual(db.getWorkCards(), [], `${appName} should add empty V1.3 work-card tables during upgrade`);
    assert.doesNotThrow(() => db.db.prepare('SELECT * FROM work_card_focus').all(), `${appName} should add personal-focus storage during upgrade`);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testDistinctAvatarColors(appName, previousSchemaVersion) {
  const Database = require(path.join(repoRoot, `${appName}/main/database`));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `studiosync-avatar-colors-${appName}-`));
  const databasePath = path.join(root, 'avatar-colors.db');
  let db = new Database(databasePath);

  try {
    db.initialize();
    db.createUser({ id: 'person-1', username: 'personone', display_name: 'Person One', role: 'staff', active: 1 });
    db.createUser({ id: 'person-2', username: 'persontwo', display_name: 'Person Two', role: 'staff', active: 1 });
    db.createUser({ id: 'person-3', username: 'personthree', display_name: 'Person Three', role: 'partner', active: 1 });
    const createdColors = db.getAllUsers().map((user) => user.avatar_color);
    assert.equal(new Set(createdColors).size, createdColors.length, `${appName} should assign a different badge color to each new person`);

    // Simulate a pre-1.3.1 office where imported users all had the same color.
    db.db.prepare("UPDATE users SET avatar_color = '#5856A6'").run();
    db.db.prepare('UPDATE meta SET value = ? WHERE key = ?').run(String(previousSchemaVersion), 'schema_version');
    db.close();
    db = new Database(databasePath);
    db.initialize();
    const migratedColors = db.getAllUsers().map((user) => user.avatar_color);
    assert.equal(new Set(migratedColors).size, migratedColors.length, `${appName} should repair duplicate legacy badge colors during migration`);

    db.updateUser({ id: 'person-2', avatar_color: migratedColors[0] });
    const updatedColors = db.getAllUsers().map((user) => user.avatar_color);
    assert.equal(new Set(updatedColors).size, updatedColors.length, `${appName} should prevent a color collision when editing a person`);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testDashboardExportGuards() {
  const ExportEngine = require(path.join(repoRoot, 'sd-scheduling/main/export'));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studiosync-export-'));
  const outputPath = path.join(outputDir, 'schedule.html');
  const db = {
    getUsers: () => [
      { id: 'staff-1', display_name: 'Staff Person', role: 'staff', avatar_color: '#3E91A5' },
      { id: 'partner-1', display_name: 'Partner Person', role: 'partner', avatar_color: '#5856A6' },
    ],
    getTasks: () => [
      { id: 'task-1', assigned_to: 'staff-1', project_id: 'project-1', priority: 1, notes: 'Staff task', confirmed: 1 },
      { id: 'task-2', assigned_to: 'partner-1', title: 'Partner-only task', priority: 2, confirmed: 1 },
    ],
    getProjects: () => [
      { id: 'project-1', client: 'Client', name: 'Project', partner_initials: 'PP' },
    ],
    getPTO: () => [],
    getBusinessRoles: () => [],
    getCustomPriorities: () => [],
  };

  try {
    new ExportEngine(db).exportHTML(outputPath, { reloadInterval: 3600 });
    const html = fs.readFileSync(outputPath, 'utf-8');

    assert.match(html, /data-staff="Staff Person"/, 'Schedule exports should include staff accounts');
    assert.doesNotMatch(html, /data-staff="Partner Person"/, 'Schedule exports should omit partner accounts');
    assert.doesNotMatch(html, /Partner-only task/, 'Schedule exports should omit tasks assigned to partners');
    assert.match(html, /class="partner-badge">PP</, 'Staff tasks should retain their partner badge');
    assert.match(html, /\.staff-section\.empty \{ display: none; \}/, 'Printed schedules should omit empty staff groups');
    assert.match(html, /<table class="print-task-table"/, 'Printed schedules should render a task table for each staff member');
    assert.match(html, /class="print-staff-heading"/, 'Printed task tables should carry staff identity into repeated headers');
    assert.match(html, /<th>Priority<\/th><th>Project<\/th><th>Due<\/th><th>Partner<\/th><th>Notes<\/th>/, 'Printed task tables should preserve the weekly schedule columns');
    assert.match(html, /\.tasks-container \{ display: none; \}/, 'Printed schedules should hide the interactive card grid');
    assert.match(html, /\.print-task-table \{ display: table;/, 'Printed schedules should reveal the table layout');
    assert.match(html, /\.print-task-table thead \{ display: table-header-group; \}/, 'Printed task tables should repeat staff and column headers after page breaks');
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
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
  runBrowserScript('sd-companion/renderer/lib/projectList.js', win);
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

  const unsetPresentation = plain(win.MyTasksPriorityPresentation.getPriorityPresentation(
    { priority: null },
    { isPrioritySet: win.MyTasksPriority.isPrioritySet },
  ));
  assert.equal(unsetPresentation.className, 'punset');
  assert.equal(unsetPresentation.isUnset, true);
  assert.equal(unsetPresentation.shortLabel, '', 'unset priority shows an empty chip, not a dash');
  assert.match(unsetPresentation.inlineStyle, /border:1px dashed #8693A3/);

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

  const projectList = win.MyTasksProjectList;
  const projectToday = new Date(2026, 10, 11);
  assert.deepEqual(plain(projectList.getProjectListDueChip({ due_date: '2026-11-09' }, projectToday)), {
    label: 'Overdue · 2d', tone: 'overdue', title: 'Due Nov 9, 2026',
  });
  assert.deepEqual(plain(projectList.getProjectListDueChip({ due_date: '2026-11-11' }, projectToday)), {
    label: 'Due today', tone: 'overdue', title: 'Due Nov 11, 2026',
  });
  assert.deepEqual(plain(projectList.getProjectListDueChip({ due_date: '2026-11-12' }, projectToday)), {
    label: 'Due tomorrow', tone: 'soon', title: 'Due Nov 12, 2026',
  });
  assert.deepEqual(plain(projectList.getProjectListDueChip({ due_date: '2026-11-13' }, projectToday)), {
    label: 'Due Fri', tone: 'soon', title: 'Due Nov 13, 2026',
  });
  assert.deepEqual(plain(projectList.getProjectListDueChip({ due_date: '2026-11-16' }, projectToday)), {
    label: 'Due Mon', tone: 'neutral', title: 'Due Nov 16, 2026',
  });
  assert.deepEqual(plain(projectList.getProjectListDueChip({ due_date: '2026-11-20' }, projectToday)), {
    label: 'Due Nov 20', tone: 'neutral', title: 'Due Nov 20, 2026',
  });
  assert.deepEqual(plain(projectList.getProjectListDueChip({ completed: 1, due_date: '2026-11-20' }, projectToday)), {
    label: '✓ Done', tone: 'done', title: 'Project complete',
  });
  assert.deepEqual(plain(projectList.getProjectListWorkSummary([])), {
    text: 'No Task Cards', tone: 'empty', plannedMinutes: 0,
  });
  assert.deepEqual(plain(projectList.getProjectListWorkSummary([
    { status: 'in_progress', planned_minutes: 300 },
    { status: 'in_progress', paused: 1, planned_minutes: 60 },
    { status: 'todo', planned_minutes: 0 },
    { status: 'done', planned_minutes: 600 },
  ])), {
    text: '3 Tasks | 6h', tone: 'active', plannedMinutes: 360,
  });
  assert.deepEqual(plain(projectList.getProjectListWorkSummary([{ status: 'todo', planned_minutes: 0 }])), {
    text: '1 Task', tone: 'active', plannedMinutes: 0,
  });
  const groupedProjects = projectList.getProjectListGroups([
    { id: 'due', title: 'Due', due_date: '2026-11-11', priority: 4 },
    { id: 'late', title: 'Late', due_date: '2026-11-10', priority: 9 },
    { id: 'soon-low', title: 'Beta', due_date: '2026-11-13', priority: 3 },
    { id: 'soon-high', title: 'Alpha', due_date: '2026-11-13', priority: 1 },
    { id: 'no-date', title: 'No date', priority: 1 },
    { id: 'wait', title: 'Waiting', due_date: '2026-11-09', priority: -1 },
    { id: 'done', title: 'Done', completed: 1, due_date: '2026-11-01' },
  ], projectToday);
  assert.deepEqual(plain(groupedProjects.due).map((project) => project.id), ['late', 'due'], 'Due-today and overdue projects should be grouped first and sorted by due date');
  assert.deepEqual(plain(groupedProjects.active).map((project) => project.id), ['soon-high', 'soon-low', 'no-date'], 'Active projects should sort by due date, priority, then name');
  assert.deepEqual(plain(groupedProjects.waiting).map((project) => project.id), ['wait'], 'Wait-priority projects should be kept out of active and due workload groups');
  assert.deepEqual(plain(groupedProjects.completed).map((project) => project.id), ['done'], 'Completed projects should have their own group');
  const priorityOrderedGroups = projectList.getProjectListGroups([
    { id: 'clear-first-date', title: 'Clear', due_date: '2026-11-12', priority: 0, confirmed: 1 },
    { id: 'numeric-later-date', title: 'Numbered', due_date: '2026-11-14', priority: 2, confirmed: 1 },
  ], projectToday, undefined, (items) => win.MyTasksTaskOrdering.sortTasksLikeScheduling(items, {
    getPrioritySortKey: (task) => task.priority || Number.MAX_SAFE_INTEGER,
  }));
  assert.deepEqual(plain(priorityOrderedGroups.active).map((project) => project.id), ['numeric-later-date', 'clear-first-date'], 'A configured scheduling priority sorter should keep numbered priorities above clear priorities regardless of due date');
  assert.deepEqual(plain(projectList.getProjectListHeaderSummary(groupedProjects)), {
    dueCount: 2, activeCount: 3, waitingCount: 1, completedCount: 1, text: '2 due today or overdue · 3 active · 1 waiting · 1 completed',
  });
  const checkboxProject = { id: 'checkbox-project', title: 'Checkbox project', due_date: '2026-11-14', completed: 0 };
  assert.equal(projectList.getProjectListGroups([checkboxProject], projectToday).active.length, 1, 'An unchecked project should remain in Active');
  checkboxProject.completed = 1;
  const movedProjectGroups = projectList.getProjectListGroups([checkboxProject], projectToday);
  assert.equal(movedProjectGroups.active.length, 0, 'Completing a project should remove it from Active');
  assert.equal(movedProjectGroups.completed.length, 1, 'Completing a project should move it into Completed');
  assert.deepEqual(plain(projectList.getProjectListAssignees([
    { id: 'me', display_name: 'Current User' },
    { id: 'u1', display_name: 'Ashwin Yadav' },
    { id: 'u2', display_name: 'Michael Caringal' },
    { id: 'u3', display_name: 'Kevin Matthew' },
    { id: 'u4', display_name: 'Andres Fajardo' },
  ], 'me')), {
    visible: [
      { id: 'u1', display_name: 'Ashwin Yadav' },
      { id: 'u2', display_name: 'Michael Caringal' },
      { id: 'u3', display_name: 'Kevin Matthew' },
    ],
    hiddenCount: 1,
    title: 'Assigned: You, Ashwin Yadav, Michael Caringal, Kevin Matthew, Andres Fajardo',
  }, 'Assigned people should hide the current user visually and summarize any overflow');

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

  const directProjectTasks = win.MyTasksActionItems.getVisibleRepresentativeTasks(
    [
      { id: 'monday', project_id: 'p1', assigned_to: 'u1', due_date: '2026-10-05', sort_order: 2 },
      { id: 'tuesday', project_id: 'p1', assigned_to: 'u1', due_date: '2026-10-06', sort_order: 1 },
    ],
    'u1',
    () => [],
    (tasks) => [...tasks].sort((a, b) => a.sort_order - b.sort_order),
  );
  assert.deepEqual(plain(directProjectTasks).map((task) => task.id), ['tuesday', 'monday'], 'Every directly assigned task must remain visible, including overdue work on the same project');

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
  const dashboardMainCode = readRepoFile('sd-scheduling/main/index.js');
  const packageJson = readRepoFile('sd-companion/package.json');
  const installerScript = readRepoFile('sd-companion/build/installer.nsh');
  const notesWindowCode = readRepoFile('sd-companion/renderer/components/projectNotesWindow.js');
  const companionCss = readRepoFile('sd-companion/renderer/styles/companion.css');
  const notesCss = readRepoFile('sd-companion/renderer/styles/project-notes.css');
  const companionDatabase = readRepoFile('sd-companion/main/database.js');
  const companionMain = readRepoFile('sd-companion/main/index.js');
  const companionSync = readRepoFile('sd-companion/main/sync.js');
  assertFilesEqual(
    'sd-scheduling/renderer/styles/interaction-system.css',
    'sd-companion/renderer/styles/interaction-system.css',
  );

  assert.doesNotMatch(indexHtml, /project-notes-overlay/, 'MyTasks should use the standalone Project Notes window only');
  assert.doesNotMatch(appCode, /function openProjectNotesDialog/, 'Legacy embedded Project Notes dialog should stay removed');
  assert.match(indexHtml, /staff-overview-search-input/, 'Staff Overview should keep its search control');
  assert.doesNotMatch(indexHtml, /staff-due-today-toggle/, 'Staff Overview should not carry a due-today toggle (a hidden saved filter once emptied the list)');
  assert.match(indexHtml, /preferences-overlay/, 'MyTasks should expose a real Preferences dialog');
  assert.match(indexHtml, /lib\/toast\.js/, 'MyTasks should load the shared toast feedback layer');
  assert.match(indexHtml, /lib\/modalManager\.js/, 'MyTasks should load accessible modal behavior');
  assert.match(indexHtml, /detail-pane-mode-options/, 'Preferences should include Staff detail pane style choices');
  assert.match(indexHtml, /theme-options/, 'Preferences should include theme preview choices');
  assert.doesNotMatch(indexHtml, /id="my-task-count"/, 'My Tasks header should not show a redundant inline task count');
  assert.match(appCode, /preview-detail/, 'Preferences should render diagram-style preview details');
  assert.match(companionCss, /@keyframes previewSlideDetail/, 'Slide-open preference preview should animate its detail pane');
  assert.match(companionCss, /scrollbar-gutter:\s*stable/, 'MyTasks scrolling surfaces should retain a stable gutter');
  assert.match(readRepoFile('sd-scheduling/renderer/styles/layout.css'), /scrollbar-gutter:\s*stable/, 'Dashboard scrolling surfaces should retain a stable gutter');
  assert.match(appCode, /function bindAdaptiveScrollSmoothing/, 'MyTasks should initialize adaptive wheel smoothing after startup');
  assert.match(readRepoFile('sd-scheduling/renderer/app.js'), /_bindAdaptiveScrollSmoothing/, 'Dashboard should initialize adaptive wheel smoothing after startup');
  assert.doesNotMatch(appCode, /STAFF_OVERVIEW_DUE_TODAY_KEY|staffOverviewDueTodayOnly/, 'Staff Overview must not apply a saved due-today filter');
  assert.match(appCode, /PROJECT_SECTION_COLLAPSE_KEY/, 'Project section collapse preference should be persisted');
  assert.match(appCode, /STYLE_PREFERENCES_KEY/, 'Style preferences should be persisted');
  assert.match(appCode, /shouldUseSlideDetailPane/, 'Staff slide-open details mode should stay wired');
  assert.match(appCode, /TASKS\.find\(t => String\(t\.id\) === String\(taskId\)\)/, 'Task detail lookup should tolerate DOM string ids');
  assert.match(appCode, /function toggleTaskDetailPanel/, 'Task cards should toggle the detail pane when clicked again');
  assert.match(appCode, /restoreTaskDetailPane[\s\S]{0,900}openProjectDetailPanel\(sharedTask\.project_id\)/, 'My Tasks startup should restore shared assignments into the project Work Cards pane');
  assert.match(appCode, /ACTIVE_PROJECT_DETAIL_DRAFT/, 'Project details should protect unsaved changes');
  assert.match(appCode, /actionLabel:\s*'Undo'/, 'Task completion feedback should offer undo');
  assert.match(mainCode, /syncFailures:\s*sync\?\.getFailureSummary/, 'Runtime status should expose sync failures');
  assert.match(readRepoFile('sd-companion/main/sync.js'), /nextRetryAt/, 'Failed sync files should use retry backoff');
  assert.match(appCode, /toggleTaskDetailPanel\(card\.dataset\.taskId\)/, 'Task card click handlers should use detail-pane toggle behavior');
  assert.match(appCode, /function getProjectPartners/, 'Task cards should have a defined project partner helper');
  assert.match(appCode, /function renderTaskStatusControl/, 'Task detail panel should have the status control renderer');
  assert.match(appCode, /data-staff-popup-add/, 'Partner Staff Overview should expose the project-specific Add Task action');
  assert.match(mainCode, /function getAppIconPath/, 'MyTasks should resolve a packaged external app icon');
  assert.match(mainCode, /function repairWindowsShortcutIdentity/, 'MyTasks should repair Windows shortcut identity metadata');
  assert.match(mainCode, /appUserModelId:\s*APP_USER_MODEL_ID/, 'MyTasks shortcuts should match the runtime AppUserModelID');
  assert.match(packageJson, /"extraResources"[\s\S]*studiosync-mytasks\.ico/, 'MyTasks installer should include the icon as an external resource');
  assert.match(installerScript, /resources\\assets\\studiosync-mytasks\.ico/, 'MyTasks desktop shortcut should point directly at the packaged icon');
  assert.match(installerScript, /WinShell::SetLnkAUMI[\s\S]*\$\{APP_ID\}/, 'MyTasks installer should associate its desktop shortcut with the app identity');
  assert.match(installerScript, /!include "getProcessInfo\.nsh"/, 'MyTasks installer should include the process-info helper used by its override');
  assert.match(installerScript, /!macro customCheckAppRunning/, 'MyTasks installer should override the path-prefix process check');
  assert.match(installerScript, /StrCpy \$IsPowerShellAvailable 1[\s\S]*!insertmacro _CHECK_APP_RUNNING/, 'MyTasks installer should use exact executable-name shutdown');
  assert.match(notesWindowCode, /applyStoredThemePreference/, 'Project Notes should inherit the MyTasks theme preference');
  assert.match(appCode, /getVisibleTaskCardsForActiveTab/, 'Task-card keyboard navigation should remain wired');
  assert.match(appCode, /function getScheduledProjectsForStaff/, 'Staff Overview should use the complete direct-assignment source rather than the personal task feed');
  assert.match(appCode, /STAFF_OVERVIEW_ASSIGNMENTS/, 'Staff Overview should maintain a dedicated assignment dataset');
  assert.match(appCode, /window\.api\.getStaffOverviewAssignments/, 'Staff Overview should load its assignments from the dedicated backend query');
  assert.match(mainCode, /get-staff-overview-assignments/, 'MyTasks should expose the dedicated Staff Overview assignment query');
  assert.match(appCode, /String\(task\?\.assigned_to \|\| ''\) !== normalizedStaffId/, 'Staff Overview should match scheduled staff ids safely across synced data types');
  assert.match(appCode, /const unfinished = projectTasks\.filter\(\(task\) => !task\.completed\)/, 'Staff Overview should retain completed projects while favoring an unfinished duplicate assignment');
  assert.match(appCode, /function getTaskIdForDetailRestore[\s\S]*?const storedProjectId = readLastViewedProjectId\(\);[\s\S]*?const storedTaskId = readLastViewedTaskId\(\);/, 'MyTasks should restore the last viewed project before an older assignment detail');
  assert.match(appCode, /button\.getAttribute\('aria-expanded'\) === 'true'/, 'Staff Overview caret should toggle from the rendered section state on its first click');
  assert.match(appCode, /setupStaffOverviewSectionToggle/, 'Staff Overview section headers should use a persistent delegated click handler after re-renders');
  assert.match(readRepoFile('sd-companion/main/sync.js'), /mergeExisting:\s*true/, 'MyTasks should reconcile an incomplete cache without discarding a richer local assignment set');
  assert.match(readRepoFile('sd-companion/main/sync.js'), /refreshSharedSnapshot\(\)/, 'MyTasks should expose a manual recovery-snapshot refresh');
  assert.match(mainCode, /const snapshotRefreshed = sync\.refreshSharedSnapshot/, 'MyTasks Force Sync should refresh a repaired Dashboard snapshot');
  assert.match(appCode, /await window\.api\.forceSync\(\);\s*await refreshExternalDataAndUI\(\);/, 'MyTasks manual sync actions should reload rendered assignment data after syncing');
  assert.match(readRepoFile('sd-scheduling/main/index.js'), /const snapshotWritten = sync\.writeSharedSnapshot\(\)/, 'Dashboard Force Sync should republish the authoritative recovery snapshot');
  assert.match(readRepoFile('sd-scheduling/renderer/components/toolbar.js'), /querySelector\('\.sync-dot'\)\?\.classList\.remove\('syncing'\)/, 'Dashboard should clear the temporary yellow syncing indicator when runtime status returns');
  assert.match(companionCss, /#view-staff-view[\s\S]*overflow-x:\s*hidden/, 'Staff Overview should guard against horizontal scrolling');
  assert.match(companionCss, /detail-slide-mode[\s\S]*:not\(\.detail-drawer-open\)[\s\S]*\.detail-panel[\s\S]*display:\s*none/, 'Closed slide detail mode should hide the detail panel');
  assert.doesNotMatch(companionCss, /detail-slide-mode[\s\S]{0,260}\.detail-panel[\s\S]{0,260}position:\s*absolute/, 'Open slide detail mode should use the normal split-pane layout');
  assert.match(readRepoFile('sd-companion/renderer/styles/tokens.css'), /body\.theme-dark/, 'MyTasks should keep dark mode theme variables');
  assert.match(companionCss, /\.staff-section-tasks\s+\.task-card[\s\S]*min-width:\s*0/, 'Partner Staff Overview task cards should shrink safely');
  assert.match(companionCss, /\.app-shell\.role-partner #view-staff-view[\s\S]*overflow-y:\s*hidden/, 'Partner Staff Overview should keep scrolling out of the outer view');
  assert.match(companionCss, /\.app-shell\.role-partner \.staff-overview[\s\S]*overflow-y:\s*auto/, 'Partner Staff Overview should own the vertical scroll');
  assert.match(companionCss, /\.app-shell\.role-partner \.staff-section-tasks[\s\S]*overflow-y:\s*visible/, 'Expanded Partner staff groups should not create nested scrollbars');
  assert.match(companionCss, /\.staff-project-work-cards-dialog\s*\{[\s\S]*?max-height:\s*84vh/, 'The Staff Overview work-card dialog should fit the narrow layout');
  assert.match(companionCss, /\.detail-pane-toggle\s*\{[\s\S]*?width:\s*18px/, 'The shared Staff and Partner detail toggle should remain narrow');
  assert.match(companionCss, /\.project-group\s*\{[\s\S]*?overflow:\s*hidden/, 'Partner project sections should own their visible frame');
  assert.match(companionCss, /\.project-group-body\s*\{[\s\S]*?scrollbar-gutter:\s*stable/, 'Partner project section scrollbars should stay inside the frame');
  assert.match(appCode, /task-not-reviewed-badge/, 'MyTasks should label unresolved rollover tasks as Not Reviewed');
  assert.match(companionCss, /\.task-card\.not-reviewed[\s\S]*opacity:\s*0\.62/, 'Not Reviewed tasks should be visually faded');
  assert.match(indexHtml, /id="rollover-review-overlay"/, 'MyTasks should display a meeting review lock');
  assert.match(appCode, /setRolloverReviewUi/, 'MyTasks should update the meeting review lock after syncing');
  const dashboardLoginHandler = dashboardMainCode.match(/ipcMain\.handle\('login',[\s\S]*?\r?\n  \}\);\r?\n\r?\n  ipcMain\.handle\('logout'/)?.[0] || '';
  const dashboardRolloverHandler = dashboardMainCode.match(/function performWeeklyRollover\([\s\S]*?\r?\n\}\r?\n\r?\nfunction releaseRolloverReviewWithoutPublishing/)?.[0] || '';
  const dashboardPublishHandler = dashboardMainCode.match(/function publishRolloverChanges\([\s\S]*?\r?\n\}\r?\n\r?\nfunction getSharedWeeklyRolloverStatus/)?.[0] || '';
  assert.doesNotMatch(dashboardLoginHandler, /acquireLock\(/, 'Signing in to Dashboard must not reserve the scheduling lock');
  assert.match(dashboardRolloverHandler, /acquireLock\(/, 'Dashboard should reserve the scheduling lock only when rollover begins');
  assert.match(dashboardPublishHandler, /releaseLock\(\)/, 'Publishing a schedule should release the Dashboard scheduling lock');
  assert.match(companionCss, /\.rollover-review-active #app-shell/, 'MyTasks should fade the active task screen during review');
  assert.match(mainCode, /get-rollover-review-state/, 'MyTasks should expose durable rollover review state to the renderer');
  assert.match(mainCode, /const isRolloverReviewActive/, 'MyTasks should enforce the review lock in the main process');
  assert.match(mainCode, /isRolloverReviewActive\(\) \|\| !canMutateTask/, 'MyTasks should reject shared task edits while review is active');
  assert.match(companionDatabase, /case 'rollover-published': return this\.applyRolloverPublication/, 'MyTasks should apply published rollover batches');
  assert.match(companionDatabase, /case 'rollover-review-started': return this\.startRolloverReview/, 'MyTasks should apply review-start events');
  assert.match(companionDatabase, /endRolloverReview\(data\.week\)/, 'MyTasks should release the review lock when the publication arrives');
  assert.doesNotMatch(companionDatabase, /applyRolloverPublication[\s\S]{0,500}performWeeklyRollover/, 'MyTasks must not run a broad rollover when it receives a publication');
  assert.match(companionDatabase, /applied_rollover_publications/, 'MyTasks must de-duplicate rollover publications');
  assert.doesNotMatch(companionDatabase, /existing\.updated_at > baseUpdatedAt/, 'MyTasks rollover conflicts must compare parsed timestamps, not mixed-format strings');
  assert.match(companionDatabase, /_getNextTaskTimestamp\(data\.id\)/, 'MyTasks local task edits must be stamped after the version they replace');
  assert.match(companionDatabase, /ORDER BY julianday\(created_at\), rowid LIMIT/, 'MyTasks outbox must flush in creation order, including events created within the same second');
  assert.doesNotMatch(companionDatabase, /ORDER BY datetime\(created_at\), event_id/, 'MyTasks outbox must not order same-second events by random event ID');
  assert.match(mainCode, /event\.type\.startsWith\('user-'\)[\s\S]{0,80}auth\.clearCache\(\)/, 'MyTasks must refresh its cached acting user when user events sync');
  assert.match(appCode, /if \(!created\) throw new Error\('Task was not created\.'\)/, 'MyTasks must not report success when the main process refuses a new task');
  assert.match(companionSync, /processedFiles\.has\(file\)[\s\S]{0,200}fs\.statSync/, 'MyTasks polling must skip already-processed event files before calling stat');
  assert.match(companionDatabase, /_applyCompatibilityEvent/, 'MyTasks must ignore legacy compatibility events after applying their publication');
  assert.match(companionDatabase, /recordTaskDeletion\(taskId, data\.publishedAt/, 'MyTasks rollover deletions must record a durable tombstone');
  assert.doesNotMatch(companionDatabase, /DELETE FROM tasks WHERE completed = 1/, 'MyTasks should retain completed tasks during rollover publication');
  assert.match(companionSync, /'rollover-published': isRolloverPublication/, 'MyTasks should validate rollover publication events');
  assert.match(companionSync, /'rollover-review-started': isRolloverReviewStart/, 'MyTasks should validate review-start events');
  assert.match(companionDatabase, /CREATE TABLE IF NOT EXISTS task_activity/, 'MyTasks should persist synced task activity');
  assert.match(readRepoFile('sd-companion/main/services/taskCommandService.js'), /task-activity-added/, 'MyTasks should queue local task activity with the task command');
  assert.match(companionDatabase, /task_tombstones/, 'MyTasks must preserve task deletion tombstones');
  assert.match(companionDatabase, /CREATE TABLE IF NOT EXISTS work_cards/, 'MyTasks V1.3 should persist shared work cards');
  assert.match(companionDatabase, /CREATE TABLE IF NOT EXISTS work_card_assignees/, 'MyTasks V1.3 should support multiple work-card assignees');
  assert.match(companionDatabase, /is_senior_staff/, 'MyTasks should persist the senior-staff project-lead designation');
  assert.match(indexHtml, /data-tab="my-week"/, 'MyTasks should expose the My Week workspace tab');
  assert.match(appCode, /tabBar\.addEventListener\('click'/, 'MyTasks workspace selectors should use a persistent tab-bar click handler');
  assert.match(appCode, /event\.target\.closest\('button\.tab\[data-tab\]'\)/, 'MyTasks workspace selector clicks should resolve the selected tab from the tab bar');
  assert.match(appCode, /function updateStaffOverviewControls\(\{ visibleStaffCount = 0, visibleProjectCount = 0 \} = \{\}\)/, 'Staff Overview controls should have defined counts during startup');
  assert.match(appCode, /updateStaffOverviewControls\(\{[\s\S]{0,220}visibleProjectCount/, 'Staff Overview should provide its counts before rendering its toolbar');
  assert.match(appCode, /staff-project-priority project-row-priority task-priority/, 'Staff Overview should render the assignment priority badge');
  assert.match(appCode, /\.staff-project-priority\.task-priority-interactive/, 'Staff Overview priority badges should open the priority menu when editable');
  assert.match(appCode, /priority-picker-menu/, 'MyTasks priority pickers should use the viewport-safe menu treatment');
  assert.match(appCode, /availableAbove/, 'MyTasks priority pickers should evaluate room above the badge');
  assert.match(appCode, /availableBelow/, 'MyTasks priority pickers should evaluate room below the badge');
  assert.match(companionCss, /\.priority-picker-menu \{[\s\S]*?overscroll-behavior:\s*contain/, 'Long MyTasks priority pickers should remain scrollable inside the viewport');
  assert.match(readRepoFile('sd-scheduling/renderer/components/taskCard.js'), /availableAbove/, 'Dashboard priority pickers should evaluate room above the badge');
  assert.match(readRepoFile('sd-scheduling/renderer/components/taskCard.js'), /availableBelow/, 'Dashboard priority pickers should evaluate room below the badge');
  assert.match(appCode, /project-row-priority task-priority/, 'My Projects should render the assignment priority rather than a generic status dot');
  assert.doesNotMatch(appCode, /PROJECT_ROW_AVATAR_COLORS/, 'Project-row avatars should use each person\'s stored color, not a repeating display palette');
  assert.match(appCode, /my-tasks-project-workspace/, 'My Projects should activate its responsive split-view layout');
  assert.match(companionCss, /my-tasks-project-workspace[\s\S]*?max-width:\s*520px/, 'The My Projects list should stop expanding after its readable maximum width');
  assert.match(companionCss, /repeat\(auto-fit, minmax\(min\(100%, 240px\), 1fr\)\)/, 'Work Cards should wrap into responsive tiles instead of staying cramped in fixed columns');
  assert.match(appCode, /options\.push\(`<option value="\$\{i\}">\$\{i\}<\/option>`\)/, 'Numbered project priorities should display as plain numbers');
  assert.match(appCode, /btn btn-primary btn-sm" type="button" data-project-add-work-card>\+ Add work card/, 'An empty Work Cards panel should keep a visible primary Add work card action');
  assert.match(appCode, /data-project-detail-tab="work-cards"/, 'Project details should default to a Work cards tab');
  assert.match(appCode, /task\.lead_id/, 'Work Cards should display the lead selected on the scheduled task');
  assert.match(appCode, /const leadLabel = `Lead: \$\{getLastName\(lead\)\}`/, 'Work Cards should use the same Lead label and last-name format as Dashboard tasks');
  assert.match(appCode, /\$\{isAssigned \? primaryAction : activityBadge\}/, 'Only a Work Card assignee should receive workflow controls');
  assert.match(appCode, /Not Started/, 'Read-only Work Cards should show a Not Started status badge');
  assert.match(appCode, /'Active'/, 'Read-only in-progress Work Cards should show an Active status badge');
  assert.match(companionMain, /isStatusOnly \? !isAssignee : !isPartner\(actor\)/, 'The main process must refuse workflow changes from non-assignees');
  assert.match(companionMain, /work-card-completed/, 'Completing a Work Card should send a dedicated Team Lead notification event');
  assert.match(companionSync, /'work-card-completed':/, 'MyTasks sync should validate Work Card completion notifications');
  assert.doesNotMatch(appCode, /name="leadId"/, 'Work Card editor should not offer a card-specific Team Lead dropdown');
  assert.match(companionDatabase, /tasks', 'lead_id'/, 'MyTasks should migrate a Project Lead field onto scheduled tasks');
  assert.match(readRepoFile('sd-scheduling\/renderer\/components\/dialogs\/taskDialog.js'), /id="dialog-task-lead"/, 'Dashboard task editing should expose Project Lead selection');
  assert.doesNotMatch(readRepoFile('sd-scheduling\/renderer\/components\/dialogs\/taskDialog.js'), /dialog-project-lead-checkbox/, 'Dashboard project editing should not expose Project Lead selection');
  assert.match(appCode, /getProjectWorkCardSummary/, 'My Projects rows should summarize their work cards');
  assert.match(appCode, /function renderProjectRowSummary\(summary, task\)/, 'Project rows should combine work-card and due-date information on one summary line');
  assert.match(appCode, /Due \$\{escapeHtml\(due\.text\)\}/, 'Project rows should display an assigned project due date beside the work-card summary');
  assert.match(appCode, /WORK_CARD_DONE_EXPANDED_PROJECT_ID/, 'Work Card Done state should remain folded until explicitly opened');
  assert.match(appCode, /data-work-card-done-toggle/, 'Completed Work Cards should expose an accessible fold toggle');
  assert.match(appCode, /project-work-card-empty-state/, 'Projects without Work Cards should render the dedicated empty state');
  assert.match(appCode, /MY_WEEK_SELECTED_START/, 'My Week should retain a navigable displayed week');
  assert.match(appCode, /my-week-previous/, 'My Week should wire previous-week navigation');
  assert.match(appCode, /my-week-today/, 'My Week should wire return-to-current-week navigation');
  assert.match(appCode, /data-my-week-focus-action/, 'The My Week Working on pill should expose status actions');
  assert.match(appCode, /getWorkCardsDailyLoad/, 'My Week should calculate daily capacity from work cards');
  assert.match(appCode, /function getTeamProjectDueEntries\(tasks = TASKS, projects = PROJECTS\)/, 'Team Calendar should aggregate due dates from the complete office project and assignment set');
  assert.match(appCode, /projectAssignees/, 'Team Calendar entries should include every staff member assigned to the project');
  assert.match(appCode, /project\.status === 'inactive'/, 'Team Calendar should omit inactive projects from the active team schedule');
  assert.match(appCode, /data-team-calendar-today/, 'Team Calendar should provide a direct return to the current month');
  assert.match(mainCode, /get-team-calendar-work-cards/, 'Team Calendar should load office-wide scheduled work cards through IPC');
  assert.match(appCode, /getTeamCalendarCardsForDate/, 'Team Calendar should place selected work cards on every date they span');
  assert.match(appCode, /renderTeamCalendarDayMarkers/, 'Team Calendar should combine project due dates and visible work cards into compact calendar markers');
  assert.match(appCode, /visibleEntries = entries\.slice\(0, 2\)/, 'Team Calendar should limit each day to two visible entries');
  assert.match(appCode, /More<\//, 'Team Calendar should summarize additional scheduled entries beneath the visible two');
  assert.match(appCode, /const updateSelectedDate = \(\) => \{[\s\S]*?team-calendar-agenda/, 'Team Calendar should update only the selected date and agenda after a day click');
  assert.match(appCode, /selectedDate = button\.dataset\.teamCalendarDay;\s*updateSelectedDate\(\);/, 'Team Calendar day selection should not rebuild the full dialog');
  assert.match(companionDatabase, /show_on_team_calendar/, 'MyTasks should retain the shared category visibility setting');
  assert.match(readRepoFile('sd-scheduling/renderer/components/dialogs/settingsDialog.js'), /Show on Team Calendar/, 'Dashboard Work Card Types should allow calendar visibility selection');
  assert.match(readRepoFile('sd-scheduling/renderer/components/dialogs/settingsDialog.js'), /settings-work-category-actions/, 'Dashboard Work Card Types should place calendar visibility with the row actions');
  assert.match(readRepoFile('sd-scheduling/renderer/components/dialogs/settingsDialog.js'), /settings-content-work-categories/, 'Dashboard Work Card Types should isolate scrolling to the category section');
  assert.match(readRepoFile('sd-scheduling/renderer/styles/dialogs.css'), /\.settings-list-actions\.settings-work-category-actions \{[\s\S]*?grid-template-rows:\s*auto auto/, 'Work Card Type actions should reserve a second row for Team Calendar');
  assert.match(readRepoFile('sd-scheduling/renderer/styles/dialogs.css'), /\.settings-list-actions\.settings-work-category-actions \.settings-work-category-calendar[\s\S]*?grid-column:\s*1 \/ -1/, 'The Team Calendar checkbox should sit beneath Edit and Delete rather than crowding the category name');
  assert.match(readRepoFile('sd-scheduling/renderer/styles/dialogs.css'), /\.settings-work-category-list \{[\s\S]*?overflow-y:\s*auto/, 'Only the Work Card Type list should scroll when there are many categories');
  assert.match(readRepoFile('sd-scheduling/renderer/styles/dialogs.css'), /\.settings-work-categories-section \.settings-add-row \{[\s\S]*?flex-shrink:\s*0/, 'The Work Card Type add controls should remain visible below the scrolling list');
  assert.match(companionCss, /\.dialog-card\.team-due-calendar-dialog \{ width: min\(980px, 75vw\); max-width: calc\(100vw - 24px\)/, 'Team Calendar should override the generic dialog cap with a comfortable three-quarter-width layout');
  assert.match(companionCss, /\.team-calendar-day \{[\s\S]*?min-height: clamp\(54px, 6vh, 66px\)/, 'Team Calendar day cells should scale with available window height to leave room for the agenda');
  assert.match(companionCss, /\.team-calendar-layout \{ display: grid; grid-template-columns: minmax\(0, 1fr\); min-height: 0/, 'Team Calendar should keep its agenda below the month at every responsive width');
  assert.match(companionCss, /\.team-calendar-agenda \{ min-width: 0; max-height: min\(320px, 36vh\);[\s\S]*?border-top/, 'Team Calendar agenda should remain a bounded, scrollable section beneath the month');
  assert.match(companionCss, /\.app-shell\.my-week-calendar-mode \.tab-bar,[\s\S]*?width:\s*clamp\(380px, 34vw, 520px\)/, 'My Week navigation should remain in the My Projects left-side rail');
  assert.match(companionCss, /\.app-shell\.staff-overview-mode \.tab-bar \{[\s\S]*?width:\s*clamp\(380px, 34vw, 520px\)/, 'Staff Overview navigation should remain in the My Projects left-side rail');
  assert.match(companionCss, /\.my-week-grid-header,[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/, 'My Week should keep all five days in an equal responsive grid');
  assert.match(appCode, /my-week-grid-scroll[\s\S]*?aria-label="Scheduled work cards"/, 'My Week should isolate scheduled-card scrolling beneath its fixed day header');
  assert.match(companionCss, /\.my-week-grid-scroll\s*\{[\s\S]*?overflow-y:\s*auto/, 'My Week cards should scroll inside the calendar body');
  assert.match(companionCss, /my-week-calendar-mode #view-my-week[\s\S]*?overflow:\s*hidden/, 'My Week should not scroll its day header with the cards');
  assert.doesNotMatch(companionCss, /\.my-week-grid-header, \.my-week-grid-body \{ min-width: 750px/, 'My Week should not reintroduce a narrow-window horizontal scroll');
  assert.match(companionCss, /@media \(max-width: 760px\)[\s\S]*?\.staff-section-header \{ flex-wrap: wrap; \}/, 'Staff Overview headers should wrap instead of clipping in narrow windows');
  assert.match(appCode, /openStaffProjectWorkCardsDialog/, 'Staff Overview project rows should open the work-card dialog');
  assert.match(appCode, /data-staff-project-row/, 'Staff Overview project rows should be keyboard-addressable controls');
  assert.match(appCode, /Please enter a title\./, 'The staff-project Add Task form should validate title input');
  assert.match(appCode, /normalizeWorkCardDates/, 'The staff-project Add Task form should normalize single and reversed dates');
  assert.match(appCode, /getStaffProjectPopupCards/, 'The popup should share its person-and-project filtering logic with row summaries');
  assert.match(appCode, /data-staff-popup-cancel/, 'The in-dialog Add Task form should support cancel without saving');
  assert.match(appCode, /returnFocus/, 'The staff-project popup should restore focus to its launching project row');
  assert.match(appCode, /event\.key === 'Escape'/, 'The staff-project popup should close with Escape');
  assert.match(indexHtml, /id="office-capacity-daily"/, 'Preferences should expose the office daily capacity setting');
  assert.match(mainCode, /get-office-capacity/, 'MyTasks should expose shared office capacity through IPC');
  assert.match(mainCode, /studiosync-office-settings\.json/, 'Office capacity should live in a shared office settings file');
  assert.match(indexHtml, /data-tab="my-tasks"[^>]*>My Work</, 'The Partner daily workspace should not duplicate the portfolio label');
  assert.match(appCode, /myTasksTab\.textContent = isPortfolioPartner \? 'My Work' : 'My Projects'/, 'Non-partner users should retain the My Projects label');
  assert.match(appCode, /tabBar\.append\(myTasksTab, myWeekTab, myProjectsTab, staffViewTab\)/, 'Partner navigation should place My Projects before Staff Overview');
  assert.match(appCode, /activeTab === 'my-tasks' \|\| activeTab === 'my-projects'/, 'The Partner portfolio should keep the same narrow navigation rail as My Work');
  assert.match(appCode, /function getPartnerAssignedProjectTasks/, 'Partner My Work should be built from staff assignments on the Partner\'s projects');
  assert.match(appCode, /title: 'Private Tasks'/, 'Partner My Work should retain a private-only task section');
  assert.match(appCode, /title: 'Assigned Projects'/, 'Partner My Work should show its staff-assigned project section');
  assert.match(indexHtml, /id="my-projects-search-input"/, 'The Partner project portfolio should expose an interactive search input');
  assert.match(appCode, /function setupMyProjectsSearch/, 'The Partner project portfolio search should update while the user types');
  assert.match(companionCss, /\.project-row-title[\s\S]*?-webkit-line-clamp:\s*2/, 'Project names in My Projects should wrap to two lines');
  assert.match(companionCss, /\.project-row-avatar[\s\S]*?border:\s*2px solid var\(--project-row-bg\)/, 'Project assignee avatars should retain a row-colored separation ring');
  assert.match(appCode, /work-card-column-empty">No cards/, 'Empty Work Card columns should use the quiet No cards message');
  assert.doesNotMatch(appCode, /ACTIVE_WORK_CARD_CATEGORY_FILTER|data-work-card-filter|draggable="true"/, 'Work Cards should not retain category filtering or drag-and-drop state');
  assert.match(mainCode, /get-my-week-work-cards/, 'MyTasks should scope My Week cards to the signed-in person');
  assert.match(mainCode, /const STAFF_APP_WINDOW_BOUNDS = \{[\s\S]*?width:\s*775,[\s\S]*?minWidth:\s*775/, 'MyTasks staff workspace should keep the validated 775px split-pane minimum');
  assert.match(mainCode, /isPartner\(actor\)/, 'MyTasks should reserve work-card edits for Partner or V1 Admin users');
  assert.match(readRepoFile('sd-companion/main/services/taskCommandService.js'), /recordTaskDeletion/, 'MyTasks task deletion must create a tombstone before removing local data');
  assert.match(appCode, /View Activity\.\.\./, 'MyTasks project menu should expose project activity');
  assert.doesNotMatch(appCode, /detail-section-heading">Activity/, 'MyTasks task details should not duplicate project activity');
  assert.match(readRepoFile('sd-companion/renderer/project-activity.html'), /PROJECT HISTORY/, 'MyTasks should provide a project activity window');
  assert.match(mainCode, /mytasks-diagnostics\.log/, 'MyTasks should create a dedicated diagnostics log');
  const companionAuth = readRepoFile('sd-companion/main/auth.js');
  assert.match(companionAuth, /String\(username \|\| ''\)\.trim\(\)\.toLowerCase\(\)/, 'MyTasks must use the StudioSync username selected at sign-in');
  assert.doesNotMatch(companionAuth, /os\.userInfo\(\)\.username/, 'MyTasks must not bind identity to the Windows session');
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

function testDurableSyncOutbox(appName) {
  const SyncEngine = require(path.join(repoRoot, `${appName}/main/sync`));
  const sharedPath = fs.mkdtempSync(path.join(os.tmpdir(), `studiosync-outbox-${appName}-`));
  const eventsPath = path.join(sharedPath, 'events');
  const outbox = new Map();
  const db = {
    getProcessedSyncFiles: () => [], getLastSyncTimestamp: () => null,
    markSyncFileProcessed: () => {}, setLastSyncTimestamp: () => {}, applyEvent: () => {},
    queueSyncEvent: (event) => outbox.set(event.eventId, { event_id: event.eventId, event, attempts: 0, last_error: null }),
    getQueuedSyncEvents: () => [...outbox.values()].filter((item) => !item.published),
    markSyncEventPublished: (eventId) => { outbox.get(eventId).published = true; },
    recordSyncEventFailure: (eventId, error) => { const item = outbox.get(eventId); item.attempts += 1; item.last_error = error; },
    getSyncOutboxSummary: () => ({ pending: [...outbox.values()].filter((item) => !item.published).length }),
  };

  try {
    const sync = new SyncEngine(db, sharedPath, 'tester');
    fs.mkdirSync(eventsPath, { recursive: true });
    fs.rmSync(eventsPath, { recursive: true, force: true });
    fs.writeFileSync(eventsPath, 'blocked', 'utf-8');
    assert.equal(sync.pushEvent('task-created', { id: 'task-1' }), false, `${appName} should queue an unavailable shared-folder write`);
    assert.equal(sync.getOutboxSummary().pending, 1, `${appName} should retain the failed event in its outbox`);
    fs.unlinkSync(eventsPath);
    fs.mkdirSync(eventsPath);
    assert.equal(sync.flushOutbox(), true, `${appName} should retry queued events after the shared folder returns`);
    assert.equal(sync.getOutboxSummary().pending, 0, `${appName} should mark a delivered outbox event as published`);
    assert.equal(fs.readdirSync(eventsPath).filter((file) => file.endsWith('.json')).length, 1);
  } finally {
    fs.rmSync(sharedPath, { recursive: true, force: true });
  }
}

function testDurableSyncHistory(appName) {
  const SyncEngine = require(path.join(repoRoot, `${appName}/main/sync`));
  const sharedPath = fs.mkdtempSync(path.join(os.tmpdir(), `studiosync-history-${appName}-`));
  const eventsPath = path.join(sharedPath, 'events');
  const oldEventPath = path.join(eventsPath, '2000-01-01T00-00-00-000Z_tester_task-created_deadbeef.json');
  const db = {
    getProcessedSyncFiles: () => [], getLastSyncTimestamp: () => null,
  };

  try {
    fs.mkdirSync(eventsPath, { recursive: true });
    fs.writeFileSync(oldEventPath, JSON.stringify({ type: 'task-created', data: { id: 'task-1' } }), 'utf-8');
    const sync = new SyncEngine(db, sharedPath, 'tester');
    assert.equal(sync.cleanup(), 0, `${appName} should keep replay history until snapshot compaction exists`);
    assert.equal(fs.existsSync(oldEventPath), true, `${appName} should not delete recovery events by age`);
  } finally {
    fs.rmSync(sharedPath, { recursive: true, force: true });
  }
}

function testSharedSnapshotBootstrap() {
  const DashboardDatabase = require(path.join(repoRoot, 'sd-scheduling/main/database'));
  const MyTasksDatabase = require(path.join(repoRoot, 'sd-companion/main/database'));
  const DashboardSync = require(path.join(repoRoot, 'sd-scheduling/main/sync'));
  const MyTasksSync = require(path.join(repoRoot, 'sd-companion/main/sync'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studiosync-snapshot-'));
  const sharedPath = path.join(root, 'shared');
  const dashboardDb = new DashboardDatabase(path.join(root, 'dashboard.db'));
  const myTasksDb = new MyTasksDatabase(path.join(root, 'mytasks.db'));
  const upgradedMyTasksDb = new MyTasksDatabase(path.join(root, 'mytasks-upgraded.db'));
  const atomicMyTasksDb = new MyTasksDatabase(path.join(root, 'mytasks-atomic.db'));

  try {
    dashboardDb.initialize();
    dashboardDb.createUser({
      id: 'user-1', username: 'officeuser', windows_username: 'officeuser',
      display_name: 'Office User', role: 'partner', active: 1,
    });
    dashboardDb.createProject({ id: 'project-1', name: 'Recovery Project', partner_id: 'user-1' });
    dashboardDb.createTask({ id: 'task-1', project_id: 'project-1', assigned_to: 'user-1', title: 'Recovered task' });
    dashboardDb.createProject({ id: 'project-2', name: 'Recovered missing project', partner_id: 'user-1' });
    dashboardDb.createTask({ id: 'task-2', project_id: 'project-2', assigned_to: 'user-1', title: 'Recovered missing assignment' });
    dashboardDb.createWorkCard({
      id: 'work-card-1', project_id: 'project-1', week_of: '2026-11-09',
      title: 'Recovered work card', created_by: 'user-1', updated_by: 'user-1',
      assignee_ids: ['user-1'],
    });
    dashboardDb.setWorkCardFocus('user-1', 'work-card-1');

    const dashboardSync = new DashboardSync(dashboardDb, sharedPath, 'officeuser', 'scheduling');
    dashboardSync.initialize();
    assert.equal(fs.existsSync(path.join(sharedPath, 'snapshots', 'dashboard-state.json')), true, 'Dashboard should publish a recovery snapshot');

    // A current snapshot supersedes old history. These legacy files may use
    // payloads that no longer validate, but must not block a fresh install.
    fs.writeFileSync(
      path.join(sharedPath, 'events', '2026-01-01T00-00-00-000Z_legacy_rollover-published_deadbeef.json'),
      JSON.stringify({ type: 'rollover-published', data: { legacy: true } }),
      'utf8',
    );

    myTasksDb.initialize();
    const myTasksSync = new MyTasksSync(myTasksDb, sharedPath, 'officeuser', 'companion');
    myTasksSync.initialize();
    assert.equal(myTasksDb.getUsers().length, 1, 'A fresh MyTasks cache should restore users from the Dashboard snapshot');
    assert.equal(myTasksDb.getTaskById('task-1')?.title, 'Recovered task', 'A fresh MyTasks cache should restore shared tasks from the Dashboard snapshot');
    assert.equal(myTasksDb.getWorkCardById('work-card-1')?.title, 'Recovered work card', 'A fresh MyTasks cache should restore shared work cards from the Dashboard snapshot');
    assert.equal(myTasksDb.getWorkCardFocus('user-1')?.id, 'work-card-1', 'A fresh MyTasks cache should restore each personal work-card focus');
    assert.equal(myTasksSync.getFailureSummary().count, 0, 'Historical events covered by the snapshot should not be replayed');

    // Match the state produced by 1.2.6: the snapshot is already restored,
    // but its history cursor has not been saved locally yet.
    upgradedMyTasksDb.initialize();
    const snapshot = JSON.parse(fs.readFileSync(path.join(sharedPath, 'snapshots', 'dashboard-state.json'), 'utf8'));
    assert.throws(
      () => upgradedMyTasksDb.importSharedSnapshot({ ...snapshot, source: 'companion' }),
      /shared recovery snapshot is invalid/i,
      'Only Dashboard snapshots may be used to rebuild shared state',
    );
    upgradedMyTasksDb.importSharedSnapshot(snapshot);
    // Reproduce a partial cache with local edits that have not yet been
    // published. The authoritative snapshot replaces shared cache rows, then
    // the durable outbox reapplies those local edits immediately afterwards.
    upgradedMyTasksDb.updateTask({ id: 'task-1', title: 'Stale cached task' });
    upgradedMyTasksDb.updateWorkCard({ id: 'work-card-1', status: 'done', updated_by: 'user-1' });
    // Reproduce an interrupted/partial cache: a newer local edit survives,
    // while a different Dashboard assignment was never retained locally.
    upgradedMyTasksDb.db.prepare('DELETE FROM tasks WHERE id = ?').run('task-2');
    const upgradedMyTasksSync = new MyTasksSync(upgradedMyTasksDb, sharedPath, 'officeuser', 'companion');
    // Queue every local shared change before recovery. This simulates a
    // disconnected client whose edits must survive the cache replacement.
    upgradedMyTasksDb.queueSyncEvent(upgradedMyTasksSync.createEvent('task-updated', upgradedMyTasksDb.getTaskById('task-1')));
    upgradedMyTasksDb.queueSyncEvent(upgradedMyTasksSync.createEvent('work-card-updated', upgradedMyTasksDb.getWorkCardById('work-card-1')));
    upgradedMyTasksSync.initialize();
    assert.equal(upgradedMyTasksDb.getTaskById('task-1')?.title, 'Stale cached task', 'An updated local task should not be replaced by an older Dashboard snapshot');
    assert.equal(upgradedMyTasksDb.getTaskById('task-2')?.title, 'Recovered missing assignment', 'A stale partial cache should reconcile assignments missing from the Dashboard snapshot');
    assert.equal(upgradedMyTasksDb.getSyncOutboxSummary().pending, 0, 'A queued local edit should publish after the snapshot reconciliation completes');
    assert.equal(upgradedMyTasksDb.getWorkCardById('work-card-1')?.status, 'done', 'A completed local Work Card should not be reopened by an older Dashboard snapshot');
    assert.equal(upgradedMyTasksSync.getFailureSummary().count, 0, 'An upgraded cache should adopt the snapshot cursor without replaying covered legacy files');

    atomicMyTasksDb.initialize();
    assert.throws(
      () => atomicMyTasksDb.applyEventAndMarkProcessed({
        type: 'task-created',
        data: { id: 'orphaned-task', assigned_to: 'missing-user' },
      }, '2026-11-04T00-00-00-000Z_test_task-created_orphaned.json'),
      /FOREIGN KEY constraint failed/i,
      'An invalid event must fail before it is marked as processed',
    );
    assert.equal(
      atomicMyTasksDb.getProcessedSyncFiles().length,
      0,
      'A failed event application must not advance the processed-event cursor',
    );
  } finally {
    dashboardDb.close();
    myTasksDb.close();
    upgradedMyTasksDb.close();
    atomicMyTasksDb.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testTrustedDeviceEnrollment() {
  const DashboardTrust = require(path.join(repoRoot, 'sd-scheduling/main/deviceTrust'));
  const MyTasksTrust = require(path.join(repoRoot, 'sd-companion/main/deviceTrust'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studiosync-device-trust-'));
  try {
    const dashboard = new DashboardTrust({ appDataDir: path.join(root, 'dashboard'), sharedDrivePath: path.join(root, 'shared'), source: 'scheduling' });
    dashboard.setActor({ id: 'partner-1', username: 'partner', role: 'partner' });
    const myTasks = new MyTasksTrust({ appDataDir: path.join(root, 'mytasks'), sharedDrivePath: path.join(root, 'shared'), source: 'companion' });
    myTasks.setActor({ id: 'staff-1', username: 'staff', role: 'staff' });
    const request = dashboard.getPendingEnrollments()[0];
    assert.equal(request.userId, 'staff-1');
    assert.equal(dashboard.approveEnrollment(request.deviceId), true);
    const event = myTasks.signEvent({ eventId: 'event-1', schemaVersion: 2, type: 'task-created', data: { id: 'task-1' }, timestamp: '2026-10-11T12:00:00.000Z' });
    assert.ok(event.signature, 'An approved device should sign new events');
    assert.equal(dashboard.verifyEvent(event).valid, true, 'Dashboard should verify an approved device event');
    const mismatchedAuthorEvent = myTasks.signEvent({ eventId: 'event-2', schemaVersion: 2, type: 'task-created', data: { id: 'task-2' }, author: 'different-user', timestamp: '2026-10-11T12:00:00.000Z' });
    assert.equal(
      dashboard.verifyEvent(mismatchedAuthorEvent).valid,
      false,
      'An enrolled device cannot sign an event for a different author identity',
    );
    dashboard.setEnforcement(true);
    assert.equal(dashboard.verifyEvent({ eventId: 'old-event', type: 'task-created', data: { id: 'task-2' } }).valid, false, 'Strict policy should reject legacy unsigned events');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testCompanionStaffOverviewAssignments() {
  const Database = require(path.join(repoRoot, 'sd-companion/main/database'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studiosync-staff-overview-'));
  const db = new Database(path.join(root, 'mytasks.db'));

  try {
    db.initialize();
    db.createUser({ id: 'staff-1', username: 'danielle', display_name: 'Danielle Sizer', role: 'staff', active: 1 });
    db.createUser({ id: 'staff-2', username: 'inactive', display_name: 'Inactive Staff', role: 'staff' });
    db.updateUser({ id: 'staff-2', active: 0 }); // createUser always starts a user as active
    db.createUser({ id: 'partner-1', username: 'partner', display_name: 'Partner', role: 'partner', active: 1 });
    db.createProject({ id: 'project-1', client: 'Client', name: 'One' });
    db.createProject({ id: 'project-2', client: 'Client', name: 'Two' });
    db.createProject({ id: 'project-3', client: 'Client', name: 'Three' });
    db.createTask({ id: 'assignment-1', project_id: 'project-1', assigned_to: 'staff-1', title: 'One' });
    db.createTask({ id: 'assignment-2', project_id: 'project-2', assigned_to: 'staff-1', title: 'Two', completed: 1 });
    db.createTask({ id: 'inactive-assignment', project_id: 'project-3', assigned_to: 'staff-2', title: 'Three' });

    const assignments = db.getStaffOverviewAssignments();
    assert.deepEqual(
      assignments.map((task) => task.id),
      ['assignment-1', 'assignment-2'],
      'Staff Overview should query every active staff assignment directly, including completed assignments',
    );
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testWeeklyRolloverCarriesOverUnfinishedWorkCards() {
  const DashboardDatabase = require(path.join(repoRoot, 'sd-scheduling/main/database'));
  const MyTasksDatabase = require(path.join(repoRoot, 'sd-companion/main/database'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studiosync-carry-over-'));
  const dashboard = new DashboardDatabase(path.join(root, 'dashboard.db'));
  const myTasks = new MyTasksDatabase(path.join(root, 'mytasks.db'));

  try {
    for (const db of [dashboard, myTasks]) {
      db.initialize();
      db.createUser({ id: 'partner-1', username: 'partner', display_name: 'Partner', role: 'partner', active: 1 });
      db.createUser({ id: 'staff-1', username: 'staffone', display_name: 'Staff One', role: 'staff', active: 1 });
      db.createProject({ id: 'project-1', client: 'Client', name: 'One' });
      db.createProject({ id: 'project-2', client: 'Client', name: 'Two' });
    }
    const make = (db, card) => db.createWorkCard({ project_id: 'project-1', created_by: 'partner-1', updated_by: 'partner-1', assignee_ids: ['staff-1'], ...card });
    const cards = (db) => {
      make(db, { id: 'todo', week_of: '2026-11-09', title: 'To do', start_date: '2026-11-10', end_date: '2026-11-11' });
      make(db, { id: 'paused', week_of: '2026-11-02', title: 'Paused', status: 'in_progress', paused: 1, start_date: '2026-11-04', end_date: '2026-11-06', planned_minutes: 90 });
      make(db, { id: 'undated', week_of: '2026-11-09', title: 'No dates' });
      make(db, { id: 'done', week_of: '2026-11-09', title: 'Finished', status: 'done' });
      make(db, { id: 'future', week_of: '2026-11-23', title: 'Next next week' });
      make(db, { id: 'already-here', week_of: '2026-11-16', title: 'Already this week', sort_order: 5 });
      db.createWorkCard({ id: 'other-project', project_id: 'project-2', week_of: '2026-11-09', title: 'Other project', created_by: 'partner-1', updated_by: 'partner-1', assignee_ids: [] });
    };
    cards(dashboard);
    cards(myTasks);
    dashboard.setWorkCardFocus('staff-1', 'paused');

    const moved = dashboard.carryOverUnfinishedWorkCards('2026-11-16');
    assert.deepEqual(moved.map((card) => card.id).sort(), ['other-project', 'paused', 'todo', 'undated'], 'Only unfinished cards from earlier weeks should carry over');

    const byId = (id) => dashboard.getWorkCardById(id);
    assert.equal(byId('todo').week_of, '2026-11-16', 'A carried card should move to the new week');
    assert.equal(byId('todo').start_date, '2026-11-17', 'Carried card dates should keep the same weekdays');
    assert.equal(byId('todo').end_date, '2026-11-18', 'Carried card dates should keep the same weekdays');
    assert.equal(byId('paused').week_of, '2026-11-16', 'A card two weeks behind should reach the current week');
    assert.equal(byId('paused').start_date, '2026-11-18', 'Dates shift by the full number of weeks the card was behind');
    assert.equal(byId('paused').status, 'in_progress', 'Carrying over must not change status');
    assert.equal(byId('paused').paused, 1, 'Carrying over must keep a paused card paused');
    assert.equal(byId('paused').planned_minutes, 90, 'Carrying over must keep planned time');
    assert.deepEqual(byId('paused').assignee_ids, ['staff-1'], 'Carrying over must keep assignees');
    assert.equal(dashboard.getWorkCardFocus('staff-1')?.id, 'paused', 'Carrying over must keep the focus card');
    assert.equal(byId('undated').start_date, null, 'A card without dates should stay undated');
    assert.equal(byId('done').week_of, '2026-11-09', 'Done cards should stay in the week they were finished');
    assert.equal(byId('future').week_of, '2026-11-23', 'Cards scheduled for a later week should not be pulled forward');
    assert.equal(byId('other-project').week_of, '2026-11-16', 'Cards on every project should carry over');
    const order = dashboard.getWorkCards({ project_id: 'project-1', week_of: '2026-11-16' }).filter((card) => card.id !== 'already-here').map((card) => card.sort_order);
    assert.ok(order.every((value) => value > 5), 'Carried cards should be added after the cards already in the new week');
    assert.equal(new Set(order).size, order.length, 'Carried cards should each get their own place in the list');
    assert.deepEqual(dashboard.carryOverUnfinishedWorkCards('2026-11-16'), [], 'Carrying over again should change nothing');

    // The moves are published as ordinary work-card-updated events; both apps must end up the same.
    for (const card of moved) myTasks.applyEvent({ type: 'work-card-updated', data: card, timestamp: new Date().toISOString() });
    for (const id of ['todo', 'paused', 'undated', 'done', 'future', 'other-project']) {
      const left = dashboard.getWorkCardById(id);
      const right = myTasks.getWorkCardById(id);
      assert.deepEqual(
        [right.week_of, right.start_date, right.end_date, right.status, right.paused, right.sort_order],
        [left.week_of, left.start_date, left.end_date, left.status, left.paused, left.sort_order],
        `MyTasks should match the Dashboard for carried work card ${id}`,
      );
    }
  } finally {
    dashboard.close();
    myTasks.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testDashboardProjectLeadIsProjectWide() {
  const DashboardDatabase = require(path.join(repoRoot, 'sd-scheduling/main/database'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studiosync-project-lead-'));
  const db = new DashboardDatabase(path.join(root, 'dashboard.db'));

  try {
    db.initialize();
    db.createUser({ id: 'lead-1', username: 'leadone', display_name: 'Lead One', role: 'staff', active: 1, is_senior_staff: 1 });
    db.createUser({ id: 'lead-2', username: 'leadtwo', display_name: 'Lead Two', role: 'staff', active: 1, is_senior_staff: 1 });
    db.createUser({ id: 'staff-a', username: 'staffa', display_name: 'Staff A', role: 'staff', active: 1 });
    db.createUser({ id: 'staff-b', username: 'staffb', display_name: 'Staff B', role: 'staff', active: 1 });
    db.createProject({ id: 'project-1', client: 'Client', name: 'One' });
    db.createProject({ id: 'project-2', client: 'Client', name: 'Two' });
    db.createProject({ id: 'project-3', client: 'Client', name: 'Three' });
    const leadOf = (id) => db.getTaskById(id).lead_id || null;

    // Setting the lead on one assignment reaches every other assignment on the project, and only that project.
    for (const [id, who, project] of [['a1', 'staff-a', 'project-1'], ['b1', 'staff-b', 'project-1'], ['c1', 'lead-2', 'project-1'], ['a2', 'staff-a', 'project-2']]) {
      db.createTask({ id, project_id: project, assigned_to: who, title: id });
    }
    db.updateTask({ id: 'a1', lead_id: 'lead-1' });
    const changed = db.applyProjectLead('project-1', 'lead-1', { exceptTaskId: 'a1' });
    assert.deepEqual(changed.map((task) => task.id).sort(), ['b1', 'c1'], 'The lead should be copied to the other assignments on the project');
    assert.deepEqual(['a1', 'b1', 'c1'].map(leadOf), ['lead-1', 'lead-1', 'lead-1'], 'Every assignment on the project should have the lead');
    assert.equal(leadOf('a2'), null, 'Another project must not be affected');
    assert.deepEqual(db.applyProjectLead('project-1', 'lead-1', { exceptTaskId: 'a1' }), [], 'Applying the same lead again should change nothing');
    assert.equal(db.getProjectLeadId('project-1'), 'lead-1', 'The project lead should be found from any assignment');
    assert.equal(db.getProjectLeadId('project-1', { excludeTaskId: 'a1' }), 'lead-1', 'A new assignment should be able to read the lead from the others');
    assert.equal(db.getProjectLeadId('project-3'), null, 'A project without a lead has none');

    // Clearing the lead clears it for the project; a lead must be senior staff.
    db.updateTask({ id: 'b1', lead_id: null });
    db.applyProjectLead('project-1', null, { exceptTaskId: 'b1' });
    assert.deepEqual(['a1', 'b1', 'c1'].map(leadOf), [null, null, null], 'Clearing the lead should clear it for the whole project');
    assert.throws(() => db.applyProjectLead('project-1', 'staff-a'), /senior staff/, 'A non-senior person cannot be the project lead');

    // Repair: a lead that was only set on some assignments is filled in; two different leads are left alone.
    db.createTask({ id: 'a3', project_id: 'project-3', assigned_to: 'staff-a', title: 'a3', lead_id: 'lead-1' });
    db.createTask({ id: 'b3', project_id: 'project-3', assigned_to: 'staff-b', title: 'b3' });
    db.updateTask({ id: 'a1', lead_id: 'lead-1' });
    db.updateTask({ id: 'c1', lead_id: 'lead-2' });
    const repaired = db.reconcileProjectLeads();
    assert.deepEqual(repaired.map((task) => task.id), ['b3'], 'Only the assignment missing a clear lead should be repaired');
    assert.equal(leadOf('b3'), 'lead-1', 'The missing lead should be filled in');
    assert.deepEqual(['a1', 'b1', 'c1'].map(leadOf), ['lead-1', null, 'lead-2'], 'A project with two different leads should be left for the user to decide');
    assert.deepEqual(db.reconcileProjectLeads(), [], 'Repairing again should change nothing');
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testCompanionSnapshotMergeKeepsNewerWorkCards() {
  const Database = require(path.join(repoRoot, 'sd-companion/main/database'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studiosync-snapshot-merge-'));
  const db = new Database(path.join(root, 'mytasks.db'));

  try {
    db.initialize();
    db.createUser({ id: 'partner-1', username: 'partner', display_name: 'Partner', role: 'partner', active: 1 });
    db.createUser({ id: 'staff-1', username: 'staffone', display_name: 'Staff One', role: 'staff', active: 1 });
    db.createProject({ id: 'project-1', client: 'Client', name: 'One' });
    db.createTask({ id: 'assignment-1', project_id: 'project-1', assigned_to: 'staff-1', title: 'One' });
    // Shared rows are older than the latest Dashboard snapshot, as they are in real use.
    for (const [table, column] of [['users', 'created_at'], ['projects', 'created_at'], ['projects', 'updated_at'], ['tasks', 'created_at'], ['tasks', 'updated_at']]) {
      try { db.db.prepare(`UPDATE ${table} SET ${column} = '2026-11-01T00:00:00.000Z'`).run(); } catch (_) {}
    }
    const snapshot = {
      schemaVersion: 1,
      source: 'scheduling',
      generatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      tables: {
        users: db.db.prepare('SELECT * FROM users').all(),
        projects: db.db.prepare('SELECT * FROM projects').all(),
        tasks: db.db.prepare('SELECT * FROM tasks').all(),
      },
    };

    // A work card created in MyTasks after the Dashboard last wrote its snapshot.
    db.createWorkCard({ id: 'card-after-snapshot', project_id: 'project-1', week_of: '2026-11-16', title: 'Created later', created_by: 'partner-1', updated_by: 'partner-1', assignee_ids: ['staff-1'] });
    db.setWorkCardFocus('staff-1', 'card-after-snapshot');

    const merged = db.importSharedSnapshot(snapshot, { mergeExisting: true });
    assert.ok(merged > 0, 'The snapshot merge should still refresh shared rows that exist locally');
    const card = db.getWorkCardById('card-after-snapshot');
    assert.ok(card, 'A startup snapshot merge must not delete work cards created after the snapshot');
    assert.deepEqual(card.assignee_ids, ['staff-1'], 'A snapshot merge must keep the card assignees');
    assert.equal(db.getWorkCardFocus('staff-1')?.id, 'card-after-snapshot', 'A snapshot merge must keep the focus card');
    assert.equal(db.getTasks().length, 1, 'A snapshot merge should keep scheduled assignments');
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  const target = process.argv[2] || 'all';
  if (target === 'all' || target === 'scheduling') {
    testDashboardPriority();
    testDashboardPaletteSearch();
    testDashboardShellGuards();
    testDashboardLayoutGuards();
    testDashboardSharedTaskDueDate();
    testRolloverReviewRelease();
    testReviewRegressions('sd-scheduling');
    testSharedWorkCards('sd-scheduling');
    testWeeklyRolloverCarriesOverUnfinishedWorkCards();
    testDashboardProjectLeadIsProjectWide();
    testWorkCardStatusAndDateHelpers();
    testWorkCardSchemaUpgrade('sd-scheduling', 20);
    testDistinctAvatarColors('sd-scheduling', 24);
    testDashboardExportGuards();
    await testDashboardNotesEditor();
    testDurableSyncOutbox('sd-scheduling');
    testDurableSyncHistory('sd-scheduling');
    testSharedSnapshotBootstrap();
    testTrustedDeviceEnrollment();
  }
  if (target === 'all' || target === 'companion') {
    testMyTasksHelpers();
    testMyTasksShellGuards();
    testMyTasksLayoutGuards();
    testMyTasksLinkSecurity();
    testMyTasksSyncRecovery();
    testReviewRegressions('sd-companion');
    testCompanionStaffOverviewAssignments();
    testCompanionSnapshotMergeKeepsNewerWorkCards();
    testSharedWorkCards('sd-companion');
    testWorkCardSchemaUpgrade('sd-companion', 22);
    testDistinctAvatarColors('sd-companion', 26);
    testDurableSyncOutbox('sd-companion');
    testDurableSyncHistory('sd-companion');
  }
  console.log(`Smoke tests passed (${target}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
