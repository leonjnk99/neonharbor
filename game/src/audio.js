// WebAudio synth: every sound is generated in code, no audio files. All calls are
// safe before the audio context exists (headless / Node): they become no-ops.
let actx = null;
let master = null;
let musicGain = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let muted = false;
let musicTimer = null;
let musicStep = 0;

export function isMuted() {
  return muted;
}

export function ensureAudio() {
  if (typeof window === 'undefined' || actx) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    master = actx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(actx.destination);
    musicGain = actx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
    engineOsc = actx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;
    engineGain = actx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = actx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    sirenOsc = actx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 740;
    sirenGain = actx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
  } catch (err) {
    actx = null;
  }
}

export function setMuted(value) {
  muted = value;
  if (master && actx) master.gain.setTargetAtTime(value ? 0 : 0.5, actx.currentTime, 0.05);
}

function tone(freq, dur, type, vol, slideTo) {
  if (!actx || muted) return;
  const t = actx.currentTime;
  const osc = actx.createOscillator();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur, vol, filterFreq) {
  if (!actx || muted) return;
  const t = actx.currentTime;
  const len = Math.max(1, Math.floor(actx.sampleRate * dur));
  const buffer = actx.createBuffer(1, len, actx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = actx.createBufferSource();
  src.buffer = buffer;
  const filter = actx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq || 1200;
  const g = actx.createGain();
  g.gain.value = vol;
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t);
}

export const sfx = {
  click() { tone(660, 0.07, 'square', 0.12); },
  pickup() { tone(880, 0.09, 'sine', 0.2); tone(1320, 0.12, 'sine', 0.16); },
  cash() { tone(990, 0.08, 'triangle', 0.2); setTimeout(() => tone(1480, 0.14, 'triangle', 0.2), 70); },
  shoot() { noise(0.09, 0.5, 2600); tone(160, 0.08, 'square', 0.25, 60); },
  punch() { noise(0.08, 0.35, 500); },
  crash(strength) { noise(0.25, Math.min(0.6, 0.2 + strength * 0.4), 700); },
  skid() { noise(0.12, 0.12, 1800); },
  sirenBlip() { tone(740, 0.15, 'square', 0.1, 980); },
  busted() { tone(330, 0.4, 'sawtooth', 0.2, 110); },
  wasted() { tone(220, 0.7, 'sawtooth', 0.22, 55); },
  mission() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.22), i * 90)); },
  fail() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.2), i * 110)); },
};

// Engine hum follows speed (0..1); siren wails while police are near.
export function updateEngine(speed01, driving) {
  if (!actx) return;
  const t = actx.currentTime;
  engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.06 : 0, t, 0.1);
  engineOsc.frequency.setTargetAtTime(48 + speed01 * 130, t, 0.08);
}

export function updateSiren(on) {
  if (!actx) return;
  const t = actx.currentTime;
  sirenGain.gain.setTargetAtTime(on && !muted ? 0.035 : 0, t, 0.2);
  if (on) sirenOsc.frequency.setTargetAtTime(740 + 260 * Math.sin(t * 4.4), t, 0.05);
}

// Generative dusk-drive loop: minor-key bass, hats, soft pad. Schedules ahead.
const BASS = [55, 0, 55, 0, 65.4, 0, 49, 0, 55, 0, 55, 0, 82.4, 0, 73.4, 0];
const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
export function startMusic() {
  ensureAudio();
  if (!actx || musicTimer) return;
  musicTimer = setInterval(() => {
    if (muted || !actx) return;
    const step = musicStep;
    const bass = BASS[step % BASS.length];
    if (bass) tone(bass, 0.22, 'triangle', 0.5);
    if (step % 2 === 0) noise(0.03, 0.05, 6000);
    if (step % 16 === 0) {
      const chord = CHORDS[(step / 16 | 0) % CHORDS.length];
      chord.forEach((f) => tone(f, 1.6, 'sine', 0.05));
    }
    musicStep += 1;
  }, 150);
}

export function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
