// Missions: the 6-story arc plus repeatable side jobs. A mission is a list of steps;
// updateMission advances them from the world's live state and reports events.
import { MISSIONS, ECONOMY } from './config.js';

export function makeMissionState() {
  return {
    index: 0, // next story mission to start
    active: null, // running mission instance, or null
    side: null, // running side job, or null
    completed: [], // mission ids finished
    storyDone: false,
  };
}

export function currentMissionDef(state) {
  return state.index < MISSIONS.length ? MISSIONS[state.index] : null;
}

export function startMission(state, def, world) {
  const inst = {
    def,
    step: 0,
    timer: 0,
    spotted: 0,
    holdProgress: 0,
    lostTimer: 0,
    cpIndex: 0, // checkpoint step: how many zones of step.zones are hit
    targetCar: null,
    started: world.time,
  };
  // Step-specific setup.
  const first = def.steps[0];
  if (first.type === 'follow') {
    inst.targetCar = world.spawnTargetCar();
  }
  if (first.type === 'steal') {
    world.ensureFixedCar(first.car);
  }
  if (def.id === 'heist') {
    world.spawnBankGuards();
  }
  state.active = inst;
  return inst;
}

export function failMission(state, world, reason) {
  if (!state.active) return;
  world.banner(reason || 'Mission failed', 'Try again — the job is still open.', 3);
  state.active = null;
}

export function completeMission(state, world) {
  const inst = state.active;
  if (!inst) return;
  state.completed.push(inst.def.id);
  state.index += 1;
  state.active = null;
  if (state.index >= MISSIONS.length) state.storyDone = true;
  world.player.cash += inst.def.reward;
  world.totalEarned += inst.def.reward;
  world.emit('missionComplete', {
    title: 'Job done — $' + inst.def.reward,
    progress: 'Missions ' + state.completed.length + '/' + MISSIONS.length,
    stats: 'Jobs done ' + state.completed.length + ' · Cars stolen ' + (world.carsStolen || 0) + ' · Earned $' + world.totalEarned,
    next: state.storyDone ? 'The harbor is yours, Rook.' : nextBrief(state),
  });
  world.saveGame();
}

function nextBrief(state) {
  const def = currentMissionDef(state);
  return def ? 'Next: ' + def.name + ' — ' + def.giver : '';
}

function stepZone(world, name) {
  return world.city.zone(name);
}

function distTo(player, zone) {
  return Math.hypot(player.x - zone.x, player.y - zone.y);
}

// Advance the active mission one step. Returns 'step' | 'complete' | 'failed' | null.
export function updateMission(state, world, dt) {
  const inst = state.active;
  if (!inst) return null;
  const step = inst.def.steps[inst.step];
  const player = world.player;

  if (step.time) {
    if (inst.timer <= 0) inst.timer = step.time;
    inst.timer -= dt;
    if (inst.timer <= 0) {
      failMission(state, world, 'Out of time');
      return 'failed';
    }
  }
  if (step.startWanted && !inst.wantedSet) {
    inst.wantedSet = true;
    world.addHeat(step.startWanted);
  }

  switch (step.type) {
    case 'goto': {
      const zone = stepZone(world, step.zone);
      if (zone && distTo(player, zone) < zone.r) return advance(state, world);
      break;
    }
    case 'pickup': {
      const zone = stepZone(world, step.zone);
      if (zone && distTo(player, zone) < zone.r) {
        if (step.needsCar && !player.car) break;
        return advance(state, world);
      }
      break;
    }
    case 'steal': {
      if (player.car && player.car.fixed === step.car) return advance(state, world);
      break;
    }
    case 'deliverCar': {
      const zone = stepZone(world, step.zone);
      if (zone && player.car && player.car.fixed === (step.car || 'sunray') && distTo(player, zone) < zone.r) {
        return advance(state, world);
      }
      break;
    }
    case 'follow': {
      const target = inst.targetCar;
      if (!target || target.dead) {
        failMission(state, world, 'You lost the target');
        return 'failed';
      }
      const d = Math.hypot(target.x - player.x, target.y - player.y);
      if (d > 520) {
        inst.lostTimer += dt;
        if (inst.lostTimer > 3) {
          failMission(state, world, 'You lost the target');
          return 'failed';
        }
      } else {
        inst.lostTimer = 0;
      }
      if (d < 90) {
        inst.spotted += dt;
        if (inst.spotted > 2.5) {
          failMission(state, world, 'Spotted! The courier burned you');
          return 'failed';
        }
      } else {
        inst.spotted = Math.max(0, inst.spotted - dt);
      }
      if (d >= 120 && d <= 380) inst.followProgress = (inst.followProgress || 0) + dt;
      const need = step.duration || 45;
      if ((inst.followProgress || 0) >= need) return advance(state, world);
      break;
    }
    case 'loseWanted': {
      if (world.wanted.stars === 0) return advance(state, world);
      break;
    }
    case 'deliver': {
      if (step.noHeat && world.wanted.stars > 0) {
        failMission(state, world, 'The VIP saw the cops — job blown');
        return 'failed';
      }
      const zone = stepZone(world, step.zone);
      if (zone && distTo(player, zone) < zone.r) return advance(state, world);
      break;
    }
    case 'checkpoint': {
      // Hit each zone in step.zones in order, before the step timer runs out.
      const zones = step.zones || [];
      const idx = inst.cpIndex || 0;
      if (idx >= zones.length) return advance(state, world);
      const zone = stepZone(world, zones[idx]);
      if (zone && distTo(player, zone) < zone.r) {
        inst.cpIndex = idx + 1;
        if (inst.cpIndex >= zones.length) return advance(state, world);
        const next = stepZone(world, zones[inst.cpIndex]);
        world.banner('Checkpoint ' + inst.cpIndex + '/' + zones.length, next ? 'Next: ' + next.label : '', 2);
      }
      break;
    }
    case 'hold': {
      const zone = stepZone(world, step.zone);
      if (zone && distTo(player, zone) < zone.r) {
        inst.holdProgress += dt;
        if (inst.holdProgress >= (step.hold || 6)) return advance(state, world);
      } else {
        inst.holdProgress = Math.max(0, inst.holdProgress - dt * 2);
      }
      break;
    }
    case 'escape': {
      const zone = stepZone(world, step.zone);
      if (world.wanted.stars === 0 && zone && distTo(player, zone) < zone.r) {
        return advance(state, world);
      }
      break;
    }
    default:
      break;
  }
  return null;
}

function advance(state, world) {
  const inst = state.active;
  inst.step += 1;
  inst.timer = 0;
  inst.spotted = 0;
  inst.holdProgress = 0;
  inst.followProgress = 0;
  inst.lostTimer = 0;
  inst.cpIndex = 0;
  if (inst.step >= inst.def.steps.length) {
    completeMission(state, world);
    return 'complete';
  }
  const next = inst.def.steps[inst.step];
  if (next.type === 'follow') inst.targetCar = world.spawnTargetCar();
  if (next.type === 'steal') world.ensureFixedCar(next.car);
  world.banner(inst.def.name, next.label, 3);
  return 'step';
}

// ---- Side jobs: taxi fares and parcel deliveries. ----

export function maybeOfferTaxi(state, world, rng) {
  if (state.active || state.side || !world.player.car) return;
  if (world.wanted.stars > 0) return; // No fares while the cops are on you.
  if (rng() > 0.02) return;
  const spot = world.city.sidewalkPoint();
  const dest = world.city.zone('marina');
  state.side = {
    kind: 'taxi',
    phase: 'pickup',
    x: spot.x,
    y: spot.y,
    destX: dest.x,
    destY: dest.y,
    timer: 90,
    fare: ECONOMY.taxiBase,
  };
  world.banner('Taxi fare', 'A fare is waving you down — pick them up.', 2.5);
}

export function updateSideJob(state, world, dt) {
  const job = state.side;
  if (!job) return null;
  const player = world.player;
  job.timer -= dt;
  if (job.timer <= 0) {
    state.side = null;
    world.banner('Fare lost', 'They found another cab.', 2);
    return 'failed';
  }
  if (job.phase === 'pickup') {
    const d = Math.hypot(player.x - job.x, player.y - job.y);
    if (d < 55 && player.car) {
      job.phase = 'drop';
      job.timer = 90;
      world.banner('Fare aboard', 'Take them to the Marina.', 2);
    }
  } else {
    const d = Math.hypot(player.x - job.destX, player.y - job.destY);
    if (d < 80) {
      const pay = job.fare + Math.round(ECONOMY.taxiPerPx * 900);
      player.cash += pay;
      world.totalEarned += pay;
      state.side = null;
      world.banner('Fare paid — $' + pay, 'Nice driving.', 2.5);
      return 'complete';
    }
  }
  return null;
}
