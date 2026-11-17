// Save / continue in localStorage. Guarded so Node (logic tests) stays inert.
const KEY = 'neonharbor.save.v1';

export function hasSave() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) !== null;
  } catch (err) {
    return false;
  }
}

export function loadSave() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export function writeSave(save) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch (err) {
    // Storage full or unavailable: the run continues without a save.
  }
}

export function clearSave() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
  } catch (err) {
    // Ignore.
  }
}

export function bestScore() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('neonharbor.best.v1');
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

export function writeBest(best) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('neonharbor.best.v1', JSON.stringify(best));
  } catch (err) {
    // Ignore.
  }
}
