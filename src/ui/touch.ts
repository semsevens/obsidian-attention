/**
 * The gestures a phone has instead of a mouse.
 *
 * Two of this plugin's ways in are mouse-shaped. A selection is noticed on
 * `mouseup`, which a touch never sends; and the full menu is on right-click,
 * which a phone has no way to perform. On a phone both simply never happen —
 * the plugin loads, paints marks, and cannot be used to make one.
 *
 * Neither gesture translates cleanly, which is why these are their own thing:
 *
 * A touch selection is not finished when the finger lifts. iOS shows handles
 * and the reader drags them, so `touchend` fires while the selection is still
 * being adjusted, and reacting to it offers to mark half a word. Waiting for
 * the selection to stop changing is what actually corresponds to "done".
 *
 * A long press has no event of its own. It is a touch that stays still for
 * long enough, which has to be measured — and abandoned the moment the finger
 * moves, or every scroll would raise a menu.
 */

const SELECTION_SETTLED_MS = 400;
const LONG_PRESS_MS = 500;
/** A finger is never perfectly still; this much drift is still a press. */
const SLOP_PX = 10;

export interface Gestures {
  /** Cancel everything registered. */
  dispose(): void;
}

/**
 * Call `done` once a touch selection has stopped changing.
 *
 * Also fires for a selection made with a mouse on a touchscreen laptop, which
 * costs nothing: the handler is expected to be idempotent, and both hosts'
 * already are — they read the current selection rather than trusting the event.
 */
export function onTouchSelection(done: () => void): Gestures {
  let timer: number | null = null;
  let touching = false;

  const settle = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      if (!touching) done();
    }, SELECTION_SETTLED_MS);
  };

  // Only selections the reader made with a finger. A caret moved by typing
  // changes the selection too, and offering to mark on every keystroke would
  // be unbearable.
  const start = () => { touching = true; };
  const end = () => { touching = false; settle(); };

  document.addEventListener('touchstart', start, { passive: true });
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('selectionchange', () => { if (touching) return; settle(); });

  return {
    dispose() {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchend', end);
    },
  };
}

/**
 * Call `press` when a finger rests on something without moving.
 *
 * The target is the element under the finger where it went down, not where it
 * came up, so a press that drifts a little still acts on what was pressed.
 */
export function onLongPress(press: (target: EventTarget | null, at: Touch) => void): Gestures {
  let timer: number | null = null;
  let from: Touch | null = null;
  let target: EventTarget | null = null;

  const cancel = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    from = null;
  };

  const start = (e: TouchEvent) => {
    if (e.touches.length !== 1) return cancel();
    from = e.touches[0];
    target = e.target;
    timer = window.setTimeout(() => {
      timer = null;
      if (from) press(target, from);
    }, LONG_PRESS_MS);
  };

  const move = (e: TouchEvent) => {
    const now = e.touches[0];
    if (!from || !now) return;
    if (Math.abs(now.clientX - from.clientX) > SLOP_PX ||
        Math.abs(now.clientY - from.clientY) > SLOP_PX) cancel();
  };

  document.addEventListener('touchstart', start, { passive: true });
  document.addEventListener('touchmove', move, { passive: true });
  document.addEventListener('touchend', cancel, { passive: true });
  document.addEventListener('touchcancel', cancel, { passive: true });

  return {
    dispose() {
      cancel();
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', cancel);
      document.removeEventListener('touchcancel', cancel);
    },
  };
}

/**
 * Whether a menu was just raised, so a second gesture doesn't raise another.
 *
 * A long press and a `contextmenu` are the same request, and some platforms
 * send both — a press that Obsidian also reports as a right-click stacked two
 * identical menus on top of each other. Whichever arrives first wins; the
 * other is the same press still being described.
 */
const TOGETHER_MS = 800;
let raisedAt = 0;

export function claimMenu(): boolean {
  const now = Date.now();
  if (now - raisedAt < TOGETHER_MS) return false;
  raisedAt = now;
  return true;
}
