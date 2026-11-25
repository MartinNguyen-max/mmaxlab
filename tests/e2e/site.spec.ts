import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
  { path: '/', heading: 'M.MaxLab' },
  { path: '/about', heading: "Hi, I'm MartinNguyen-Max." },
  { path: '/404', heading: 'Lost in space.' },
];

for (const { path, heading } of pages) {
  test.describe(`page ${path}`, () => {
    test('renders its main heading', async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(heading);
    });

    test('has no a11y violations in dark mode (WCAG 2.2 AA)', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .exclude('canvas')
        .analyze();
      expect(results.violations).toEqual([]);
    });

    test('has no a11y violations in light mode (the default)', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .exclude('canvas')
        .analyze();
      expect(results.violations).toEqual([]);
    });
  });
}

test('home lists every project in the overview', async ({ page }) => {
  await page.goto('/');
  const list = page.locator('#projects');
  await expect(list.getByRole('heading', { level: 3 })).toHaveCount(6);
  await expect(list.getByRole('list', { name: 'In the lab' }).getByRole('listitem')).toHaveCount(4);
  await expect(list.getByRole('link', { name: 'Stramin', exact: true })).toHaveAttribute(
    'href',
    /^https:\/\//,
  );
});

test.describe('planet game', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard driving is a desktop feature');

  test('drives with the keyboard without scrolling the page', async ({ page }) => {
    await page.goto('/');
    await page.locator('#planet').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-planet]')).toHaveClass(/is-ready/, { timeout: 45_000 });
    await page.getByRole('button', { name: 'Start driving' }).click();
    const before = await page.evaluate(() => scrollY);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowUp');
    expect(await page.evaluate(() => scrollY)).toBe(before);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-planet]')).not.toHaveClass(/is-engaged/);
  });

  test('opening a screen flies in and opens the project in a new tab', async ({
    page,
    context,
  }) => {
    await context.route('https://stramin.vercel.app/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Stramin</title>' }),
    );
    await page.goto('/');
    await page.locator('#planet').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-planet]')).toHaveClass(/is-ready/, { timeout: 45_000 });
    // In the opening shot, Stramin's screen sits left of centre. Clicking it flies in.
    const box = await page.locator('[data-planet-canvas]').boundingBox();
    if (!box) throw new Error('no canvas');
    const newTab = context.waitForEvent('page', { timeout: 20_000 });
    await page.mouse.click(box.x + box.width * 0.255, box.y + box.height * 0.43);
    await expect(page.locator('[data-planet]')).toHaveClass(/is-flying/);
    const tab = await newTab;
    await expect(tab).toHaveURL(/stramin\.vercel\.app/);
    // The hub stays where it was, and the camera returns to the rover.
    await expect(page).toHaveURL(/localhost/);
    await expect(page.locator('[data-planet]')).not.toHaveClass(/is-flying/);
  });
});

test('GitHub link is prominent in the hero', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('.hero').getByRole('link', { name: /MartinNguyen-Max/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://github.com/MartinNguyen-max');
});

test('SEO basics are present', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/M\.MaxLab/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://mmaxlab.com/',
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og\.png$/);
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(jsonLd ?? '{}')['@graph']).toBeDefined();
});

test('robots.txt and sitemap are served', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Sitemap: https://mmaxlab.com/sitemap-index.xml');
  const sitemap = await request.get('/sitemap-0.xml');
  const xml = await sitemap.text();
  expect(xml).toContain('https://mmaxlab.com/about');
  expect(xml).not.toContain('404');
});

test('theme toggle switches and persists', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');
  const toggle = page.getByRole('button', { name: 'Light mode' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(html).not.toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).not.toHaveAttribute('data-theme', 'light');
});

test('client-side navigation keeps the cosmos canvas', async ({ page }) => {
  await page.goto('/');
  await page.locator('canvas.cosmos').evaluate((el) => (el.dataset.marker = 'kept'));
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'About' }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator('canvas.cosmos')).toHaveAttribute('data-marker', 'kept');
});

test('content is fully visible with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const text of [
    'I build apps, games and AI.',
    'This is where they launch.',
    'All projects',
  ]) {
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  }
});
