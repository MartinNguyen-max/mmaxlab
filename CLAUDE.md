# CLAUDE.md

Project hub **M.MaxLab** at mmaxlab.com. Spec: [docs/SPEC.md](docs/SPEC.md). Decisions: [docs/decisions.md](docs/decisions.md). Plan: [docs/plan.md](docs/plan.md).

## Commands

```sh
pnpm dev            # dev server
pnpm build          # static build to dist/
pnpm preview        # serve build
pnpm check          # astro check (types)
pnpm lint           # eslint
pnpm format         # prettier --write
pnpm test           # vitest
pnpm test:e2e       # playwright + axe (builds + previews itself)
pnpm screenshots    # capture live project front pages
pnpm og             # regenerate public/og.png (after build)
```

## Conventions

- **Language:** all code, content, and docs in English.
- **Docs:** every decision is logged briefly in `docs/decisions.md`. Keep docs short.
- **TypeScript:** strict (`astro/tsconfigs/strictest`). No `any`, no non-null assertions without reason.
- **Styling:** vanilla CSS. Design tokens in `src/styles/tokens.css`. Component styles are scoped in `.astro` files. No utility frameworks.
- **JS budget:** zero JS by default. Client scripts only for motion/interactivity. They must be small, lazy where possible, and degrade gracefully.
- **Motion:** every animation must respect `prefers-reduced-motion` and must never hide content when JS fails.
- **A11y:** WCAG 2.2 AA. Semantic HTML, visible focus, AA contrast, alt text. axe tests must pass.
- **Projects:** one Markdown file per project in `src/content/projects/` (schema in `src/content.config.ts`).
- **Naming:** components `PascalCase.astro`, utilities `camelCase.ts`, CSS classes kebab-case.
- **Git:** never commit or push without asking Martin first.

## Gotchas

- Only one `astro preview` can run at a time (Astro 7 lockfile). Stop it with `pnpm astro preview stop`.
- Keep `cssMinify: false` in `astro.config.mjs` (see docs/decisions.md) or scroll animations break.
- The planet game (`src/scripts/planet/`) must stay lazy-loaded and pause when off-screen. Driving uses `src/lib/sphere.ts` (unit-tested); obstacles only push outwards, so the rover can never get stuck.
- The shader timeline (`src/scripts/cosmos/shader.ts`) and the launch text ranges (`LaunchSequence.astro`) are tuned together. Change both.
