// A small seeded random number generator (mulberry32): the same seed gives the same city,
// the same traffic and the same screenshot scenes, which is what makes the game repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one entry of `list` with the seeded generator. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** An integer in [min, max] from the seeded generator. */
export function intBetween(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** Clamp a value into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle <= -Math.PI) angle += Math.PI * 2;
  return angle;
}

/** Distance between two points. */
export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}
