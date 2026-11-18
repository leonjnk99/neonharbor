// NEONHARBOR — the world: owns every entity and runs the step. main.js calls
// update(dt, input) once per frame; render.js draws the state; ui.js shows it.
import { ECONOMY, COMBAT, WANTED, PLAYER } from './config.js';
import { mulberry32, range, pick, chance } from './random.js';
import { buildCity } from './city.js';
import { makeCar, stepCar, collideCars, nearestCar } from './vehicles.js';
import { makePlayer, stepPlayerOnFoot, damagePlayer, healPlayer } from './player.js';
import { makeTrafficCar, stepTrafficCar } from './traffic.js';
import { makePed, stepPed, knockDown } from './pedestrians.js';
import { makeWanted, addHeat, clearWanted, updateWanted, makeFootCop, makePoliceCar, stepFootCop, stepPoliceCar, wantedCounts } from './police.js';
import { makeBullets, fireBullet, stepBullets, makeGuard, stepGuard, damageGuard } from './combat.js';
import { makeMissionState, currentMissionDef, startMission, updateMission, maybeOfferTaxi, updateSideJob } from './missions.js';
import { makeParticles, burst, smoke, addText, addSkid, stepParticles } from './particles.js';
import { loadSave, writeSave, hasSave, writeBest } from './save.js';

const TRAFFIC_TARGET = 12;
const PED_TARGET = 14;

export function createWorld(seed, opts) {
  const o = opts || {};
  const world = {
    seed,
    rng: mulberry32(seed),
    city: null,
    player: null,
    cars: [],
    traffic: [],
    peds: [],
    footCops: [],
    policeCars: [],
    guards: [],
    bullets: makeBullets(),
    particles: makeParticles(),
    pickups: [], // weapon pickups: { x, y, kind: 'shotgun'|'shells', taken }
    wanted: makeWanted(),
    missions: makeMissionState(),
    time: 0,
    playSeconds: 0,
    totalEarned: 0,
    carsStolen: 0, // jacked NPC cars + stolen fixed cars (Sunray, Comet)
    state: 'title', // title | playing | paused | dead | busted | victory
    camX: 0,
    camY: 0,
    shake: 0,
    missionTarget: null,
    objective: '',
    prompt: '',
    events: [],
    lastShot: null,
    lastCrash: null,
    crashCooldown: 0,
    victoryShown: false,
    debug: !!o.debug,
  };

  world.emit = function emit(type, data) {
    world.events.push({ type, ...(data || {}) });
  };
  world.banner = function banner(title, sub, dur) {
    world.emit('banner', { title, sub, dur });
  };
  world.addHeat = function addHeatAmount(n) {
    addHeat(world.wanted, n);
  };

  world.reset = function reset() {
    world.rng = mulberry32(seed);
    world.city = buildCity(seed);
    world.player = makePlayer(world.city.playerStart.x, world.city.playerStart.y);
    world.cars = [];
    world.traffic = [];
    world.peds = [];
    world.footCops = [];
    world.policeCars = [];
    world.guards = [];
    world.bullets = makeBullets();
    world.particles = makeParticles();
    // Weapon pickups (fixed spots, one run each): the shotgun hangs by the
    // Harbor Arms door; shell boxes sit on two avenues.
    world.pickups = [
      { x: 1350, y: 600, kind: 'shotgun', taken: false },
      { x: 704, y: 256, kind: 'shells', taken: false },
      { x: 1856, y: 1536, kind: 'shells', taken: false },
    ];
    world.wanted = makeWanted();
    world.missions = makeMissionState();
    world.time = 0;
    world.playSeconds = 0;
    world.totalEarned = 0;
    world.carsStolen = 0;
    world.state = 'playing';
    world.camX = world.player.x;
    world.camY = world.player.y;
    world.shake = 0;
    world.missionTarget = null;
    world.objective = '';
    world.prompt = '';
    world.events = [];
    world.lastShot = null;
    world.lastCrash = null;
    world.crashCooldown = 0;
    world.victoryShown = false;
    // Parked cars from the city's spots.
    for (let i = 0; i < world.city.parkedSpots.length; i += 1) {
      const s = world.city.parkedSpots[i];
      const fixed = s.fixed || null;
      world.cars.push(makeCar(s.type, s.x, s.y, s.angle, world.rng, { color: s.color, fixed }));
    }
    // One car parked by the Loft so the first drive is a step away.
    world.cars.push(makeCar('sedan', 352, 1400, Math.PI / 2, world.rng, {}));
    for (let i = 0; i < TRAFFIC_TARGET; i += 1) {
      const t = makeTrafficCar(world.city, world.rng);
      world.traffic.push(t);
      world.cars.push(t.car);
    }
    for (let i = 0; i < PED_TARGET; i += 1) {
      world.peds.push(makePed(world.city, world.rng));
    }
    computeTargetAndObjective(world);
    computePrompt(world);
    world.banner('NEON HARBOR', 'Take work at the Lantern Bar. Stay out of the cells.', 2);
  };

  world.saveGame = function saveGame() {
    writeSave({
      cash: world.player.cash,
      ammo: world.player.ammo,
      health: world.player.health,
      weapon: world.player.weapon,
      hasShotgun: world.player.hasShotgun,
      shotgunAmmo: world.player.shotgunAmmo,
      missionIndex: world.missions.index,
      completed: world.missions.completed,
      storyDone: world.missions.storyDone,
      totalEarned: world.totalEarned,
      carsStolen: world.carsStolen,
      playSeconds: world.playSeconds,
      x: world.player.x,
      y: world.player.y,
    });
  };

  world.loadSaveInto = function loadSaveInto(save) {
    if (!save) return;
    world.player.cash = save.cash;
    world.player.ammo = save.ammo;
    world.player.health = save.health;
    world.player.weapon = save.weapon || 'pistol';
    world.player.hasShotgun = !!save.hasShotgun;
    world.player.shotgunAmmo = save.shotgunAmmo || 0;
    world.player.x = save.x || world.city.playerStart.x;
    world.player.y = save.y || world.city.playerStart.y;
    world.missions.index = save.missionIndex || 0;
    world.missions.completed = save.completed || [];
    world.missions.storyDone = !!save.storyDone;
    world.totalEarned = save.totalEarned || 0;
    world.carsStolen = save.carsStolen || 0;
    world.playSeconds = save.playSeconds || 0;
    world.camX = world.player.x;
    world.camY = world.player.y;
  };

  world.ensureSunray = function ensureSunray() {
    if (world.cars.some((c) => c.fixed === 'sunray')) return;
    const s = world.city.sunraySpot;
    world.cars.push(makeCar('sport', s.x, s.y, s.angle, world.rng, { color: '#f2c230', fixed: 'sunray' }));
  };

  world.ensureComet = function ensureComet() {
    if (world.cars.some((c) => c.fixed === 'comet')) return;
    const s = world.city.cometSpot;
    world.cars.push(makeCar('comet', s.x, s.y, s.angle, world.rng, { color: '#ff6a3d', fixed: 'comet' }));
  };

  // Ensure the fixed car a 'steal' step names ('sunray' by default).
  world.ensureFixedCar = function ensureFixedCar(id) {
    if (id === 'comet') world.ensureComet();
    else world.ensureSunray();
  };

  world.spawnTargetCar = function spawnTargetCar() {
    const spot = world.city.roadPointNear(world.player.x, world.player.y, 380);
    const car = makeCar('sedan', spot.x, spot.y, 0, world.rng, { driver: 'npc', color: '#8a8f96', fixed: 'target' });
    car.maxSpeed = 175;
    const t = { car, axis: 'v', dir: 1, cruise: 175, isTarget: true };
    world.traffic.push(t);
    world.cars.push(car);
    return car;
  };

  world.spawnBankGuards = function spawnBankGuards() {
    const bank = world.city.zone('bank');
    if (!bank) return;
    for (let i = 0; i < 3; i += 1) {
      world.guards.push(makeGuard(bank.x + (i - 1) * 70, bank.y - 40, world.rng));
    }
    world.banner('Guards on the floor', 'The vault crew is armed. Clear them out.', 3);
  };

  world.spawnTrafficNear = function spawnTrafficNear(x, y, n) {
    for (let i = 0; i < n; i += 1) {
      const t = makeTrafficCar(world.city, world.rng);
      t.car.x = x + range(world.rng, -260, 260);
      t.car.y = y + range(world.rng, -260, 260);
      world.traffic.push(t);
      world.cars.push(t.car);
    }
  };

  world.enterExitCar = function enterExitCar() {
    const player = world.player;
    if (player.car) {
      const car = player.car;
      car.driver = null;
      player.car = null;
      const px = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      const py = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      const resolved = world.city.resolveCircle(px, py, PLAYER.radius);
      player.x = resolved.x;
      player.y = resolved.y;
      world.emit('sfx', { name: 'click' });
      return;
    }
    const car = nearestCar(world.cars, player.x, player.y, 72);
    if (!car) return;
    const jacked = car.driver === 'npc';
    const fixedTheft = car.fixed === 'sunray' || car.fixed === 'comet';
    if (jacked) {
      // Pull the driver out: they flee on foot, the heat is on you.
      const driver = makePed(world.city, world.rng, car.x + 30, car.y + 30);
      driver.state = 'flee';
      driver.timer = 3;
      driver.fleeX = car.x + 40 - player.x;
      driver.fleeY = car.y + 40 - player.y;
      world.peds.push(driver);
      world.addHeat(30);
      world.banner('Car jacked', 'The Harbor PD was told. Lose them.', 2.5);
      world.emit('sfx', { name: 'crash', arg: 0.4 });
    }
    // Stolen-car stat: each jack counts once; each fixed mission car counts
    // the first time it is taken.
    if (jacked || (fixedTheft && !car.stolenCounted)) {
      world.carsStolen += 1;
      car.stolenCounted = true;
    }
    car.driver = 'player';
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    world.emit('sfx', { name: 'click' });
  };

  world.shootAt = function shootAt(wx, wy) {
    const player = world.player;
    if (player.shootTimer > 0) return;
    const fromX = player.car ? player.car.x : player.x;
    const fromY = player.car ? player.car.y : player.y;
    const angle = Math.atan2(wy - fromY, wx - fromX);
    player.angle = angle;
    // Shotgun: a 5-pellet spread at close range. Empty shells drop back to
    // the pistol on the next trigger pull.
    if (player.weapon === 'shotgun' && player.shotgunAmmo > 0) {
      player.shotgunAmmo -= 1;
      player.shootTimer = COMBAT.shotgunInterval;
      for (let i = 0; i < COMBAT.shotgunPellets; i += 1) {
        const off = (i - (COMBAT.shotgunPellets - 1) / 2) * COMBAT.shotgunSpread + (world.rng() - 0.5) * 0.05;
        fireBullet(world.bullets, fromX + Math.cos(angle) * 24, fromY + Math.sin(angle) * 24, angle + off, true, { dmg: COMBAT.shotgunDamage, range: COMBAT.shotgunRange });
      }
      world.lastShot = { x: fromX, y: fromY, r: 240, t: 0.6 };
      world.addHeat(25);
      world.emit('sfx', { name: 'shoot' });
      world.shake = Math.min(1, world.shake + 0.3);
      return;
    }
    if (player.weapon === 'shotgun' && player.shotgunAmmo <= 0) {
      player.weapon = 'pistol';
    }
    if (!player.hasPistol || player.ammo <= 0) {
      world.punch(angle);
      return;
    }
    player.ammo -= 1;
    player.shootTimer = COMBAT.pistolInterval;
    fireBullet(world.bullets, fromX + Math.cos(angle) * 24, fromY + Math.sin(angle) * 24, angle, true);
    world.lastShot = { x: fromX, y: fromY, r: 240, t: 0.6 };
    world.addHeat(25);
    world.emit('sfx', { name: 'shoot' });
    world.shake = Math.min(1, world.shake + 0.15);
  };

  world.punch = function punch(angle) {
    const player = world.player;
    if (player.punchTimer > 0) return;
    player.punchTimer = 0.45;
    player.angle = angle;
    const px = player.x + Math.cos(angle) * 34;
    const py = player.y + Math.sin(angle) * 34;
    world.emit('sfx', { name: 'punch' });
    // Hit the nearest ped / guard / cop in reach.
    for (let i = 0; i < world.peds.length; i += 1) {
      const ped = world.peds[i];
      if (ped.state !== 'down' && Math.hypot(ped.x - px, ped.y - py) < 34) {
        if (knockDown(ped, world.rng)) {
          world.addHeat(40);
          burst(world.particles, ped.x, ped.y, { color: '#e05a4e', n: 10 });
        }
        return;
      }
    }
    for (let i = 0; i < world.guards.length; i += 1) {
      const g = world.guards[i];
      if (!g.dead && Math.hypot(g.x - px, g.y - py) < 36) {
        damageGuard(g, 25);
        burst(world.particles, g.x, g.y, { color: '#e05a4e', n: 8 });
        return;
      }
    }
    for (let i = 0; i < world.footCops.length; i += 1) {
      const c = world.footCops[i];
      if (Math.hypot(c.x - px, c.y - py) < 36) {
        c.x += Math.cos(angle) * 30;
        c.y += Math.sin(angle) * 30;
        world.addHeat(20);
        return;
      }
    }
  };

  world.interact = function interact() {
    const player = world.player;
    const zone = nearestZone(world, player.x, player.y, 85);
    if (!zone) return;
    switch (zone.name) {
      case 'bar': {
        if (world.missions.active) {
          world.banner('Job in progress', world.missions.active.def.name + ' — check the marker.', 2.5);
          return;
        }
        const def = currentMissionDef(world.missions);
        if (!def) {
          world.banner('No work right now', 'Free roam — taxi fares pay the bills.', 2.5);
          return;
        }
        startMission(world.missions, def, world);
        world.banner(def.name, def.brief, 4);
        world.emit('sfx', { name: 'mission' });
        return;
      }
      case 'garage': {
        if (!player.car) {
          world.banner('Pit Stop Garage', 'Bring a car in to repair it — $' + ECONOMY.repairCost + '.', 2.5);
          return;
        }
        if (player.car.health >= 100) {
          world.banner('Pit Stop Garage', 'She is already in good shape.', 2);
          return;
        }
        if (player.cash < ECONOMY.repairCost) {
          world.banner('Pit Stop Garage', 'Repair is $' + ECONOMY.repairCost + ' — you are short.', 2.5);
          return;
        }
        player.cash -= ECONOMY.repairCost;
        player.car.health = 100;
        player.car.dead = false;
        world.banner('Repaired', 'Good as new. $' + ECONOMY.repairCost + '.', 2);
        world.emit('sfx', { name: 'cash' });
        return;
      }
      case 'med': {
        if (player.health >= 100) {
          world.banner('Med Stop', 'You are already patched up.', 2);
          return;
        }
        if (player.cash < ECONOMY.healCost) {
          world.banner('Med Stop', 'A patch-up is $' + ECONOMY.healCost + ' — you are short.', 2.5);
          return;
        }
        player.cash -= ECONOMY.healCost;
        healPlayer(player, 100);
        world.banner('Patched up', 'Back to full health. $' + ECONOMY.healCost + '.', 2);
        world.emit('sfx', { name: 'cash' });
        return;
      }
      case 'arms': {
        if (player.cash < ECONOMY.ammoCost) {
          world.banner('Harbor Arms', '12 rounds is $' + ECONOMY.ammoCost + ' — you are short.', 2.5);
          return;
        }
        player.cash -= ECONOMY.ammoCost;
        player.ammo += ECONOMY.ammoPack;
        world.banner('Ammo bought', '+' + ECONOMY.ammoPack + ' rounds. $' + ECONOMY.ammoCost + '.', 2);
        world.emit('sfx', { name: 'cash' });
        return;
      }
      case 'loft': {
        clearWanted(world.wanted);
        world.footCops = [];
        for (let i = 0; i < world.policeCars.length; i += 1) {
          world.policeCars[i].car.driver = null;
        }
        world.policeCars = [];
        world.saveGame();
        world.banner('Safehouse', 'Heat is off. Progress saved.', 2.5);
        world.emit('sfx', { name: 'pickup' });
        return;
      }
      case 'chop': {
        if (!player.car) {
          world.banner('Chop Shop', 'Bring a car in to sell it.', 2.5);
          return;
        }
        const car = player.car;
        const pay = car.fixed === 'sunray' ? 300 : 150;
        player.cash += pay;
        world.totalEarned += pay;
        const idx = world.cars.indexOf(car);
        if (idx >= 0) world.cars.splice(idx, 1);
        player.car = null;
        player.x = zone.x;
        player.y = zone.y + 40;
        world.banner('Car sold — $' + pay, 'No questions asked.', 2.5);
        world.emit('sfx', { name: 'cash' });
        return;
      }
      default:
        world.banner(zone.label, 'Nothing to do here right now.', 2);
        return;
    }
  };

  function nearestZone(w, x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    const zones = w.city.zones;
    for (let i = 0; i < zones.length; i += 1) {
      if (zones[i].name === 'vault') continue;
      const d = Math.hypot(zones[i].x - x, zones[i].y - y);
      if (d < bestD) {
        bestD = d;
        best = zones[i];
      }
    }
    return best;
  }

  function computeTargetAndObjective(w) {
    const player = w.player;
    const ms = w.missions;
    // Side job first.
    if (ms.side) {
      if (ms.side.phase === 'pickup') {
        w.missionTarget = { x: ms.side.x, y: ms.side.y };
        w.objective = 'Taxi: pick up the fare';
      } else {
        w.missionTarget = { x: ms.side.destX, y: ms.side.destY };
        w.objective = 'Taxi: drop the fare at the Marina';
      }
      return;
    }
    if (ms.active) {
      const inst = ms.active;
      const step = inst.def.steps[inst.step];
      w.objective = inst.def.name + ' — ' + step.label;
      if (step.type === 'follow' && inst.targetCar) {
        w.missionTarget = { x: inst.targetCar.x, y: inst.targetCar.y };
        return;
      }
      if (step.type === 'checkpoint' && step.zones) {
        const idx = inst.cpIndex || 0;
        const zone = idx < step.zones.length ? w.city.zone(step.zones[idx]) : null;
        if (zone) w.missionTarget = { x: zone.x, y: zone.y };
        return;
      }
      if (step.zone) {
        const zone = w.city.zone(step.zone);
        if (zone) w.missionTarget = { x: zone.x, y: zone.y };
        return;
      }
      w.missionTarget = null;
      return;
    }
    const def = currentMissionDef(ms);
    if (def) {
      const bar = w.city.zone('bar');
      w.missionTarget = bar ? { x: bar.x, y: bar.y } : null;
      w.objective = 'Next job: ' + def.name + ' — go to the Lantern Bar (Q)';
    } else {
      w.missionTarget = null;
      w.objective = 'Free roam — the harbor is yours';
    }
    if (player.car) w.objective += '  ·  E to get out';
  }

  function computePrompt(w) {
    const player = w.player;
    const zone = nearestZone(w, player.x, player.y, 85);
    if (!zone) {
      w.prompt = '';
      return;
    }
    switch (zone.name) {
      case 'bar': w.prompt = 'Q — Take the job'; break;
      case 'garage': w.prompt = player.car ? 'Q — Repair car ($' + ECONOMY.repairCost + ')' : 'Q — Pit Stop Garage'; break;
      case 'med': w.prompt = 'Q — Heal ($' + ECONOMY.healCost + ')'; break;
      case 'arms': w.prompt = 'Q — Buy ammo ($' + ECONOMY.ammoCost + ')'; break;
      case 'loft': w.prompt = 'Q — Safehouse: clear heat + save'; break;
      case 'chop': w.prompt = player.car ? 'Q — Sell this car' : 'Q — Chop Shop'; break;
      default: w.prompt = ''; break;
    }
    if (!player.car && nearestCar(w.cars, player.x, player.y, 72)) {
      w.prompt = (w.prompt ? w.prompt + '   ' : '') + 'E — Get in the car';
    }
  }

  world.update = function update(dt, input) {
    if (world.state !== 'playing') return;
    world.time += dt;
    world.playSeconds += dt;
    const player = world.player;
    player.shootTimer = Math.max(0, player.shootTimer - dt);
    player.punchTimer = Math.max(0, player.punchTimer - dt);
    world.crashCooldown = Math.max(0, world.crashCooldown - dt);
    world.shake = Math.max(0, world.shake - dt * 2.2);
    if (world.lastShot) {
      world.lastShot.t -= dt;
      if (world.lastShot.t <= 0) world.lastShot = null;
    }
    if (world.lastCrash) {
      world.lastCrash.t -= dt;
      if (world.lastCrash.t <= 0) world.lastCrash = null;
    }

    // Input edges.
    if (input.wasPressed('e')) world.enterExitCar();
    if (input.wasPressed('q')) world.interact();
    if (input.wasPressed('p')) {
      world.state = 'paused';
      world.emit('state', { state: 'paused' });
      return;
    }
    if (input.wasPressed('m')) {
      world.emit('mute');
      return;
    }
    if (input.wasPressed('r')) {
      const save = loadSave();
      world.reset();
      if (save) world.loadSaveInto(save);
      world.banner('Run restarted', 'Loaded your last save.', 2.5);
      return;
    }

    const move = input.moveVector();
    if (player.car) {
      const car = player.car;
      const drive = {
        throttle: -move.y,
        steer: move.x,
        handbrake: input.held('Space'),
      };
      const res = stepCar(car, drive, dt, world.city);
      if (res.hitBuilding && res.hitSpeed > 140) {
        world.lastCrash = { x: car.x, y: car.y, r: 200, t: 0.6 };
        world.shake = Math.min(1, world.shake + 0.3);
        world.emit('sfx', { name: 'crash', arg: res.hitSpeed / 500 });
        burst(world.particles, car.x, car.y, { color: '#c8c8d0', n: 8, speed: 160 });
        damagePlayer(player, Math.min(12, (res.hitSpeed - 140) * 0.03));
      }
      if (car.skid > 0) {
        const bx = car.x - Math.cos(car.angle) * car.l * 0.4;
        const by = car.y - Math.sin(car.angle) * car.l * 0.4;
        addSkid(world.particles, bx, by, bx + Math.cos(car.angle) * 6, by + Math.sin(car.angle) * 6);
      }
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      // Shooting from the car: aim at the mouse.
      if (input.wasPressed('f') || input.clicked) {
        world.shootAt(input.aimX, input.aimY);
      }
      if (car.dead) {
        world.banner('Car wrecked', 'Get out and find another ride.', 2.5);
        world.enterExitCar();
      }
    } else {
      stepPlayerOnFoot(player, move, dt, world.city);
      // Aim at the mouse when it has moved; otherwise face movement.
      if (input.mouseMoved && Math.hypot(input.aimX - player.x, input.aimY - player.y) > 60) {
        player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
      }
      if (input.wasPressed('f') || input.clicked) {
        world.shootAt(input.aimX, input.aimY);
      }
    }

    // Traffic.
    for (let i = world.traffic.length - 1; i >= 0; i -= 1) {
      const t = world.traffic[i];
      stepTrafficCar(t, dt, world.city, world.rng, world.cars);
      const d = Math.hypot(t.car.x - player.x, t.car.y - player.y);
      if (d > 1400 && !t.isTarget) {
        // Recycle far-away traffic near the player.
        const idx = world.cars.indexOf(t.car);
        if (idx >= 0) world.cars.splice(idx, 1);
        world.traffic.splice(i, 1);
        const nt = makeTrafficCar(world.city, world.rng);
        nt.car.x = player.x + range(world.rng, -700, 700);
        nt.car.y = player.y + range(world.rng, -700, 700);
        world.traffic.push(nt);
        world.cars.push(nt.car);
      }
    }
    if (world.traffic.length < TRAFFIC_TARGET) {
      const t = makeTrafficCar(world.city, world.rng);
      world.traffic.push(t);
      world.cars.push(t.car);
    }

    // Pedestrians.
    const dangers = [];
    if (world.lastShot) dangers.push(world.lastShot);
    if (world.lastCrash) dangers.push(world.lastCrash);
    if (player.car && Math.abs(player.car.speed) > 200) {
      dangers.push({ x: player.car.x, y: player.car.y, r: 200 });
    }
    for (let i = world.peds.length - 1; i >= 0; i -= 1) {
      const ped = world.peds[i];
      stepPed(ped, dt, world.city, world.rng, dangers);
      const d = Math.hypot(ped.x - player.x, ped.y - player.y);
      if (d > 1200) {
        world.peds.splice(i, 1);
        world.peds.push(makePed(world.city, world.rng));
      }
      // Run over by the player's car.
      if (player.car && ped.state !== 'down' && Math.hypot(ped.x - player.car.x, ped.y - player.car.y) < 30) {
        if (knockDown(ped, world.rng)) {
          world.addHeat(40);
          burst(world.particles, ped.x, ped.y, { color: '#e05a4e', n: 12 });
          addText(world.particles, ped.x, ped.y - 20, '+1 ★ heat', '#ff6b5e');
          world.emit('sfx', { name: 'punch' });
        }
      }
    }

    // Car-car collisions.
    for (let i = 0; i < world.cars.length; i += 1) {
      for (let j = i + 1; j < world.cars.length; j += 1) {
        const a = world.cars[i];
        const b = world.cars[j];
        if (a.dead || b.dead) continue;
        const impact = collideCars(a, b);
        if (impact > 120 && (a.driver === 'player' || b.driver === 'player') && world.crashCooldown <= 0) {
          world.crashCooldown = 2;
          world.addHeat(8);
          world.lastCrash = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: 200, t: 0.6 };
          world.shake = Math.min(1, world.shake + 0.35);
          world.emit('sfx', { name: 'crash', arg: impact / 500 });
          burst(world.particles, (a.x + b.x) / 2, (a.y + b.y) / 2, { color: '#ffd76a', n: 10, speed: 200 });
        }
      }
    }

    // Bullets.
    const hits = stepBullets(world.bullets, dt, world.city, (b) => {
      for (let i = 0; i < world.guards.length; i += 1) {
        const g = world.guards[i];
        if (!g.dead && Math.hypot(g.x - b.x, g.y - b.y) < 14) return { kind: 'guard', ref: g };
      }
      for (let i = 0; i < world.footCops.length; i += 1) {
        const c = world.footCops[i];
        if (Math.hypot(c.x - b.x, c.y - b.y) < 14) return { kind: 'cop', ref: c };
      }
      for (let i = 0; i < world.peds.length; i += 1) {
        const p = world.peds[i];
        if (p.state !== 'down' && Math.hypot(p.x - b.x, p.y - b.y) < 12) return { kind: 'ped', ref: p };
      }
      for (let i = 0; i < world.cars.length; i += 1) {
        const c = world.cars[i];
        if (c.driver !== 'player' && Math.hypot(c.x - b.x, c.y - b.y) < c.l * 0.42) return { kind: 'car', ref: c };
      }
      if (!b.fromPlayer && Math.hypot(player.x - b.x, player.y - b.y) < 14) return { kind: 'player', ref: player };
      if (!b.fromPlayer && player.car && Math.hypot(player.car.x - b.x, player.car.y - b.y) < player.car.l * 0.42) {
        return { kind: 'car', ref: player.car };
      }
      return null;
    });
    for (let i = 0; i < hits.length; i += 1) {
      const hit = hits[i];
      burst(world.particles, hit.x, hit.y, { color: '#ffd76a', n: 6, speed: 140 });
      if (hit.target === 'wall') continue;
      const t = hit.target;
      if (t.kind === 'guard') {
        damageGuard(t.ref, hit.dmg || COMBAT.pistolDamage);
        if (t.ref.dead) {
          addText(world.particles, t.ref.x, t.ref.y - 20, 'Guard down', '#ffd76a');
        }
      } else if (t.kind === 'cop') {
        const idx = world.footCops.indexOf(t.ref);
        if (idx >= 0) world.footCops.splice(idx, 1);
        world.addHeat(45);
        addText(world.particles, t.ref.x, t.ref.y - 20, 'Cop down', '#ff6b5e');
      } else if (t.kind === 'ped') {
        if (knockDown(t.ref, world.rng)) world.addHeat(40);
      } else if (t.kind === 'car') {
        t.ref.health -= hit.dmg || COMBAT.pistolDamage;
        if (t.ref.health <= 0) {
          t.ref.health = 0;
          t.ref.dead = true;
          t.ref.speed = 0;
          burst(world.particles, t.ref.x, t.ref.y, { color: '#ff9a3c', n: 22, speed: 320 });
        }
      } else if (t.kind === 'player') {
        damagePlayer(player, COMBAT.guardDamage);
        world.shake = Math.min(1, world.shake + 0.25);
        world.emit('sfx', { name: 'punch' });
      }
    }

    // Guards shoot back.
    for (let i = 0; i < world.guards.length; i += 1) {
      const shot = stepGuard(world.guards[i], player, dt, world.city, world.rng);
      if (shot) {
        fireBullet(world.bullets, shot.x, shot.y, shot.angle, false);
        world.emit('sfx', { name: 'shoot' });
      }
    }

    // Wanted: police spawn and chase.
    const counts = wantedCounts(world.wanted.stars, !!player.car);
    if (world.wanted.stars > 0) {
      while (world.footCops.length < counts.foot) {
        const spot = world.city.roadPointNear(player.x, player.y, 480);
        world.footCops.push(makeFootCop(spot.x, spot.y));
      }
      while (world.policeCars.length < counts.cars) {
        const spot = world.city.roadPointNear(player.x, player.y, 620);
        const pc = makePoliceCar(world.city, world.rng, spot.x, spot.y);
        world.policeCars.push(pc);
        world.cars.push(pc.car);
      }
    } else {
      world.footCops = [];
      for (let i = 0; i < world.policeCars.length; i += 1) {
        world.policeCars[i].car.driver = null;
      }
      world.policeCars = [];
    }
    let seen = false;
    for (let i = world.footCops.length - 1; i >= 0; i -= 1) {
      const cop = world.footCops[i];
      const d = Math.hypot(cop.x - player.x, cop.y - player.y);
      if (d < 520) seen = true;
      if (d > 1300) {
        world.footCops.splice(i, 1);
        continue;
      }
      const res = stepFootCop(cop, player, dt, world.city);
      if (res === 'busted') {
        player.busted = true;
        const bail = Math.min(player.cash, 100);
        player.cash -= bail;
        world.state = 'busted';
        world.emit('state', { state: 'busted' });
        world.emit('sfx', { name: 'busted' });
        return;
      }
    }
    for (let i = world.policeCars.length - 1; i >= 0; i -= 1) {
      const pc = world.policeCars[i];
      const d = Math.hypot(pc.car.x - player.x, pc.car.y - player.y);
      if (d < 620) seen = true;
      if (d > 1500) {
        const idx = world.cars.indexOf(pc.car);
        if (idx >= 0) world.cars.splice(idx, 1);
        world.policeCars.splice(i, 1);
        continue;
      }
      const res = stepPoliceCar(pc, player, dt, world.city, world.rng);
      if (res && res.dropCop) {
        world.footCops.push(makeFootCop(res.x, res.y));
      }
      // A police car ramming the player's car hurts the player.
      if (player.car && Math.hypot(pc.car.x - player.car.x, pc.car.y - player.car.y) < 60) {
        damagePlayer(player, 6 * dt);
      }
    }
    updateWanted(world.wanted, dt, seen);

    // Weapon pickups: walk over them to collect.
    for (let i = 0; i < world.pickups.length; i += 1) {
      const pk = world.pickups[i];
      if (pk.taken) continue;
      if (Math.hypot(pk.x - player.x, pk.y - player.y) > 34) continue;
      if (pk.kind === 'shotgun') {
        pk.taken = true;
        player.hasShotgun = true;
        player.weapon = 'shotgun';
        player.shotgunAmmo += COMBAT.shotgunAmmoStart;
        world.banner('Shotgun!', '+' + COMBAT.shotgunAmmoStart + ' shells — spread fire, close range. Empty shells drop back to the pistol.', 3);
        world.emit('sfx', { name: 'pickup' });
      } else if (pk.kind === 'shells') {
        if (!player.hasShotgun) {
          if (!pk.warned) {
            pk.warned = true;
            world.banner('Shotgun shells', 'You need a shotgun first — one hangs by the Harbor Arms door.', 2.5);
          }
          continue;
        }
        pk.taken = true;
        player.shotgunAmmo += COMBAT.shellsPerPickup;
        player.weapon = 'shotgun';
        world.banner('Shells + ' + COMBAT.shellsPerPickup, 'Shotgun loaded.', 2);
        world.emit('sfx', { name: 'pickup' });
      }
    }

    // Missions and side jobs.
    updateMission(world.missions, world, dt);
    maybeOfferTaxi(world.missions, world, world.rng);
    updateSideJob(world.missions, world, dt);

    // Smoking wreck.
    if (player.car && player.car.health < 40 && chance(world.rng, dt * 6)) {
      smoke(world.particles, player.car.x, player.car.y - 10);
    }

    // Death.
    if (player.dead) {
      world.state = 'dead';
      world.emit('state', { state: 'dead' });
      world.emit('sfx', { name: 'wasted' });
      const best = { cash: world.totalEarned, missions: world.missions.completed.length, seconds: Math.round(world.playSeconds) };
      writeBest(best);
      return;
    }
    // Victory (once).
    if (world.missions.storyDone && !world.victoryShown) {
      world.victoryShown = true;
      world.state = 'victory';
      world.emit('state', { state: 'victory' });
      world.emit('sfx', { name: 'mission' });
      return;
    }

    computeTargetAndObjective(world);
    computePrompt(world);
    stepParticles(world.particles, dt);

    // Camera follows the player (or the car).
    const tx = player.x;
    const ty = player.y;
    world.camX += (tx - world.camX) * Math.min(1, dt * 5);
    world.camY += (ty - world.camY) * Math.min(1, dt * 5);
  };

  world.reset();
  if (o.save) world.loadSaveInto(o.save);
  return world;
}
