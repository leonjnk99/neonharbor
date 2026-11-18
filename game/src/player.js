// Rook on foot: movement, facing, health, cash and ammo.
import { PLAYER, COMBAT, ECONOMY } from './config.js';

export function makePlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    health: PLAYER.maxHealth,
    cash: ECONOMY.startCash,
    ammo: COMBAT.pistolAmmoStart,
    hasPistol: true,
    weapon: 'pistol', // 'pistol' | 'shotgun' — the shotgun comes from a pickup
    hasShotgun: false,
    shotgunAmmo: 0,
    car: null, // the car being driven, or null on foot
    moving: false,
    punchTimer: 0,
    shootTimer: 0,
    dead: false,
    busted: false,
  };
}

// Walk for dt along move {x, y} (unit-ish). Returns true when actually moving.
export function stepPlayerOnFoot(player, move, dt, city) {
  const len = Math.hypot(move.x, move.y);
  player.moving = len > 0.05;
  if (!player.moving) return false;
  const nx = player.x + (move.x / Math.max(1, len)) * PLAYER.walkSpeed * dt;
  const ny = player.y + (move.y / Math.max(1, len)) * PLAYER.walkSpeed * dt;
  const resolved = city.resolveCircle(nx, ny, PLAYER.radius);
  player.x = resolved.x;
  player.y = resolved.y;
  player.angle = Math.atan2(move.y, move.x);
  return true;
}

export function damagePlayer(player, amount) {
  if (player.dead) return;
  player.health -= amount;
  if (player.health <= 0) {
    player.health = 0;
    player.dead = true;
  }
}

export function healPlayer(player, amount) {
  player.health = Math.min(PLAYER.maxHealth, player.health + amount);
}

export function addCash(player, amount) {
  player.cash += amount;
  return player.cash;
}
