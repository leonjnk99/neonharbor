// Pedestrians: they walk the sidewalks, turn at intersections, and run from danger.
// Getting run over knocks one down and earns the player wanted heat.
import { ROAD_HALF, WORLD_W, WORLD_H } from './config.js';
import { pick, range, chance } from './random.js';

const PED_COLORS = ['#e8e0d0', '#d0d8e8', '#e8c8c0', '#c8e0c8', '#e0d0a8', '#c8c8d8', '#f0e8d8',
  '#e85d3d', '#4f7ec9', '#f2c230', '#8c5da8', '#3f9e6e', '#d86a9a', '#5da8a0', '#c96a3f', '#7a6fd0'];

export function makePed(city, rng, x, y) {
  const p = city.sidewalkPoint();
  return {
    x: x !== undefined ? x : p.x,
    y: y !== undefined ? y : p.y,
    angle: rng() * Math.PI * 2,
    speed: range(rng, 55, 95),
    color: pick(rng, PED_COLORS),
    state: 'walk', // walk | flee | down
    timer: 0,
    axis: chance(rng, 0.5) ? 'v' : 'h',
    dir: chance(rng, 0.5) ? 1 : -1,
    fleeX: 0,
    fleeY: 0,
  };
}

export function stepPed(ped, dt, city, rng, dangers) {
  if (ped.state === 'down') {
    ped.timer -= dt;
    if (ped.timer <= 0) {
      ped.state = 'flee';
      ped.timer = 2;
      ped.fleeX = ped.x + range(rng, -1, 1);
      ped.fleeY = ped.y + range(rng, -1, 1);
    }
    return;
  }
  // Danger nearby? Run away from it.
  for (let i = 0; i < dangers.length; i += 1) {
    const d = dangers[i];
    const dist = Math.hypot(ped.x - d.x, ped.y - d.y);
    if (dist < d.r) {
      ped.state = 'flee';
      ped.timer = 1.5 + rng() * 1.5;
      ped.fleeX = ped.x - d.x;
      ped.fleeY = ped.y - d.y;
      break;
    }
  }
  if (ped.state === 'flee') {
    ped.timer -= dt;
    const len = Math.hypot(ped.fleeX, ped.fleeY) || 1;
    ped.angle = Math.atan2(ped.fleeY / len, ped.fleeX / len);
    const nx = ped.x + Math.cos(ped.angle) * 290 * dt;
    const ny = ped.y + Math.sin(ped.angle) * 290 * dt;
    const resolved = city.resolveCircle(nx, ny, 12);
    ped.x = resolved.x;
    ped.y = resolved.y;
    if (ped.timer <= 0) ped.state = 'walk';
    return;
  }
  // Walk along the sidewalk: keep the lane, turn at intersections.
  const speed = ped.speed;
  let desired;
  if (ped.axis === 'v') {
    desired = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const av = nearestRoadLine(city.avenues, ped.x);
    const laneX = av + (ped.dir > 0 ? ROAD_HALF + 16 : -(ROAD_HALF + 16));
    ped.x += Math.max(-1, Math.min(1, (laneX - ped.x) * 0.08));
  } else {
    desired = ped.dir > 0 ? 0 : Math.PI;
    const st = nearestRoadLine(city.streets, ped.y);
    const laneY = st + (ped.dir > 0 ? ROAD_HALF + 16 : -(ROAD_HALF + 16));
    ped.y += Math.max(-1, Math.min(1, (laneY - ped.y) * 0.08));
  }
  ped.angle = desired;
  ped.x += Math.cos(desired) * speed * dt;
  ped.y += Math.sin(desired) * speed * dt;
  if (ped.x < 30 || ped.x > WORLD_W - 30 || ped.y < 30 || ped.y > WORLD_H - 30) {
    ped.dir *= -1;
    ped.x = Math.max(30, Math.min(WORLD_W - 30, ped.x));
    ped.y = Math.max(30, Math.min(WORLD_H - 30, ped.y));
  }
  // At an intersection, sometimes switch to the crossing road.
  if (onCrossing(ped, city) && chance(rng, dt * 0.25)) {
    ped.axis = ped.axis === 'v' ? 'h' : 'v';
    ped.dir = chance(rng, 0.5) ? 1 : -1;
  }
}

function nearestRoadLine(lines, value) {
  let best = lines[0];
  let bestD = Math.abs(value - lines[0]);
  for (let i = 1; i < lines.length; i += 1) {
    const d = Math.abs(value - lines[i]);
    if (d < bestD) {
      bestD = d;
      best = lines[i];
    }
  }
  return best;
}

function onCrossing(ped, city) {
  let nearV = false;
  let nearH = false;
  for (let i = 0; i < city.avenues.length; i += 1) {
    if (Math.abs(ped.x - city.avenues[i]) < ROAD_HALF) nearV = true;
  }
  for (let i = 0; i < city.streets.length; i += 1) {
    if (Math.abs(ped.y - city.streets[i]) < ROAD_HALF) nearH = true;
  }
  return nearV && nearH;
}

// Knock a pedestrian down (run over). Returns true when it was a fresh hit.
export function knockDown(ped, rng) {
  if (ped.state === 'down') return false;
  ped.state = 'down';
  ped.timer = 2.5 + rng() * 1.5;
  return true;
}
