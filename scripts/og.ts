/**
 * Generates public/og.png (1200×630) from the real hero, WebGL included,
 * and public/apple-touch-icon.png (180×180) from the favicon.
 *
 * Usage: pnpm build && pnpm og
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { preview } from 'astro';

const PORT = 4329;
const BASE = `http://localhost:${PORT}`;

const server = await preview({ server: { port: PORT }, logLevel: 'warn' });

try {
  const browser = await chromium.launch({
    args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'],
  });

  // Open Graph image
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.addStyleTag({
    content: `.site-header, .telemetry, .scroll-cue, .gh-pill, .grain { display: none !important; }`,
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.resolve('public/og.png') });
  console.log('✓ public/og.png');

  // Apple touch icon
  const svg = await readFile(path.resolve('public/favicon.svg'), 'utf8');
  const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
  await icon.setContent(
    `<body style="margin:0;background:#07060a"><img style="width:180px;height:180px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body>`,
  );
  await icon.screenshot({ path: path.resolve('public/apple-touch-icon.png') });
  console.log('✓ public/apple-touch-icon.png');

  await browser.close();
} finally {
  await server.stop();
}
