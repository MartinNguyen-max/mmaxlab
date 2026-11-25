import { z } from 'astro/zod';

export const PROJECT_STATUSES = ['live', 'in-progress', 'coming-soon'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  live: 'Live',
  'in-progress': 'In progress',
  'coming-soon': 'In the lab',
};

/**
 * Builds the project schema. `image` is injected so the same schema can be
 * used by Astro (with its image() helper) and by unit tests.
 */
export function createProjectSchema<TImage extends z.ZodType>(image: () => TImage) {
  return z
    .object({
      name: z.string().min(1),
      tagline: z.string().min(1).max(80),
      description: z.string().min(1).max(320),
      status: z.enum(PROJECT_STATUSES),
      url: z.url().optional(),
      repo: z.url().optional(),
      image: image().optional(),
      imageAlt: z.string().optional(),
      tech: z.array(z.string()).default([]),
      order: z.number().int().nonnegative(),
    })
    .refine((p) => p.status !== 'live' || p.url !== undefined, {
      message: 'Live projects need a url',
      path: ['url'],
    })
    .refine((p) => p.image === undefined || (p.imageAlt?.length ?? 0) > 0, {
      message: 'Images need alt text',
      path: ['imageAlt'],
    });
}

interface Sortable {
  data: { status: ProjectStatus; order: number };
}

const statusRank: Record<ProjectStatus, number> = { live: 0, 'in-progress': 1, 'coming-soon': 2 };

/** Live first, then in progress, then coming soon; `order` within each group. */
export function sortProjects<T extends Sortable>(projects: readonly T[]): T[] {
  return [...projects].sort(
    (a, b) => statusRank[a.data.status] - statusRank[b.data.status] || a.data.order - b.data.order,
  );
}

/** Zero-padded mission number, e.g. 1 → "01". */
export function missionNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

/** Hostname without "www.", for display. */
export function displayHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}
