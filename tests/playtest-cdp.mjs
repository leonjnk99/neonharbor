// Full interactive playtest of NEONHARBOR in real headless Chromium (file://
// bundle): title -> new game -> walk -> enter car -> drive -> shoot -> wanted
// -> police chase -> lose heat -> mission 1 end to end -> pause/resume ->
// death -> retry. Fails on any console error, failed request or http request.
// Usage: node tests/bundle.mjs && node tests/playtest-cdp.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connectCDP } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const bundleUrl = pathToFileURL(join(here, 'bundle.html')).href + '?debug=1&seed=1';

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed += 1; console.log('  ok  ' + name); }
  else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connectCDP();
const tab = await cdp.openTab(bundleUrl);
try {
  await tab.waitFor('window.__ready === true', 20000);
  const W = 'window.__NEONHARBOR__.world';

  // FPS probe: count rAF ticks for 2 s on the title screen.
  await tab.eval(`window.__fpsN = 0; const __tick = () => { window.__fpsN++; requestAnimationFrame(__tick); }; requestAnimationFrame(__tick);`);
  await sleep(2000);
  const fps = await tab.eval('window.__fpsN / 2');
  console.log(`  fps: ${fps.toFixed(0)} (headless SwiftShader; load-dependent — the game loop is dt-based so play stays correct at any fps >= 20)`);
  check('fps >= 20 (dt clamp floor)', fps >= 20, String(fps));

  // Title screen -> New game.
  check('title screen visible', await tab.eval(`!document.getElementById('screen-title').classList.contains('hidden')`));
  const btnRect = await tab.eval(`(() => { const r = document.getElementById('btn-new').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await tab.click(btnRect.x, btnRect.y);
  await sleep(500);
  check('new game starts playing', await tab.eval(`${W}.state === 'playing'`));
  check('HUD visible', await tab.eval(`!document.getElementById('hud').classList.contains('hidden')`));

  // Walk north along the avenue (east from the start runs into a building).
  const y0 = await tab.eval(`${W}.player.y`);
  await tab.holdKey('KeyW', 'w', 700);
  const y1 = await tab.eval(`${W}.player.y`);
  check('walk: moves north', y1 < y0 - 80, `${y0.toFixed(0)} -> ${y1.toFixed(0)}`);

  // Enter the parked sedan by the Loft (player starts next to it).
  await tab.eval(`${W}.player.x = 352; ${W}.player.y = 1400;`);
  await tab.press('KeyE', 'e');
  await sleep(300);
  check('enter car: driving', await tab.eval(`${W}.player.car !== null`));

  // Drive forward for 2 s down a clear mid-block stretch of avenue.
  await tab.eval(`(() => { const c = ${W}.player.car; c.x = 704; c.y = 1100; c.angle = Math.PI / 2; c.speed = 0; ${W}.player.x = 704; ${W}.player.y = 1100; ${W}.camX = 704; ${W}.camY = 1100; })()`);
  const carPos0 = await tab.eval(`({ x: ${W}.player.car.x, y: ${W}.player.car.y })`);
  await tab.holdKey('KeyW', 'w', 2000);
  const speed = await tab.eval(`Math.abs(${W}.player.car.speed)`);
  const carPos1 = await tab.eval(`({ x: ${W}.player.car.x, y: ${W}.player.car.y })`);
  const moved = Math.hypot(carPos1.x - carPos0.x, carPos1.y - carPos0.y);
  check('drive: accelerates', speed > 100, `speed ${speed.toFixed(0)}`);
  check('drive: car moves', moved > 150, `moved ${moved.toFixed(0)}px`);

  // Shoot at the mouse: ammo drops, heat rises.
  await tab.mouseMove(900, 360);
  const ammo0 = await tab.eval(`${W}.player.ammo`);
  await tab.press('KeyF', 'f');
  await sleep(200);
  const ammo1 = await tab.eval(`${W}.player.ammo`);
  check('shoot: ammo -1', ammo1 === ammo0 - 1, `${ammo0} -> ${ammo1}`);
  check('shoot: heat rises', await tab.eval(`${W}.wanted.heat > 0`));

  // Wanted 3 stars: police spawn and close in.
  await tab.eval(`window.__NEONHARBOR__.setWanted(3)`);
  await sleep(2000);
  check('wanted: 3 stars', await tab.eval(`${W}.wanted.stars === 3`));
  check('police: cars + foot cops spawn', await tab.eval(`(${W}.policeCars.length + ${W}.footCops.length) >= 2`));
  const starsText = await tab.eval(`document.getElementById('stars').textContent`);
  check('HUD: 3 stars shown', starsText.startsWith('★★★'), starsText);

  // Lose the heat.
  await tab.eval(`window.__NEONHARBOR__.setWanted(0)`);
  await sleep(1200);
  check('wanted: clears', await tab.eval(`${W}.wanted.stars === 0`));

  // Mission 1 end to end: bar -> pickup -> marina.
  const bar = await tab.eval(`${W}.city.zone('bar')`);
  await tab.eval(`window.__NEONHARBOR__.teleport(${bar.x}, ${bar.y})`);
  await sleep(200);
  await tab.press('KeyQ', 'q');
  await sleep(300);
  check('mission 1: starts at the bar', await tab.eval(`${W}.missions.active && ${W}.missions.active.def.id === 'fare'`));
  // Get in a car, then drive to the bar for the pickup.
  const parked = await tab.eval(`(() => { const c = ${W}.cars.find(c => !c.driver && !c.dead); return { x: c.x, y: c.y }; })()`);
  await tab.eval(`window.__NEONHARBOR__.teleport(${parked.x + 10}, ${parked.y})`);
  await sleep(200);
  await tab.press('KeyE', 'e');
  await sleep(300);
  await tab.eval(`window.__NEONHARBOR__.teleport(${bar.x}, ${bar.y})`);
  await sleep(300);
  check('mission 1: fare picked up', await tab.eval(`${W}.missions.active && ${W}.missions.active.step === 1`));
  const marina = await tab.eval(`${W}.city.zone('marina')`);
  await tab.eval(`window.__NEONHARBOR__.teleport(${marina.x - 40}, ${marina.y})`);
  await sleep(300);
  check('mission 1: delivered, $150 paid', await tab.eval(`${W}.missions.completed.includes('fare') && ${W}.player.cash === 270`));
  const cashText = await tab.eval(`document.getElementById('cash').textContent`);
  check('HUD: cash $270', cashText === '$270', cashText);
  const saveOk = await tab.eval(`(() => { try { return localStorage.getItem('neonharbor.save.v1') !== null; } catch (e) { return 'unavailable'; } })()`);
  console.log('  save in localStorage:', saveOk);

  // Pause / resume.
  await tab.press('KeyP', 'p');
  await sleep(300);
  check('pause: state paused', await tab.eval(`${W}.state === 'paused'`));
  check('pause screen visible', await tab.eval(`!document.getElementById('screen-pause').classList.contains('hidden')`));
  const resumeRect = await tab.eval(`(() => { const r = document.getElementById('btn-resume').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await tab.click(resumeRect.x, resumeRect.y);
  await sleep(300);
  check('resume: back to playing', await tab.eval(`${W}.state === 'playing'`));

  // Death -> wasted screen -> retry.
  await tab.eval(`${W}.player.health = 0; ${W}.player.dead = true;`);
  await sleep(500);
  check('death: wasted screen', await tab.eval(`${W}.state === 'dead' && !document.getElementById('screen-dead').classList.contains('hidden')`));
  const retryRect = await tab.eval(`(() => { const r = document.getElementById('btn-retry').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await tab.click(retryRect.x, retryRect.y);
  await sleep(500);
  // Retry loads the last save: the saved health may be below 100 (police
  // rams during the wanted test), so assert alive + playing, not full HP.
  check('retry: fresh run playing', await tab.eval(`${W}.state === 'playing' && ${W}.player.health > 0 && !${W}.player.dead`));

  // No errors, no failed requests, no http requests.
  const errors = tab.consoleErrors();
  check('zero console errors', errors.length === 0, errors.join(' | ').slice(0, 300));
  const failedReqs = tab.failedRequests();
  check('zero failed requests', failedReqs.length === 0, failedReqs.join(' | ').slice(0, 300));
  const http = tab.httpRequests();
  check('zero http requests', http.length === 0, http.join(', ').slice(0, 300));
} finally {
  tab.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) console.log('Failed: ' + failures.join(', '));
process.exit(failed > 0 ? 1 : 0);
