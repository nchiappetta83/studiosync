# StudioSync V2 Phase 0 — V1.3 Baseline and Safety Contract

**Recorded:** 2026-11-12  
**Scope:** evidence and planning only; no V1.3 application code was changed.

## 1. Approved baseline

The intended V2 source baseline is the active StudioSync V1.3 working tree:

| Item | Value |
| --- | --- |
| Dashboard package | `sd-scheduling`, StudioSync `1.3.1`, `com.studiosync.dashboard` |
| MyTasks package | `sd-companion`, StudioSync MyTasks `1.3.1`, `com.studiosync.mytasks` |
| Current Git branch | `sync-task-delivery-fixes` |
| Current committed ancestor | `b0070270c578f8620de62befffc75fa49ee688bf` — “Release StudioSync 1.2.5” |
| Baseline status | **Approved:** the current V1.3 working tree is the V2 baseline. |
| Baseline snapshot | `Archive/v1.3-unified-v2-baseline-2026-11-12/` (source-only, 104 files) |

V1.3 remains active development until V2 is ready. The approved source archive
above is the fixed reference for the initial V2 port; later V1.3 changes are
not automatically incorporated. Any desired follow-on change needs a recorded
compatibility decision rather than silently changing V2’s target.

The V1.3-related working-tree changes observed when this document was recorded
are concentrated in both apps’ main process, database, sync, preload, package,
and renderer files, plus the V1.3 Work Cards plan. Generated `dist*` folders
are not source baseline material.

## 2. Product and role inventory

### StudioSync Dashboard (`sd-scheduling`)

| Area | V1.3 behavior V2 must preserve initially |
| --- | --- |
| Sign-in and startup | Compact identity selection; cached local startup; shared replay and Excel refresh before the live workspace opens. |
| Schedule | Office-wide staff/task board, task search/filtering, ordering, drag-and-drop assignment, due dates, status, priorities, planned scheduling notes, confirmation, and project context. |
| Staff and capacity | Staff list, active/inactive people, business roles, custom priorities, avatar colors, PTO dates, lead/senior designations, capacity signals, and controlled self-assignment permission. |
| Project catalogue | Current/Future projects, direct project CRUD, partner/lead/folder links, project notes, activity, and Excel import/refresh/write-back. |
| Task detail | Shared tasks, Action Items (`sub_tasks`), comments, task activity, project notes, deletion/tombstone handling, and project-linked staff context. |
| Work Cards | On-demand disclosure of the project-and-week shared Work Card board without changing the scheduled-task model. |
| Weekly operations | Rollover review, explicit keep/delete decisions, priority rules, idempotent rollover publication, and PTO reset where chosen. |
| Office operations | HTML/PDF export, backups and restore/inspection, shared-path/update configuration, logs/diagnostics, device trust, and update handling. |

### StudioSync MyTasks (`sd-companion`)

| Area | V1.3 behavior V2 must preserve initially |
| --- | --- |
| Personal work | Assigned shared tasks, search/filtering, task detail, status/completion, comments, Action Items, project context, folder links, and project notes. |
| Staff workflow | A focused project/task view, permitted self-assignment, project participants, and read scope limited to the person’s authorized work. |
| Senior/team workflow | Staff overview and team calendar/project detail, with V1.3 senior authority for shared Work Card management. |
| Partner workflow | My Work, project portfolio/detail, project editing, staff workload, unsaved-edit protection, and partner-only private tasks. |
| Work Cards | My Week calendar, project Work Cards board, per-person active-focus selection, work-card start/pause/resume/complete flow, project assignees, categories, leads, planned time, and schedule dates. |
| Private information | Partner private tasks are local-only and must never produce shared-drive events. |
| Desktop support | Synced cache, retry/status feedback, local logs, update handling, and compact sign-in behavior. |

### Role rules that remain authoritative in V2

- A partner is an administrator; V1.3 also recognizes selected scheduling
  administrators (`is_admin`) and senior staff (`is_senior_staff`).
- A person can create a shared task for themselves only when their
  `can_self_assign` permission allows it; partners/administrators retain
  office scheduling authority.
- Ordinary task mutation is constrained to a partner/administrator or a task’s
  assignee/creator. Subtask mutation follows the parent task’s authorization.
- Work Cards are shared by project and week. Partners and senior scheduling
  staff manage their creation/editing/assignment; project participants may see
  them. A person’s active-focus choice is their own.
- Hiding a workspace in V2 is not sufficient authorization. These checks must
  remain in V2’s main-process API.

### Keyboard and interaction invariants

| Surface | Existing interaction to retain or deliberately replace |
| --- | --- |
| Dashboard | `Ctrl/Cmd+F` and `Ctrl/Cmd+K` focus search; `Ctrl/Cmd+N` opens add-task for administrators; `Ctrl/Cmd+P` opens export; `Ctrl/Cmd+E` refreshes Excel for administrators; Escape closes overlays/menus before clearing search. |
| MyTasks | `Ctrl/Cmd+K` focuses the search appropriate to the active tab; `Ctrl/Cmd+N` opens the allowed personal-task flow; Up/Down moves the task-card focus when not editing; Escape clears active search/filter state after dialogs have had priority. |
| Both apps | Enter submits specific lightweight inputs where indicated; Shift+Enter remains available for a comment newline; Enter/Space operate keyboard-addressable cards and controls; dialogs trap/follow focus conventions and Escape closes safely. |
| MyTasks tabs | Visible tabs support arrow-key, Home, and End navigation and remember the person’s permitted last workspace locally. |

The mockup stage must either preserve these interactions or record an approved
replacement. Keyboard behavior is a compatibility requirement, not polish to
defer until after rollout.

## 3. Data ownership contract

V1.3 has no central database. Each installation has a local SQLite replica and
uses the shared-drive event folder as the replication transport. “Shared” below
means replicated office data, not a record owned by one local database.

| Ownership | Records / files | V2 rule |
| --- | --- | --- |
| Shared office domain | Users, projects, scheduled tasks, Action Items, comments, PTO, business roles, custom priorities, project notes/shared notes, task activity, Work Cards, Work Card assignees/focus/categories, rollover publications, and office settings. | Import, preserve identifiers and timestamps, and publish through the compatible V1.3 event contract during coexistence. |
| Local technical state | Sync inbox ledger, sync outbox/retry state, processed-event cursor, device trust identity/enrollment, local database copy, local lock state, window state, logs, diagnostics, and update-check state. | Back up and migrate only where it is safe and useful. Never mistake it for shared business data. Resolve/flush pending outbox records before migration. |
| Local-private domain | MyTasks `private_tasks`, per-user remembered identity/preferences, and other personal UI state. | Import only into that person’s V2 profile. Do not emit it to the shared drive or expose it to other users. |
| External source / generated output | Excel project workbook, HTML/PDF exports, database/config backups, and installers. | Keep Excel as the V1.3 catalogue integration for initial V2. Treat exports as generated artifacts. Make all destructive Excel/restore actions explicit and backed up. |

## 4. SQLite schema compatibility target

Both applications run ordered, idempotent SQLite migrations tracked in
`meta.schema_version`. The current source contains migrations through **31**.
Their migration numbering differs in places because MyTasks introduced
`private_tasks` independently; V2 must compare actual schema capabilities,
not assume equal migration numbers.

### Shared domain tables

`users`, `projects`, `tasks`, `sub_tasks`, `comments`, `staff_pto`,
`staff_pto_dates`, `business_roles`, `custom_priorities`, `project_notes`,
`task_activity`, `task_tombstones`,
`work_cards`, `work_card_assignees`, `work_card_focus`,
`work_card_categories`, and `applied_rollover_publications`.

Key V1.3 concepts that cannot be collapsed during an initial V2 port:

- A scheduled assignment is a `tasks` record. It has person-specific schedule,
  priority, due date, status, lead, comments, and rollover state.
- An Action Item is a `sub_tasks` record on a scheduled task. It is not a Work
  Card.
- A Work Card is a separate shared `work_cards` record keyed by `project_id`
  and `week_of`, with many assignees and independently tracked personal focus.
- Task deletion tombstones and rollover publication receipts are necessary for
  correct replay and must be retained.

### Local and synchronization tables

`meta`, `sync_meta`, `sync_processed_events`, `sync_outbox`, and, in MyTasks,
`private_tasks`. These carry local migration and delivery state and need a
separate migration policy from the shared domain.

## 5. Shared-drive event contract

The event transport writes JSON files atomically under:

```text
<sharedDrivePath>/events/
  <timestamp>_<username>_<type>_<event-id-prefix>.json
```

An event has an ID, type, timestamp, source/instance information, payload, and
optionally a device-trust signature. V1.3 queues each event durably in a local
outbox before publishing, marks processed files in a durable inbox ledger, and
uses snapshots for a fresh local database. V2 must accept and emit this format
while V1.3 remains in use.

| Event group | Supported V1.3 event types |
| --- | --- |
| People | `user-created`, `user-updated`, `user-deleted` |
| Scheduled tasks | `task-created`, `task-updated`, `task-deleted`, `tasks-reordered`, `task-confirmed`, `task-activity-added` |
| Work Cards | `work-card-created`, `work-card-updated`, `work-card-completed`, `work-card-deleted`, `work-card-focus-set`, `work-card-category-created`, `work-card-category-updated`, `work-card-category-deleted`, `work-card-categories-reordered` |
| Action Items and comments | `subtask-created`, `subtask-updated`, `subtask-toggled`, `subtask-deleted`, `comment-added`, `comment-deleted` |
| Projects and notes | `project-created`, `project-updated`, `project-deleted`, `project-notes-updated`, `project-shared-note-created`, `project-shared-note-updated`, `project-shared-note-deleted` |
| Staff time | `pto-set`, `pto-cleared` |
| Administration | `role-created`, `role-updated`, `role-deleted`, `roles-reordered`, `priority-created`, `priority-updated`, `priority-deleted`, `priorities-reordered`, `setting-updated` |
| Weekly lifecycle | `weekly-rollover`, `rollover-review-started`, `rollover-review-ended`, `rollover-published` |

The current source validates event payloads by type before applying them. V2
must add an automated, versioned event-contract test suite before it writes a
new event type or field.

## 6. Required representative fixtures

No live office data will be copied into the repository. Phase 0 defines these
scrubbed fixtures to create next:

| Fixture | Contents | Required checks |
| --- | --- | --- |
| `office-small` | Partner, senior, two staff, current/future projects, normal assignments, a private task, and basic shared events. | Basic import and role scope. |
| `office-work-cards` | Multi-assignee project, dated/undated cards, all statuses, pause/history, categories, leads, and personal focus. | V1.3 Work Card parity. |
| `office-rollover` | Last-week tasks, custom and numbered priorities, PTO, review decisions, publication receipt, and tombstones. | Idempotent Friday-to-Monday flow. |
| `office-excel` | Scrubbed current/future workbook and matching projects, direct V2 edits, refresh, and backup. | Excel round trip without data loss. |
| `office-offline` | Queued local events, failed event file, stale cache, duplicate/reordered events, and a valid shared snapshot. | Recovery and replay. |
| `office-private-import` | Several MyTasks profiles with local-only private tasks and preferences. | Per-user migration with no shared publication. |

Fixtures now live in [`fixtures/v1.3-baseline/`](../fixtures/v1.3-baseline/),
use fictitious names, and include generated SQLite/shared-drive/Excel data plus
a manifest of expected record counts and event outcomes. The README provides
the rebuild and verification commands; both use V1.3’s Electron runtime so the
fixture SQLite files match the desktop application’s native module.

## 7. Data-loss and coexistence test matrix

| Scenario | Required result |
| --- | --- |
| Import is interrupted before V2 creation | V1.3 files untouched; V2 import can safely retry from a verified backup. |
| Dashboard or MyTasks database is missing/corrupt | Import explains the missing source, never invents records, and continues only with explicit user direction. |
| MyTasks has unpublished queued events | V2 blocks final import until they publish or the user selects a documented recovery path. |
| Duplicate or re-ordered shared events | No duplicate domain records; tombstones, timestamps, and publication receipts continue to prevent stale resurrection. |
| V2 emits an event during a V1.3 pilot | The relevant V1.3 Dashboard and MyTasks builds accept it and reach the same business state. |
| V1.3 emits an event during a V2 pilot | V2 accepts it and updates the correct workspace without discarding local drafts. |
| Private task import | Record is visible only to its owner; no event is created and no other profile can query it. |
| Excel refresh/write-back | Project counts and protected workbook structure remain correct; a timestamped workbook backup exists before write-back. |
| Work Card migration | IDs, project/week links, assignees, focus, statuses, categories, leads, planned time, dates, and completion state match source. |
| Rollover replay | A repeated rollover publication is idempotent and preserves the V1.3 priority rule. |
| Rollback after pilot issue | V1.3 launchers and data remain usable; V2 data/events are retained for audit rather than copied back blindly. |

## Phase 0 status

- [x] User-approved V1.3 baseline captured in a source-only archive.
- [x] Dashboard, MyTasks, role, data, schema, and event inventory recorded.
- [x] Data ownership contract and data-loss/coexistence test matrix written.
- [x] Create and verify the six scrubbed fixture datasets and expected-result
  manifests in `fixtures/v1.3-baseline/`.

**Phase 0 complete.** Phase 1 mockups may begin now.
