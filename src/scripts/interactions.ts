/**
 * Small progressive enhancements, re-initialised on every page load
 * (Astro's ClientRouter keeps this module alive between pages).
 *
 * - [data-scramble]  decodes text from random glyphs when it scrolls into view
 */

const GLYPHS = '!<>-_\\/[]{}=+*^?#01▓▒░';
const motionOk = () => matchMedia('(prefers-reduced-motion: no-preference)').matches;

export function scramble(el: HTMLElement, duration = 900): void {
  const final = (el.dataset.text ?? el.textContent ?? '').trim();
  el.dataset.text = final;
  const start = performance.now();
  const reveal = final
    .split('')
    .map((_, i) => (i / final.length) * duration * 0.7 + Math.random() * duration * 0.3);

  const frame = (now: number) => {
    const elapsed = now - start;
    let out = '';
    for (let i = 0; i < final.length; i++) {
      const ch = final[i] ?? '';
      if (ch === ' ' || elapsed >= (reveal[i] ?? 0)) out += ch;
      else out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }
    el.textContent = out;
    if (elapsed < duration) requestAnimationFrame(frame);
    else el.textContent = final;
  };
  requestAnimationFrame(frame);
}

function initScramble(signal: AbortSignal): void {
  const items = document.querySelectorAll<HTMLElement>('[data-scramble]');
  if (!items.length || !motionOk()) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        scramble(entry.target as HTMLElement);
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  );
  items.forEach((el) => observer.observe(el));
  signal.addEventListener('abort', () => observer.disconnect());
}

let controller: AbortController | undefined;

document.addEventListener('astro:page-load', () => {
  controller?.abort();
  controller = new AbortController();
  initScramble(controller.signal);
});
