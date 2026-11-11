// Tiny handshake between the page loader and the hero timeline.
// The loader calls startIntro() when its exit begins; the hero waits on onIntro().

type Listener = () => void;

let started = false;
const listeners = new Set<Listener>();

export function startIntro() {
  if (started) return;
  started = true;
  listeners.forEach((fn) => fn());
  listeners.clear();
}

export function onIntro(fn: Listener) {
  if (started) {
    fn();
    return () => {};
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const INTRO_SEEN_KEY = "arapoush:intro-seen";
