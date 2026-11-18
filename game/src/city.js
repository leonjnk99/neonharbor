// NEONHARBOR — the city: roads, blocks, buildings, landmarks, spawn points.
// The layout is deterministic for a seed. All collision queries live here.
import { AVENUES, STREETS, ROAD_HALF, WORLD_W, WORLD_H, WATER_X, COLORS } from './config.js';
import { mulberry32, pick, range, rangeInt, chance } from './random.js';

// Deterministic hash for window placement (shared with render).
export function hash2(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// Block columns (x intervals) and rows (y intervals) between the roads.
const COLS = [[32, 272], [368, 656], [752, 1040], [1136, 1424], [1520, 1808], [1904, 2192]];
const ROWS = [[32, 208], [304, 528], [624, 848], [944, 1168], [1264, 1488], [1584, 1744]];

// Landmark blocks: [col, row] -> { name, label, kind }.
const LANDMARKS = {
  '2,2': { name: 'bank', label: 'Harbor Bank', kind: 'bank' },
  '1,3': { name: 'bar', label: 'Lantern Bar', kind: 'bar' },
  '4,4': { name: 'chop', label: 'Chop Shop', kind: 'chop' },
  '3,1': { name: 'arms', label: 'Harbor Arms', kind: 'arms' },
  '1,1': { name: 'med', label: 'Med Stop', kind: 'med' },
  '5,2': { name: 'garage', label: 'Pit Stop Garage', kind: 'garage' },
  '0,4': { name: 'loft', label: "Rook's Loft", kind: 'loft' },
  '0,0': { name: 'depot', label: 'Taxi Depot', kind: 'depot' },
};

export function buildCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const palms = [];
  const parkedSpots = [];
  const parks = [];
  const lots = [];
  const zones = [];

  function addBuilding(x, y, w, h, name, label) {
    const i = Math.floor(rng() * COLORS.building.length);
    // Precompute the lit windows once: render draws them every frame.
    const windows = [];
    const cols = Math.max(1, Math.floor(w / 46));
    const rows = Math.max(1, Math.floor(h / 46));
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        if (hash2(x + cx * 31, y + cy * 29) < 0.4) {
          windows.push({
            x: x + 16 + cx * 46,
            y: y + 16 + cy * 46,
            color: hash2(x + cx, y + cy) < 0.5 ? '#ffd76a' : '#9be8ff',
          });
        }
      }
    }
    // Rooftop details (AC units, vents, skylights), precomputed once via
    // hash2 so render just draws them. Purely visual.
    const roofDetails = [];
    const dcols = Math.max(1, Math.floor(w / 64));
    const drows = Math.max(1, Math.floor(h / 64));
    for (let dx = 0; dx < dcols; dx += 1) {
      for (let dy = 0; dy < drows; dy += 1) {
        const hv = hash2(x + dx * 53 + 7, y + dy * 47 + 3);
        if (hv < 0.34) {
          roofDetails.push({
            kind: hv < 0.14 ? 'ac' : hv < 0.24 ? 'vent' : 'sky',
            x: x + 24 + dx * 64,
            y: y + 24 + dy * 64,
          });
        }
      }
    }
    buildings.push({
      x, y, w, h,
      color: COLORS.building[i],
      roof: COLORS.roof[i],
      name: name || null,
      label: label || null,
      windows,
      roofDetails,
    });
    return buildings[buildings.length - 1];
  }

  for (let c = 0; c < COLS.length; c += 1) {
    for (let r = 0; r < ROWS.length; r += 1) {
      const [bx0, bx1] = COLS[c];
      const [by0, by1] = ROWS[r];
      const key = `${c},${r}`;
      const mark = LANDMARKS[key];
      if (mark) {
        // Landmark: one big building with a door zone on its south side.
        const b = addBuilding(bx0 + 14, by0 + 14, bx1 - bx0 - 28, by1 - by0 - 28, mark.name, mark.label);
        const doorX = b.x + b.w / 2;
        const doorY = b.y + b.h + 26;
        zones.push({ name: mark.name, label: mark.label, x: doorX, y: doorY, r: 70, kind: mark.kind });
        continue;
      }
      const roll = rng();
      if (roll < 0.16) {
        // Park: grass + palms.
        parks.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 });
        const n = rangeInt(rng, 3, 6);
        for (let i = 0; i < n; i += 1) {
          palms.push({ x: range(rng, bx0 + 20, bx1 - 20), y: range(rng, by0 + 20, by1 - 20) });
        }
      } else if (roll < 0.32) {
        // Parking lot: flat asphalt with marked spots.
        lots.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 });
        const cols = Math.floor((bx1 - bx0) / 90);
        const rows = Math.floor((by1 - by0) / 70);
        for (let i = 0; i < cols; i += 1) {
          for (let j = 0; j < rows; j += 1) {
            if (chance(rng, 0.45)) {
              parkedSpots.push({
                x: bx0 + 45 + i * 90,
                y: by0 + 35 + j * 70,
                angle: Math.PI / 2,
                type: pick(rng, ['sedan', 'sedan', 'van', 'taxi']),
              });
            }
          }
        }
      } else {
        // Buildings: one wide or two side by side.
        const w = bx1 - bx0;
        const h = by1 - by0;
        if (w > 220 && chance(rng, 0.6)) {
          addBuilding(bx0 + 16, by0 + 16, w / 2 - 26, h - 32);
          addBuilding(bx0 + w / 2 + 10, by0 + 16, w / 2 - 26, h - 32);
        } else {
          addBuilding(bx0 + 18, by0 + 18, w - 36, h - 36);
        }
        if (chance(rng, 0.5)) palms.push({ x: bx0 + 14, y: by1 - 14 });
      }
    }
  }

  // The north lot holds the yellow Sunray for mission 2 (fixed spot).
  const sunraySpot = { x: 896, y: 120, angle: Math.PI / 2, type: 'sport', color: '#f2c230', fixed: 'sunray' };
  parkedSpots.push(sunraySpot);

  // The Marina lot holds the orange Comet for mission 8 (fixed spot).
  const cometSpot = { x: 1949, y: 479, angle: Math.PI / 2, type: 'comet', color: '#ff6a3d', fixed: 'comet' };
  parkedSpots.push(cometSpot);

  // Marina: the dock on the east edge, over the water line.
  zones.push({ name: 'marina', label: 'Marina', x: 2368, y: 896, r: 80, kind: 'marina' });
  // The bank vault is held at the bank's door (the building itself is solid).
  const bank = buildings.find((b) => b.name === 'bank');
  if (bank) zones.push({ name: 'vault', label: 'Bank Vault', x: bank.x + bank.w / 2, y: bank.y + bank.h + 26, r: 60, kind: 'vault' });

  // (No roadside parked cars: the 96 px roads fit two driving lanes, and a car
  // parked at the curb would block the lane next to it. Lots hold the parked cars.)

  const city = {
    avenues: AVENUES,
    streets: STREETS,
    buildings,
    palms,
    parks,
    lots,
    zones,
    parkedSpots,
    sunraySpot,
    cometSpot,
    playerStart: { x: 320, y: 1400 },
  };

  city.zone = function zone(name) {
    return zones.find((z) => z.name === name) || null;
  };

  city.isWater = function isWater(x, y) {
    return x >= WATER_X;
  };

  city.onRoad = function onRoad(x, y) {
    for (let i = 0; i < AVENUES.length; i += 1) {
      if (Math.abs(x - AVENUES[i]) <= ROAD_HALF + 6) return true;
    }
    for (let i = 0; i < STREETS.length; i += 1) {
      if (Math.abs(y - STREETS[i]) <= ROAD_HALF + 6) return true;
    }
    return false;
  };

  // Nearest road centreline and signed offset: { axis: 'v'|'h', center, along }.
  city.nearestRoad = function nearestRoad(x, y) {
    let best = null;
    for (let i = 0; i < AVENUES.length; i += 1) {
      const d = Math.abs(x - AVENUES[i]);
      if (!best || d < best.dist) best = { axis: 'v', center: AVENUES[i], along: y, dist: d };
    }
    for (let i = 0; i < STREETS.length; i += 1) {
      const d = Math.abs(y - STREETS[i]);
      if (!best || d < best.dist) best = { axis: 'h', center: STREETS[i], along: x, dist: d };
    }
    return best;
  };

  // Push a circle out of every building and the water; returns corrected {x, y}.
  city.resolveCircle = function resolveCircle(x, y, r) {
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      const cx = Math.max(b.x, Math.min(x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        if (d2 > 0.01) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          y = cy + (dy / d) * r;
        } else {
          // Centre inside the building: push out along the smallest overlap.
          const left = x - b.x + r;
          const right = b.x + b.w - x + r;
          const top = y - b.y + r;
          const bottom = b.y + b.h - y + r;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = b.x - r;
          else if (m === right) x = b.x + b.w + r;
          else if (m === top) y = b.y - r;
          else y = b.y + b.h + r;
        }
      }
    }
    if (x > WATER_X - r) x = WATER_X - r;
    if (x < r) x = r;
    if (y < r) y = r;
    if (y > WORLD_H - r) y = WORLD_H - r;
    return { x, y };
  };

  city.hitsBuilding = function hitsBuilding(x, y, r) {
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  };

  // A random point on a road at least minDist from (x, y).
  city.roadPointNear = function roadPointNear(x, y, minDist) {
    for (let tries = 0; tries < 24; tries += 1) {
      let px;
      let py;
      if (rng() < 0.5) {
        px = pick(rng, AVENUES);
        py = range(rng, 80, WORLD_H - 80);
      } else {
        px = range(rng, 80, WATER_X - 80);
        py = pick(rng, STREETS);
      }
      if (Math.hypot(px - x, py - y) >= minDist) return { x: px, y: py };
    }
    return { x: AVENUES[0], y: STREETS[0] };
  };

  // A random sidewalk point (just off a road) for pedestrians.
  city.sidewalkPoint = function sidewalkPoint() {
    if (rng() < 0.5) {
      const av = pick(rng, AVENUES);
      return { x: av + (rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 16), y: range(rng, 80, WORLD_H - 80) };
    }
    const st = pick(rng, STREETS);
    return { x: range(rng, 80, WATER_X - 80), y: st + (rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 16) };
  };

  return city;
}
