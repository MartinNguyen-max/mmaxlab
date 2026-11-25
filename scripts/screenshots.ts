/**
 * Captures the front page of every project that has both `url` and `image`
 * in its frontmatter, and saves it to the image path.
 *
 * Usage: pnpm screenshots            (all projects)
 *        pnpm screenshots stramin    (one project by file name)
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const CONTENT_DIR = path.resolve('src/content/projects');
const VIEWPORT = { width: 1440, height: 900 };

function frontmatterValue(source: string, key: string): string | undefined {
  return new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(source)?.[1]?.trim();
}

const only = process.argv[2];
const files = (await readdir(CONTENT_DIR)).filter(
  (f) => f.endsWith('.md') && (!only || f === `${only}.md`),
);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2, // 2880×1800: sharp on retina screens and as planet textures
  colorScheme: 'dark',
  reducedMotion: 'reduce',
});

for (const file of files) {
  const source = await readFile(path.join(CONTENT_DIR, file), 'utf8');
  const url = frontmatterValue(source, 'url');
  const image = frontmatterValue(source, 'image');
  if (!url || !image) continue;

  const out = path.resolve(CONTENT_DIR, image);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out });
  await page.close();
  console.log(`✓ ${file} → ${path.relative(process.cwd(), out)}`);
}

await browser.close();
