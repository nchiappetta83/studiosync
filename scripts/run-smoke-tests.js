// Runs scripts/smoke-tests.js under Electron's bundled Node runtime instead of
// the system Node. The apps load better-sqlite3 through Electron, and that
// native module is not guaranteed to load under whichever Node a machine or CI
// runner happens to have (it crashed silently on Node 20 and 22.12). Running the
// tests on the same runtime the apps ship with keeps results identical
// everywhere. Launch from an app folder: `node ..\scripts\run-smoke-tests.js <target>`.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const electronPath = require(require.resolve('electron', { paths: [process.cwd()] }));
const result = spawnSync(
  electronPath,
  [path.join(__dirname, 'smoke-tests.js'), ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
