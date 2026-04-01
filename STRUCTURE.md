# SD Apps â€” File Structure

> Current StudioSync repo layout, app identities, and SignPath values are captured in the `Current Update (2026-03-31)` section near the end of this file.

## Repository Root

```
SD Apps/
  DESIGN.md                              # Design system, architecture, and conventions
  DESIGN.pdf                             # PDF version of design document
  STRUCTURE.md                           # This file
  scheduling_icon.ico                    # Shared app icon
```

## SD Scheduling (Main App â€” Portable)

```
sd-scheduling/
  package.json                           # Dependencies, build config (targets: dir + nsis)
  main/
    index.js                             # Electron main process, IPC handlers, lock file, portable data dir
    preload.js                           # Context bridge â€” 50+ API methods exposed to renderer
    database.js                          # SQLite with 9 schema migrations, all CRUD, rollover logic
    sync.js                              # File-based event sync engine (5s polling)
    updateManager.js                     # Shared-folder installer update checks + launcher
    auth.js                              # Username-based auth (no Windows dependency)
    excelImport.js                       # Excel .xlsx import via exceljs
    export.js                            # PDF (11x17 tabloid) + HTML export
  renderer/
    index.html                           # App shell â€” setup, login, registration, and main app screens
    app.js                               # Entry point â€” setup flow, init, component wiring, resizer
    components/
      sidebar.js                         # Staff list with task counts, PTO badges, drag targets
      toolbar.js                         # Top toolbar â€” search, filters, action buttons
      taskPanel.js                       # Tasks area â€” staff sections, task card rendering
      taskCard.js                        # Individual task card component
      projectPanel.js                    # Project list â€” current/future tabs, project cards
      projectCard.js                     # Individual project card component
      subTasks.js                        # Subtask list rendering and toggle logic
      comments.js                        # Comment thread rendering
      miniCalendar.js                    # Sidebar mini calendar widget
      alphaStrip.js                      # Alphabetical quick-nav strip
      dialogs/
        taskDialog.js                    # Create/edit task dialog
        userDialog.js                    # User CRUD dialog (admin only)
        ptoDialog.js                     # PTO date picker dialog
        settingsDialog.js                # Admin settings â€” roles, priorities, export paths, update folder
        printDialog.js                   # Export/print dialog (PDF + HTML)
    lib/
      state.js                           # AppState â€” centralized data store, refresh logic
      dragDrop.js                        # Drag-and-drop engine for tasks and projects
      mock.js                            # Mock API for offline development
    styles/
      tokens.css                         # Design tokens â€” colors, spacing, radii, shadows, fonts
      layout.css                         # Main app layout â€” three-panel grid, resizer
      sidebar.css                        # Sidebar styles â€” staff list, avatars, badges
      cards.css                          # Task and project card styles
      dialogs.css                        # Modal dialog styles
      scrollbars.css                     # Custom scrollbar styles
  assets/
    scheduling_icon.ico                  # App icon

  # Generated build output:
  dist/
    SD Scheduling Dashboard Setup 1.0.0.exe  # Interactive NSIS installer with install-location picker + desktop shortcut
    win-unpacked/                        # Portable app folder â€” copy to server
      SD Scheduling Dashboard.exe        # Main executable
      data/                              # Created at runtime â€” db, config, lock file
        local.db                         # SQLite database
        config.json                      # Shared drive path, logged-in user, export/excel paths
        .lock                            # Lock file preventing concurrent access
```

## SD Companion (Installed per user)

```
sd-companion/
  package.json                           # Dependencies, build config (interactive nsis installer)
  main/
    index.js                             # Electron main process, IPC handlers, portable/install-local data dir
    preload.js                           # Context bridge â€” 30+ API methods exposed to renderer
    database.js                          # Same shared schema (9 migrations) + private_tasks table
    sync.js                              # Same file-based event sync engine
    updateManager.js                     # Shared-folder installer update checks + launcher
    auth.js                              # Same username-based auth module
  renderer/
    index.html                           # App shell â€” login screen, main app, dialogs
    components/
      app.js                             # Full UI logic â€” login, data loading, all views and interactions
    styles/
      tokens.css                         # Same design tokens as main app
      companion.css                      # Companion-specific styles
  assets/
    companion_icon.ico                   # App icon

  # Generated build output:
  dist/
    SD Companion Setup 1.0.0.exe         # Interactive NSIS installer with install-location picker + desktop shortcut
    win-unpacked/                        # Unpacked app folder for local validation
      SD Companion.exe                   # Main executable
      data/                              # Created at runtime â€” db + config for this install
        local.db                         # Local SQLite database (synced via events)
        config.json                      # Shared drive path, logged-in username

  # Runtime data for packaged installs:
  data/                                  # Stored next to the installed executable
    local.db                             # Local SQLite database (synced via events)
    config.json                          # Shared drive path, logged-in username
```

## Shared Drive (created at runtime)

```
<sharedDrivePath>/                       # Configured during first-time setup
  events/                                # Sync event files
    <username>_<timestamp>_<type>_<uuid>.json
  # Global metadata such as the office-wide update folder lives in synced DB meta rows
```

## Key Relationships

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        Server / Shared Drive                     â”‚
â”‚                                                                  â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”‚
â”‚  â”‚  SD Scheduling        â”‚         â”‚  events/              â”‚     â”‚
â”‚  â”‚  (win-unpacked/)      â”‚â”€â”€â”€â”€â”€â”€â”€â”€>â”‚  JSON sync files      â”‚     â”‚
â”‚  â”‚  + data/local.db      â”‚         â”‚                       â”‚     â”‚
â”‚  â”‚  + data/config.json   â”‚         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â”‚
â”‚  â”‚  + data/.lock         â”‚                     â”‚                 â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                      â”‚                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                                 â”‚ 5s polling
                    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
                    â”‚                            â”‚
          â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
          â”‚  SD Companion     â”‚         â”‚  SD Companion     â”‚
          â”‚  (User A)         â”‚         â”‚  (User B)         â”‚
          â”‚  install\data\    â”‚         â”‚  install\data\    â”‚
          â”‚   local.db        â”‚         â”‚   local.db        â”‚
          â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## Current Update (2026-03-31)

This section is the current source of truth for the repository and release structure.

```text
StudioSync/
  .github/workflows/release-signpath.yml
  docs/signpath-setup.md
  sd-scheduling/
  sd-companion/
  LICENSE
  README.md
  DESIGN.md
  STRUCTURE.md
```

Current app identity:

- `sd-scheduling` -> `StudioSync` -> `com.studiosync.dashboard`
- `sd-companion` -> `StudioSync MyTasks` -> `com.studiosync.mytasks`

Current SignPath variable values:

- `SIGNPATH_PROJECT_SLUG` = `studiosync`
- `SIGNPATH_SIGNING_POLICY_SLUG` = `release-signing`
- `SIGNPATH_STUDIOSYNC_ARTIFACT_CONFIG_SLUG` = `studiosync-installer`
- `SIGNPATH_MYTASKS_ARTIFACT_CONFIG_SLUG` = `studiosync-mytasks-installer`
