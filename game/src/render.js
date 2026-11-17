// NEONHARBOR — canvas rendering: the city, cars, people, particles, dusk light
// and the minimap. Pure drawing from world state; no game logic here.
import { WORLD_W, WORLD_H, WATER_X, ROAD_HALF, COLORS } from './config.js';

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderWorld(ctx, world, view) {
  const { w, h } = view;
  const city = world.city;
  const time = world.time;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  // Camera: centre on the player, with screen shake.
  const camX = (world.camX || world.player.x) + (view.shakeX || 0);
  const camY = (world.camY || world.player.y) + (view.shakeY || 0);
  ctx.translate(w / 2, h / 2);
  ctx.scale(view.zoom || 1, view.zoom || 1);
  ctx.translate(-camX, -camY);

  // Ground: grass (visible rect only).
  const zoom = view.zoom || 1;
  const halfW = w / 2 / zoom;
  const halfH = h / 2 / zoom;
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(camX - halfW - 20, camY - halfH - 20, halfW * 2 + 40, halfH * 2 + 40);
  // Beach strip and water on the east edge.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(WATER_X - 26, 0, 26, WORLD_H);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(WATER_X, 0, WORLD_W - WATER_X, WORLD_H);
  ctx.fillStyle = '#7ee8fa';
  ctx.fillRect(WATER_X - 4, 0, 4, WORLD_H);

  // Roads (culled to the camera view).
  const viewLeft = camX - halfW - 80;
  const viewRight = camX + halfW + 80;
  const viewTop = camY - halfH - 80;
  const viewBottom = camY + halfH + 80;
  ctx.fillStyle = COLORS.road;
  for (let i = 0; i < city.avenues.length; i += 1) {
    const ax = city.avenues[i];
    if (ax + ROAD_HALF < viewLeft || ax - ROAD_HALF > viewRight) continue;
    ctx.fillRect(ax - ROAD_HALF, Math.max(0, viewTop), ROAD_HALF * 2, Math.min(WORLD_H, viewBottom) - Math.max(0, viewTop));
  }
  for (let i = 0; i < city.streets.length; i += 1) {
    const sy = city.streets[i];
    if (sy + ROAD_HALF < viewTop || sy - ROAD_HALF > viewBottom) continue;
    ctx.fillRect(Math.max(0, viewLeft), sy - ROAD_HALF, Math.min(WORLD_W, viewRight) - Math.max(0, viewLeft), ROAD_HALF * 2);
  }
  // Centre dashes.
  ctx.strokeStyle = '#c8a84a';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (let i = 0; i < city.avenues.length; i += 1) {
    const ax = city.avenues[i];
    if (ax < viewLeft || ax > viewRight) continue;
    ctx.moveTo(ax, Math.max(0, viewTop));
    ctx.lineTo(ax, Math.min(WORLD_H, viewBottom));
  }
  for (let i = 0; i < city.streets.length; i += 1) {
    const sy = city.streets[i];
    if (sy < viewTop || sy > viewBottom) continue;
    ctx.moveTo(Math.max(0, viewLeft), sy);
    ctx.lineTo(Math.min(WORLD_W, viewRight), sy);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Crosswalks at visible intersections.
  ctx.fillStyle = 'rgba(240,240,230,0.5)';
  for (let i = 0; i < city.avenues.length; i += 1) {
    const ax = city.avenues[i];
    if (ax < viewLeft || ax > viewRight) continue;
    for (let j = 0; j < city.streets.length; j += 1) {
      const sy = city.streets[j];
      if (sy < viewTop || sy > viewBottom) continue;
      for (let k = -2; k <= 2; k += 1) {
        ctx.fillRect(ax - 40 + k * 18, sy - ROAD_HALF - 6, 8, 12);
        ctx.fillRect(ax - 40 + k * 18, sy + ROAD_HALF - 6, 8, 12);
      }
    }
  }

  // Parks and parking lots.
  for (let i = 0; i < city.parks.length; i += 1) {
    const p = city.parks[i];
    ctx.fillStyle = '#2f6b3a';
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  for (let i = 0; i < city.lots.length; i += 1) {
    const l = city.lots[i];
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(l.x, l.y, l.w, l.h);
    ctx.strokeStyle = 'rgba(230,230,220,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(l.x + 4, l.y + 4, l.w - 8, l.h - 8);
  }
  // Parking spot lines.
  ctx.strokeStyle = 'rgba(240,240,230,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < city.parkedSpots.length; i += 1) {
    const s = city.parkedSpots[i];
    ctx.strokeRect(s.x - 22, s.y - 14, 44, 28);
  }

  // Buildings (culled to the camera view; windows were precomputed at build).
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (b.x > viewRight || b.x + b.w < viewLeft || b.y > viewBottom || b.y + b.h < viewTop) continue;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    // Lit windows: precomputed per building at city build.
    for (let wi = 0; wi < b.windows.length; wi += 1) {
      const win = b.windows[wi];
      ctx.fillStyle = win.color;
      ctx.fillRect(win.x, win.y, 18, 14);
    }
    // Landmark buildings get no text label here: their zone marker below the
    // door already names them (drawing both doubled every landmark name).
    if (b.label && !b.name) {
      ctx.fillStyle = '#f5f0e6';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 - 4);
      ctx.fillStyle = '#ffd76a';
      ctx.fillRect(b.x + b.w / 2 - 24, b.y + b.h / 2 + 4, 48, 3);
    }
  }

  // Palms.
  for (let i = 0; i < city.palms.length; i += 1) {
    const p = city.palms[i];
    ctx.fillStyle = '#3f7a44';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2c5a31';
    ctx.beginPath();
    ctx.arc(p.x + 4, p.y - 4, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Skid marks.
  ctx.strokeStyle = 'rgba(20,20,24,0.45)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let i = 0; i < world.particles.skids.length; i += 1) {
    const s = world.particles.skids[i];
    ctx.globalAlpha = Math.min(1, s.life / 3);
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Zone markers (shops, safehouse, mission targets).
  for (let i = 0; i < city.zones.length; i += 1) {
    const z = city.zones[i];
    if (z.name === 'vault') continue;
    const pulse = 0.6 + 0.4 * Math.sin(time * 3 + i);
    ctx.strokeStyle = z.kind === 'loft' ? '#7ee8fa' : '#ffd76a';
    ctx.lineWidth = 3;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f5f0e6';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(z.label, z.x, z.y - z.r * 0.55 - 8);
  }

  // Mission target marker.
  const target = world.missionTarget;
  if (target) {
    const pulse = 1 + 0.18 * Math.sin(time * 5);
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd76a';
    const s = 16 * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = '#1a1a22';
    ctx.lineWidth = 3;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
  // Side-job fare marker.
  const job = world.missions.side;
  if (job && job.phase === 'pickup') {
    ctx.fillStyle = '#7ee8fa';
    ctx.beginPath();
    ctx.arc(job.x, job.y, 12 + 3 * Math.sin(time * 5), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a22';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', job.x, job.y + 5);
  }

  // Cars.
  for (let i = 0; i < world.cars.length; i += 1) {
    drawCar(ctx, world.cars[i], time);
  }
  // Pedestrians.
  for (let i = 0; i < world.peds.length; i += 1) {
    const p = world.peds[i];
    if (p.state === 'down') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 14, 7, p.angle, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a22';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(p.angle) * 4, p.y + Math.sin(p.angle) * 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Guards.
  for (let i = 0; i < world.guards.length; i += 1) {
    const g = world.guards[i];
    if (g.dead) continue;
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(g.x, g.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(g.x + Math.cos(g.angle) * 22, g.y + Math.sin(g.angle) * 22);
    ctx.stroke();
  }
  // Foot cops.
  for (let i = 0; i < world.footCops.length; i += 1) {
    const c = world.footCops[i];
    ctx.fillStyle = '#2f6fd0';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player (on foot only; inside a car the car is the body).
  const player = world.player;
  if (!player.car && !player.dead) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a22';
    ctx.fillRect(6, -3, 12, 6); // arm / gun direction
    ctx.fillStyle = '#f2c230';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Direction ring when the player has the pistol out.
    if (player.hasPistol) {
      ctx.strokeStyle = 'rgba(242,194,48,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 20, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Bullets.
  ctx.fillStyle = '#ffe27a';
  for (let i = 0; i < world.bullets.length; i += 1) {
    const b = world.bullets[i];
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Particles.
  for (let i = 0; i < world.particles.list.length; i += 1) {
    const pt = world.particles.list[i];
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Floating texts.
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < world.particles.texts.length; i += 1) {
    const t = world.particles.texts[i];
    ctx.globalAlpha = Math.max(0, t.life);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Dusk vignette in screen space (pre-rendered once per size: a live radial
  // gradient fill every frame is the slowest draw in software rendering).
  ctx.drawImage(vignetteFor(w, h), 0, 0);

  drawMinimap(ctx, world, w, h, time);
}

// Cached vignette: an offscreen canvas with the radial gradient baked in.
let vignetteCanvas = null;
let vignetteW = 0;
let vignetteH = 0;
function vignetteFor(w, h) {
  if (vignetteCanvas && vignetteW === w && vignetteH === h) return vignetteCanvas;
  vignetteCanvas = document.createElement('canvas');
  vignetteCanvas.width = w;
  vignetteCanvas.height = h;
  const vctx = vignetteCanvas.getContext('2d');
  const grad = vctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  grad.addColorStop(0, 'rgba(30,16,60,0)');
  grad.addColorStop(1, 'rgba(30,16,60,0.38)');
  vctx.fillStyle = grad;
  vctx.fillRect(0, 0, w, h);
  vignetteW = w;
  vignetteH = h;
  return vignetteCanvas;
}

function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const l = car.l;
  const wd = car.w;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRectPath(ctx, -l / 2 + 3, -wd / 2 + 4, l, wd, 8);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  roundRectPath(ctx, -l / 2, -wd / 2, l, wd, 8);
  ctx.fill();
  // Windshield + roof.
  ctx.fillStyle = 'rgba(20,30,44,0.85)';
  ctx.fillRect(l * 0.12, -wd / 2 + 4, 12, wd - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRectPath(ctx, -l * 0.18, -wd / 2 + 5, l * 0.28, wd - 10, 5);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#14141a';
  ctx.fillRect(-l * 0.32, -wd / 2 - 3, 14, 6);
  ctx.fillRect(-l * 0.32, wd / 2 - 3, 14, 6);
  ctx.fillRect(l * 0.32, -wd / 2 - 3, 14, 6);
  ctx.fillRect(l * 0.32, wd / 2 - 3, 14, 6);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(l / 2 - 2, -wd / 2 + 5, 4, 5);
  ctx.fillRect(l / 2 - 2, wd / 2 - 10, 4, 5);
  if (car.type === 'taxi') {
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(-6, -8, 12, 16);
    ctx.fillStyle = '#1a1a22';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  if (car.type === 'police') {
    // Flashing light bar.
    const on = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = on ? '#ff3b30' : '#2f6fd0';
    ctx.fillRect(-8, -wd / 2 + 2, 16, 8);
    ctx.fillStyle = on ? '#2f6fd0' : '#ff3b30';
    ctx.fillRect(-8, wd / 2 - 10, 16, 8);
    ctx.fillStyle = '#f5f0e6';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HPD', 0, 3);
  }
  // Damage smoke.
  if (car.health < 40 && !car.dead) {
    ctx.fillStyle = 'rgba(120,120,130,0.5)';
    ctx.beginPath();
    ctx.arc(-l * 0.3, 0, 8 + 4 * Math.sin(time * 9), 0, Math.PI * 2);
    ctx.fill();
  }
  if (car.dead) {
    ctx.fillStyle = 'rgba(20,20,24,0.55)';
    roundRectPath(ctx, -l / 2, -wd / 2, l, wd, 8);
    ctx.fill();
  }
  ctx.restore();
  // Player's car gets a marker ring.
  if (car.driver === 'player') {
    ctx.strokeStyle = '#7ee8fa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(car.x, car.y, Math.max(car.l, car.w) * 0.62, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawMinimap(ctx, world, w, h, time) {
  const mw = 168;
  const mh = 118;
  const mx = 14;
  const my = h - mh - 14;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(10,12,20,0.78)';
  roundRectPath(ctx, mx, my, mw, mh, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, mw, mh);
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  // Water.
  ctx.fillStyle = '#1b4a6b';
  ctx.fillRect(mx + WATER_X * sx, my, (WORLD_W - WATER_X) * sx, mh);
  // Roads.
  ctx.strokeStyle = 'rgba(200,200,210,0.7)';
  ctx.lineWidth = 2;
  for (let i = 0; i < world.city.avenues.length; i += 1) {
    ctx.beginPath();
    ctx.moveTo(mx + world.city.avenues[i] * sx, my);
    ctx.lineTo(mx + world.city.avenues[i] * sx, my + mh);
    ctx.stroke();
  }
  for (let i = 0; i < world.city.streets.length; i += 1) {
    ctx.beginPath();
    ctx.moveTo(mx, my + world.city.streets[i] * sy);
    ctx.lineTo(mx + mw, my + world.city.streets[i] * sy);
    ctx.stroke();
  }
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Mission target.
  const target = world.missionTarget;
  if (target) {
    const pulse = 2 + Math.sin(time * 5);
    dot(target.x, target.y, '#ffd76a', 4 + pulse);
  }
  // Cars.
  for (let i = 0; i < world.cars.length; i += 1) {
    const c = world.cars[i];
    if (c.type === 'police') dot(c.x, c.y, '#3b82f6', 2.5);
    else if (c.driver === 'player') dot(c.x, c.y, '#7ee8fa', 3);
  }
  // Cops.
  for (let i = 0; i < world.footCops.length; i += 1) {
    dot(world.footCops[i].x, world.footCops[i].y, '#3b82f6', 2);
  }
  // Player.
  dot(world.player.x, world.player.y, '#ffffff', 3.5);
  ctx.restore();
}
