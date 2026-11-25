import { Vector3 } from 'three';

/**
 * Movement on a unit sphere. A vehicle is described by `up` (its position, a unit vector)
 * and `heading` (a unit tangent). All functions mutate their inputs in place, to avoid
 * allocations in the game loop.
 */

const axis = new Vector3();
const tmp = new Vector3();

/** Keep `heading` tangent to the sphere at `up`, and unit length. */
export function orthonormalize(up: Vector3, heading: Vector3): void {
  up.normalize();
  heading.addScaledVector(up, -heading.dot(up));
  if (heading.lengthSq() < 1e-12) anyTangent(up, heading);
  heading.normalize();
}

/** Any unit vector perpendicular to `up`. */
export function anyTangent(up: Vector3, out: Vector3): Vector3 {
  out.set(1, 0, 0);
  if (Math.abs(up.x) > 0.9) out.set(0, 0, 1);
  return out.addScaledVector(up, -out.dot(up)).normalize();
}

/** Move forward along a great circle by `angle` radians (parallel transport of the heading). */
export function advance(up: Vector3, heading: Vector3, angle: number): void {
  if (angle === 0) return;
  axis.crossVectors(up, heading).normalize();
  up.applyAxisAngle(axis, angle);
  heading.applyAxisAngle(axis, angle);
  orthonormalize(up, heading);
}

/** Rotate the heading around `up`. Positive = counter-clockwise seen from outside (a left turn). */
export function turn(up: Vector3, heading: Vector3, angle: number): void {
  heading.applyAxisAngle(up, angle);
  orthonormalize(up, heading);
}

/** Great-circle angle between two unit vectors. */
export function angleBetween(a: Vector3, b: Vector3): number {
  return Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
}

/**
 * Signed angle from `heading` to the direction of `target`, in the tangent plane at `up`.
 * Positive means the target is to the left.
 */
export function bearingTo(up: Vector3, heading: Vector3, target: Vector3): number {
  tmp.copy(target).addScaledVector(up, -target.dot(up));
  if (tmp.lengthSq() < 1e-12) return 0;
  tmp.normalize();
  const cos = Math.min(1, Math.max(-1, heading.dot(tmp)));
  const sin = axis.crossVectors(heading, tmp).dot(up);
  return Math.atan2(sin, cos);
}

/**
 * Push `up` out of a circular obstacle (centre `center`, angular radius `radius`).
 * Returns true if there was an overlap. Pushing only ever moves outwards, so the
 * vehicle slides around obstacles and can never get stuck inside one.
 */
export function pushOut(up: Vector3, center: Vector3, radius: number): boolean {
  const d = angleBetween(up, center);
  if (d >= radius) return false;
  tmp.copy(up).sub(center);
  tmp.addScaledVector(up, -tmp.dot(up));
  if (tmp.lengthSq() < 1e-12) anyTangent(up, tmp);
  tmp.normalize();
  axis.crossVectors(up, tmp).normalize();
  up.applyAxisAngle(axis, radius - d).normalize();
  return true;
}

/** Point at `polar` radians from `pole`, rotated `azimuth` radians around it from `forward`. */
export function pointAround(
  pole: Vector3,
  forward: Vector3,
  polar: number,
  azimuth: number,
  out = new Vector3(),
): Vector3 {
  const right = tmp.crossVectors(forward, pole).normalize();
  const sinP = Math.sin(polar);
  return out
    .copy(pole)
    .multiplyScalar(Math.cos(polar))
    .addScaledVector(forward, Math.cos(azimuth) * sinP)
    .addScaledVector(right, Math.sin(azimuth) * sinP)
    .normalize();
}

/** Small deterministic PRNG (mulberry32), so the planet looks the same on every visit. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniformly random unit vector. */
export function randomOnSphere(rand: () => number, out = new Vector3()): Vector3 {
  const z = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(a), z, r * Math.sin(a));
}
