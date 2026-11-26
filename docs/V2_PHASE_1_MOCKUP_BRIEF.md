# StudioSync V2 Phase 1 — Mockup Brief

## Objective

Design a cleaner, more modern unified StudioSync experience without losing the
speed, visibility, keyboard fluency, dense planning capability, or direct
manipulation that makes V1.3 useful in daily work.

The visual reference is Apple’s current Human Interface Guidelines and macOS
design resources, applied as principles for a Windows Electron application—not
as a literal macOS clone. StudioSync must still feel like StudioSync and remain
comfortable on the Windows desktops where V1.3 is used.

## Source material

- [Apple Design Resources](https://developer.apple.com/design/resources/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
- [Designing for macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos)
- [Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles)
- [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)

## Principles translated for StudioSync

| Apple principle | StudioSync V2 decision |
| --- | --- |
| Purpose and simplicity | Every workspace begins with its primary job: schedule the office, finish personal work, review a team, or understand a portfolio. Secondary actions move into contextual menus or inspectors, not a permanently crowded toolbar. |
| Familiarity | Keep V1.3 names, task cards, priorities, Work Cards, project context, drag-and-drop, and keyboard shortcuts recognizable. Freshen presentation and hierarchy; do not make people relearn their work. |
| Agency | Preserve context when moving between workspaces, make sync status understandable, support Undo/confirmation for consequential actions, and avoid destructive hidden behaviors. |
| macOS productivity patterns | Use the large desktop window deliberately: resizable panes, information-rich but breathable layouts, persistent navigation, precise pointer interactions, and shortcut-friendly commands. |
| Craft | Use fewer visual treatments, a clear type scale, restrained semantic color, consistent controls, subtle depth only where it establishes hierarchy, and intentional empty states. |
| Accessibility | Meet contrast requirements in light and dark appearances; do not rely on color alone; retain visible focus, keyboard navigation, readable type, and adequately sized controls. |

## Visual direction

### Foundation

- **Typography:** system UI stack with SF Pro where available and Segoe UI as
  the Windows-native fallback. Use tabular figures for dates, capacity, and
  hours.
- **Color:** near-neutral background and surfaces; StudioSync blue for primary
  actions/selection; semantic green, amber, and red only for recognizable
  state, always paired with text or an icon.
- **Depth:** opaque, lightly separated navigation and inspectors; content is
  grouped primarily through spacing and alignment rather than heavy card
  chrome.
- **Controls:** short, explicit labels; one obvious primary action per context;
  compact desktop controls that remain touch-tolerant where appropriate.
- **Motion:** brief, functional transitions for opening inspectors, changing
  workspaces, reordering, and sync feedback. Respect reduced-motion settings.

### App structure

```text
Global shell
├─ Workspace navigation: My Work, Schedule, Team, Portfolio, Projects, Office
├─ Global command/search entry and sync state
├─ Role-aware account menu
└─ Workspace-specific toolbar and optional inspector
```

The global shell is stable. Workspace navigation changes content without
recreating the window or losing a person’s selected project, staff member,
search, or in-progress safe edit.

### V1.3 usability that must remain visible in mockups

- Schedule staff and project context together during planning.
- Search and keyboard commands (`Ctrl/Cmd+K`, `Ctrl/Cmd+N`, plus existing
  scheduling shortcuts) remain first-class, not buried in menus.
- Drag-to-assign, task/work-card status, priority, due dates, PTO, waiting,
  capacity, comments, Action Items, notes, and folder context retain clear
  entry points.
- Work Cards remain distinct from scheduled task assignments.
- Rollover, Excel refresh, export, staff management, settings, and sync
  recovery remain reachable for authorized people without cluttering staff
  daily work.
- Partners, senior staff, scheduling administrators, and staff receive the
  same visual system but appropriately different workspaces and authority.

## First mockup round

The first round uses fictional V1.3 fixture data and contains:

1. **Unified Schedule shell** — the recommended daily/weekly planning layout.
2. **Planner canvas** — a denser alternative for an active scheduling meeting.
3. **My Work** — the staff daily workspace using the same shell and task/project
   detail conventions.

Each mockup must show a realistic selected state, sync feedback, one primary
action, keyboard discoverability, and how a secondary detail is reached. It
must not invent new V2 data or retire a V1.3 feature.

## Mockup review questions

1. Does a scheduling administrator still see staff capacity, projects, and
   assignable work quickly enough for a live meeting?
2. Does the visual hierarchy make the current next action obvious without
   hiding frequent V1.3 commands?
3. Can a staff member understand what is shared, personal, waiting, and due
   without a tutorial?
4. Does moving between Schedule and My Work preserve useful context?
5. Are priority, waiting, completion, and sync states understandable without
   color alone?
6. Is the interface more breathable without reducing necessary office density?

## Round 1 review decisions (recorded 2026-11-12)

Round 1 critique found that the first mockups showed data V1.3 does not have
and blurred Work Cards with scheduled assignments. The decisions below govern
round 2 and later rounds.

| # | Decision | Status |
| --- | --- | --- |
| D1 | **No capacity or load display on Schedule.** *(Supersedes the earlier D1, which reused V1.3 MyTasks's load model.)* That model (planned Work Card hours against office targets of 8 h/day and 40 h/week) exists in the V1.3 source, but the office does not track hours, so a load bar would read "No work" or "Unscheduled" for almost everyone and mislead. Schedule shows each person's task count, P1 / Waiting / overdue counts and PTO instead. Some Work Cards carry **planned hours**, but they are informational, a guide for the assignee, and not a tracked item: they show only when set (list row, inspector "Planned hours", "Working on now" bar), with a note saying so. Logged time is not shown anywhere. The office may move to tracked hours later; when it does, V1.3's load model and logged time can return, and the data fields (`planned_minutes`, `logged_hours`) already exist. **Open:** whether the V2 Team workspace (V1.3's MyTasks senior view, where the load model lives) should drop it as well. | **Decided** (user, 2026-11-15) |
| D2 | **"Publish Changes" is contextual, not permanent.** In V1.3 Dashboard it is partner-only and visible only while a rollover is active with unpublished changes (`getRolloverPublicationState`: `active && hasUnpublishedChanges`); it opens a confirm ("Publish weekly schedule?" / "Publish scheduling changes?", noting how many tasks stay *Not Reviewed*) and shows a publishing overlay. All other edits sync individually through the outbox, so otherwise the header shows sync status. Existing toolbar vocabulary is kept: **Carryover (n)** filter toggle (shown only when carried-over tasks exist), **Bulk Actions**, **Print**, **Settings**. | Verified against `sd-scheduling` source; adopted |
| D3 | **The Planner canvas becomes a Board \| Week view inside Schedule**, not a rival direction. Rows are people, columns are the five working days. Work Cards are spans (`start_date`–`end_date`); undated cards sit in a "Needs dates" tray; assignments are due-date markers. Each person row shows the V1.3 daily load (card hours spread evenly across working days in the card's range, against the daily target). Only existing fields are used. | Recommended by Codex review and adopted for round 2 |
| D4 | **No invented fields.** Scheduled assignments show priority, status, carryover state (V1.3 term: **Not Reviewed**), due date, partner initials, lead, and a Work cards disclosure (see "V1.3.1 Dashboard alignment"). Status words and Action Item / comment counts live in the inspector, not in the row. They never show planned hours. "Waiting" is a priority label, not a status. | Adopted |
| D5 | **Private tasks are partner-only** (baseline §2). Staff and senior personas have no Private entry in My Work. | Adopted |
| D6 | **Dates.** Mockups use the week of Mon Nov 9, 2026 with "today" as Tue Nov 10 (matches fixture timestamps). The fixture's Drawing QA due date, Nov 14, is a Saturday; it is kept as a weekend edge case rather than relabelled. | Adopted |

### Palette (decided: Meridian Blue)

During the round 2 review the mockup was compared with three palette variants,
each in light and dark. Meridian Blue was chosen and the other two were removed
from the mockup at the user's request:

| Variant | Accent | Notes |
| --- | --- | --- |
| Round 2 (current) | Azure blue `#0b5bd3` | The original mockup colours. **Not V1.3's colour**: both V1.3 apps use indigo `#4D4AD5`. P3/P4 chips differ from V1.3 (V1.3: P1 red, P2 orange, P3 green, P4 blue). |
| Meridian Blue (fixed) | Steel blue `#3b608f` | 21st.dev theme by @serafimcloud. Its tokens are used as published except: stronger control-edge border (3:1), lightened dark-mode text accents and destructive red (the published values fail 4.5:1 as text), plus added success and warning colours (the theme has only a destructive colour). Radius 8 px. |
| V1.3 heritage | Indigo `#4D4AD5` | Values from `sd-scheduling/renderer/styles/tokens.css`: dark slate sidebar (`#2A3439`), V1.3 priority hues, 6/10 px radii. Deepened only where text contrast required. |

Verification: every text/background pair of each variant was computed (>= 4.5:1,
control edges >= 3:1) and the rendered page was audited (6,372 text elements
across six screens, both themes, all three palettes; one failure found and
fixed). V1.3 fonts (Rubik, Source Sans 3) are not used in the mockup, which
keeps the system UI stack from this brief.

**Decided (user, round 2 review):** **Meridian Blue** is the V2 palette (calmer
over an hour-long scheduling meeting). This is a deliberate identity change from
V1.3's indigo and is recorded as such. The company colour **`#011827`** is used
for the title bar in both light and dark themes, as a trial pending review.

Title-bar tokens (`--tb-*` in `mockup.css`): bar `#011827`, text `#eaf0f6`,
secondary text `#a9b8c8`, search field `#0c2539` with a `#5a7691` edge (3:1),
focus ring `#9db7d6`, logo tile inverted (`#eaf0f6` with `#011827`), and the sync
warning/error chips use dark-tinted fills so they stay legible on the navy.
Measured: all title-bar text >= 8.9:1 except the status chips (>= 5.2:1);
rendered audit of 132 title-bar text checks across all six sync states and 2,924
page-wide checks found no failures. The earlier Round 2 (azure) and V1.3
heritage (indigo) variants were removed from the mockup; Meridian is now the only
palette and lives directly in the `:root` tokens of `mockup.css`. One thing from
the comparison is kept on purpose: priority chips use V1.3's hues (P1 red,
P2 amber, P3 green, P4 blue), which the original round 2 colours had not.

**Sidebar (user decision, round 2 review):** the sidebar uses the same `#011827`
so the title bar and sidebar read as one frame around the content (a slightly
lifted navy was tried and rejected because it showed a seam). Sidebar tokens
(`--nav-*`): text `#eaf0f6`, secondary `#a9b8c8`, hover `#12293b`, selected fill
`#1b3a56` with white text and a `#9db7d6` edge marker, focus ring `#9db7d6`.
Selected state is carried by the edge marker (8.8:1), bold text and
`aria-current`, not by the fill alone (about 1.5:1). Measured and audited in the
rendered page: sidebar text (expanded and collapsed rail, light and dark, three
personas), icons 15.8:1, focus ring 8.8:1, and 2,924 page-wide text checks with
no failures.

### V1.3.1 Dashboard alignment (from the user's screenshot of the live app)

The user supplied a screenshot of the V1.3.1 Dashboard ("created based on our
actual usage") as the guide for what the task list and project list must show.
The mockup's rows and Projects panel were rebuilt to match it.

| Area | V1.3.1 shows | Round 2 mockup before | Now |
| --- | --- | --- | --- |
| Task row title | The **project** ("Client \| Address") | A separate task title, project on a second line | Project is the title; the scheduling note is the line under it (italic "Note" placeholder when blank) |
| Task row left | Completion **checkbox** + priority badge (dash = none, W = Waiting, numbers) | Status circle + priority chip | Checkbox + compact priority badge, always with a text name for screen readers |
| Task row right | Calendar icon / due date, **partner initials** chip, "Lead: None" | Due date, "Lead Riley Chen", three count icons | Due date (alert icon when overdue), partner initials, "Lead: None" |
| Work Cards | On-demand "Work cards" disclosure under the row | Count icon | Disclosure that expands the project's cards inline |
| Not in the row | Status words, comment / Action Item counts, hours | Shown | Removed from rows (status, Action Items and comments are in the inspector) |
| Staff group header | Name, green "N tasks" badge, "..." menu | Name, role, load, counts | Name, "N tasks" badge, PTO chip, and a "..." menu whose only item is Set PTO; P1 / Waiting / overdue counts are kept and the load bar was removed (see D1) |
| Navigation aid | Jump rail of staff initials | None | Jump rail with scroll tracking |
| Projects panel | Title + **New Project** + **Import**; **Current / Future** tabs; search; **Active only**; rows with "Client \| Address", partner chips, note, status, task count; A-Z rail | A plain list with open and card counts | All of that, alphabetical, with project status shown as icon + word (Active, On hold, Complete) |
| Header | "All tasks", today's date, "N tasks scheduled", **Add Task** | "Schedule" with several buttons | The task panel has the V1.3.1 header; Bulk Actions, Carryover, Publish Changes (rollover only) and Print stay in the workspace toolbar |

Realistic fictional data now mirrors that usage: roughly half of assignments have
no priority, some have no due date, most show "Lead: None", some notes are blank,
projects have one or two partners and a status (Active, On hold, Complete).

**User review (2026-11-15):** the user confirmed that nothing they use is missing
from the task list or the project list as rebuilt. The inferences below were not
individually confirmed and remain open.

**Answers from the user (2026-11-15) to what had been inferred from the screenshot:**
1. Confirmed: the dash badge means no priority, W means Waiting, numbers are priorities.
2. Confirmed: the calendar icon alone means no due date; the date shows beside it when set.
3. Confirmed: the initials chip is the project's partner(s).
4. The "..." menu on a staff group contains exactly one item, **Set PTO** (the mockup had also invented "print this person's tasks"; removed).
5. Confirmed: "Active only" is on by default. **On hold** and **Complete** statuses do not exist in the office's usage and were removed. A project is either Active or not; the other state is **Inactive** (the correct term, confirmed by the user), which "Active only" hides.
6. **Hours are not tracked.** The capacity / load bar (and the daily load numbers in Week view) were removed everywhere; see D1.

**Resolved:** Work Card planned hours are used, but only as information for the
assignee; hours are not tracked (see D1).

**Availability (user, 2026-11-15):** the Work Card Start / Pause / Resume flow does
not record time. It is a status signal showing that a task is being worked on or
is paused, so that **Partners and Senior staff can see what each staff member is
working on and who is available for additional work**. It is *not* for Schedule or
for staff to see about each other.

**Team / Portfolio = the V1.3.1 Staff Overview (user, 2026-11-15).** The user
pointed to the Staff Overview page of V1.3.1 (partner view in MyTasks) as the model
for this content. In V1.3.1 it is one collapsible section per person (first one
open); each project the person holds is a row with a checkbox, priority badge,
"Client | Project", a Work Card summary ("No Task Cards" / "2 Tasks | 6h") plus due
date, comment count and partner initials. **Clicking a project opens a dialog with
that person's Work Cards for the project** (category, title, date chip, planned
hours, status). V2 keeps the structure and replaces the dialog with the **right-hand
column**:

- **Team** (Senior staff) and **Portfolio** (Partner, as its staff-workload part)
  open the same screen. Section header: avatar, name, PTO badge, one line saying
  what the status means for that person, "N projects", the status chip.
- Rows reuse the Schedule row vocabulary (checkbox, priority badge, project,
  partner chip) and show the Work Card summary and due date. A row also says
  "Working on now" or "Paused" when one of that person's cards on the project is.
- Selecting a row shows that person's Work Cards for that project in the right
  column (status, "Working on now", dates, planned hours if set, assignees), an
  **Add Work Card** button for Partners and Senior staff, and **View in Schedule**.
  Below the inspector breakpoint it becomes a slide-over like the other screens.
- Filters: Everyone / Working / Paused / Nothing in progress. Sort: Name | Status.
  Arrow keys move between project rows.
- Staff do not have it (Avery sees "Team isn't available to Staff"). It is not on
  Schedule, the Week view or the Assign menu.

**Capacity in V1.3.1 (checked 2026-11-15).** It does exist in the latest source:
Settings has daily / weekly capacity (8 h / 40 h), the Staff Overview section header
shows "N projects · Xh this week" with a load bar and a tag (Unscheduled, Available,
On target, Over capacity), the staff sidebar has the same bars plus a Name | Load sort
and a legend, and MyTasks My Week shows daily load. All of it is computed from Work
Card **planned hours**. Because the office does not enter hours, the real app shows
"0h this week" and "Unscheduled" for almost everyone (the user's screenshot). Note
that V1.3.1 labels someone "Available" when planned hours are under half of weekly
capacity, a different meaning from the Start / Pause availability here. **Mockup
decision:** no hours total, load bar or capacity tags on Team. Planned hours are
shown only on a card or summary where one was set. If hours become tracked later, the
V1.3.1 load bar and tags can return.

**Status = Start / Pause only; judging availability is on hold (user, 2026-11-15).**
The user chose to keep this simple. Team / Portfolio shows what the Work Card Start /
Pause flow says and nothing more. There is no "Available" state, no "Available for more
work" toggle, and no inference from Work Cards (earlier rounds tried deriving it, then an
explicit toggle; both were set aside as over-thinking).

| Status | Meaning | Shown as |
| --- | --- | --- |
| Working | The person's focus card is in progress | Play icon + "Working", plus the card and project under the name |
| Paused | Nothing in progress, at least one paused card | Pause icon + "Paused", plus the paused cards. A paused card only means that task is not being worked on right now; it does not mean the person is free |
| Nothing in progress | Anything else (the V1.3.1 My Week wording) | Dash icon + "Nothing in progress" |

Filters: Everyone / Working / Paused / Nothing in progress. Sort: Name | Status. It
updates live: pausing a card as Avery changes Avery's section to Paused, stopping or
completing it changes it to Nothing in progress, starting a card changes it to
Working. In My Work the same bar reads *Working on now*, *Paused* or *Nothing in
progress*, matching the V1.3.1 My Week banner. No new data or sync events are needed:
this reuses the existing Work Card status and focus events.

**Deferred (revisit later, not for this round):** any way to say who has room for
more work, for example deriving it, a self-set flag, or a Senior-set flag. If it
returns, note that V1.3.1 apps reject unknown sync event types ("unsupported type"),
so a new event would need a compatibility plan.

Still open for Team: search and the Due-today toggle from the V1.3.1 Staff Overview
are not on Team yet (Ctrl+K search covers people and projects).

**Team access and Work Card editing (user, 2026-11-15).**

- **Staff get a read-only Team.** Like the V1.3.1 Staff View: every teammate's section
  with the projects they hold (priority, project, scheduling note, due date, partner).
  No Work Card summary, no Start / Pause status, no filters, no right-hand column, and
  no editing. Staff do not see themselves in the list (as in V1.3.1).
- **Partners and Senior staff add and edit Work Cards from Team.** V1.3.1 splits this:
  *Add* is in the Staff Overview dialog (it creates a card for that person on that
  project: title, category, description, planned hours, dates), while *edit, duplicate
  and delete* are only on the project's Work Card board. V2 puts all of it in the Team
  right-hand column:
  - **Add Work Card** below the person's cards, with that person preselected.
  - A **…** menu on each card: **Edit…**, **Duplicate**, **Delete…** (confirm). Delete
    and Edit are undoable from the toast.
  - The form follows the V1.3.1 editor: Title (required), Type, Allotted time (hours,
    optional guide), Start / End date, Assign to project staff, and Status when editing.
  - The same dialogs open from the Schedule inspector's Work Cards tab.
- **Rules kept from V1.3.1:** only Partners and Senior staff (admins) can add, edit,
  duplicate or delete cards; only the assignee starts, pauses or completes one; and
  everything is refused while a weekly rollover review is running, so the buttons are
  disabled with a note (set Rollover to Idle in the mockup controls to try them).
- **Work Card Type (category)** is now in the mockup data and shown on each card with a
  colored marker plus its text label (Planning, Elevations, Diagrams, Details,
  Coordination; the real list comes from Dashboard settings).
- **Lead** is shown on every Work Card as "Lead: Surname" with the full name on hover. As in V1.3.1 it is not a field on the card: it is the project's lead (the lead set on the project's assignments, senior staff only), so it is "Lead: None" when no assignment on the project has one. The add / edit form shows it as read-only context.


### MyTasks V1.3.1 workflow review (source read, 2026-11-15)

Read from `sd-companion` (renderer `app.js`, `lib/*`, main `index.js`,
`database.js`, `sync.js`, `authorizationService.js`). This is what the real app does,
and where the V2 mockup differs.

**Navigation by role.** Staff see tabs *My Projects* (their assigned projects),
*My Week* and *Staff View* (read-only). Senior staff (`is_admin`) additionally get a
staff sidebar and the full *Staff Overview*. Partners get *My Work* (private tasks
plus assigned projects), *My Week*, *My Projects* (the partner's own project
portfolio: Active / Future / Inactive, Add Project) and *Staff Overview*. Every role
with the tab bar also has a Team due-date calendar button (office-wide project due
dates and Work Cards by category, driven by a Dashboard setting). The last tab is
remembered per person.

**Daily flow for staff.** Project rows grouped *Due today or overdue / Active /
Waiting / Completed* with a checkbox (complete with Undo toast), priority pill,
project title, due chip, Work Card summary ("No Task Cards" / "2 Tasks | 6h"),
comment count and teammates' initials. Clicking a row opens the **project detail
panel** on the right with two tabs: *Work cards* and *Project info* (people, folder
link, shared Project Notes which open in their own window). Action Items (steps with
assignees and due dates) and the comment drawer belong to the task.

**Work Cards.** A project-and-week board with columns *To do / In progress / Done*
(Done is folded). Each card: **category (colored Type)**, title, description, date
chip ("2d late", "due tomorrow"), "Nh planned" or "No hours set", a schedule
progress bar, first assignee avatar, project Lead. Visible to Partners / admins and
to people assigned to the project. Only Partners and admins create, edit, duplicate
and delete cards, and all of that is blocked during a rollover review.

**Start / Pause / Complete.** Only the **assignee** can run these, including staff;
even a Partner cannot start, pause or complete someone else's card. Start sets the
person's single "focus" card. Pause keeps the card in progress with a paused flag and
**keeps the focus**; Resume, Complete, Reopen and "Stop and return to To do" are in
the card menu. My Week shows a banner: *Working on: X [Pause] [Complete]*, *Paused:
X [Resume] [Complete]* or *Nothing in progress*. A project Lead gets a Windows
notification when someone else completes a card. Focus changes are still allowed
during a rollover review; card edits are not.

**Rollover.** While the Dashboard runs the weekly review, every MyTasks window dims
with an "In Review" overlay (tasks locked).

**Capacity.** See above: all derived from planned hours, so "0h / Unscheduled" for
most people.

**Where the mockup differed, and what changed or is open.**

| Finding | Mockup before | Now |
| --- | --- | --- |
| Staff can complete their own Work Cards (assignee-only, no Partner override) | "Staff cannot complete Work Cards" | **Fixed**: Complete / Stop are assignee-only buttons next to Start / Pause; the Manage block has Edit only |
| Pause keeps the focus; idle wording is "Nothing in progress" | Pause cleared focus; no idle state | **Fixed**: bar shows Working / Paused / Nothing in progress |
| Staff already see a read-only Staff View of teammates' projects | Staff get "Team isn't available" | **Decided**: Staff get a read-only Team, no status, no Work Cards |
| Partner has *My Projects* (own portfolio) **and** Staff Overview | One merged "Portfolio" screen | **Done in round 3**: Portfolio is its own screen (My projects + Staff); Team is the Senior-staff version of the staff part |
| Work Cards have a colored **category** (Type) and a Lead | No category, no Lead shown | **Done**: Type is on cards and in the add / edit form; the card shows **Lead: Surname** (or "Lead: None"), which is the project's lead set on its assignments, as in V1.3.1. The week-view span colors by Type are still open |
| Work Card board (To do / In progress / Done, Done folded) on the project | List rows in the inspector | **Done in round 3**: project panel with the Work Card board |
| Team due-date calendar (office-wide) | Not present | **Open**: place it (Schedule view or Portfolio) |
| Staff "My Work" is called *My Projects* for staff, *My Work* for Partners | "My Work" for everyone | **Open**: naming |
| Rollover dims MyTasks, locks card edits but not focus | Rollover only affects Schedule | **Open**: add the locked state to My Work |
| Project Notes open in a separate window | Toast only | **Open**: keep as a window or fold into the inspector |

### Finish layer: depth, softness and motion (round 2 review feedback)

Feedback: layout and palette were right, but the mockup felt rigid and stiff. The
causes found were concrete: the window and every popover, dialog and toast had no
shadow (the shadow token was invalid CSS), every control had a `0s` transition,
the whole DOM was rebuilt on each interaction (so even added transitions could not
run), and the type and lists were hard-edged (uppercase letter-spaced labels,
full-bleed ruled rows, default scrollbars).

What changed (`docs/mockups/round-2/finish.css`, loaded after `mockup.css`, plus
a DOM-patching renderer in `mockup.js`):

- **Depth and material:** layered window and popover shadows, translucent blurred
  sticky headers and menus, a soft top highlight on the navy bar, thin overlay-style
  scrollbars, a faint accent glow behind the page.
- **Softer geometry and type:** 10 px window, rounded inset list rows with inset
  hairlines (no full-bleed rules), pill chips, sentence-case section labels instead
  of uppercase tracking, tighter display headings.
- **Motion:** 120-340 ms ease-out transitions on hover, press, selection and the
  sidebar collapse (labels fade while the rail narrows and icons stay put); a
  segmented control with a sliding thumb; an accent pill that grows into the
  selected row and sidebar item; entrance animations for the window, dialogs,
  popovers and toasts; a short cross-fade when the view or selection changes.
  Everything is disabled under `prefers-reduced-motion`.
- **Renderer:** `render()` now patches the live DOM instead of replacing it, so
  elements keep identity, focus, scroll position, hover state and in-progress
  comment text, and transitions actually run.
- **Responsive rows:** rows adapt to the width of the list itself (container
  query), not the window. In a narrow list the counts drop under the title (and the
  lead line is dropped; it is in the inspector) so titles are never squeezed to a
  few characters. This also fixed a pre-existing flaw seen when a side panel was
  dragged wide ("Drawing QA" truncated to "D...").

Constraints kept: contrast unchanged (14,220 rendered text checks, no failures;
button-gradient extremes measured separately at >= 4.76:1), status still carried by
shape and words, focus rings kept, no V1.3 behaviour or data touched.

Limits: motion was verified by mechanism (running transitions, node identity,
final states, reduced-motion rule), not by watching frames, because the review
pane only paints on demand; it needs a look in a real window. Needs Chromium with
`light-dark()`, container queries and `:has()`; V1.3's Electron 43 supports all of
them.

### Object vocabulary

| Object | Marker shape | Always labelled |
| --- | --- | --- |
| Scheduled assignment | Completion checkbox | Priority badge (number, W, or dash) beside the checkbox in list rows; the status word (Not started / In progress / Done) appears in the inspector, never in the row (user decision, round 2 review; matches the V1.3.1 Dashboard) |
| Action Item | Checkbox row inside an assignment | "Action Item" |
| Work Card | Square (to do / in progress / paused / done) with stacked-cards icon | "Work Card" + status word; "Working on now" badge for the viewer's focus |
| Private task | Lock icon | "Only you" |

Status is carried by icon shape plus a word everywhere; color only reinforces.

### Round 2 mockups

Location: `docs/mockups/round-2/index.html` (plain HTML/CSS/JS, no build step;
open it directly in a browser, or serve the folder with
`npx serve docs/mockups/round-2`). Fictional data only,
modelled on `fixtures/v1.3-baseline`, scaled to 11 staff, 20 projects and about
36 assignments to test density. The frame above the window has persona, density,
window-width, theme, sync-state and rollover selectors (palette selector removed after the Meridian decision); each screen has a
"What to evaluate here" panel listing its assumptions.

Screens: Schedule board (both densities), drag-and-assign state with keyboard
"Assign to…", Week view, My Work (staff, senior, partner personas), objects and
states spec, sync states, search, role matrix, rollover review, shortcut sheet.
Team, Portfolio, Projects, Office, sign-in and first-run migration remain for
round 3.

### Round 3 mockups (in progress)

Location: `docs/mockups/round-3/` (a copy of round 2, kept separate so round 2 stays as
the reviewed record). Serve with `npx serve docs/mockups/round-3` (launch entry
`v2-mockup-round-3`, port 3003). The user reviewed round 2 while it was built and
approved moving on, with polish still to come.

**Step 1 (done): project detail and the Partner Portfolio.**

- **Project panel** (right-hand column, anywhere a project is selected). Two tabs, as in
  V1.3.1: *Work cards* and *Project info*.
  - *Work cards* is a board: **To do / In progress / Done** (Done folded, with a count).
    The V1.3.1 board is three columns side by side; here the columns stack so they fit
    the narrow panel. Each card shows Type, title, description, a date chip ("2d late",
    "due tomorrow"), planned hours if set, Paused / Working on now, a schedule-progress
    bar (elapsed share of the date range; it does not track time), assignees and Lead.
  - Assignee actions on the card: **Start**, then **Pause** and **Complete**; **Resume**
    when paused; **Reopen** when done. The card's **…** menu holds **Stop and return to
    To do** and **Mark complete** (assignee) and **Edit / Duplicate / Delete** (Partners
    and Senior staff). **Add** sits in the heading for Partners and Senior staff.
  - Visibility follows V1.3.1: Work Cards are visible to Partners, Senior staff and
    people assigned to the project.
  - *Project info*: Details (client, project, status, scheduling notes), People
    (assigned, project lead, partner), Project folder (open / change) and Project
    notes (opens in its own window in V1.3.1; a button here).
- **Portfolio** is now its own Partner screen, from the V1.3.1 *My Projects* and
  *Staff Overview* tabs. A segmented control switches **My projects** and **Staff**
  (the Team view, unchanged).
  - *My projects*: projects the Partner is partner on, grouped **Active / Future /
    Non-Active** (collapsible, with counts), search, and **Add Project** (client,
    project name, scheduling notes, "Add to Future Projects"). Each row shows the
    project, assigned staff avatars (up to four, then +n), a status chip with text and
    icon, and the scheduling note (or "No scheduling notes yet").
  - A project's **…** menu mirrors the V1.3.1 context menu: Edit project, Assign to
    (the existing person picker), Move to Current / Make Active, Mark Inactive, View
    Activity, Duplicate, Delete (confirm; its assignments and Work Cards go too).
    Status changes, add, duplicate and delete are undoable from the toast.
  - Senior staff and Staff do not have Portfolio (they see an explanation). Senior
    staff use Team; Partners reach the same staff view inside Portfolio.
- **My Work**: selecting a project on the left now shows the same project panel.

**Full-size test version.** `docs/mockups/round-3/StudioSync-V2-mockup.html` is one self-contained file (no server, no internet): double-click it to open in any browser. The window fills the page, with a **View as: Staff / Senior staff / Partner** switcher (each lands on that role's default screen: My Work, Team, Portfolio) and demo controls for Weekly review (set to Idle to add or edit Work Cards), Sync, Density and Theme, plus **Reset data**. `app.html` is the same thing as separate files for development; rebuild the single file with `node docs/mockups/round-3/build-standalone.js`. Changes live only in the open page (reload or Reset data to start over).

**Still to do in round 3:** Projects (the catalogue), Office, sign-in and first-run
migration, the Team due-date calendar, the locked "In Review" state for My Work,
Team search and the Due-today toggle, and Work Card Type colors in the Week view.

## Phase 1 status

- [x] Establish the visual and interaction principles for the first mockup
  round.
- [x] Produce the first interactive mockup directions using fictional data.
- [x] Review a preferred direction and record changes (see "Round 1 review
  decisions"; D2 and D3 await confirmation).
- [x] Review round 2 mockups (`docs/mockups/round-2/`); reviewed while built, polish items still to come.
- [ ] Produce the complete approved screen inventory: My Work, Team, Portfolio,
  Schedule, Projects, Office, sign-in, and first-run migration.
- [ ] Walk through V1.3 weekly and role-specific workflows against approved
  mockups.
