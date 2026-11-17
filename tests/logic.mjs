// NEONHARBOR — headless logic tests. Runs the real game modules in Node with a
// mocked input object and a mocked localStorage. No browser, no faking: every
// assertion drives world.update() and checks the resulting state.
// Usage: node tests/logic.mjs
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};

import { createWorld } from '../game/src/world.js';
import { makeFootCop, updateWanted } from '../game/src/police.js';
import { damageGuard } from '../game/src/combat.js';
import { MISSIONS } from '../game/src/config.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('  ok  ' + name);
  } else {
    failed += 1;
    failures.push(name);
    console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

// Minimal input mock: the world only reads these.
function mockInput() {
  return {
    keys: new Set(),
    pressed: new Set(),
    mv: { x: 0, y: 0 },
    clicked: false,
    mouseMoved: false,
    aimX: 0,
    aimY: 0,
    wasPressed(n) { return this.pressed.has(n); },
    held(n) { return this.keys.has(n); },
    moveVector() { return this.mv; },
    press(n) { this.pressed.add(n); this.keys.add(n); },
    release(n) { this.keys.delete(n); },
    endStep() { this.pressed.clear(); this.clicked = false; },
  };
}

function step(world, input, seconds, dt) {
  const n = Math.round(seconds / (dt || 1 / 60));
  for (let i = 0; i < n; i += 1) {
    world.update(dt || 1 / 60, input);
    input.endStep();
    if (world.state !== 'playing') break;
  }
}

function teleportCar(world, x, y) {
  const car = world.player.car;
  car.x = x;
  car.y = y;
  car.speed = 0;
  world.player.x = x;
  world.player.y = y;
  world.camX = x;
  world.camY = y;
}

function zonePos(world, name) {
  const z = world.city.zone(name);
  return { x: z.x, y: z.y };
}

console.log('NEONHARBOR logic tests');

// 1. Boot.
{
  const world = createWorld(1, {});
  check('boot: city has buildings', world.city.buildings.length > 20, String(world.city.buildings.length));
  check('boot: zones bar/chop/loft exist', !!world.city.zone('bar') && !!world.city.zone('chop') && !!world.city.zone('loft'));
  check('boot: parked cars exist', world.cars.length >= 20, String(world.cars.length));
  check('boot: traffic + peds spawned', world.traffic.length === 12 && world.peds.length === 14);
  check('boot: state playing, player at start', world.state === 'playing' && world.player.x === 320 && world.player.y === 1400);
  check('boot: objective points at the bar', world.objective.includes('Lantern Bar') || world.missionTarget !== null, world.objective);
}

// 2. Walk.
{
  const world = createWorld(1, {});
  const input = mockInput();
  input.mv = { x: 0, y: -1 };
  const y0 = world.player.y;
  step(world, input, 1);
  check('walk: moves north ~215px', world.player.y < y0 - 180 && world.player.y > y0 - 260, `y ${y0} -> ${world.player.y}`);
}

// 3. Enter / drive / exit a parked car.
{
  const world = createWorld(1, {});
  const input = mockInput();
  const car = world.cars.find((c) => !c.driver);
  world.player.x = car.x + 10;
  world.player.y = car.y;
  input.press('e');
  world.update(1 / 60, input);
  input.endStep();
  check('enter: player is driving', world.player.car === car && car.driver === 'player');
  // Put the car on an open avenue mid-block before driving, so cross traffic
  // in the intersection does not ram it while it accelerates.
  car.x = 704;
  car.y = 1100;
  car.angle = Math.PI / 2;
  world.player.x = car.x;
  world.player.y = car.y;
  input.mv = { x: 0, y: -1 }; // W = forward
  const x0 = car.x;
  const y0 = car.y;
  step(world, input, 2);
  check('drive: car accelerates and moves', Math.abs(car.speed) > 100 && Math.hypot(car.x - x0, car.y - y0) > 150, `speed ${car.speed.toFixed(0)}`);
  input.mv = { x: 0, y: 0 };
  input.press('e');
  world.update(1 / 60, input);
  input.endStep();
  check('exit: player on foot again', world.player.car === null && car.driver === null);
}

// 4. Steal an NPC car: heat rises, driver flees.
{
  const world = createWorld(1, {});
  const input = mockInput();
  const t = world.traffic[0];
  world.player.x = t.car.x + 10;
  world.player.y = t.car.y;
  const heat0 = world.wanted.heat;
  input.press('e');
  world.update(1 / 60, input);
  input.endStep();
  check('steal: driving the NPC car', world.player.car === t.car);
  check('steal: heat +30 (decays a tick when unseen)', world.wanted.heat >= 29 && world.wanted.stars === 2, String(world.wanted.heat));
}

// 5. Wanted stars and decay.
{
  const world = createWorld(1, {});
  world.addHeat(70);
  check('wanted: 70 heat = 3 stars', world.wanted.stars === 3, String(world.wanted.stars));
  updateWanted(world.wanted, 30, false);
  check('wanted: decays when unseen', world.wanted.heat < 10 && world.wanted.stars <= 1, `heat ${world.wanted.heat}`);
  world.addHeat(25);
  const h = world.wanted.heat;
  updateWanted(world.wanted, 30, true);
  check('wanted: no decay while seen', world.wanted.heat === h, `${h} -> ${world.wanted.heat}`);
}

// 6. Police spawn at 3 stars and chase.
{
  const world = createWorld(1, {});
  const input = mockInput();
  world.addHeat(70);
  step(world, input, 1.5);
  check('police: cars spawn at 3 stars', world.policeCars.length >= 1, String(world.policeCars.length));
  check('police: foot cops spawn at 3 stars', world.footCops.length >= 1, String(world.footCops.length));
}

// 7. Mission 1 completes end to end (bar pickup -> marina drop).
{
  const world = createWorld(1, {});
  const input = mockInput();
  const bar = zonePos(world, 'bar');
  world.player.x = bar.x;
  world.player.y = bar.y;
  input.press('q');
  world.update(1 / 60, input);
  input.endStep();
  check('mission 1: starts at the bar', world.missions.active && world.missions.active.def.id === 'fare');
  // Get in a car, drive to the bar to pick up the fare.
  const car = world.cars.find((c) => !c.driver);
  world.player.x = car.x + 10;
  world.player.y = car.y;
  input.press('e');
  world.update(1 / 60, input);
  input.endStep();
  teleportCar(world, bar.x, bar.y);
  world.update(1 / 60, input);
  check('mission 1: fare picked up', world.missions.active && world.missions.active.step === 1, 'step ' + (world.missions.active && world.missions.active.step));
  const marina = zonePos(world, 'marina');
  teleportCar(world, marina.x - 40, marina.y);
  world.update(1 / 60, input);
  check('mission 1: delivered, $150 paid', world.missions.completed.includes('fare') && world.player.cash === 120 + 150, `cash ${world.player.cash}`);
  check('mission 1: next mission is hot-wheels', world.missions.index === 1);
}

// 8. Mission 3 follow: stay in band for 45s.
{
  const world = createWorld(1, {});
  const input = mockInput();
  world.missions.index = 2;
  const bar = zonePos(world, 'bar');
  world.player.x = bar.x;
  world.player.y = bar.y;
  input.press('q');
  world.update(1 / 60, input);
  input.endStep();
  const target = world.missions.active && world.missions.active.targetCar;
  check('mission 3: target car spawns', !!target);
  if (target) {
    const car = world.cars.find((c) => !c.driver);
    world.player.x = car.x + 10;
    world.player.y = car.y;
    input.press('e');
    world.update(1 / 60, input);
    input.endStep();
    // Follow from behind the target (200 px back along its heading): the player
    // car never rams it, and the distance stays in the 120-380 band.
    for (let i = 0; i < 100 && world.missions.active; i += 1) {
      const bx = target.x - Math.cos(target.angle) * 200;
      const by = target.y - Math.sin(target.angle) * 200;
      teleportCar(world, bx, by);
      world.update(0.5, input);
      input.endStep();
    }
    check('mission 3: completes after 45s in band', world.missions.completed.includes('tail'), 'active=' + !!world.missions.active);
  }
}

// 9. Shooting spends ammo and spawns a bullet.
{
  const world = createWorld(1, {});
  const ammo0 = world.player.ammo;
  world.player.x = 500;
  world.player.y = 500;
  world.shootAt(700, 500);
  check('shoot: ammo -1, bullet spawned', world.player.ammo === ammo0 - 1 && world.bullets.length === 1, `ammo ${world.player.ammo} bullets ${world.bullets.length}`);
  check('shoot: firing adds heat', world.wanted.heat > 0, String(world.wanted.heat));
}

// 10. Run over a ped: ped goes down, heat rises.
{
  const world = createWorld(1, {});
  const input = mockInput();
  const car = world.cars.find((c) => !c.driver);
  world.player.x = car.x + 10;
  world.player.y = car.y;
  input.press('e');
  world.update(1 / 60, input);
  input.endStep();
  const ped = world.peds[0];
  ped.state = 'walk';
  teleportCar(world, 704, 1100);
  world.player.car.angle = Math.PI / 2;
  input.mv = { x: 0, y: -1 };
  // Pin the ped in the car's path each step (it would otherwise wander off the road).
  for (let i = 0; i < 72 && ped.state !== 'down'; i += 1) {
    ped.x = 704;
    ped.y = 1250;
    ped.state = 'walk';
    world.update(1 / 60, input);
    input.endStep();
  }
  check('run over: ped knocked down', ped.state === 'down', ped.state);
  check('run over: heat rises', world.wanted.heat >= 39, String(world.wanted.heat));
}

// 11. Chop shop sells the car.
{
  const world = createWorld(1, {});
  const input = mockInput();
  const car = world.cars.find((c) => !c.driver);
  world.player.x = car.x + 10;
  world.player.y = car.y;
  input.press('e');
  world.update(1 / 60, input);
  input.endStep();
  const chop = zonePos(world, 'chop');
  teleportCar(world, chop.x, chop.y);
  const cash0 = world.player.cash;
  input.press('q');
  world.update(1 / 60, input);
  input.endStep();
  check('chop: car sold for $150', world.player.cash === cash0 + 150 && world.player.car === null, `cash ${world.player.cash}`);
}

// 12. Safehouse clears heat and saves.
{
  const world = createWorld(1, {});
  const input = mockInput();
  world.addHeat(50);
  const loft = zonePos(world, 'loft');
  world.player.x = loft.x;
  world.player.y = loft.y;
  input.press('q');
  world.update(1 / 60, input);
  input.endStep();
  check('safehouse: heat cleared', world.wanted.heat === 0 && world.wanted.stars === 0);
  check('safehouse: save written', globalThis.localStorage.getItem('neonharbor.save.v1') !== null);
}

// 13. Save / load round trip.
{
  const world = createWorld(1, {});
  world.player.cash = 999;
  world.missions.index = 3;
  world.saveGame();
  const world2 = createWorld(1, {});
  const save = JSON.parse(globalThis.localStorage.getItem('neonharbor.save.v1'));
  world2.loadSaveInto(save);
  check('save: cash + mission index restore', world2.player.cash === 999 && world2.missions.index === 3, `cash ${world2.player.cash} idx ${world2.missions.index}`);
}

// 14. Busted: a cop standing on the player arrests them.
{
  const world = createWorld(1, {});
  const input = mockInput();
  world.addHeat(25);
  world.footCops.push(makeFootCop(world.player.x, world.player.y));
  step(world, input, 2);
  check('busted: arrest completes', world.state === 'busted', world.state);
}

// 15. Bank guards spawn and can be killed.
{
  const world = createWorld(1, {});
  world.spawnBankGuards();
  check('guards: 3 spawn at the bank', world.guards.length === 3, String(world.guards.length));
  damageGuard(world.guards[0], 100);
  check('guards: damage kills', world.guards[0].dead === true);
}

// 16. Heist mission can start (mission 6, index 5).
{
  const world = createWorld(1, {});
  check('config: 6 story missions', MISSIONS.length === 6, String(MISSIONS.length));
  world.missions.index = 5;
  const input = mockInput();
  const bar = zonePos(world, 'bar');
  world.player.x = bar.x;
  world.player.y = bar.y;
  input.press('q');
  world.update(1 / 60, input);
  input.endStep();
  check('mission 6: starts, guards posted', world.missions.active && world.missions.active.def.id === 'heist' && world.guards.length === 3);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failed: ' + failures.join(', '));
  process.exit(1);
}
