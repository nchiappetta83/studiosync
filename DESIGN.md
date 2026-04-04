# SD Apps â€” Design System & Architecture

> Current StudioSync branding, app IDs, repo layout, and release-flow notes are captured in the `Current Update (2026-04-03)` section near the end of this file.

## Overview

**SD Apps** is a two-app scheduling ecosystem built with Electron for a small professional services firm. Both apps share the same design language, database schema, and sync engine, but serve different audiences:

- **SD Scheduling** â€” The admin dashboard. Partners and managers use it to assign tasks, import projects from Excel, manage staff, set PTO, configure priorities/roles, publish a global update folder, and export schedules (PDF/HTML). This is the source of truth. Runs as a **portable app** from a shared server folder or via installer.

- **SD Companion** â€” A lightweight companion installed on each user's desktop. Partners see their assigned tasks, private tasks (local-only), staff overviews, and project notes. Staff see only their own assignments. No admin controls.

The main app lives on a shared network drive and stores its database alongside the executable. Companion apps each maintain their own local SQLite database and sync via a shared event-file system.

---

## 1. Color Palette â€” Tonal Surface Hierarchy

### Surfaces (light to dark nesting)
| Token              | Hex       | Usage                              |
|--------------------|-----------|------------------------------------|
| `--bg`             | `#F7F9FB` | Canvas â€” lightest surface          |
| `--bg-secondary`   | `#F0F4F7` | Panels, hover zones                |
| `--bg-tertiary`    | `#E4EAF0` | Pressed states, nested containers  |
| `--bg-card`        | `#FFFFFF` | Elevated card surfaces             |
| `--bg-card-hover`  | `#FAFBFC` | Card hover â€” 1-step tonal shift    |

### Sidebar (dark charcoal â€” main app only)
| Token                        | Hex       |
|------------------------------|-----------|
| `--sidebar`                  | `#2A3439` |
| `--sidebar-hover`            | `#353F45` |
| `--sidebar-selected`         | `#1E2629` |
| `--sidebar-pill`             | `#3D4A52` |
| `--sidebar-text`             | `#E8ECF0` |
| `--sidebar-text-secondary`   | `#8A9AA6` |

### Accent
| Token            | Hex       |
|------------------|-----------|
| `--accent`       | `#4D4AD5` |
| `--accent-hover` | `#3F3CC4` |
| `--accent-light` | `#EDEDFB` |

### Priority Colors
| Level | Foreground | Background |
|-------|-----------|-----------|
| 1     | `#D95F5F` | `#FDF2F2` |
| 2     | `#D4883A` | `#FDF5ED` |
| 3     | `#2EAD7F` | `#EEFAF5` |
| 4     | `#4880C8` | `#EEF4FB` |
| W     | `#8899AA` | `#F2F4F6` |

### Text (never pure black)
| Token              | Hex       |
|--------------------|-----------|
| `--text-primary`   | `#2A3439` |
| `--text-secondary` | `#5C6B75` |
| `--text-tertiary`  | `#94A3AF` |

### Borders, Badges & Special
| Token              | Hex       | Usage                        |
|--------------------|-----------|------------------------------|
| `--border`         | `#E4EAF0` | Ghost borders, dividers      |
| `--border-light`   | `#F0F4F7` | Subtle inner edges           |
| `--badge-bg`       | `#2EAD7F` | Task count badges            |
| `--badge-fg`       | `#FFFFFF` | Badge text                   |
| `--status-active`  | `#D4A017` | Project "ACTIVE" label       |
| `--pto-bg`         | `#FDF0E0` | PTO badge background         |
| `--pto-text`       | `#D4883A` | PTO badge text               |
| `--danger`         | `#D95F5F` | Destructive actions          |
| `--success`        | `#2EAD7F` | Positive indicators          |

---

## 2. Typography

| Role    | Font    | Stack                                                   |
|---------|---------|---------------------------------------------------------|
| Display | Rubik | `'Rubik', 'Segoe UI', 'SF Pro Display', sans-serif`  |
| Body    | Source Sans 3   | `'Source Sans 3', 'Segoe UI', 'SF Pro Text', sans-serif`       |

### Type Scale
| Element              | Font    | Size  | Weight |
|----------------------|---------|-------|--------|
| Page heading         | Display | 28px  | 800    |
| Section heading      | Display | 18-20px | 700-800 |
| Staff section header | Display | 16px  | 700    |
| Body text / tasks    | Body    | 13px  | 400    |
| Project card title   | Body    | 13px  | 700    |
| Notes (italic)       | Body    | 11px  | 400i   |
| Labels / uppercase   | Body    | 10-11px | 600-700 |
| Badge text           | Body    | 8-9px | 600    |
| Status label         | Body    | 9px   | 700    |

---

## 3. Visual Boundaries

Boundaries are defined through **background color shifts** (tonal hierarchy), with **1px separator lines** (`--border`) only where content grouping demands it.

### Tonal boundaries (no lines)
- Sidebar (`#2A3439`) to main content (`#F7F9FB`)
- Main content to secondary panels (`#F0F4F7`)
- Cards (`#FFFFFF`) on page background â€” elevated via ambient shadow

### Explicit 1px lines (`#E4EAF0`)
- Between staff sections in task lists
- Splitter handles between panels
- Input field focus outlines

### No lines used
- Inside cards (hover tonal shift instead)
- Between individual task cards (8px gap)
- Between individual project cards (10px gap)

---

## 4. Elevation & Shadows

Cards sit on `--bg-card` (`#FFFFFF`) atop the workspace `--bg` (`#F7F9FB`). Shadows are tinted with `--text-primary` at very low opacity:

| Usage      | Shadow                                                          |
|------------|-----------------------------------------------------------------|
| Card       | `0 2px 8px rgba(42,52,57,0.06), 0 4px 20px rgba(42,52,57,0.04)` |
| Card (lg)  | `0 4px 12px rgba(42,52,57,0.08), 0 8px 28px rgba(42,52,57,0.06)` |
| Dropdown   | `0 8px 32px rgba(42,52,57,0.12)`                                |
| Dialog     | `0 16px 48px rgba(42,52,57,0.16)`                               |

---

## 5. Spacing & Radii

### Spacing Scale
| Token         | Value |
|---------------|-------|
| `--space-xs`  | 4px   |
| `--space-sm`  | 8px   |
| `--space-md`  | 12px  |
| `--space-lg`  | 16px  |
| `--space-xl`  | 20px  |
| `--space-2xl` | 28px  |

### Border Radii
| Token           | Value |
|-----------------|-------|
| `--radius-sm`   | 6px   |
| `--radius-md`   | 10px  |
| `--radius-lg`   | 12px  |
| `--radius-pill` | 100px |

---

## 6. Components

### Buttons
Pill-shaped (`border-radius: 100px`) with 6px gap for icon+label. Variants: `btn-primary` (accent), `btn-accent` (accent-light bg), `btn-danger`, `btn-ghost`. Size variant: `btn-sm`.

### Badges
Uppercase, 9px, 600 weight. Variants: `badge-green` (task counts), `badge-pto` (orange PTO), `badge-status` (project status).

### Cards
Individual card per task and per project. White background, ambient shadow, hover tonal shift. Never group multiple items into one container card.

### Dialogs
Modal overlays with `--shadow-dialog`. Standard structure: header (title + close), body (form fields), footer (cancel + action buttons).

### Tabs
Underline-style text tabs. Active: accent color + 2px bottom border, weight 700. Inactive: tertiary text, weight 500.

### Scrollbars
Thin (4px), subtle, always-present. Handle uses `--text-tertiary` at low opacity.

### Avatar Colors
Muted tones for sidebar/user avatars:
`#5856A6  #3D8A6E  #A8803F  #5478A3  #A65C5C  #7E5FA6  #3D8A9E`

---

## 7. Architecture

### Technology Stack
| Component     | Technology                    |
|---------------|-------------------------------|
| Runtime       | Electron 33                   |
| Database      | SQLite via `better-sqlite3`   |
| IDs           | `uuid` v4                     |
| Excel import  | `exceljs` (main app only)     |
| Build         | `electron-builder`            |
| Fonts         | Google Fonts (Rubik + Source Sans 3)|

### Process Model
Both apps use Electron's standard architecture:
- **Main process** â€” Database, sync engine, auth, IPC handlers, window management, lock file (main app only)
- **Preload script** â€” Bridges `window.api` via `contextBridge` (context isolation enabled)
- **Renderer** â€” Vanilla JS, no framework. DOM manipulation with component modules

### Data Flow
```
Renderer  â”€â”€(ipcRenderer.invoke)â”€â”€>  Main Process  â”€â”€>  SQLite DB
                                         â”‚
                                         â”œâ”€â”€>  SyncEngine.pushEvent()  â”€â”€>  Shared Drive (JSON files)
                                         â”‚
                                         â””â”€â”€>  BrowserWindow.send('data-updated')  â”€â”€>  Renderer refreshes
```

---

## 8. Database Schema

Both apps share the same base schema (11 migration versions). The companion adds one local-only table.

### Shared Tables (synced via events)

| Table               | Purpose                          | Key Columns                                         |
|---------------------|----------------------------------|-----------------------------------------------------|
| `users`             | Team members                     | `id`, `username`, `display_name`, `role` (partner/staff/bootstrap), `avatar_color`, `business_role_id`, `is_admin`, `can_self_assign` |
| `tasks`             | Assigned work items              | `id`, `project_id`, `assigned_to`, `created_by`, `title`, `notes`, `priority`, `priority_label`, `due_date`, `completed`, `confirmed`, `partner_id`, `category` (current/last_week), `sort_order` |
| `sub_tasks`         | Action Items on tasks            | `id`, `task_id`, `title`, `completed`, `assigned_to` |
| `comments`          | Discussion on tasks              | `id`, `task_id`, `author_id`, `body`, `created_at`  |
| `projects`          | Client projects (from Excel)     | `id`, `client`, `name`, `notes`, `status`, `category` (current/future), `partner_id`, `partner_ids`, `partner_initials` |
| `project_notes`     | Partner-authored notes (v6)      | `id`, `project_id`, `notes`, `updated_by`, `updated_at` |
| `staff_pto_dates`   | Individual PTO dates (v5)        | `id`, `user_id`, `pto_date`                          |
| `business_roles`    | Custom job titles (v2)           | `id`, `name`, `sort_order`                           |
| `custom_priorities` | Configurable priority labels (v2)| `id`, `label`, `color`, `sort_order`                 |

### Companion-Only Table (local, never synced)

| Table            | Purpose               | Key Columns                                                  |
|------------------|-----------------------|--------------------------------------------------------------|
| `private_tasks`  | Partner's private work | `id`, `project_id`, `owner_id`, `title`, `notes`, `priority`, `due_date`, `completed`, `sort_order` |

### Metadata Tables

| Table       | Purpose             |
|-------------|---------------------|
| `meta`      | Schema version, last rollover week |
| `sync_meta` | Legacy sync cursor plus processed sync filenames |

---

## 9. Sync Engine

Both apps use the same file-based sync mechanism over a shared network drive.

### How it Works
1. Each app has its own local SQLite database (no shared DB, no lock conflicts)
2. Mutations push JSON event files to `<sharedDrivePath>/events/<timestamp>_<username>_<type>_<uuid>.json`
3. Event files are written atomically through a temp-file rename
4. A 5-second polling loop validates and applies new event files to the local DB
5. Processed filenames are tracked locally so delayed or previously failed files are not silently skipped
6. After applying events, the main process sends `data-updated` to the renderer
7. Events are idempotent â€” replaying them produces the same result

### Event Types
`user-created`, `user-updated`, `user-deleted`, `task-created`, `task-updated`, `task-deleted`, `subtask-created`, `subtask-updated`, `subtask-toggled`, `subtask-deleted`, `comment-added`, `project-created`, `project-updated`, `project-notes-updated`, `pto-set`, `pto-cleared`, `setting-updated`, `business-role-created`, `custom-priority-created`, `weekly-rollover`, `task-confirmed`, and more.

### Companion Setup
On first launch, the companion app shows a folder picker for the shared drive path. Once selected, the path is saved locally and used for all future sessions.

Selecting a shared folder explicitly is treated as a fresh connection: the companion resets its local cache database and saved login before re-syncing from that shared location.

---

## 10. Authentication

Both apps use **username-based login** â€” no passwords, no Windows account dependency.

1. Admin creates staff in the main app with first/last name
2. A username is auto-generated: first initial + full last name, lowercase (e.g., "Nick Chiappetta" â†’ `nchiappetta`)
3. Users sign in by typing their username on a compact branded login screen
4. The username is saved to `config.json` â€” users stay signed in across restarts
5. Signing out clears the saved username and returns to the login screen. In MyTasks, sign-out now lives in the settings gear menu.

The main app also supports a bootstrap admin account for first-time setup. That account is hidden from normal staff/partner lists until it is explicitly converted into a real staff or partner user.

---

## 11. SD Scheduling (Main App)

### Deployment
The main app can be deployed either as a **portable application** or with an **interactive installer**. The portable option uses the `win-unpacked/` folder copied to a shared server location. The installer option allows the install location to be chosen, defaults under `C:\SD Apps`, forces current-user scope, and creates a desktop shortcut automatically. In both cases, database, config, and lock file live in a `data/` subfolder next to the executable.

### Office-Wide Updates
The Scheduling app can publish a **global update folder** in Settings. That path is stored as synced shared metadata, so every Companion install receives it through normal event sync. Both apps scan that folder for the newest matching installer (`StudioSync Setup <version>.exe` or `StudioSync MyTasks Setup <version>.exe`), compare it with the running app version, and can prompt the user to launch the newer installer.

### Lock File
A lock file prevents concurrent dashboard access. Before the shared drive is configured, the app uses a local fallback `.lock`. Once the shared path is chosen, it switches to a shared `.dashboard.lock` that carries the app user, machine name, and a lock token. The lock auto-expires after 2 minutes if the app crashes without cleaning up.

### Layout
```
+----------+---------------------------+-------------------+
| Sidebar  |       Tasks Area          |    Projects       |
|  240px   |    min 450px, flex 3      |  min 340px, flex 2|
|  fixed   |       ~60%                |      ~40%         |
+----------+---------------------------+-------------------+
```

Three-panel layout with a draggable splitter between tasks and projects.

### Features
- **Task Management** â€” Create, assign, prioritize, reorder (drag), confirm tasks
- **Staff Sidebar** â€” Staff list with task counts, PTO badges, drag-drop assignment
- **Project Panel** â€” Imported from Excel, draggable onto staff to create tasks, with new-project defaults tied to the active Current/Future tab
- **Excel Import** â€” Reads `.xlsx` and upserts projects with auto-refresh
- **Faster Startup Paint** â€” Shows the window before longer sync and Excel initialization work completes
- **PDF Export** â€” 11x17 tabloid format for printing
- **HTML Export** â€” Auto-updating file on shared drive, staff can bookmark it
- **Weekly Rollover** â€” Triggered Mondays: deletes completed tasks and their subtasks, moves incomplete tasks to "Last Week", clears PTO and priorities
- **Admin Settings** â€” Manage users, business roles, custom priorities, export paths, the global update folder, and MyTasks self-assign permissions
- **Drag-and-Drop** â€” Projects to staff, tasks between staff, with ghost card insertion

### Admin-Only Features
- User CRUD (create/edit/delete staff and partners)
- Business role management
- Custom priority configuration
- Excel import / refresh
- Export path configuration
- Global update folder configuration
- Weekly rollover trigger

---

## 12. SD Companion

### Deployment
Installed on each user's desktop via an interactive NSIS installer. The installer allows the destination folder to be chosen, defaults under `C:\SD Apps`, forces current-user scope, and creates a desktop shortcut automatically. On first launch, the user selects the shared drive folder and signs in with their username. For packaged installs, local config and cache DB live in a `data/` folder next to that installed executable.

### Layout
```
+----------+-----------------------------+------------------+
| Sidebar  |       Main Panel            |  Detail Panel    |
| 220px    |  Task list + projects       |  Task details    |
| collapsible                            |  Action Items, comments|
+----------+-----------------------------+------------------+
```

Three-panel layout. Sidebar collapses to 40px. Detail panel shows on task selection.

### Views
- **My Tasks** â€” Shared assigned work for the signed-in user, plus private partner tasks where applicable
- **Staff Overview** â€” All staff members' task assignments (partner-only)
- **My Projects** â€” Partner workspace for active/future/inactive projects with project detail editing, assigned staff avatars, and context-menu actions

### Features
- **Private Tasks** â€” Local-only tasks visible only to the partner, never synced
- **Project Details + Notes** â€” Partners can edit project fields and notes from My Projects
- **Project Creation** â€” Partners can add projects as current or future directly from MyTasks
- **Action Items** â€” View, toggle, add, edit, and delete task Action Items (backed by `sub_tasks`) and share them across staff assigned to the same project-linked work
- **Shared Assignees** â€” Project-linked task detail shows everyone assigned to that project
- **Comments** â€” View and add shared comments on project-linked tasks
- **Search** â€” Filter tasks by title and notes
- **Stats Bar** â€” Pending / Completed / Overdue filter buttons
- **Settings Gear** â€” Houses sign-out and low-frequency controls without crowding the top bar
- **Sync Status Dot** â€” Shows sync activity beside the signed-in user badge
- **Real-time Sync** â€” Receives updates from main app via shared drive events (5-second polling)
- **Username Login** â€” Simple username entry, saved for future sessions
- **Private Partner Workspace** â€” Private tasks remain local to that companion install and do not sync back to Scheduling
- **Staff Self-Assign Option** â€” Selected staff can add project-linked tasks to their own MyTasks list, add Action Items to their own work, and adjust priority on those shared tasks
- **Update Checks** â€” Reads the synced global update folder and can prompt to launch a newer installer
- **Project Assignment Menu** â€” Partner project context menus support assign-to staff, duplicate, delete, and move-to-current flows

### Role-Based Visibility
| Feature              | Partner | Staff |
|----------------------|---------|-------|
| My Tasks             | Yes     | Yes   |
| Private local tasks  | Yes     | No    |
| Staff Overview       | Yes     | No    |
| Staff Sidebar        | Yes     | No    |
| My Projects          | Yes     | No    |
| Add Private Task     | Yes     | No    |
| Edit project details | Yes     | No    |
| Project Notes        | Yes     | No    |
| Assigned tasks       | Yes     | Yes   |
| Action Items         | Yes     | Yes*  |
| Comments on shared   | Yes     | Yes   |
| Add task to own list | Yes     | Yes*  |

\* Staff creation of shared tasks and Action Items depends on the `can_self_assign` permission managed in the Scheduling app.

---

## 13. Build & Distribution

### StudioSync
```bash
cd sd-scheduling
npm install
npm run build
# Output:
#   dist/win-unpacked/
#   dist/StudioSync Setup <version>.exe
```

### StudioSync MyTasks
```bash
cd sd-companion
npm install
npm run build
# Output:
#   dist/StudioSync MyTasks Setup <version>.exe
#   dist/win-unpacked/
```

### Build Notes
- `better-sqlite3` is a native module â€” `electron-rebuild` runs automatically via `postinstall`
- Both apps build interactive NSIS installers and also produce `win-unpacked/` folders
- GitHub release tags currently publish the unsigned installers plus zipped `win-unpacked` packages
- Main app data stored in `data/` folder next to the executable
- Companion packaged-install data stored in `data/` next to the installed executable
- SignPath setup is documented for future use, but the current live release flow is unsigned

---

## 14. Weekly Rollover

Triggered by an admin on Monday (or whenever a new week is detected). The rollover:

1. **Deletes subtasks** belonging to completed tasks
2. **Deletes completed tasks** entirely (clean slate)
3. **Moves incomplete tasks** to `category = 'last_week'` so they appear under a "Last Week" heading
4. **Resets** `confirmed = 0` and `priority = 0` on all remaining tasks
5. **Clears all PTO dates**

New tasks created after rollover default to `category = 'current'`.

---

## 15. Do's and Don'ts

### Do
- Use CSS custom properties (`--token`) for all colors, spacing, shadows
- Use individual cards for each task and project
- Use tonal shifts to define layout zones
- Use Display font (Manrope) for headings, Body font (Inter) for everything else
- Use ambient shadows (highly diffused, tinted) for card elevation
- Use muted avatar colors
- Use pill-shaped buttons and badges
- Use the sync engine for all shared data mutations
- Keep private tasks completely local (no sync, no events)
- Use username-based login with auto-generated usernames (first initial + last name)
- Store main app data portably next to the executable

### Don't
- Use pure black (`#000000`) â€” always `--text-primary` (`#2A3439`)
- Use 1px dividers inside or between cards
- Group multiple items into one container card
- Use bright/saturated colors for avatars
- Share a SQLite database file between apps (use sync engine instead)
- Store private tasks in the sync events
- Rely on Windows username detection for authentication
- Store main app data in `%APPDATA%` (it must be portable)

## Current Update (2026-04-03)

This section is the current source of truth for the app naming, repository shape, and release flow.

- `StudioSync` is the main dashboard app.
- `StudioSync MyTasks` is the companion app.
- The current app IDs are `com.studiosync.dashboard` and `com.studiosync.mytasks`.
- The current GitHub release workflow lives in `.github/workflows/release-signpath.yml`.
- The current workflow publishes unsigned installers and `win-unpacked` zip packages to GitHub Releases.
- The SignPath restoration guide lives in `docs/signpath-setup.md`.
- The current build icons are `sd-scheduling/assets/studiosync-main.ico` and `sd-companion/assets/studiosync-mytasks.ico`.
- The current brand masters are `sd-scheduling/assets/studiosync-main.svg` and `sd-companion/assets/studiosync-mytasks.svg`.
- The current installers default under `C:\SD Apps` and force current-user install mode.
- Both apps now open in compact branded sign-in windows before transitioning to the full shell.

When older sections below mention `SD Scheduling` or `SD Companion`, read them as the current StudioSync names.
