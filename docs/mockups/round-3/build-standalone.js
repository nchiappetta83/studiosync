// Bundles app.html and its CSS / JS into one self-contained file: StudioSync-V2-mockup.html
// Usage: node docs/mockups/round-3/build-standalone.js
const fs = require('fs'); const path = require('path');
const dir = __dirname; const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const css = ['mockup.css', 'finish.css', 'app.css'].map(read).join('\n');
const js = ['data.js', 'mockup.js'].map(read).join('\n;\n');
if (/<\/script/i.test(js)) throw new Error('script contains a closing script tag');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StudioSync V2 — Test App</title>
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>window.APP_MODE = true;</script>
<script>
${js}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(dir, 'StudioSync-V2-mockup.html'), html);
console.log('wrote StudioSync-V2-mockup.html', Math.round(html.length / 1024) + ' KB');
