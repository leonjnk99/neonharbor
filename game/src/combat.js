// Combat: the player's pistol and fists, bullets, and armed guards who shoot back.
import { COMBAT } from './config.js';

export function makeBullets() {
  return [];
}

export function fireBullet(bullets, x, y, angle, fromPlayer) {
  bullets.push({
    x, y,
    vx: Math.cos(angle) * COMBAT.bulletSpeed,
    vy: Math.sin(angle) * COMBAT.bulletSpeed,
    life: COMBAT.bulletRange / COMBAT.bulletSpeed,
    fromPlayer,
  });
}

// Move bullets; returns hits: { x, y, fromPlayer, target } where target is a guard,
// a cop, a ped, a car or 'player'. Guards/cops/cars are resolved by the caller via
// the check functions it passes in.
export function stepBullets(bullets, dt, city, hitTest) {
  const hits = [];
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && city.hitsBuilding(b.x, b.y, 2)) {
      hits.push({ x: b.x, y: b.y, fromPlayer: b.fromPlayer, target: 'wall' });
      dead = true;
    }
    if (!dead && hitTest) {
      const target = hitTest(b);
      if (target) {
        hits.push({ x: b.x, y: b.y, fromPlayer: b.fromPlayer, target });
        dead = true;
      }
    }
    if (dead) bullets.splice(i, 1);
  }
  return hits;
}

export function makeGuard(x, y, rng) {
  return {
    x, y,
    angle: rng() * Math.PI * 2,
    health: COMBAT.guardHealth,
    shootTimer: 0.5 + rng(),
    dead: false,
    kind: 'guard',
  };
}

// A guard stands its ground and shoots at the player when in range and line of
// sight (buildings block). Returns a bullet to fire, or null.
export function stepGuard(guard, player, dt, city, rng) {
  if (guard.dead) return null;
  guard.shootTimer -= dt;
  const dx = player.x - guard.x;
  const dy = player.y - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > COMBAT.guardRange) return null;
  guard.angle = Math.atan2(dy, dx);
  if (guard.shootTimer > 0) return null;
  guard.shootTimer = COMBAT.guardInterval * (0.8 + rng() * 0.5);
  // Line of sight: sample along the shot for a building.
  for (let t = 0; t < dist; t += 24) {
    if (city.hitsBuilding(guard.x + (dx / dist) * t, guard.y + (dy / dist) * t, 2)) return null;
  }
  const spread = (rng() - 0.5) * 0.35 * Math.min(1, dist / 300);
  return {
    x: guard.x + Math.cos(guard.angle) * 20,
    y: guard.y + Math.sin(guard.angle) * 20,
    angle: guard.angle + spread,
    fromPlayer: false,
  };
}

export function damageGuard(guard, amount) {
  guard.health -= amount;
  if (guard.health <= 0) {
    guard.health = 0;
    guard.dead = true;
  }
}
