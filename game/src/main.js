// NEONHARBOR — entry point: canvas, input, UI, the frame loop, screen wiring.
// Debug: ?debug=1 exposes window.__NEONHARBOR__ and enables the debug helpers.
// Shots: ?shot=1-start|2-drive|3-chase|4-mission starts the game in a staged state.
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createUI } from './ui.js';
import { renderWorld } from './render.js';
import { ensureAudio, setMuted, isMuted, sfx, updateEngine, updateSiren, startMusic } from './audio.js';
import { applyShot } from './shots.js';
import { hasSave, loadSave, clearSave } from './save.js';
import { addHeat } from './police.js';

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 1);
const shotName = params.get('shot') || null;
const debug = params.get('debug') === '1';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);

let world = createWorld(seed, { debug });

const ui = createUI({
  onNewGame() {
    clearSave();
    world = createWorld(seed, { debug });
    startPlaying();
  },
  onContinue() {
    const save = loadSave();
    world = createWorld(seed, { debug, save });
    startPlaying();
  },
  onResume() {
    world.state = 'playing';
    ui.showScreen(null);
  },
  onRestart() {
    const save = loadSave();
    world = createWorld(seed, { debug, save });
    startPlaying();
  },
  onToggleMute() {
    setMuted(!isMuted());
    ui.setMute(isMuted());
  },
  onTitle() {
    world.state = 'title';
    ui.showScreen('title');
    ui.setContinueVisible(hasSave());
  },
  onRetry() {
    const save = loadSave();
    world = createWorld(seed, { debug, save });
    startPlaying();
  },
  onFreeRoam() {
    world.state = 'playing';
    ui.showScreen(null);
  },
});

function startPlaying() {
  ensureAudio();
  startMusic();
  world.state = 'playing';
  ui.showScreen(null);
  if (shotName) applyShot(world, shotName);
}

function showStateScreen(state) {
  if (state === 'paused') ui.showScreen('pause');
  else if (state === 'dead') {
    ui.setDeadStats(`Earned $${world.totalEarned} · ${world.missions.completed.length} jobs done · ${Math.round(world.playSeconds)}s in the harbor.`);
    ui.showScreen('dead');
  } else if (state === 'busted') {
    ui.showScreen('busted');
  } else if (state === 'victory') {
    ui.setVictoryStats(`All 6 story jobs done · $${world.totalEarned} earned · ${Math.round(world.playSeconds)}s in the harbor.`);
    ui.showScreen('victory');
  }
}

function drainEvents() {
  const events = world.events.splice(0);
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i];
    if (e.type === 'banner') ui.banner(e.title, e.sub, e.dur);
    else if (e.type === 'state') showStateScreen(e.state);
    else if (e.type === 'sfx') sfx[e.name] && sfx[e.name](e.arg);
    else if (e.type === 'mute') {
      setMuted(!isMuted());
      ui.setMute(isMuted());
    }
  }
}

let last = performance.now();
let frames = 0;

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  frames += 1;

  if (world.state === 'playing') {
    // Mouse position in world coordinates (the canvas may be CSS-scaled).
    const rect = canvas.getBoundingClientRect();
    const zoom = world.player.car ? 0.82 : 0.95;
    input.aimX = world.camX + (input.mouseX * (canvas.width / rect.width) - canvas.width / 2) / zoom;
    input.aimY = world.camY + (input.mouseY * (canvas.height / rect.height) - canvas.height / 2) / zoom;
    world.update(dt, input);
    drainEvents();
    // Audio follows the drive.
    const driving = !!world.player.car;
    const speed01 = driving ? Math.abs(world.player.car.speed) / world.player.car.maxSpeed : 0;
    updateEngine(speed01, driving);
    updateSiren(world.wanted.stars > 0 && (world.policeCars.length > 0 || world.footCops.length > 0));
  }

  // Camera view.
  const zoom = world.player.car ? 0.82 : 0.95;
  const shakeMag = world.shake * 12;
  const view = {
    w: canvas.width,
    h: canvas.height,
    zoom,
    shakeX: (Math.random() - 0.5) * shakeMag,
    shakeY: (Math.random() - 0.5) * shakeMag,
  };
  renderWorld(ctx, world, view);

  if (world.state === 'playing') {
    ui.setHUD({
      stars: world.wanted.stars,
      cash: world.player.cash,
      health: world.player.health,
      ammo: world.player.ammo,
      hasPistol: world.player.hasPistol,
      objective: world.objective,
      prompt: world.prompt,
    });
  }

  input.endStep();
  requestAnimationFrame(frame);
}

// Title screen first, unless a shot preset skips straight into the game.
ui.setContinueVisible(hasSave());
ui.showScreen('title');
if (shotName) {
  startPlaying();
}
if (debug) {
  window.__NEONHARBOR__ = {
    get world() { return world; },
    setWanted(stars) {
      world.wanted.heat = stars * 25;
      world.wanted.stars = stars;
    },
    setMission(i) {
      world.missions.index = i;
      world.missions.active = null;
    },
    teleport(x, y) {
      world.player.x = x;
      world.player.y = y;
      world.camX = x;
      world.camY = y;
      if (world.player.car) {
        world.player.car.x = x;
        world.player.car.y = y;
      }
    },
    giveCash(n) { world.player.cash += n; },
    addHeat(n) { addHeat(world.wanted, n); },
  };
}
window.__ready = true;
requestAnimationFrame(frame);
