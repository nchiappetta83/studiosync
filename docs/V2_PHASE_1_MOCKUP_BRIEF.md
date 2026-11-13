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
| D1 | **Capacity reuses the existing V1.3 MyTasks model; no new data.** Load = the person's not-done Work Card `planned_minutes` for the displayed week (each assignee is credited the card's full minutes, as V1.3 does) against the shared office targets (`getOfficeCapacity`: default 8 h/day, 40 h/week, partner-editable in Preferences). Load states and thresholds are V1.3's: **No work** (0 h), **Available** (< 50 %), **On target** (50–100 %), **Over capacity** (> 100 %); with no open projects the label is **No projects**, with projects but no card hours **Unscheduled**. Scheduled assignments contribute no hours. Each state is a segmented bar plus an icon plus its word. Secondary counts (open assignments, P1, Waiting) may sit beside it but never feed the load. The Schedule workspace newly surfaces this model (V1.3 shows it only in MyTasks Team/staff views); verify that is wanted. | **Decided** (user; model verified against `sd-companion` source) |
| D2 | **"Publish Changes" is contextual, not permanent.** In V1.3 Dashboard it is partner-only and visible only while a rollover is active with unpublished changes (`getRolloverPublicationState`: `active && hasUnpublishedChanges`); it opens a confirm ("Publish weekly schedule?" / "Publish scheduling changes?", noting how many tasks stay *Not Reviewed*) and shows a publishing overlay. All other edits sync individually through the outbox, so otherwise the header shows sync status. Existing toolbar vocabulary is kept: **Carryover (n)** filter toggle (shown only when carried-over tasks exist), **Bulk Actions**, **Print**, **Settings**. | Verified against `sd-scheduling` source; adopted |
| D3 | **The Planner canvas becomes a Board \| Week view inside Schedule**, not a rival direction. Rows are people, columns are the five working days. Work Cards are spans (`start_date`–`end_date`); undated cards sit in a "Needs dates" tray; assignments are due-date markers. Each person row shows the V1.3 daily load (card hours spread evenly across working days in the card's range, against the daily target). Only existing fields are used. | Recommended by Codex review and adopted for round 2 |
| D4 | **No invented fields.** Scheduled assignments show priority, status, carryover state (V1.3 term: **Not Reviewed**), due date, lead, Action Item and comment counts, and Work Card count. They never show planned hours. "Waiting" is a priority label, not a status. | Adopted |
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

### Object vocabulary

| Object | Marker shape | Always labelled |
| --- | --- | --- |
| Scheduled assignment | Circle (not started / in progress / done) | Priority chip beside the status circle in list rows; status word in the inspector, tooltip and screen-reader label (user decision, round 2 review) |
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

## Phase 1 status

- [x] Establish the visual and interaction principles for the first mockup
  round.
- [x] Produce the first interactive mockup directions using fictional data.
- [x] Review a preferred direction and record changes (see "Round 1 review
  decisions"; D2 and D3 await confirmation).
- [ ] Review round 2 mockups (`docs/mockups/round-2/`).
- [ ] Produce the complete approved screen inventory: My Work, Team, Portfolio,
  Schedule, Projects, Office, sign-in, and first-run migration.
- [ ] Walk through V1.3 weekly and role-specific workflows against approved
  mockups.
