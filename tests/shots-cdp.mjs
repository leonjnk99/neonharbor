// Take the 4 real screenshots of NEONHARBOR via the file:// bundle in headless
// Chromium. Reads shots.json for the shot list. Waits for the game to boot and
// settle (~2.5 s per shot) so traffic, cops and particles are alive in frame.
// Usage: node tests/bundle.mjs && node tests/shots-cdp.mjs
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connectCDP } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shots = JSON.parse(fs.readFileSync(join(root, 'shots.json'), 'utf8'));
const bundleUrl = pathToFileURL(join(here, 'bundle.html')).href;
const outDir = join(root, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const cdp = await connectCDP();
let ok = true;
for (const shot of shots) {
  const tab = await cdp.openTab(bundleUrl + shot.query + '&debug=1');
  try {
    await tab.waitFor('window.__ready === true', 20000);
    // Let the world run so traffic moves, the camera settles and (for the
    // chase shot) the police close in.
    await new Promise((r) => setTimeout(r, 2800));
    const state = await tab.eval(`(() => { const w = window.__NEONHARBOR__.world; return { state: w.state, stars: w.wanted.stars, cops: w.footCops.length + w.policeCars.length, cash: w.player.cash }; })()`);
    const size = await tab.screenshot(join(outDir, shot.name));
    console.log(`${shot.name}: ${size} B  state=${state.state} stars=${state.stars} cops=${state.cops} cash=$${state.cash}`);
    if (size > 262144) { console.log('  FAIL: over 256 KiB'); ok = false; }
    const errors = tab.consoleErrors();
    if (errors.length > 0) { console.log('  console errors:', errors); ok = false; }
    const http = tab.httpRequests();
    if (http.length > 0) { console.log('  http requests:', http); ok = false; }
  } finally {
    tab.close();
  }
}
console.log(ok ? 'SHOTS OK' : 'SHOTS FAILED');
process.exit(ok ? 0 : 1);
