import { z } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import { createProjectSchema, displayHost, missionNumber, sortProjects } from './projects';

const schema = createProjectSchema(() => z.string());

const base = {
  name: 'Test',
  tagline: 'A test project',
  description: 'Does things.',
  order: 1,
};

describe('project schema', () => {
  it('accepts a coming-soon project without url', () => {
    expect(schema.safeParse({ ...base, status: 'coming-soon' }).success).toBe(true);
  });

  it('requires a url for live projects', () => {
    const result = schema.safeParse({ ...base, status: 'live' });
    expect(result.success).toBe(false);
  });

  it('requires alt text when an image is set', () => {
    const result = schema.safeParse({
      ...base,
      status: 'live',
      url: 'https://example.com',
      image: './x.png',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown statuses', () => {
    expect(schema.safeParse({ ...base, status: 'abandoned' }).success).toBe(false);
  });

  it('defaults tech to an empty list', () => {
    const result = schema.parse({ ...base, status: 'coming-soon' });
    expect(result.tech).toEqual([]);
  });
});

describe('sortProjects', () => {
  it('sorts by status, then order', () => {
    const items = [
      { id: 'c', data: { status: 'coming-soon' as const, order: 1 } },
      { id: 'b', data: { status: 'live' as const, order: 2 } },
      { id: 'a', data: { status: 'live' as const, order: 1 } },
      { id: 'd', data: { status: 'in-progress' as const, order: 9 } },
    ];
    expect(sortProjects(items).map((p) => p.id)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('does not mutate the input', () => {
    const items = [
      { data: { status: 'coming-soon' as const, order: 1 } },
      { data: { status: 'live' as const, order: 1 } },
    ];
    const copy = [...items];
    sortProjects(items);
    expect(items).toEqual(copy);
  });
});

describe('helpers', () => {
  it('pads mission numbers', () => {
    expect(missionNumber(0)).toBe('01');
    expect(missionNumber(11)).toBe('12');
  });

  it('formats hosts', () => {
    expect(displayHost('https://www.stramin.vercel.app/x')).toBe('stramin.vercel.app');
  });
});
