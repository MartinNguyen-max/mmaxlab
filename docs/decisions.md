# Decisions

Short log of choices and why. Newest at the bottom.

## 2026-11-25 · Tech stack

| Area            | Choice                                                                                                                       | Why                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework       | **Astro 7**                                                                                                                  | Static HTML (SEO, speed), zero JS by default, content collections for "one file per project", React islands if needed. Rust compiler, Vite 8/Rolldown. |
| Styling         | **Vanilla CSS** (Astro scoped styles + CSS custom properties as tokens)                                                      | No dependency; modern CSS (nesting, `:has()`, `light-dark()`, scroll-driven animations) covers it.                                                     |
| Components      | **No library**, own small components                                                                                         | Few components, unique look, full a11y control.                                                                                                        |
| Package manager | **pnpm**                                                                                                                     | Fast, strict, already installed.                                                                                                                       |
| Lint/format     | **ESLint 10** (flat config, `typescript-eslint`, `eslint-plugin-astro`, `jsx-a11y`) + **Prettier** (`prettier-plugin-astro`) | Biome's `.astro` support is still experimental (biomejs.dev). Revisit later.                                                                           |
| TypeScript      | `strict` (Astro `strictest` preset)                                                                                          | TS 7 to be verified with `astro check` at setup; else latest compatible.                                                                               |
| Tests           | **Vitest** (schema/utils) + **Playwright** with **axe** (smoke + a11y on all pages)                                          | Keeps WCAG compliance checked in CI.                                                                                                                   |
| AI tooling      | Astro Docs MCP server in Claude Code (optional)                                                                              | Official, current docs available to the agent.                                                                                                         |

Sources: astro.build/blog/astro-7, docs.astro.build/en/guides/upgrade-to/v7, docs.astro.build/en/guides/build-with-ai, biomejs.dev/internals/language-support.

## 2026-11-25 · Design

| Area       | Choice                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Name       | **M.MaxLab** (M. Max = MartinNguyen-Max). Prominent GitHub link with logo + username below the title.                                         |
| Concept    | "Lab" / space-mission feel. Cinematic scroll: wild, high-quality animations, but minimal layout and clear overview. Purpose: showcase skills. |
| Theme      | **Dark by default**, optional light toggle.                                                                                                   |
| Accent     | **Warm orange**, with terminal/AI details (monospace accents).                                                                                |
| Typography | **Geist Sans + Geist Mono**, self-hosted.                                                                                                     |
| Animation  | **Astro View Transitions** + CSS scroll-driven animations; a WebGL hero as a lazy island. Everything respects `prefers-reduced-motion`.       |
| Logo       | Simple custom SVG wordmark + favicon.                                                                                                         |

## 2026-11-25 · Content

- **English only.**
- Pages: **home** (hero + project links) and **about**. No blog.
- Projects: Stramin, Rift of Fortune, plus 4 upcoming (AI tender filter, AI answering service for tradespeople, Danish support bot, electricity price app). Cards link out; no detail pages.
- All docs in this repo are written in English.
- Contact: GitHub + LinkedIn only, no email. About text: Claude drafts, Martin edits.
- Live projects show a screenshot of their front page (captured by a Playwright script). Upcoming projects use placeholder names and "coming soon".
- Analytics: Vercel Web Analytics. Repo: public at `MartinNguyen-Max/mmaxlab`.

## 2026-11-25 · Build-time findings

| Topic            | Decision                                                                               | Why                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript       | **6.0.3** (not 7)                                                                      | `@astrojs/check` and `typescript-eslint` only support TS < 6.1. Revisit when they support TS 7.                                                                                |
| `jsx-a11y`       | Dropped                                                                                | No ESLint 10 support, and the site has no JSX. axe tests cover a11y.                                                                                                           |
| CSS minify       | `vite.build.cssMinify: false`                                                          | Lightning CSS merges `animation-timeline` into the `animation` shorthand, which browsers reject. That broke every scroll-driven animation. Vercel Brotli keeps the size small. |
| WebGL            | Raw WebGL2 shader, **no three.js / GSAP / Lenis**                                      | ~10 KB instead of 150+ KB. Native CSS scroll-driven animations cover the choreography. No scroll hijacking.                                                                    |
| Theme            | Dark by default, ignores the system setting; the toggle is remembered                  | Matches the brand; light is opt-in.                                                                                                                                            |
| Project URLs     | `*.vercel.app` until the `*.mmaxlab.com` subdomains exist                              | Links must work today. See deployment.md.                                                                                                                                      |
| Images           | Project screenshots and `og.png` are generated by Playwright scripts and committed     | Free, reproducible, the OG image shows the real WebGL hero.                                                                                                                    |
| URLs             | `build.format: 'file'` + Vercel `cleanUrls`                                            | Clean `/about` URLs without trailing slashes. Canonical URLs strip `.html`.                                                                                                    |
| Node             | 26 (`.nvmrc`), CI on Node 26                                                           | Current LTS line.                                                                                                                                                              |
| Security headers | `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` in `vercel.json` | Cheap hardening. CSP postponed (needs hashes for inline scripts).                                                                                                              |

## 2026-11-25 · Feedback round 1

- **Name:** always written **MartinNguyen-Max** (site, docs, metadata).
- **Launch sequence:** 5 lines / 420svh → **3 lines / 240svh** on all screens. Shorter and simpler; the shader timeline is unchanged, the text ranges were re-tuned to it.
- **Missions:** full-width alternating scenes → **compact grid** (screenshot on top, info below, 2 columns on desktop) so a long list stays scannable.
- **About:** removed the "How I work" cards.
- **License:** MIT.
- **Background story:** the hole now pulls matter in, goes supernova (chromatic shockwave) and reveals a multicoloured far side: violet/teal/magenta nebula, spiral galaxies and planets that drift past with parallax (`uAfter`), and a planet horizon with a sunrise at the page end. All still one raw WebGL2 shader.

## 2026-11-25 · Planet game (feedback round 2)

| Topic       | Decision                                                                                                                                                                                        | Why                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Concept     | Hero → ~1-screen launch → drivable mini-planet → compact overview → outro. ~5 screens in total.                                                                                                 | Martin wants it playful but short and quick to scan.                                                           |
| Engine      | **three.js 0.187** (replaces "no three.js"), dynamic `import()` when the section is ~1 screen away.                                                                                             | A real 3D world with shadows and models is not worth hand-writing in raw WebGL. First load stays ~16 KB JS gz. |
| Vehicle     | Rover on a perfect sphere; maths in `src/lib/sphere.ts` (parallel transport, soft push-out collisions).                                                                                         | Friendly to drive, never falls off, can't get stuck. Obstacles are spaced wider than the rover.                |
| Controls    | WASD/arrows only while engaged (Start button, click, focus, or WASD with the planet in view). Esc exits. Tap/click the ground to auto-drive, tap a screen to open.                              | No scroll hijacking; touch works without a joystick.                                                           |
| Opening     | Camera flies into the screen, then the site opens in a **new tab** (the click still counts as a user gesture); the camera glides back. Popup blocked → same tab. Reduced motion: open directly. | Martin wants the hub to stay open.                                                                             |
| Performance | Renders only while visible; adaptive pixel ratio, shadows drop last; cosmos shader pauses while the game covers the screen.                                                                     | Smooth on weak devices, no two full-screen WebGL loops at once.                                                |
| Theme       | **Light by default**, dark optional (stored). Game sky: day in light, sunset in dark.                                                                                                           | Martin wants it brighter.                                                                                      |
| Overview    | Live projects as cards with screenshots, lab projects as a compact row. Replaces missions grid + lab cards.                                                                                     | One screen for everything; also the accessible path for people who skip the game.                              |
| Tests       | Playwright timeouts raised (60 s / 12 s).                                                                                                                                                       | Headless Chrome renders WebGL on the CPU (SwiftShader).                                                        |

- **Screenshots** are captured at 2× (2880×1800) and the overview requests sizes that match the real card width. Before, a 24rem `sizes` hint made browsers upscale a small image, which looked blurry.

## 2026-11-25 · Phone feedback (round 3)

| Topic        | Decision                                                                                                                                                                                                      | Why                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Twitching    | Background canvas sized to `100lvh`; measurements use that height; resize only on width change; redraw immediately after resize.                                                                              | Phone address bars resize the viewport while scrolling, which blanked the canvas and moved the scene. |
| Sideways pan | Launch section `overflow-x: clip` (+ `html`). E2E test checks `scrollWidth` at several scroll positions.                                                                                                      | The launch lines scale to 115 % as they leave and stuck out 29 px.                                    |
| Intro        | Scroll-driven: stars stream from the first pixel, the hole collapses and explodes into colour gas + debris, a green planet rises. No white flash, nothing timed.                                              | Phone feedback: start earlier, more colour, no flashes, smooth when scrolling slowly.                 |
| Game loading | Blurred still (`planet-poster.png`) until **Start**; three.js prefetches on hover/touch of Start and loads on press.                                                                                          | Zero cost for people who don't play; no hitch while scrolling.                                        |
| Play mode    | Start → fullscreen, page scrolling paused; ✕ / Esc exits, ⌂ returns to the landing zone. Header and HUD hidden while playing.                                                                                 | Drag means "look around" in the game and "scroll" on the page; an explicit mode removes the conflict. |
| Controls     | Joystick (touch), WASD/arrows, drag to look, wheel to zoom. Rover turns on the spot. Tap-to-drive removed.                                                                                                    | Tap-to-drive circled around targets behind you; on-the-spot turning means you can't get stuck.        |
| Opening      | Tapping a screen only shows a compact card. Its **Open ↗** is a real `target="_blank"` link (Enter clicks it).                                                                                                | Delayed `window.open` after an animation is blocked by Safari, which fell back to the same tab.       |
| Safari       | WebKit crashes when a view transition snapshots a live WebGL canvas, so the cosmos canvas is `display: none` during page transitions there. A WebKit (iPhone 15) Playwright project now runs the whole suite. | Found by the new iPhone tests.                                                                        |

## 2026-11-25 · Feedback round 4

- **Dark only.** The light theme, its toggle and all light styles are gone; the shader's light mode too. The planet game keeps its sunny sky (the one bright place).
- **Hero GitHub link:** static gradient border; the spinning conic border was distracting.
- **Intro:** a meteor streaks in and hits the black hole at 30 % of the launch; camera shake and a warm flare; the hole shatters into ~30 cracked rock pieces (cells with wobbly, shared boundaries, so they fit together) that fly towards the camera while colour gas and debris reveal the far side.
- **Flight feel:** the background rolls and flies forward to a wandering vanishing point (layers expand at different depths); planets now approach and pass on either side instead of sliding up.
- **Game:** joystick bottom left (tried the right, Martin preferred the left); a solid white **Exit** button.
