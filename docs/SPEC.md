# M.MaxLab: Specification

Personal project hub at **mmaxlab.com** by MartinNguyen-Max ([GitHub](https://github.com/MartinNguyen-Max)). It shows hobby projects and work with a cinematic, high-quality feel, so the site itself showcases skills.

## Goals

- Link to all projects. Each project lives on its own subdomain or domain.
- Look exceptional: cinematic scroll animations, minimal layout.
- Fast, accessible (WCAG 2.2 AA), mobile-first, strong SEO.
- Adding a project = adding one file.
- Cost: 0 kr. beyond the domain.

## Stack

Astro 7 · TypeScript strict · vanilla CSS (tokens + scoped styles) · pnpm · ESLint + Prettier · Vitest + Playwright/axe · Vercel. Details: [decisions.md](decisions.md).

## Pages

| Route    | Content                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`      | Hero (**M.MaxLab** wordmark, GitHub link with logo + `MartinNguyen-Max`), a short launch (~1 screen), a drivable mini-planet game, a compact overview of all projects, then footer (GitHub, LinkedIn). |
| `/about` | Short bio (draft by Claude, edited by Martin), skills/stack, links.                                                                                                                                    |
| `404`    | On-brand "lost in space" page.                                                                                                                                                                         |

English only. No blog, no contact form, no email shown. Contact via GitHub + LinkedIn.

## Projects

One Markdown file per project in `src/content/projects/`, validated by a Zod schema:

```yaml
name: Stramin
tagline: Running analytics for Strava & Garmin
description: Two sentences.
status: live # live | in-progress | coming-soon
url: https://stramin.mmaxlab.com
repo: https://github.com/... # optional
image: ./stramin.png # screenshot of the live site; optional for coming-soon
tech: [Next.js, TypeScript]
order: 1
```

| Project                             | Status      | URL                                                 |
| ----------------------------------- | ----------- | --------------------------------------------------- |
| Stramin                             | live        | stramin.mmaxlab.com                                 |
| Rift of Fortune                     | live        | rift-of-fortune.mmaxlab.com                         |
| AI Support Bot (placeholder)        | coming-soon | –                                                   |
| AI Tender Filter (placeholder)      | coming-soon | –                                                   |
| AI Answering Service (placeholder)  | coming-soon | –                                                   |
| Electricity Price App (placeholder) | coming-soon | –                                                   |

**Live previews:** a `pnpm screenshots` script (Playwright) captures each live site's front page into the repo. Astro optimizes them (AVIF/WebP, responsive). No runtime cost, no third-party service.

## Design

- Dark only.
- Warm orange accent, terminal/monospace details, subtle grid. Geist Sans + Geist Mono, self-hosted.
- Custom SVG logo + favicon.
- **Planet game:** a small green low-poly planet (three.js, lazy-loaded) with a rover. Loads only when you press Start, then plays fullscreen (✕ to leave). One screen per live project; driving up to or tapping a screen shows a small card whose Open link opens the site in a new tab. Keyboard (WASD/arrows, Enter, Esc), joystick on touch, drag to look around. The overview list carries the same content for everyone who skips the game.
- **Motion:** WebGL2 background driven by scroll from the first pixel (stars stream from the first scroll → a meteor smashes the black hole into pieces → colour explosion → forward flight past planets → green landing planet), persisted across pages. Native CSS scroll-driven reveals and a pinned film-title sequence. Astro View Transitions between pages. Full `prefers-reduced-motion` support.
- Performance budget: Lighthouse ≥ 95 in all categories on mobile.

## SEO & sharing

Per-page title/description, canonical URLs, Open Graph + Twitter cards, generated OG image, `sitemap.xml` (`@astrojs/sitemap`), `robots.txt`, JSON-LD `Person` schema. Verify in Google Search Console (DNS TXT at Simply).

## Analytics

Vercel Web Analytics: cookieless, no banner needed, free tier.

## Hosting & DNS

- Vercel project `mmaxlab` → `mmaxlab.com`. `www` redirects to the root.
- Simply DNS: apex `A` record and `www` `CNAME` with the values Vercel shows. Each subdomain (`stramin`, `rift`, …) gets a `CNAME` to Vercel and is added in its own Vercel project.
- Preview deploys per PR (Vercel default).

## Quality & CI

GitHub Actions on PR/push: install → lint → format check → `astro check` → unit tests → build → Playwright + axe. Public repo `MartinNguyen-Max/mmaxlab` with a solid README.

## Out of scope (for now)

Blog/devlog, detail pages per project, contact form, i18n.
