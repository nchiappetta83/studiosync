/**
 * MyTasks browser preview (sd-companion/renderer/preview.html).
 *
 * The preview page is index.html plus a mock window.api, so it is generated rather than kept by hand: a
 * hand-kept copy went stale (it was missing Work Cards, the motion system and the command palette, and
 * threw on start-up). The smoke tests fail if the committed file differs from what this produces.
 *
 *   node scripts/build-mytasks-preview.js          rewrite preview.html from index.html
 */
const fs = require('node:fs');
const path = require('node:path');

const rendererDir = path.join(__dirname, '..', 'sd-companion', 'renderer');

function buildPreview(indexHtml) {
  const html = indexHtml.replace(/\r\n/g, '\n');
  const withTitle = html.replace('<title>StudioSync MyTasks</title>', '<title>StudioSync MyTasks (Preview)</title>');
  const firstScript = '  <script src="lib/motion.js"></script>';
  if (withTitle === html || !withTitle.includes(firstScript)) {
    throw new Error('index.html no longer has the title or the first script tag that preview.html is built around.');
  }
  return withTitle.replace(
    firstScript,
    '  <!-- Browser-preview only: injects a mock window.api before app scripts load -->\n'
      + '  <script src="lib/mock.js"></script>\n'
      + firstScript,
  );
}

if (require.main === module) {
  const indexHtml = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(rendererDir, 'preview.html'), buildPreview(indexHtml));
  console.log('Wrote sd-companion/renderer/preview.html');
}

module.exports = { buildPreview };
