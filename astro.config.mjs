// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: 'https://mmaxlab.com',
  trailingSlash: 'never',
  build: { format: 'file' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  integrations: [sitemap()],
  vite: {
    build: {
      // Lightning CSS minification merges `animation-timeline` into the `animation`
      // shorthand, which browsers reject, breaking all scroll-driven animations.
      // CSS stays small and is Brotli-compressed by Vercel. See docs/decisions.md.
      cssMinify: false,
      // three.js (the planet game) is one ~570 KB chunk, loaded lazily near the game only.
      chunkSizeWarningLimit: 700,
    },
  },
  fonts: [
    {
      name: 'Geist',
      cssVariable: '--font-geist-sans',
      provider: fontProviders.fontsource(),
      weights: ['100 900'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
    {
      name: 'Geist Mono',
      cssVariable: '--font-geist-mono',
      provider: fontProviders.fontsource(),
      weights: ['100 900'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],
});
