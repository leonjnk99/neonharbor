// Cars: physics, damage, entering and exiting. A car is a position, a heading and a
// speed along that heading; steering bites harder at speed, the handbrake slides.
import { CAR_TYPES, CAR } from './config.js';
import { pick } from './random.js';

export function makeCar(type, x, y, angle, rng, opts) {
  const def = CAR_TYPES[type];
  const o = opts || {};
  return {
    type,
    name: def.name,
    x, y, angle,
    speed: 0,
    color: o.color || pick(rng, def.colors),
    maxSpeed: def.maxSpeed * (o.speedMul || 1),
    accel: def.accel,
    grip: def.grip,
    w: def.w,
    l: def.l,
    health: CAR.maxHealth,
    driver: o.driver || null, // 'player' | 'npc' | null (parked)
    fixed: o.fixed || null, // 'sunray' | 'target' | null
    steer: 0,
    skid: 0,
    dead: false,
  };
}

// Drive one car for dt. drive = { throttle: -1..1, steer: -1..1, handbrake: bool }.
// Returns { hitBuilding, hitSpeed } for crash feedback.
export function stepCar(car, drive, dt, city) {
  const def = CAR_TYPES[car.type];
  const speedBefore = car.speed;
  if (drive.throttle > 0) {
    car.speed += car.accel * drive.throttle * dt;
  } else if (drive.throttle < 0) {
    if (car.speed > 8) car.speed += CAR.brake * drive.throttle * dt;
    else car.speed += car.accel * 0.6 * drive.throttle * dt;
  } else {
    car.speed -= Math.sign(car.speed) * 140 * dt;
    if (Math.abs(car.speed) < 6) car.speed = 0;
  }
  if (car.speed > car.maxSpeed) car.speed = car.maxSpeed;
  if (car.speed < -CAR.reverseMax) car.speed = -CAR.reverseMax;
  const speedFactor = Math.min(1, Math.abs(car.speed) / 180);
  const turn = CAR.turnRate * car.grip * speedFactor * (drive.handbrake ? CAR.handbrakeTurn : 1);
  car.angle += drive.steer * turn * Math.sign(car.speed || 1) * dt;
  car.steer = drive.steer;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const r = car.l * 0.42;
  const resolved = city.resolveCircle(nx, ny, r);
  let hitBuilding = false;
  let hitSpeed = 0;
  if (resolved.x !== nx || resolved.y !== ny) {
    hitBuilding = true;
    hitSpeed = Math.abs(speedBefore);
    // A hard hit costs speed and health; a scrape just slides.
    if (hitSpeed > 140) {
      car.health -= Math.min(30, (hitSpeed - 140) * 0.08);
      car.speed *= 0.35;
    } else {
      car.speed *= 0.7;
    }
    if (car.health <= 0) {
      car.health = 0;
      car.speed = 0;
      car.dead = true;
    }
  }
  car.x = resolved.x;
  car.y = resolved.y;
  car.skid = drive.handbrake && Math.abs(car.speed) > 120 ? 1 : Math.max(0, car.skid - dt * 3);
  return { hitBuilding, hitSpeed };
}

// Oriented overlap between two cars: project the offset into each car's own
// frame (along = length axis, side = width axis). Two cars passing in opposite
// lanes (52 px apart) do not touch; a rear-end or T-bone does.
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist > (a.l + b.l) * 0.6 || dist < 0.01) return 0;
  const alongMax = ((a.l + b.l) / 2) * 0.72;
  const sideMax = (a.w + b.w) / 2;
  const frames = [
    { angle: a.angle, ox: dx, oy: dy },
    { angle: b.angle, ox: -dx, oy: -dy },
  ];
  let overlap = false;
  let push = 0;
  for (let i = 0; i < frames.length; i += 1) {
    const f = frames[i];
    const along = Math.abs(f.ox * Math.cos(f.angle) + f.oy * Math.sin(f.angle));
    const side = Math.abs(-f.ox * Math.sin(f.angle) + f.oy * Math.cos(f.angle));
    if (along < alongMax && side < sideMax) {
      overlap = true;
      push = Math.max(push, (alongMax - along) / 2);
    }
  }
  if (!overlap) return 0;
  const nx = dx / dist;
  const ny = dy / dist;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const impact = Math.abs(a.speed - b.speed);
  const dmg = Math.min(18, impact * 0.05);
  if (impact > 90) {
    a.health = Math.max(0, a.health - dmg);
    b.health = Math.max(0, b.health - dmg);
    if (a.health <= 0) { a.dead = true; a.speed = 0; }
    if (b.health <= 0) { b.dead = true; b.speed = 0; }
    const avg = (a.speed + b.speed) / 2;
    a.speed = avg * 0.5;
    b.speed = avg * 0.5;
  }
  return impact;
}

export function nearestCar(cars, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (let i = 0; i < cars.length; i += 1) {
    const c = cars[i];
    if (c.dead) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
