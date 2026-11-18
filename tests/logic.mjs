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
  check('config: 10 story missions', MISSIONS.length === 10, String(MISSIONS.length));
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

// 17. Mission 7 gauntlet: marina, then 3 checkpoints under 100s.
{
  const world = createWorld(1, {});
  const input = mockInput();
  world.missions.index = 6;
  const bar = zonePos(world, 'bar');
  world.player.x = bar.x;
  world.player.y = bar.y;
  input.press('q');
  world.update(1 / 60, input);
  input.endStep();
  check('mission 7: starts', world.missions.active && world.missions.active.def.id === 'gauntlet');
  const marina = zonePos(world, 'marina');
  world.player.x = marina.x;
  world.player.y = marina.y;
  world.update(1 / 60, input);
  check('mission 7: reached marina, checkpoint step', world.missions.active && world.missions.active.step === 1, 'step ' + (world.missions.active && world.missions.active.step));
  for (const z of ['depot', 'chop', 'garage']) {
    const p = zonePos(world, z);
    world.player.x = p.x;
    world.player.y = p.y;
    world.update(1 / 60, input);
  }
  check('mission 7: completes, $500 paid', world.missions.completed.includes('gauntlet') && world.player.cash === 120 + 500, `cash ${world.player.cash}`);
  check('mission 7: next mission is the comet', world.missions.index === 7);
}

// 18. Mission 8 comet: the fast car is parked at boot; steal + deliver it.
{
  const world = createWorld(1, {});
  const input = mockInput();
  const comet = world.cars.find((c) => c.fixed === 'comet');
  check('comet: parked in the Marina lot at boot', !!comet && comet.type === 'comet');
  check('comet: fastest car in the harbor', !!comet && comet.maxSpeed === 580 && comet.maxSpeed > 530, comet ? String(comet.maxSpeed) : 'none');
  world.missions.index = 7;
  const bar = zonePos(world, 'bar');
  world.player.x = bar.x;
  world.player.y = bar.y;
  input.press('q');
  world.update(1 / 60, input);
  input.endStep();
  check('mission 8: starts', world.missions.active && world.missions.active.def.id === 'comet');
  world.player.x = comet.x + 10;
  world.player.y = comet.y;
  input.press('e');
  world.update(1 / 60, input);
  input.endStep();
  check('mission 8: driving the Comet, steal step done', world.player.car === comet && world.missions.active.step === 1, 'step ' + (world.missions.active && world.missions.active.step));
  const chop = zonePos(world, 'chop');
  teleportCar(world, chop.x, chop.y);
  world.update(1 / 60, input);
  check('mission 8: delivered, $600 paid', world.missions.completed.includes('comet') && world.player.cash === 120 + 600, `cash ${world.player.cash}`);
}

// 19. Mission 9 VIP: clean timed delivery, and heat fails it.
{
  const world = createWorld(1, {});
  const input = mockInput();
  world.missions.index = 8;
  const bar = zonePos(world, 'bar');
  world.player.x = bar.x;
  world.player.y = bar.y;
  input.press('q');
  world.update(1 / 60, input);
  input.endStep();
  check('mission 9: starts', world.missions.active && world.missions.active.def.id === 'vip');
  const car = world.cars.find((c) => !c.driver);
  world.player.x = car.x + 10;
  world.player.y = car.y;
  input.press('e');
  world.update(1 / 60, input);
  input.endStep();
  const bank = zonePos(world, 'bank');
  teleportCar(world, bank.x, bank.y);
  world.update(1 / 60, input);
  check('mission 9: VIP picked up', world.missions.active && world.missions.active.step === 1, 'step ' + (world.missions.active && world.missions.active.step));
  const marina = zonePos(world, 'marina');
  teleportCar(world, marina.x - 40, marina.y);
  world.update(1 / 60, input);
  check('mission 9: delivered clean, $400 paid', world.missions.completed.includes('vip') && world.player.cash === 120 + 400, `cash ${world.player.cash}`);
  // A second run: any heat during the drop fails the job.
  const world2 = createWorld(1, {});
  const input2 = mockInput();
  world2.missions.index = 8;
  world2.player.x = bar.x;
  world2.player.y = bar.y;
  input2.press('q');
  world2.update(1 / 60, input2);
  input2.endStep();
  const car2 = world2.cars.find((c) => !c.driver);
  world2.player.x = car2.x + 10;
  world2.player.y = car2.y;
  input2.press('e');
  world2.update(1 / 60, input2);
  input2.endStep();
  teleportCar(world2, bank.x, bank.y);
  world2.update(1 / 60, input2);
  world2.addHeat(25);
  world2.update(1 / 60, input2);
  check('mission 9: heat fails the VIP job', !world2.missions.active && !world2.missions.completed.includes('vip'));
}

// 20. Mission 10 drops: collect 4 drops, haul home, story done + victory.
{
  const world = createWorld(1, {});
  const input = mockInput();
  world.missions.index = 9;
  const bar = zonePos(world, 'bar');
  world.player.x = bar.x;
  world.player.y = bar.y;
  input.press('q');
  world.update(1 / 60, input);
  input.endStep();
  check('mission 10: starts', world.missions.active && world.missions.active.def.id === 'drops');
  for (const z of ['depot', 'marina', 'chop', 'garage']) {
    const p = zonePos(world, z);
    world.player.x = p.x;
    world.player.y = p.y;
    world.update(1 / 60, input);
  }
  check('mission 10: drops collected, deliver step', world.missions.active && world.missions.active.step === 1, 'step ' + (world.missions.active && world.missions.active.step));
  const loft = zonePos(world, 'loft');
  world.player.x = loft.x;
  world.player.y = loft.y;
  world.update(1 / 60, input);
  check('mission 10: haul home, $550 paid, story done', world.missions.completed.includes('drops') && world.missions.storyDone && world.player.cash === 120 + 550, `cash ${world.player.cash}`);
  check('mission 10: victory screen', world.state === 'victory', world.state);
}

// 21. Shotgun: pickup grants it, one trigger pull fires 5 pellets.
{
  const world = createWorld(1, {});
  const input = mockInput();
  check('shotgun: pickup exists at Harbor Arms', world.pickups.some((p) => p.kind === 'shotgun' && !p.taken));
  world.player.x = 1350;
  world.player.y = 600;
  world.update(1 / 60, input);
  check('shotgun: picked up, 8 shells', world.player.hasShotgun && world.player.weapon === 'shotgun' && world.player.shotgunAmmo === 8, `weapon ${world.player.weapon} shells ${world.player.shotgunAmmo}`);
  const pistolAmmo = world.player.ammo;
  world.shootAt(1500, 600);
  check('shotgun: 5 pellets, 1 shell spent, pistol untouched', world.bullets.length === 5 && world.player.shotgunAmmo === 7 && world.player.ammo === pistolAmmo, `bullets ${world.bullets.length} shells ${world.player.shotgunAmmo}`);
  check('shotgun: pellets are short-range, low damage', world.bullets.every((b) => b.dmg === 16 && b.life < 0.6), `dmg ${world.bullets[0] && world.bullets[0].dmg} life ${world.bullets[0] && world.bullets[0].life.toFixed(2)}`);
  for (let i = 0; i < 7; i += 1) {
    world.player.shootTimer = 0;
    world.shootAt(1500, 600);
  }
  check('shotgun: empty after 8 shells', world.player.shotgunAmmo === 0, String(world.player.shotgunAmmo));
  world.player.shootTimer = 0;
  world.shootAt(1500, 600);
  check('shotgun: empty drops back to pistol', world.player.weapon === 'pistol' && world.player.ammo === pistolAmmo - 1, `weapon ${world.player.weapon} ammo ${world.player.ammo}`);
}

// 22. Shells: useless without the shotgun, +6 with it.
{
  const world = createWorld(1, {});
  const input = mockInput();
  const shells = world.pickups.find((p) => p.kind === 'shells');
  world.player.x = shells.x;
  world.player.y = shells.y;
  world.update(1 / 60, input);
  check('shells: not taken without the shotgun', !shells.taken && world.player.shotgunAmmo === 0);
  world.player.x = 1350;
  world.player.y = 600;
  world.update(1 / 60, input);
  world.player.x = shells.x;
  world.player.y = shells.y;
  world.update(1 / 60, input);
  check('shells: +6 with the shotgun', shells.taken && world.player.shotgunAmmo === 8 + 6, String(world.player.shotgunAmmo));
}

// 23. Mission-complete event: progress + stats for the overlay.
{
  const world = createWorld(1, {});
  const input = mockInput();
  const bar = zonePos(world, 'bar');
  world.player.x = bar.x;
  world.player.y = bar.y;
  input.press('q');
  world.update(1 / 60, input);
  input.endStep();
  const car = world.cars.find((c) => !c.driver);
  world.player.x = car.x + 10;
  world.player.y = car.y;
  input.press('e');
  world.update(1 / 60, input);
  input.endStep();
  teleportCar(world, bar.x, bar.y);
  world.update(1 / 60, input);
  const marina = zonePos(world, 'marina');
  teleportCar(world, marina.x - 40, marina.y);
  world.update(1 / 60, input);
  const ev = world.events.find((e) => e.type === 'missionComplete');
  check('mission complete: event emitted', !!ev);
  check('mission complete: progress 1/10 + stats', !!ev && ev.progress === 'Missions 1/10' && ev.stats.includes('Jobs done 1') && ev.stats.includes('Cars stolen') && ev.stats.includes('Earned $'), ev ? JSON.stringify(ev) : 'none');
}

// 24. Cars stolen: a jack counts; a fixed theft counts once.
{
  const world = createWorld(1, {});
  const input = mockInput();
  const t = world.traffic[0];
  world.player.x = t.car.x + 10;
  world.player.y = t.car.y;
  input.press('e');
  world.update(1 / 60, input);
  input.endStep();
  check('cars stolen: jacking counts', world.carsStolen === 1, String(world.carsStolen));
  const world2 = createWorld(1, {});
  const input2 = mockInput();
  const sunray = world2.cars.find((c) => c.fixed === 'sunray');
  world2.player.x = sunray.x + 10;
  world2.player.y = sunray.y;
  input2.press('e');
  world2.update(1 / 60, input2);
  input2.endStep();
  check('cars stolen: Sunray theft counts', world2.carsStolen === 1, String(world2.carsStolen));
  input2.press('e');
  world2.update(1 / 60, input2);
  input2.endStep();
  check('cars stolen: exit works', world2.player.car === null);
  world2.player.x = sunray.x + 10;
  world2.player.y = sunray.y;
  input2.press('e');
  world2.update(1 / 60, input2);
  input2.endStep();
  check('cars stolen: re-entering the same car does not double count', world2.carsStolen === 1, String(world2.carsStolen));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failed: ' + failures.join(', '));
  process.exit(1);
}
