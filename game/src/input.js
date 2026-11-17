// Keyboard and mouse input. Held keys give movement and driving; one-shot presses
// (enter car, punch, pause, confirm, interact) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice. The mouse
// position is kept in screen pixels and converted to a world aim point by the caller.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_PUNCH = 8;
export const ACTION_INTERACT = 16;
export const ACTION_SHOOT = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER_CAR = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const INTERACT = new Set(['KeyE']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
        event.preventDefault();
      }
      return;
    }
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
    } else if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (ENTER_CAR.has(event.code)) actions |= ACTION_ENTER_CAR | ACTION_INTERACT;
    else if (PUNCH.has(event.code)) actions |= ACTION_PUNCH;
    else if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });

  function trackMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }
  canvas.addEventListener('mousemove', trackMouse);
  canvas.addEventListener('mousedown', (event) => {
    trackMouse(event);
    mouseDown = true;
    actions |= ACTION_SHOOT | ACTION_CONFIRM;
  });
  window.addEventListener('mouseup', () => {
    mouseDown = false;
  });

  function anyHeld(codes) {
    for (const code of codes) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Movement vector from WASD/arrows, normalised: {x, y} in world axes (y down). */
    move() {
      const x = (anyHeld(RIGHT) ? 1 : 0) - (anyHeld(LEFT) ? 1 : 0);
      const y = (anyHeld(DOWN) ? 1 : 0) - (anyHeld(UP) ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** Driving: throttle -1..1 (W/S) and steering -1..1 (A/D). */
    drive() {
      const throttle = (anyHeld(UP) ? 1 : 0) - (anyHeld(DOWN) ? 1 : 0);
      const steer = (anyHeld(RIGHT) ? 1 : 0) - (anyHeld(LEFT) ? 1 : 0);
      return { throttle, steer };
    },
    /** True while the left mouse button is held (hold to keep firing). */
    firing() {
      return mouseDown;
    },
    /** Mouse position in CSS pixels relative to the canvas. */
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
