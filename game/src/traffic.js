// Traffic: NPC cars that follow the road grid, keep their lane, slow for the car
// ahead and turn at intersections. They keep the city feeling alive around the player.
import { AVENUES, STREETS, ROAD_HALF } from './config.js';
import { makeCar, stepCar } from './vehicles.js';
import { pick, range, chance } from './random.js';

const LANE = 26;

export function makeTrafficCar(city, rng, nearX, nearY) {
  const vertical = chance(rng, 0.5);
  let x;
  let y;
  let angle;
  let axis;
  let dir;
  if (vertical) {
    const av = pick(rng, AVENUES);
    dir = chance(rng, 0.5) ? 1 : -1;
    x = av + (dir > 0 ? LANE : -LANE);
    y = range(rng, 100, 1700);
    angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    axis = 'v';
  } else {
    const st = pick(rng, STREETS);
    dir = chance(rng, 0.5) ? 1 : -1;
    x = range(rng, 100, 2300);
    y = st + (dir > 0 ? LANE : -LANE);
    angle = dir > 0 ? 0 : Math.PI;
    axis = 'h';
  }
  const type = pick(rng, ['sedan', 'sedan', 'sedan', 'van', 'taxi', 'truck']);
  const car = makeCar(type, x, y, angle, rng, { driver: 'npc' });
  car.maxSpeed = range(rng, 130, 185);
  return { car, axis, dir, cruise: car.maxSpeed };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Drive one traffic car for dt. cars = all cars (for the car-ahead check).
export function stepTrafficCar(t, dt, city, rng, cars) {
  const car = t.car;
  if (car.dead) return;
  // Desired heading: along the road, pulled back onto the lane.
  let desired;
  let lateral = 0;
  if (t.axis === 'v') {
    const av = nearestLine(AVENUES, car.x);
    lateral = car.x - (av + (t.dir > 0 ? LANE : -LANE));
    desired = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    const st = nearestLine(STREETS, car.y);
    lateral = car.y - (st + (t.dir > 0 ? LANE : -LANE));
    desired = t.dir > 0 ? 0 : Math.PI;
  }
  desired += Math.max(-0.5, Math.min(0.5, -lateral * 0.012));
  const steer = Math.max(-1, Math.min(1, angleDiff(desired, car.angle) * 2.2));

  // Slow for the car ahead on the same road.
  let throttle = 1;
  const ahead = carAhead(t, cars);
  if (ahead < 150) throttle = ahead < 70 ? -0.6 : 0.25;
  if (car.speed > t.cruise) throttle = 0;

  const res = stepCar(car, { throttle, steer, handbrake: false }, dt, city);
  if (res.hitBuilding) {
    // Bounced off a building (should be rare): turn around.
    t.dir *= -1;
    car.angle += Math.PI;
    car.speed = Math.abs(car.speed) * 0.5;
  }

  // At an intersection, sometimes turn onto the crossing road.
  if (atIntersection(car)) {
    if (chance(rng, dt * 0.45)) {
      if (t.axis === 'v') {
        t.axis = 'h';
        t.dir = chance(rng, 0.5) ? 1 : -1;
        car.y = nearestLine(STREETS, car.y);
      } else {
        t.axis = 'v';
        t.dir = chance(rng, 0.5) ? 1 : -1;
        car.x = nearestLine(AVENUES, car.x);
      }
    }
  }
}

function nearestLine(lines, value) {
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

function atIntersection(car) {
  let nearV = false;
  let nearH = false;
  for (let i = 0; i < AVENUES.length; i += 1) {
    if (Math.abs(car.x - AVENUES[i]) < ROAD_HALF) nearV = true;
  }
  for (let i = 0; i < STREETS.length; i += 1) {
    if (Math.abs(car.y - STREETS[i]) < ROAD_HALF) nearH = true;
  }
  return nearV && nearH;
}

// Distance to the nearest car ahead in the same lane, or Infinity.
function carAhead(t, cars) {
  const car = t.car;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let best = Infinity;
  for (let i = 0; i < cars.length; i += 1) {
    const o = cars[i];
    if (o === car || o.dead) continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(dx * -fy + dy * fx);
    if (along > 0 && along < best && side < 28) best = along;
  }
  return best;
}
