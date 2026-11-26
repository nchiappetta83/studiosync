# StudioSync V2 — Unified App Plan

## Purpose

StudioSync V2 will be a single, role-aware desktop application that combines
the proven StudioSync Dashboard and StudioSync MyTasks workflows.

V2 is an evolution of **V1.3**, not a replacement-product redesign. It must
preserve the working office model—scheduled assignments, priorities, Excel
catalogue integration, shared-drive synchronization, rollover, project
context, and V1.3 shared Work Cards—before it introduces new workflow ideas.

V1.3 remains the live product throughout this work. The `sd-scheduling` and
`sd-companion` folders are not V2 implementation targets and may continue to
receive normal fixes and releases until V2 has passed its pilot and cutover
criteria.

## Starting decisions

- **One application:** one installer, one sign-in, one window, one local V2
  database, and one sync process per computer.
- **HTML desktop UI:** the application will use a unified HTML/CSS/JavaScript
  shell, modelled on the clean separation used by StackSheet. Electron is the
  initial desktop host; its preload bridge is the only path from the UI to
  local capabilities.
- **V1.3 behavior first:** retain V1.3 data meanings and operational flows.
  Do not redesign task priority, scheduling, or Work Cards during the initial
  migration.
- **Role-aware workspaces:** staff, senior staff, partners, and scheduling
  administrators share an application but never receive the same permissions
  or default workspace.
- **Parallel and reversible rollout:** V2 must coexist with V1.3 during a
  pilot. No V1 data is overwritten and no irreversible cutover happens before
  the agreed acceptance criteria are met.

## Archived prototype

The earlier, independent V2 prototype is preserved at
`Archive/v2-prototype-2026-11-12/`. It is reference material only and is not
the codebase for this plan.

## Product shape

```text
StudioSync V2
├─ My Work             staff daily workspace
├─ Team                senior-staff workspace
├─ Portfolio           partner workspace
├─ Schedule             Dashboard planning workspace
├─ Projects             project catalogue and shared project context
└─ Office               role-protected staff, settings, export, and support
```

Default workspace and navigation visibility are determined by the signed-in
person's V1.3 role and permissions:

| Person | Default | Additional workspaces |
| --- | --- | --- |
| Staff | My Work | Project context allowed by current V1.3 rules |
| Senior staff | Team | My Work and permitted project context |
| Partner | Portfolio | My Work, Schedule, Projects, Office |
| Scheduling administrator | Schedule or remembered workspace | My Work, Projects, permitted Office areas |

The navigation may hide unavailable destinations for clarity, but every
operation must still be authorized by the main-process API.

## Non-negotiable V1.3 compatibility

- Existing scheduled task assignments retain their IDs, staff assignment,
  priority, due date, scheduling summary, comments, action items, activity,
  rollover behavior, and project links.
- Existing V1.3 Work Cards remain shared project-and-week records, including
  assignees, per-person focus, status, time, categories, and lead fields.
- Excel remains the project catalogue integration during the first V2 release.
- The shared-drive event model remains the transport during the first V2
  release. V2 writes V1.3-compatible events while both products are active.
- Existing local MyTasks-only information—private tasks, local preferences,
  remembered user, and useful window preferences—has an explicit, backed-up
  import path. It is never silently discarded.
- V2 continues V1.3's desktop expectations: offline local work, durable retry,
  audit-friendly logs, export, Windows installer behavior, and recovery
  diagnostics.

## Delivery phases

### Phase 0 — V1.3 baseline and safety contract

**Goal:** establish an evidence-backed compatibility target before new V2 code
is written.

- [x] Record the user-approved V1.3 source baseline in
  [V2 Phase 0 Baseline and Safety Contract](V2_PHASE_0_BASELINE.md) and
  preserve a source-only snapshot before Phase 4.
- [x] Inventory Dashboard and MyTasks features by role, including keyboard
  behavior and less-visible operational flows.
- [x] Document current SQLite schema, migrations, shared-drive event types,
  sync outbox/inbox behavior, configuration files, and installer locations.
- [x] Define the V2 ownership of every data type: shared, local-private,
  configuration, cache, and generated export.
- [x] Create representative, scrubbed office datasets plus offline/pending-sync
  fixtures for automated migration and synchronization tests in
  `fixtures/v1.3-baseline/`.
- [x] Write a data-loss test matrix covering interrupted import, duplicate
  events, stale cache, offline edits, V1.3/V2 coexistence, and rollback.

**Exit gate:** the team can state exactly what V2 must preserve and has safe
fixtures to prove it.

### Phase 1 — Information architecture and mockups

**Goal:** validate the unified experience before coupling it to live data.

- [ ] Define navigation, role defaults, workspace switch behavior, sync/status
  presentation, sign-out, and global search/shortcut behavior.
- [x] Establish the initial visual/interaction direction in
  [V2 Phase 1 Mockup Brief](V2_PHASE_1_MOCKUP_BRIEF.md), using Apple’s Design
  Resources and Human Interface Guidelines as desktop-productivity references.
- [x] Build the first clickable HTML mockup directions with fictional data for
  Schedule and My Work.
- [ ] Expand the approved direction into complete mockups for My Work, Team,
  Portfolio, Schedule, Projects, Office, sign-in, and first-run migration.
- [ ] Retain familiar V1.3 terminology and recognizable scheduling/task cards
  in the mockups; identify every deliberate terminology change.
- [ ] Map each V1.3 control to a mockup destination or explicitly retire it
  with a user-approved rationale.
- [ ] Walk through a Monday scheduling meeting, staff daily work, senior
  review, partner project review, Work Card use, Friday rollover, offline
  recovery, and support diagnostics with representative users.
- [ ] Revise the mockups until navigation and role boundaries are approved.

**Exit gate:** approved mockups and a feature-to-screen map. No database,
sync, or Excel behavior changes are permitted in this phase.

### Phase 2 — V2 application blueprint

**Goal:** make the implementation path as clear as the visual design.

- [ ] Create a new isolated V2 application root; do not modify V1.3 imports or
  package configuration to make it run.
- [ ] Define the main-process services for database access, sync, Excel,
  authorization, migration, logging, export, update checking, and file links.
- [ ] Define one small preload API grouped by capability, with input validation
  and authorization in the main process.
- [ ] Define renderer state, routing, refresh, error, and unsaved-edit rules.
- [ ] Design a versioned V1.3-to-V2 local migration marker and backup scheme.
- [ ] Decide the V2 installer identity, per-user data location, upgrade
  behavior, and coexistence rules with the two V1.3 installers.

**Exit gate:** architecture, API contract, and migration design are reviewed;
the implementation does not rely on reaching into V1.3 runtime folders.

### Phase 3 — Static unified shell

**Goal:** turn the approved mockup into a real, navigable desktop shell.

- [ ] Implement the shared HTML shell, design tokens, app header, workspace
  navigation, user menu, connection-status area, dialogs, notifications, and
  keyboard/focus conventions.
- [ ] Implement role-aware workspace visibility using fixture data only.
- [ ] Preserve workspace context when moving between Schedule and My Work.
- [ ] Add an isolated browser-development mode where practical, with a
  development-only API adapter rather than direct local-file access.
- [ ] Complete accessibility, responsive-window, light/dark, and visual QA
  against the approved mockups.

**Exit gate:** the whole product can be demonstrated in one window without
live office data.

### Phase 4 — V1.3-compatible core

**Goal:** establish one trustworthy local V2 data and service layer.

- [ ] Port or adapt the V1.3 Dashboard database and migration logic into the
  V2 app as the shared-data baseline.
- [ ] Add the V1.3 MyTasks local-private data model without exposing private
  records through shared synchronization.
- [ ] Port authorization, logging, device trust, recovery, and update services
  with automated parity coverage.
- [ ] Port the shared-drive event reader, durable outbox, processed-event
  ledger, and retry/recovery behavior without changing event semantics.
- [ ] Add contract tests showing V2 accepts representative V1.3 data/events
  and V1.3 accepts events emitted by V2.
- [ ] Build the backup-first importer for Dashboard data and each user's
  MyTasks-private data; make it previewable, idempotent, and resumable.

**Exit gate:** V2 can import a copied V1.3 office and run safely with sync
disabled; every import has a verified backup and report.

### Phase 5 — Schedule and office capability parity

**Goal:** preserve the scheduling meeting and office operations inside the new
shell.

- [ ] Connect the Schedule workspace to staff capacity, project lists,
  current/future projects, drag-and-drop assignment, task editing, priorities,
  PTO, comments, action items, Work Card disclosure, and rollover.
- [ ] Port Excel refresh, project import/write-back, project creation,
  printing/export, and appropriate partner/admin settings.
- [ ] Port staff, business-role, custom-priority, project, and configuration
  management with the same authorization boundaries as V1.3.
- [ ] Verify a complete scheduling meeting against the Phase 0 fixture and
  resulting Excel/event output.

**Exit gate:** a scheduling administrator can complete the V1.3 Dashboard
workflow entirely in V2 without a functional regression.

### Phase 6 — Daily-work workspace parity

**Goal:** bring the V1.3 MyTasks experience into the same application.

- [ ] Implement My Work with task/project views, filters, search, detail pane,
  shared comments, action items, project notes, task activity, folder links,
  personal Work Card focus, and private tasks.
- [ ] Implement Team using V1.3 senior-staff scope and read/write rules.
- [ ] Implement Portfolio using V1.3 partner project editing, staff workload,
  project context, unsaved-change protection, and Work Card capabilities.
- [ ] Verify every user-facing MyTasks action against the V1.3 behavior and
  its permission model.

**Exit gate:** a staff member, senior, and partner can each complete their
normal day in V2 without opening MyTasks.

### Phase 7 — Migration and coexistence

**Goal:** move real copies of V1.3 safely, not just fixtures.

- [ ] Require a sync-health check before import; surface unresolved local
  outbox entries and provide a safe resolution path.
- [ ] Back up the V1.3 Dashboard database, each available MyTasks database,
  configurations, and workbook before import.
- [ ] Provide a preview showing imported, deferred, skipped, and private-local
  records before any V2 database is created.
- [ ] Run the importer against several representative office copies and verify
  record counts, event history, Excel catalogue counts, Work Cards, private
  tasks, and role scopes.
- [ ] Test opening V1.3 after a V2 import; V1.3 must remain untouched and
  usable until the explicit cutover.

**Exit gate:** migration has a reproducible report, a rollback playbook, and
zero unexplained count or permission differences.

### Phase 8 — Parallel integration pilot

**Goal:** prove that V2 and V1.3 can operate safely during a controlled pilot.

- [ ] Start with a copied office and a small group: one partner, one senior,
  one scheduling administrator, and two to four staff.
- [ ] Use V2 for a real Monday plan, midweek updates, Work Cards, and Friday
  rollover while retaining V1.3 launchers and backups.
- [ ] Compare assignments, priorities, Work Cards, comments/action items,
  private-task boundaries, Excel catalogue output, and sync health daily.
- [ ] Exercise offline creation, reconnect, duplicate/reordered event replay,
  failed-event recovery, update handling, and a documented rollback.
- [ ] Resolve pilot findings before widening participation.

**Exit gate:** two consecutive weeks meet the agreed parity, reliability,
performance, and user-adoption criteria.

### Phase 9 — Release readiness and cutover

**Goal:** ship one supported application without losing recovery options.

- [ ] Complete installer, update, code-signing, help, support-report, backup,
  restore, and logging workflows.
- [ ] Produce role-specific quick-start guides and a migration/cutover guide.
- [ ] Conduct final accessibility, security, performance, package-content, and
  clean-machine install tests.
- [ ] Choose a Monday cutover with the office; take final verified backups and
  retain V1.3 installers for at least one full scheduling cycle.
- [ ] Publish the V2 release only after a documented approval and final
  migration verification.

**Done when:** StudioSync V2 is the supported daily application, one installer
replaces Dashboard and MyTasks for new installs, and the office can recover or
roll back using the documented procedure.

## Decision gates

The project intentionally stops for a human decision at these points:

1. Mockup approval before real-data integration.
2. Architecture/migration approval before V1.3 service porting.
3. Fixture parity approval before real office-copy migration.
4. Pilot acceptance before any production cutover.

No phase may silently convert live V1.3 data, retire V1.3 installers, or
change the shared event contract without an explicit approved follow-on plan.
