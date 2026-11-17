// The wanted system: heat, stars, foot cops who chase and arrest, police cars
// that chase and ram. Heat decays when no cop can see the player.
import { WANTED } from './config.js';
import { makeCar, stepCar } from './vehicles.js';

export function makeWanted() {
  return { heat: 0, stars: 0 };
}

export function addHeat(wanted, amount) {
  wanted.heat = Math.min(WANTED.maxHeat, wanted.heat + amount);
  wanted.stars = Math.min(5, Math.ceil(wanted.heat / WANTED.perStar));
}

export function clearWanted(wanted) {
  wanted.heat = 0;
  wanted.stars = 0;
}

// Decay only while unseen; returns whether any cop currently sees the player.
export function updateWanted(wanted, dt, seen) {
  if (!seen && wanted.heat > 0) {
    wanted.heat = Math.max(0, wanted.heat - WANTED.decayPerSec * dt);
    wanted.stars = Math.min(5, Math.ceil(wanted.heat / WANTED.perStar));
    if (wanted.heat <= 0) wanted.stars = 0;
  }
}

export function makeFootCop(x, y) {
  return { x, y, angle: 0, arrest: 0, speed: 235 };
}

export function makePoliceCar(city, rng, x, y) {
  const car = makeCar('police', x, y, 0, rng, { driver: 'npc' });
  car.maxSpeed = 490;
  return { car, droppedCop: false };
}

// A foot cop runs at the player; standing on the player while they are on foot
// and slow builds the arrest timer. Returns 'busted' when the arrest completes.
export function stepFootCop(cop, player, dt, city) {
  const dx = player.x - cop.x;
  const dy = player.y - cop.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 1) {
    cop.angle = Math.atan2(dy, dx);
    const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
    const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
    const resolved = city.resolveCircle(nx, ny, 13);
    cop.x = resolved.x;
    cop.y = resolved.y;
  }
  if (dist < 46 && !player.car) {
    cop.arrest += dt;
    if (cop.arrest > 1.2) return 'busted';
  } else {
    cop.arrest = Math.max(0, cop.arrest - dt * 2);
  }
  return null;
}

function angleDiffP(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// A police car steers at the player (with a little prediction) and rams.
export function stepPoliceCar(pc, player, dt, city, rng) {
  const car = pc.car;
  if (car.dead) return null;
  const tx = player.car ? player.car.x : player.x;
  const ty = player.car ? player.car.y : player.y;
  const pvx = player.car ? Math.cos(player.car.angle) * player.car.speed : 0;
  const pvy = player.car ? Math.sin(player.car.angle) * player.car.speed : 0;
  const aimX = tx + pvx * 0.4;
  const aimY = ty + pvy * 0.4;
  const desired = Math.atan2(aimY - car.y, aimX - car.x);
  const steer = Math.max(-1, Math.min(1, angleDiffP(desired, car.angle) * 2.5));
  const dist = Math.hypot(tx - car.x, ty - car.y);
  const throttle = dist > 60 ? 1 : 0.3;
  const res = stepCar(car, { throttle, steer, handbrake: false }, dt, city);
  if (res.hitBuilding) {
    car.angle += Math.PI * 0.5 * (rng() < 0.5 ? 1 : -1);
    car.speed *= 0.5;
  }
  // Close to a player on foot: the officer gets out and chases on foot.
  if (!player.car && dist < 150 && !pc.droppedCop) {
    pc.droppedCop = true;
    car.speed = 0;
    return { dropCop: true, x: car.x, y: car.y };
  }
  return null;
}

// How many foot cops / police cars the stars call for.
export function wantedCounts(stars, playerInCar) {
  return {
    foot: playerInCar ? Math.min(2, stars) : Math.min(WANTED.maxFootCops, stars),
    cars: stars >= 2 ? Math.min(WANTED.maxPoliceCars, stars - 1) : 0,
  };
}
