// NEONHARBOR — canvas rendering: the city, cars, people, particles, dusk light
// and the minimap. Pure drawing from world state; no game logic here.
// Look: GTA 2 / Chinatown Wars top-down pixel-art — brick sidewalks, zebra
// crossings, detailed cars, light rain, circular minimap.
// Perf: everything static (ground, roads, buildings) is baked once into an
// offscreen layer per world and blitted each frame; only cars, people,
// markers, rain and the vignette are drawn live.
import { WORLD_W, WORLD_H, WATER_X, ROAD_HALF, COLORS } from './config.js';
import { hash2 } from './city.js';

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Lighten (amt > 0) or darken (amt < 0) a #rrggbb color.
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// --- Cached offscreen tiles -------------------------------------------------
// Brick sidewalk tile (64x64): staggered brick courses with mortar lines.
let brickTileCanvas = null;
function brickTile() {
  if (brickTileCanvas) return brickTileCanvas;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = COLORS.groundBrickDark;
  g.fillRect(0, 0, 64, 64);
  const rows = 4;
  const rh = 64 / rows;
  for (let r = 0; r < rows; r += 1) {
    const off = (r % 2) * 16;
    for (let x = -1; x < 3; x += 1) {
      const bx = x * 32 + off;
      const by = r * rh;
      g.fillStyle = (r + x) % 2 === 0 ? COLORS.groundBrick : COLORS.groundBrickLight;
      g.fillRect(bx + 1, by + 1, 30, rh - 2);
      // Top highlight on each brick, like sun on the course edge.
      g.fillStyle = 'rgba(255,240,210,0.10)';
      g.fillRect(bx + 1, by + 1, 30, 2);
    }
  }
  brickTileCanvas = c;
  return c;
}

// Static city layer: baked once per world (keyed by the city object).
let staticWorld = null;
let staticCanvas = null;
function staticLayer(world) {
  if (staticWorld === world && staticCanvas) return staticCanvas;
  const c = document.createElement('canvas');
  c.width = WORLD_W;
  c.height = WORLD_H;
  const g = c.getContext('2d');
  drawStaticLayer(g, world);
  staticWorld = world;
  staticCanvas = c;
  return c;
}

function drawStaticLayer(g, world) {
  const city = world.city;

  // Ground: brick sidewalks across the whole map (roads cover the rest).
  g.fillStyle = g.createPattern(brickTile(), 'repeat');
  g.fillRect(0, 0, WORLD_W, WORLD_H);

  // Beach strip and water on the east edge.
  g.fillStyle = COLORS.sand;
  g.fillRect(WATER_X - 26, 0, 26, WORLD_H);
  g.fillStyle = COLORS.water;
  g.fillRect(WATER_X, 0, WORLD_W - WATER_X, WORLD_H);
  g.fillStyle = '#7ee8fa';
  g.fillRect(WATER_X - 4, 0, 4, WORLD_H);

  // Roads: asphalt base.
  g.fillStyle = COLORS.road;
  for (let i = 0; i < city.avenues.length; i += 1) {
    const ax = city.avenues[i];
    g.fillRect(ax - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H);
  }
  for (let i = 0; i < city.streets.length; i += 1) {
    const sy = city.streets[i];
    g.fillRect(0, sy - ROAD_HALF, WORLD_W, ROAD_HALF * 2);
  }

  // Asphalt wear: deterministic speckles fixed to world coordinates.
  const speckle = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y += 16) {
      for (let x = x0; x < x0 + w; x += 16) {
        const hv = hash2(x, y);
        if (hv < 0.12) {
          g.fillStyle = hv < 0.06 ? COLORS.asphaltDark : COLORS.asphaltLight;
          g.fillRect(x, y, 3, 2);
        }
      }
    }
  };
  for (let i = 0; i < city.avenues.length; i += 1) {
    speckle(city.avenues[i] - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H);
  }
  for (let i = 0; i < city.streets.length; i += 1) {
    speckle(0, city.streets[i] - ROAD_HALF, WORLD_W, ROAD_HALF * 2);
  }

  // Curb strips + solid edge lines + centre dashes, in the gaps between
  // intersections (so nothing crosses a junction).
  const vGaps = [];
  {
    let prev = 0;
    for (let j = 0; j < city.streets.length; j += 1) {
      if (city.streets[j] - ROAD_HALF > prev) vGaps.push([prev, city.streets[j] - ROAD_HALF]);
      prev = city.streets[j] + ROAD_HALF;
    }
    if (prev < WORLD_H) vGaps.push([prev, WORLD_H]);
  }
  const hGaps = [];
  {
    let prev = 0;
    for (let i = 0; i < city.avenues.length; i += 1) {
      if (city.avenues[i] - ROAD_HALF > prev) hGaps.push([prev, city.avenues[i] - ROAD_HALF]);
      prev = city.avenues[i] + ROAD_HALF;
    }
    if (prev < WATER_X) hGaps.push([prev, WATER_X]);
  }
  for (let i = 0; i < city.avenues.length; i += 1) {
    const ax = city.avenues[i];
    for (let k = 0; k < vGaps.length; k += 1) {
      const [y0, y1] = vGaps[k];
      // Curb: pale strip just outside the asphalt.
      g.fillStyle = COLORS.curb;
      g.fillRect(ax - ROAD_HALF - 5, y0, 5, y1 - y0);
      g.fillRect(ax + ROAD_HALF, y0, 5, y1 - y0);
      g.fillStyle = COLORS.curbShadow;
      g.fillRect(ax - ROAD_HALF - 6, y0, 1, y1 - y0);
      g.fillRect(ax + ROAD_HALF + 5, y0, 1, y1 - y0);
      // Solid edge lines.
      g.fillStyle = 'rgba(232,228,210,0.85)';
      g.fillRect(ax - ROAD_HALF + 2, y0, 2, y1 - y0);
      g.fillRect(ax + ROAD_HALF - 4, y0, 2, y1 - y0);
    }
  }
  for (let j = 0; j < city.streets.length; j += 1) {
    const sy = city.streets[j];
    for (let k = 0; k < hGaps.length; k += 1) {
      const [x0, x1] = hGaps[k];
      g.fillStyle = COLORS.curb;
      g.fillRect(x0, sy - ROAD_HALF - 5, x1 - x0, 5);
      g.fillRect(x0, sy + ROAD_HALF, x1 - x0, 5);
      g.fillStyle = COLORS.curbShadow;
      g.fillRect(x0, sy - ROAD_HALF - 6, x1 - x0, 1);
      g.fillRect(x0, sy + ROAD_HALF + 5, x1 - x0, 1);
      g.fillStyle = 'rgba(232,228,210,0.85)';
      g.fillRect(x0, sy - ROAD_HALF + 2, x1 - x0, 2);
      g.fillRect(x0, sy + ROAD_HALF - 4, x1 - x0, 2);
    }
  }
  // Centre dashes (one stroke per gap so the dash restarts cleanly).
  g.strokeStyle = COLORS.laneDash;
  g.lineWidth = 3;
  g.setLineDash([26, 30]);
  for (let i = 0; i < city.avenues.length; i += 1) {
    const ax = city.avenues[i];
    for (let k = 0; k < vGaps.length; k += 1) {
      g.beginPath();
      g.moveTo(ax, vGaps[k][0]);
      g.lineTo(ax, vGaps[k][1]);
      g.stroke();
    }
  }
  for (let j = 0; j < city.streets.length; j += 1) {
    const sy = city.streets[j];
    for (let k = 0; k < hGaps.length; k += 1) {
      g.beginPath();
      g.moveTo(hGaps[k][0], sy);
      g.lineTo(hGaps[k][1], sy);
      g.stroke();
    }
  }
  g.setLineDash([]);

  // Zebra crosswalks at every intersection: one crossing on each approach,
  // stripes spanning the full road width.
  g.fillStyle = COLORS.crosswalk;
  for (let i = 0; i < city.avenues.length; i += 1) {
    const ax = city.avenues[i];
    for (let j = 0; j < city.streets.length; j += 1) {
      const sy = city.streets[j];
      for (let k = 0; k < 3; k += 1) {
        // Across the avenue, north and south of the street.
        g.fillRect(ax - ROAD_HALF, sy - ROAD_HALF - 24 + k * 10, ROAD_HALF * 2, 6);
        g.fillRect(ax - ROAD_HALF, sy + ROAD_HALF + 2 + k * 10, ROAD_HALF * 2, 6);
        // Across the street, west and east of the avenue.
        g.fillRect(ax - ROAD_HALF - 24 + k * 10, sy - ROAD_HALF, 6, ROAD_HALF * 2);
        g.fillRect(ax + ROAD_HALF + 2 + k * 10, sy - ROAD_HALF, 6, ROAD_HALF * 2);
      }
    }
  }

  // Parks and parking lots.
  for (let i = 0; i < city.parks.length; i += 1) {
    const p = city.parks[i];
    g.fillStyle = '#2f6b3a';
    g.fillRect(p.x, p.y, p.w, p.h);
    // Grass tufts.
    g.fillStyle = '#27592f';
    for (let t = 0; t < 5; t += 1) {
      const tx = p.x + 20 + hash2(p.x + t * 31, p.y) * (p.w - 40);
      const ty = p.y + 20 + hash2(p.x, p.y + t * 37) * (p.h - 40);
      g.beginPath();
      g.arc(tx, ty, 12 + hash2(tx, ty) * 10, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let i = 0; i < city.lots.length; i += 1) {
    const l = city.lots[i];
    g.fillStyle = '#3a3f4a';
    g.fillRect(l.x, l.y, l.w, l.h);
    g.strokeStyle = 'rgba(230,230,220,0.5)';
    g.lineWidth = 2;
    g.strokeRect(l.x + 4, l.y + 4, l.w - 8, l.h - 8);
  }
  // Parking spot lines.
  g.strokeStyle = 'rgba(240,240,230,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < city.parkedSpots.length; i += 1) {
    const s = city.parkedSpots[i];
    g.strokeRect(s.x - 22, s.y - 14, 44, 28);
  }

  // Buildings: drop shadow, parapet edge, brick roof, rooftop details,
  // lit windows. (Windows and roof details were precomputed at city build.)
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    // Soft drop shadow to the south-east.
    g.fillStyle = 'rgba(0,0,0,0.30)';
    g.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    // Body = parapet wall.
    g.fillStyle = b.color;
    g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = shade(b.color, -30);
    g.lineWidth = 3;
    g.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
    // Roof inset.
    g.fillStyle = b.roof;
    g.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 2;
    g.strokeRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    // Faint brick courses on the roof.
    g.fillStyle = 'rgba(0,0,0,0.07)';
    for (let y = b.y + 20; y < b.y + b.h - 12; y += 14) {
      g.fillRect(b.x + 10, y, b.w - 20, 1);
    }
    // Rooftop details: AC units, vents, skylights.
    const details = b.roofDetails || [];
    for (let d = 0; d < details.length; d += 1) {
      const rd = details[d];
      if (rd.kind === 'ac') {
        g.fillStyle = COLORS.roofDetail;
        g.fillRect(rd.x, rd.y, 16, 12);
        g.fillStyle = COLORS.roofDetailDark;
        g.fillRect(rd.x + 2, rd.y + 2, 12, 3);
      } else if (rd.kind === 'vent') {
        g.fillStyle = COLORS.roofDetailDark;
        g.beginPath();
        g.arc(rd.x + 6, rd.y + 6, 5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.beginPath();
        g.arc(rd.x + 4, rd.y + 4, 2, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = COLORS.skylight;
        g.fillRect(rd.x, rd.y, 18, 13);
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        g.lineWidth = 1;
        g.strokeRect(rd.x + 0.5, rd.y + 0.5, 18, 13);
      }
    }
    // Lit windows: precomputed per building at city build.
    for (let wi = 0; wi < b.windows.length; wi += 1) {
      const win = b.windows[wi];
      g.fillStyle = win.color;
      g.fillRect(win.x, win.y, 18, 14);
    }
    // Landmark buildings get no text label here: their zone marker below the
    // door already names them (drawing both doubled every landmark name).
    if (b.label && !b.name) {
      g.fillStyle = '#f5f0e6';
      g.font = 'bold 15px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 - 4);
      g.fillStyle = '#ffd76a';
      g.fillRect(b.x + b.w / 2 - 24, b.y + b.h / 2 + 4, 48, 3);
    }
  }

  // Palms.
  for (let i = 0; i < city.palms.length; i += 1) {
    const p = city.palms[i];
    g.fillStyle = '#3f7a44';
    g.beginPath();
    g.arc(p.x, p.y, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2c5a31';
    g.beginPath();
    g.arc(p.x + 4, p.y - 4, 7, 0, Math.PI * 2);
    g.fill();
  }
}

// Light rain: a fixed pool of 120 streaks, positions from world.time so the
// pattern never flickers or needs per-frame state.
let rainDrops = null;
function rainPool() {
  if (rainDrops) return rainDrops;
  let s = 1234567;
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) | 0;
    return (s >>> 0) / 4294967296;
  };
  rainDrops = [];
  for (let i = 0; i < 120; i += 1) {
    rainDrops.push({
      x: rnd(),
      y: rnd(),
      len: 10 + rnd() * 8,
      speed: 0.22 + rnd() * 0.3,
      drift: 0.02 + rnd() * 0.05,
    });
  }
  return rainDrops;
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

  const zoom = view.zoom || 1;
  const halfW = w / 2 / zoom;
  const halfH = h / 2 / zoom;
  const viewLeft = camX - halfW - 80;
  const viewRight = camX + halfW + 80;
  const viewTop = camY - halfH - 80;
  const viewBottom = camY + halfH + 80;

  // Brick ground under everything (also covers the margin outside the map).
  ctx.fillStyle = ctx.createPattern(brickTile(), 'repeat');
  ctx.fillRect(camX - halfW - 20, camY - halfH - 20, halfW * 2 + 40, halfH * 2 + 40);
  // The baked static layer, blitted over the visible world rect.
  const layer = staticLayer(world);
  const sx = Math.max(0, viewLeft);
  const sy = Math.max(0, viewTop);
  const sw = Math.min(WORLD_W, viewRight) - sx;
  const sh = Math.min(WORLD_H, viewBottom) - sy;
  if (sw > 0 && sh > 0) ctx.drawImage(layer, sx, sy, sw, sh, sx, sy, sw, sh);

  // Animated wave glints on the water (only when the east edge is visible).
  if (viewRight > WATER_X) {
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = Math.max(0, viewTop); y < Math.min(WORLD_H, viewBottom); y += 90) {
      const wx = WATER_X + 14 + Math.sin(time * 0.7 + y * 0.05) * 8;
      ctx.moveTo(wx, y);
      ctx.lineTo(wx + 42, y);
    }
    ctx.stroke();
  }

  // Rain splash ripples on the roads: fixed world points, expanding rings.
  ctx.strokeStyle = COLORS.splash;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gy = Math.floor(viewTop / 160) * 160; gy < viewBottom; gy += 160) {
    for (let gx = Math.floor(viewLeft / 160) * 160; gx < viewRight; gx += 160) {
      const cx = gx + 80;
      const cy = gy + 80;
      if (!city.onRoad(cx, cy)) continue;
      const hv = hash2(cx, cy);
      if (hv >= 0.45) continue;
      const ph = (time * 0.8 + hv * 2.7) % 1;
      const r = 2 + ph * 7;
      ctx.moveTo(cx + r, cy);
      ctx.ellipse(cx, cy, r, r * 0.45, 0, 0, Math.PI * 2);
    }
  }
  ctx.stroke();

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

  // Weapon pickups: pulsing gold crate with a label.
  for (let i = 0; i < world.pickups.length; i += 1) {
    const pk = world.pickups[i];
    if (pk.taken) continue;
    const pulse = 1 + 0.15 * Math.sin(time * 4 + i * 2);
    ctx.save();
    ctx.translate(pk.x, pk.y);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,20,28,0.85)';
    ctx.fillRect(-11, -8, 22, 16);
    ctx.fillStyle = '#ffd76a';
    if (pk.kind === 'shotgun') {
      // Shotgun silhouette: barrel + stock.
      ctx.fillRect(-9, -2, 16, 3);
      ctx.fillRect(-9, 1, 6, 4);
    } else {
      // Shell box: three shells.
      ctx.fillRect(-8, -4, 4, 8);
      ctx.fillRect(-2, -4, 4, 8);
      ctx.fillRect(4, -4, 4, 8);
    }
    ctx.restore();
  }

  // Cars.
  for (let i = 0; i < world.cars.length; i += 1) {
    drawCar(ctx, world.cars[i], time);
  }
  // Pedestrians.
  for (let i = 0; i < world.peds.length; i += 1) {
    const p = world.peds[i];
    // Ground shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 7, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
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
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.stroke();
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
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y + 8, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 8, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 9, 12, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
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

  // Light rain over the world (screen space, one batched stroke).
  const drops = rainPool();
  ctx.strokeStyle = COLORS.rain;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < drops.length; i += 1) {
    const d = drops[i];
    const px = (((d.x + time * d.drift) % 1) * (w + 40)) - 20;
    const py = (((d.y + time * d.speed) % 1) * (h + 40)) - 20;
    ctx.moveTo(px, py);
    ctx.lineTo(px - 5, py + d.len);
  }
  ctx.stroke();

  // Dusk vignette in screen space (pre-rendered once per size: a live radial
  // gradient fill every frame is the slowest draw in software rendering).
  ctx.drawImage(vignetteFor(w, h), 0, 0);

  drawMinimap(ctx, world, w, h, time);
}

// Cached vignette: an offscreen canvas with the radial gradient baked in,
// plus a faint warm dusk glow from the top.
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
  grad.addColorStop(1, 'rgba(30,16,60,0.46)');
  vctx.fillStyle = grad;
  vctx.fillRect(0, 0, w, h);
  const warm = vctx.createLinearGradient(0, 0, 0, h * 0.45);
  warm.addColorStop(0, 'rgba(255,166,88,0.06)');
  warm.addColorStop(1, 'rgba(255,166,88,0)');
  vctx.fillStyle = warm;
  vctx.fillRect(0, 0, w, h * 0.45);
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
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  roundRectPath(ctx, -l / 2 + 3, -wd / 2 + 5, l, wd, 10);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  roundRectPath(ctx, -l / 2, -wd / 2, l, wd, 10);
  ctx.fill();
  // Police: white doors between the black hood and trunk.
  if (car.type === 'police') {
    ctx.fillStyle = '#e8e6df';
    roundRectPath(ctx, -l * 0.20, -wd / 2 + 2, l * 0.42, wd - 4, 6);
    ctx.fill();
  }
  // Bumpers.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(l / 2 - 3, -wd / 2 + 4, 3, wd - 8);
  ctx.fillRect(-l / 2, -wd / 2 + 4, 3, wd - 8);
  // Wheels with hubs.
  ctx.fillStyle = '#14141a';
  ctx.fillRect(-l * 0.32, -wd / 2 - 3, 16, 6);
  ctx.fillRect(-l * 0.32, wd / 2 - 3, 16, 6);
  ctx.fillRect(l * 0.32, -wd / 2 - 3, 16, 6);
  ctx.fillRect(l * 0.32, wd / 2 - 3, 16, 6);
  ctx.fillStyle = '#6b6f7a';
  ctx.fillRect(-l * 0.32 + 5, -wd / 2 - 3, 6, 6);
  ctx.fillRect(-l * 0.32 + 5, wd / 2 - 3, 6, 6);
  ctx.fillRect(l * 0.32 + 5, -wd / 2 - 3, 6, 6);
  ctx.fillRect(l * 0.32 + 5, wd / 2 - 3, 6, 6);
  // Roof panel (lighter shade of the body color), between the windows.
  ctx.fillStyle = car.type === 'police' ? '#f5f2ea' : shade(car.color, 26);
  roundRectPath(ctx, -l * 0.20, -wd / 2 + 5, l * 0.30, wd - 10, 5);
  ctx.fill();
  // Windshield (front) + rear window, with a glint.
  ctx.fillStyle = 'rgba(18,30,44,0.88)';
  ctx.fillRect(l * 0.12, -wd / 2 + 4, 13, wd - 8);
  ctx.fillRect(-l * 0.36, -wd / 2 + 4, 12, wd - 8);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(l * 0.14, wd / 2 - 6);
  ctx.lineTo(l * 0.22, -wd / 2 + 6);
  ctx.stroke();
  // Side windows.
  ctx.fillStyle = 'rgba(18,30,44,0.7)';
  ctx.fillRect(-l * 0.18, -wd / 2 + 2, l * 0.26, 4);
  ctx.fillRect(-l * 0.18, wd / 2 - 6, l * 0.26, 4);
  // Van / truck: cargo roof lines and a bigger windshield.
  if (car.type === 'van' || car.type === 'truck') {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = -1; k <= 1; k += 1) {
      const x = k * l * 0.09;
      ctx.moveTo(x, -wd / 2 + 6);
      ctx.lineTo(x, wd / 2 - 6);
    }
    ctx.stroke();
  }
  // Sport: rear spoiler.
  if (car.type === 'sport' || car.type === 'comet') {
    ctx.fillStyle = '#14141a';
    roundRectPath(ctx, -l / 2 - 5, -wd / 2 + 3, 7, wd - 6, 2);
    ctx.fill();
  }
  // Comet: twin racing stripes down the body.
  if (car.type === 'comet') {
    ctx.fillStyle = 'rgba(20,20,28,0.55)';
    ctx.fillRect(-l / 2 + 8, -9, l - 16, 4);
    ctx.fillRect(-l / 2 + 8, 5, l - 16, 4);
  }
  // Headlights (front) and taillights (rear).
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(l / 2 - 2, -wd / 2 + 5, 4, 6);
  ctx.fillRect(l / 2 - 2, wd / 2 - 11, 4, 6);
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-l / 2, -wd / 2 + 5, 3, 6);
  ctx.fillRect(-l / 2, wd / 2 - 11, 3, 6);
  if (car.type === 'taxi') {
    // Roof sign.
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(-7, -9, 14, 18);
    ctx.fillStyle = '#1a1a22';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
    // Checker band along the doors.
    for (let k = 0; k < 4; k += 1) {
      ctx.fillStyle = k % 2 === 0 ? '#1a1a22' : '#f5f0e6';
      ctx.fillRect(-l * 0.16 + k * 7, -wd / 2 + 2, 7, 4);
      ctx.fillRect(-l * 0.16 + k * 7, wd / 2 - 6, 7, 4);
    }
  }
  if (car.type === 'police') {
    // Flashing light bar with a glow halo.
    const on = Math.floor(time * 6) % 2 === 0;
    const glowColor = on ? 'rgba(255,59,48,0.30)' : 'rgba(47,111,208,0.30)';
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.arc(-2, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = on ? '#ff3b30' : '#2f6fd0';
    roundRectPath(ctx, -10, -wd / 2 + 1, 20, 9, 3);
    ctx.fill();
    ctx.fillStyle = on ? '#2f6fd0' : '#ff3b30';
    roundRectPath(ctx, -10, wd / 2 - 10, 20, 9, 3);
    ctx.fill();
    ctx.fillStyle = '#1a1a22';
    ctx.font = 'bold 9px system-ui, sans-serif';
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
    roundRectPath(ctx, -l / 2, -wd / 2, l, wd, 10);
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
  // Circular minimap, GTA 2 / Chinatown Wars style: the whole city fitted
  // inside a ringed circle, water on the east edge, player as an arrow.
  const D = 168;
  const R = D / 2;
  const cx = 14 + R;
  const cy = h - 14 - R;
  const sx = D / WORLD_W;
  const mapH = WORLD_H * sx;
  const mapTop = cy - mapH / 2;
  ctx.save();
  // Dark disc + white ring.
  ctx.fillStyle = 'rgba(10,12,20,0.85)';
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  // Water on the east edge.
  ctx.fillStyle = '#1b4a6b';
  ctx.fillRect(cx - R + WATER_X * sx, mapTop, (WORLD_W - WATER_X) * sx, mapH);
  // Roads.
  ctx.strokeStyle = 'rgba(200,200,210,0.7)';
  ctx.lineWidth = 2;
  for (let i = 0; i < world.city.avenues.length; i += 1) {
    ctx.beginPath();
    ctx.moveTo(cx - R + world.city.avenues[i] * sx, mapTop);
    ctx.lineTo(cx - R + world.city.avenues[i] * sx, mapTop + mapH);
    ctx.stroke();
  }
  for (let i = 0; i < world.city.streets.length; i += 1) {
    ctx.beginPath();
    ctx.moveTo(cx - R, mapTop + world.city.streets[i] * sx);
    ctx.lineTo(cx + R, mapTop + world.city.streets[i] * sx);
    ctx.stroke();
  }
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx - R + x * sx, mapTop + y * sx, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Mission target.
  const target = world.missionTarget;
  if (target) {
    const pulse = 2 + Math.sin(time * 5);
    dot(target.x, target.y, '#ffd76a', 4 + pulse);
  }
  // Police cars + foot cops.
  for (let i = 0; i < world.cars.length; i += 1) {
    const c = world.cars[i];
    if (c.type === 'police') dot(c.x, c.y, '#3b82f6', 2.5);
    else if (c.driver === 'player') dot(c.x, c.y, '#7ee8fa', 3);
  }
  for (let i = 0; i < world.footCops.length; i += 1) {
    dot(world.footCops[i].x, world.footCops[i].y, '#3b82f6', 2);
  }
  // Player arrow (points along the player's heading).
  ctx.save();
  ctx.translate(cx - R + world.player.x * sx, mapTop + world.player.y * sx);
  ctx.rotate(world.player.angle || 0);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-2.5, 0);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  // Ring border on top of the clip.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, R - 1.5, 0, Math.PI * 2);
  ctx.stroke();
}
