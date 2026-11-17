// DOM HUD and screens: cash, health, ammo, wanted stars, objective line, banners,
// title / pause / wasted / busted / victory screens. The canvas stays the game.
export function createUI(callbacks) {
  const root = document.getElementById('ui');
  root.innerHTML = `
    <div id="hud" class="hidden">
      <div id="hud-top">
        <div id="hud-left">
          <div id="stars"></div>
          <div id="cash">$0</div>
        </div>
        <div id="objective"></div>
        <div id="hud-right">
          <div id="health-wrap"><div id="health-bar"></div><span id="health-text"></span></div>
          <div id="ammo"></div>
        </div>
      </div>
      <div id="prompt"></div>
      <div id="hint">WASD drive/walk &middot; E enter car &middot; F shoot &middot; Space handbrake &middot; Q use &middot; P pause &middot; M mute</div>
    </div>
    <div id="banner" class="hidden"><div id="banner-title"></div><div id="banner-sub"></div></div>
    <div id="screen-title" class="screen">
      <h1>NEON<span>HARBOR</span></h1>
      <p class="tagline">A driver-for-hire climbs the underworld of a coastal neon city.</p>
      <div class="menu">
        <button id="btn-continue" class="hidden">Continue</button>
        <button id="btn-new">New game</button>
        <button id="btn-help">How to play</button>
      </div>
      <div id="help" class="hidden">
        <p><b>Drive:</b> WASD / arrows &middot; <b>Enter car:</b> E &middot; <b>Handbrake:</b> Space</p>
        <p><b>Shoot:</b> F or click &middot; <b>Use place:</b> Q &middot; <b>Pause:</b> P &middot; <b>Mute:</b> M</p>
        <p>Take jobs at the <b>Lantern Bar</b>. Lose the cops at <b>Rook's Loft</b>. Repair at the <b>Pit Stop</b>, heal at the <b>Med Stop</b>, ammo at <b>Harbor Arms</b>. Sell a hot car at the <b>Chop Shop</b>.</p>
      </div>
      <p class="fine">An original game. No affiliation with any existing crime-game series.</p>
    </div>
    <div id="screen-pause" class="screen hidden">
      <h2>PAUSED</h2>
      <div class="menu">
        <button id="btn-resume">Resume</button>
        <button id="btn-restart">Restart run</button>
        <button id="btn-mute">Mute: off</button>
        <button id="btn-title">Quit to title</button>
      </div>
    </div>
    <div id="screen-dead" class="screen hidden">
      <h2 class="red">WASTED</h2>
      <p id="dead-stats"></p>
      <div class="menu">
        <button id="btn-retry">Retry from last save</button>
        <button id="btn-dead-title">Title screen</button>
      </div>
    </div>
    <div id="screen-busted" class="screen hidden">
      <h2 class="blue">BUSTED</h2>
      <p>The Harbor PD hauled you in. Bail ate your cash.</p>
      <div class="menu">
        <button id="btn-busted-retry">Retry from last save</button>
        <button id="btn-busted-title">Title screen</button>
      </div>
    </div>
    <div id="screen-victory" class="screen hidden">
      <h2 class="gold">THE HARBOR IS YOURS</h2>
      <p id="victory-stats"></p>
      <div class="menu">
        <button id="btn-freeroam">Keep playing (free roam)</button>
        <button id="btn-victory-title">Title screen</button>
      </div>
    </div>`;

  const el = (id) => document.getElementById(id);
  const ui = {
    showScreen(name) {
      ['screen-title', 'screen-pause', 'screen-dead', 'screen-busted', 'screen-victory'].forEach((id) => {
        el(id).classList.add('hidden');
      });
      if (name) el('screen-' + name).classList.remove('hidden');
      el('hud').classList.toggle('hidden', name === 'title');
    },
    setHUD(s) {
      el('stars').textContent = '★'.repeat(s.stars) + '☆'.repeat(5 - s.stars);
      el('stars').className = s.stars > 0 ? 'hot' : '';
      el('cash').textContent = '$' + s.cash.toLocaleString('en-US');
      el('health-bar').style.width = Math.max(0, s.health) + '%';
      el('health-text').textContent = Math.round(s.health) + ' HP';
      el('ammo').textContent = s.hasPistol ? '🔫 ' + s.ammo : '👊 fists';
      el('objective').textContent = s.objective || '';
      el('prompt').textContent = s.prompt || '';
    },
    banner(title, sub, dur) {
      el('banner-title').textContent = title;
      el('banner-sub').textContent = sub || '';
      el('banner').classList.remove('hidden');
      clearTimeout(ui._bannerTimer);
      ui._bannerTimer = setTimeout(() => el('banner').classList.add('hidden'), (dur || 3) * 1000);
    },
    setMute(muted) {
      el('btn-mute').textContent = 'Mute: ' + (muted ? 'on' : 'off');
    },
    setContinueVisible(visible) {
      el('btn-continue').classList.toggle('hidden', !visible);
    },
    setDeadStats(text) {
      el('dead-stats').textContent = text;
    },
    setVictoryStats(text) {
      el('victory-stats').textContent = text;
    },
  };

  el('btn-new').addEventListener('click', () => callbacks.onNewGame());
  el('btn-continue').addEventListener('click', () => callbacks.onContinue());
  el('btn-help').addEventListener('click', () => el('help').classList.toggle('hidden'));
  el('btn-resume').addEventListener('click', () => callbacks.onResume());
  el('btn-restart').addEventListener('click', () => callbacks.onRestart());
  el('btn-mute').addEventListener('click', () => callbacks.onToggleMute());
  el('btn-title').addEventListener('click', () => callbacks.onTitle());
  el('btn-retry').addEventListener('click', () => callbacks.onRetry());
  el('btn-dead-title').addEventListener('click', () => callbacks.onTitle());
  el('btn-busted-retry').addEventListener('click', () => callbacks.onRetry());
  el('btn-busted-title').addEventListener('click', () => callbacks.onTitle());
  el('btn-freeroam').addEventListener('click', () => callbacks.onFreeRoam());
  el('btn-victory-title').addEventListener('click', () => callbacks.onTitle());

  return ui;
}
