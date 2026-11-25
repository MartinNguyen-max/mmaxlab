import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  advance,
  angleBetween,
  bearingTo,
  pointAround,
  pushOut,
  randomOnSphere,
  rng,
  turn,
} from './sphere';

const pole = () => new Vector3(0, 1, 0);
const north = () => new Vector3(0, 0, -1);

describe('advance', () => {
  it('keeps position and heading orthonormal', () => {
    const up = pole();
    const heading = north();
    for (let i = 0; i < 500; i++) {
      advance(up, heading, 0.037);
      turn(up, heading, 0.011);
    }
    expect(up.length()).toBeCloseTo(1, 6);
    expect(heading.length()).toBeCloseTo(1, 6);
    expect(up.dot(heading)).toBeCloseTo(0, 6);
  });

  it('returns to the start after a full great circle', () => {
    const up = pole();
    const heading = north();
    for (let i = 0; i < 100; i++) advance(up, heading, (Math.PI * 2) / 100);
    expect(angleBetween(up, pole())).toBeLessThan(1e-6);
  });
});

describe('bearingTo', () => {
  it('is positive for targets on the left', () => {
    const up = pole();
    const heading = north();
    const left = new Vector3(-1, 1, 0).normalize();
    const right = new Vector3(1, 1, 0).normalize();
    expect(bearingTo(up, heading, left)).toBeCloseTo(Math.PI / 2, 5);
    expect(bearingTo(up, heading, right)).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('turning by the bearing points straight at the target', () => {
    const up = pole();
    const heading = north();
    const target = new Vector3(0.3, 0.8, 0.5).normalize();
    turn(up, heading, bearingTo(up, heading, target));
    expect(bearingTo(up, heading, target)).toBeCloseTo(0, 5);
  });
});

describe('pushOut', () => {
  it('moves a point inside an obstacle to its edge', () => {
    const center = pole();
    const up = new Vector3(0.05, 1, 0).normalize();
    expect(pushOut(up, center, 0.2)).toBe(true);
    expect(angleBetween(up, center)).toBeCloseTo(0.2, 6);
  });

  it('handles a point exactly at the centre', () => {
    const up = pole();
    expect(pushOut(up, pole(), 0.1)).toBe(true);
    expect(angleBetween(up, pole())).toBeCloseTo(0.1, 6);
  });

  it('leaves points outside alone', () => {
    const up = new Vector3(1, 1, 0).normalize();
    expect(pushOut(up, pole(), 0.2)).toBe(false);
  });
});

describe('pointAround', () => {
  it('places points at the requested distance', () => {
    const p = pointAround(pole(), north(), 0.6, 1.2);
    expect(angleBetween(p, pole())).toBeCloseTo(0.6, 6);
  });
});

describe('rng', () => {
  it('is deterministic and in range', () => {
    const a = rng(7);
    const b = rng(7);
    for (let i = 0; i < 50; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(randomOnSphere(rng(1)).length()).toBeCloseTo(1, 6);
  });
});
