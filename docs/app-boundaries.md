# StudioSync App Boundaries

StudioSync currently ships as two separate Electron apps:

- `sd-scheduling`: Dashboard, used primarily for scheduling meetings and office-wide planning.
- `sd-companion`: StudioSync MyTasks, often run independently as the daily task app.

The apps intentionally remain separate deployables. MyTasks must be able to launch and sync without Dashboard running.

## Mirrored Code

Some main-process modules are intentionally mirrored because both apps need the same behavior while keeping independent package/build roots:

- `main/auth.js`
- `main/logger.js`

Keep these files byte-for-byte identical unless there is a deliberate app-specific reason to split behavior. The smoke tests assert this.

`main/sync.js` and `main/updateManager.js` are similar but not exact copies. They should be reviewed together when making sync or update changes, but they are allowed to differ where each app has different runtime needs.

## Cleanup Guidance

Prefer small app-local helpers before introducing a shared workspace package. A shared package is only worth it if the duplicated behavior is stable, tested, and does not make MyTasks depend on Dashboard installation or build state.

When extracting renderer code, keep helpers feature-oriented and loaded by the app that uses them. Good examples are confirmation dialogs, project notes helpers, folder-link helpers, and display/sorting utilities.
