// Keyboard, mouse and touch input. The game reads a plain state object each step:
// keys held, edges (pressed this step), mouse position in canvas pixels, clicks.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(),
    mouseX: 0,
    mouseY: 0,
    mouseMoved: false,
    mouseDown: false,
    clicked: false,
    // Touch drag: a virtual stick from the touch start point.
    touchActive: false,
    touchStartX: 0,
    touchStartY: 0,
    touchX: 0,
    touchY: 0,
  };

  function keyName(event) {
    const k = event.key;
    if (k === ' ') return 'Space';
    if (k.length === 1) return k.toLowerCase();
    return k;
  }

  window.addEventListener('keydown', (event) => {
    const name = keyName(event);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(name) || event.key.startsWith('Arrow')) {
      event.preventDefault();
    }
    if (!event.repeat) {
      input.keys.add(name);
      input.pressed.add(name);
    }
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(keyName(event));
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
  });

  function setMouse(event) {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = event.clientX - rect.left;
    input.mouseY = event.clientY - rect.top;
    input.mouseMoved = true;
  }
  canvas.addEventListener('mousemove', setMouse);
  canvas.addEventListener('mousedown', (event) => {
    setMouse(event);
    input.mouseDown = true;
    input.clicked = true;
  });
  window.addEventListener('mouseup', () => {
    input.mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener('touchstart', (event) => {
    event.preventDefault();
    const t = event.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    input.touchActive = true;
    input.touchStartX = t.clientX - rect.left;
    input.touchStartY = t.clientY - rect.top;
    input.touchX = input.touchStartX;
    input.touchY = input.touchStartY;
  }, { passive: false });
  canvas.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const t = event.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    input.touchX = t.clientX - rect.left;
    input.touchY = t.clientY - rect.top;
  }, { passive: false });
  canvas.addEventListener('touchend', (event) => {
    event.preventDefault();
    input.touchActive = false;
  }, { passive: false });

  // Call once per frame after the step: edges live for one step only.
  input.endStep = function endStep() {
    input.pressed.clear();
    input.clicked = false;
  };

  input.held = function held(name) {
    return input.keys.has(name);
  };
  input.wasPressed = function wasPressed(name) {
    return input.pressed.has(name);
  };
  // Movement vector from WASD/arrows, or from the touch stick.
  input.moveVector = function moveVector() {
    let x = 0;
    let y = 0;
    if (input.keys.has('a') || input.keys.has('ArrowLeft')) x -= 1;
    if (input.keys.has('d') || input.keys.has('ArrowRight')) x += 1;
    if (input.keys.has('w') || input.keys.has('ArrowUp')) y -= 1;
    if (input.keys.has('s') || input.keys.has('ArrowDown')) y += 1;
    if (x === 0 && y === 0 && input.touchActive) {
      const dx = input.touchX - input.touchStartX;
      const dy = input.touchY - input.touchStartY;
      const len = Math.hypot(dx, dy);
      if (len > 12) {
        x = dx / len;
        y = dy / len;
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  };

  return input;
}
