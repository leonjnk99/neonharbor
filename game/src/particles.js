// Particles, skid marks and floating text. Pure state; render.js draws them.
export function makeParticles() {
  return { list: [], texts: [], skids: [] };
}

export function burst(p, x, y, opts) {
  const o = opts || {};
  const n = o.n || 14;
  const color = o.color || '#ffd76a';
  const speed = o.speed || 260;
  const life = o.life || 0.6;
  const size = o.size || 4;
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    p.list.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: life * (0.6 + Math.random() * 0.6),
      maxLife: life,
      size: size * (0.6 + Math.random() * 0.8),
      color,
    });
  }
  if (p.list.length > 400) p.list.splice(0, p.list.length - 400);
}

export function smoke(p, x, y) {
  p.list.push({
    x, y,
    vx: (Math.random() - 0.5) * 30,
    vy: -30 - Math.random() * 30,
    life: 0.9,
    maxLife: 0.9,
    size: 9,
    color: '#8a8f96',
  });
}

export function addText(p, x, y, text, color) {
  p.texts.push({ x, y, text, color: color || '#ffffff', life: 1.1 });
  if (p.texts.length > 24) p.texts.shift();
}

export function addSkid(p, x1, y1, x2, y2) {
  p.skids.push({ x1, y1, x2, y2, life: 6 });
  if (p.skids.length > 300) p.skids.shift();
}

export function stepParticles(p, dt) {
  for (let i = p.list.length - 1; i >= 0; i -= 1) {
    const pt = p.list[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.98;
    pt.vy *= 0.98;
    pt.life -= dt;
    if (pt.life <= 0) p.list.splice(i, 1);
  }
  for (let i = p.texts.length - 1; i >= 0; i -= 1) {
    const t = p.texts[i];
    t.y -= 34 * dt;
    t.life -= dt;
    if (t.life <= 0) p.texts.splice(i, 1);
  }
  for (let i = p.skids.length - 1; i >= 0; i -= 1) {
    p.skids[i].life -= dt;
    if (p.skids[i].life <= 0) p.skids.splice(i, 1);
  }
}
