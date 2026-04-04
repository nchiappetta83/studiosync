# SD Apps - File Structure

> Current StudioSync repo layout, app identities, and release-flow notes are captured in the `Current Update (2026-04-03)` section near the end of this file.

## Repository Root

```text
SD Apps/
  README.md                              # Product overview and release notes
  DESIGN.md                              # Design system, architecture, and conventions
  STRUCTURE.md                           # This file
  docs/
    signpath-setup.md                    # Future SignPath restoration notes
  .github/workflows/
    release-signpath.yml                 # Live GitHub release workflow
  sd-scheduling/                         # StudioSync dashboard app
  sd-companion/                          # StudioSync MyTasks companion app
```

## sd-scheduling (StudioSync dashboard)

```text
sd-scheduling/
  package.json                           # Dependencies, build config, NSIS metadata
  package-lock.json
  main/
    index.js                             # Electron main process, IPC handlers, lock handling, startup flow
    preload.js                           # Context bridge for renderer APIs
    database.js                          # SQLite schema and CRUD logic (11 migrations)
    sync.js                              # Shared-drive sync engine with validation and processed-file tracking
    updateManager.js                     # Shared-folder update detection and launcher
    auth.js                              # Username-based login helpers
    excelImport.js                       # Excel import
    excelSync.js                         # Serialized Excel write-back for project changes
    export.js                            # PDF and HTML export
  renderer/
    index.html                           # App shell
    app.js                               # Main renderer entry
    components/
      sidebar.js                         # Staff list, counts, PTO badges
      toolbar.js                         # Search, filters, action buttons, and user/sync badge
      taskPanel.js                       # Staff-grouped task list
      taskCard.js                        # Individual task card UI
      projectPanel.js                    # Project list, Current/Future tabs, and add-project defaults
      projectCard.js                     # Individual project cards and project context menu actions
      subTasks.js                        # Action Item rendering and toggles
      comments.js                        # Comment thread rendering
      miniCalendar.js                    # Sidebar calendar widget
      alphaStrip.js                      # Alphabetical quick-nav strip
      dialogs/
        taskDialog.js                    # Create/edit task dialog and current-vs-future project creation
        userDialog.js                    # User CRUD and MyTasks self-assign permission
        ptoDialog.js                     # PTO picker
        settingsDialog.js                # Settings, update folder, export paths, roles, priorities
        printDialog.js                   # Print and export dialog
    lib/
      state.js                           # AppState store with batched refresh notifications
      dragDrop.js                        # Drag and drop engine
      mock.js                            # Browser-preview mock bridge
    styles/
      tokens.css
      layout.css
      sidebar.css
      cards.css
      dialogs.css
      scrollbars.css
  build/
    installer.nsh                       # Forces current-user install and default path under C:\SD Apps
  assets/
    studiosync-main.svg                 # Source brand/logo asset
    studiosync-main.png                 # Raster brand/logo export
    studiosync-main.ico                 # Current build icon
```

Generated build output:

```text
sd-scheduling/dist/
  StudioSync Setup 1.0.4.exe             # Interactive NSIS installer
  StudioSync Setup 1.0.4.exe.blockmap
  win-unpacked/                          # Raw packaged app folder
    StudioSync.exe
```

Runtime data:

```text
sd-scheduling/data/
  local.db                               # Dashboard SQLite database
  config.json                            # Shared path, user, Excel path, exports
  .lock                                  # Local fallback lock before shared path is set
```

Once the shared drive is configured, the dashboard also uses:

```text
<sharedDrivePath>/
  .dashboard.lock                        # Shared dashboard lock with user, machine, and token
```

## sd-companion (StudioSync MyTasks)

```text
sd-companion/
  package.json                           # Dependencies, build config, NSIS metadata
  package-lock.json
  main/
    index.js                             # Electron main process, IPC handlers, notifications
    preload.js                           # Context bridge for renderer APIs
    database.js                          # Shared schema plus private_tasks table (11 migrations)
    sync.js                              # Shared-drive sync engine with validation and processed-file tracking
    updateManager.js                     # Shared-folder update detection and launcher
    auth.js                              # Username-based login helpers
  renderer/
    index.html                           # Compact login shell, top bar, dialogs, detail panel
    components/
      app.js                             # Main UI logic, project editing, shared comments, Action Items, and My Projects menus
    styles/
      tokens.css                         # Shared design tokens
      companion.css                      # MyTasks-specific layout and responsive rules
  build/
    installer.nsh                        # Forces current-user install and default path under C:\SD Apps
  assets/
    studiosync-mytasks.svg               # Source brand/logo asset
    studiosync-mytasks.png               # Raster brand/logo export
    studiosync-mytasks.ico               # Current build icon
```

Generated build output:

```text
sd-companion/dist/
  StudioSync MyTasks Setup 1.0.4.exe     # Interactive NSIS installer
  StudioSync MyTasks Setup 1.0.4.exe.blockmap
  win-unpacked/                          # Raw packaged app folder used for zip packages too
    StudioSync MyTasks.exe
```

Runtime data:

```text
sd-companion/data/
  local.db                               # Local synced cache plus private task data
  config.json                            # Shared path and remembered username
```

## Shared Drive

Created at runtime after setup:

```text
<sharedDrivePath>/
  events/
    <timestamp>_<username>_<type>_<uuid>.json
```

Notes:

- Event files are written atomically through a temp-file rename.
- Each app tracks processed filenames locally so delayed or previously failed files are not skipped.
- Shared metadata such as the office-wide update folder is stored in synced database rows, not loose config files.

## Current Update (2026-04-03)

This section is the current source of truth for the repository and release structure.

Current app identity:

- `sd-scheduling` -> `StudioSync` -> `com.studiosync.dashboard`
- `sd-companion` -> `StudioSync MyTasks` -> `com.studiosync.mytasks`

Current release flow:

- `.github/workflows/release-signpath.yml` is the live GitHub release workflow.
- It currently publishes unsigned installers and `win-unpacked` zip packages to GitHub Releases.
- The interactive installers are currently forced to current-user mode and default to `C:\SD Apps\StudioSync` and `C:\SD Apps\StudioSync MyTasks`.
- Both apps now use compact branded sign-in windows before switching to the full shell.
- Dashboard project creation follows the active Current/Future tab, and future projects can be moved into the current list from the project menu.
- MyTasks partner project cards now show assigned staff avatars, keep the header fixed while the list scrolls, and expose project actions through a right-click menu.
- The SignPath configuration values below are retained for future signed-release restoration.

Reserved SignPath values:

- `SIGNPATH_PROJECT_SLUG` = `studiosync`
- `SIGNPATH_SIGNING_POLICY_SLUG` = `release-signing`
- `SIGNPATH_STUDIOSYNC_ARTIFACT_CONFIG_SLUG` = `studiosync-installer`
- `SIGNPATH_MYTASKS_ARTIFACT_CONFIG_SLUG` = `studiosync-mytasks-installer`
