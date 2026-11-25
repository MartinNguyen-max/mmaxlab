import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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

    test('has no a11y violations (WCAG 2.2 AA)', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
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

  async function startGame(page: Page) {
    await page.goto('/');
    await page.locator('#planet').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Start driving' }).click();
    await expect(page.locator('[data-planet]')).toHaveClass(/is-playing/, { timeout: 45_000 });
  }

  test('loads only on Start, drives with the keyboard and exits with Escape', async ({ page }) => {
    const gameRequests: string[] = [];
    page.on('request', (r) => {
      if (/\/game\.[\w-]+\.js/.test(r.url())) gameRequests.push(r.url());
    });
    await page.goto('/');
    await page.locator('#planet').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    expect(gameRequests).toHaveLength(0);

    await page.getByRole('button', { name: 'Start driving' }).click();
    await expect(page.locator('[data-planet]')).toHaveClass(/is-playing/, { timeout: 45_000 });
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1000);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-planet]')).not.toHaveClass(/is-playing/);
    await expect(page.getByRole('button', { name: 'Keep driving' })).toBeVisible();
  });

  test('tapping a screen shows its card; only the link opens it, in a new tab', async ({
    page,
    context,
  }) => {
    await context.route('https://stramin.mmaxlab.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Stramin</title>' }),
    );
    // CPU-rendered 3D in headless browsers is slow, especially with other tests running in parallel.
    test.setTimeout(150_000);
    await startGame(page);
    // In the starting view, Stramin's screen is on the left. The camera glides into place after
    // Start (slowly on CPU-rendered CI browsers), so retry the tap until the card shows.
    const box = await page.locator('[data-planet-canvas]').boundingBox();
    if (!box) throw new Error('no canvas');
    const open = page.getByRole('link', { name: /Open Stramin/ });
    await expect(async () => {
      await page.mouse.click(box.x + box.width * 0.13, box.y + box.height * 0.5);
      await expect(open).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 90_000 });
    expect(context.pages()).toHaveLength(1); // tapping did not open anything
    await expect(open).toHaveAttribute('target', '_blank');

    const [tab] = await Promise.all([context.waitForEvent('page'), open.click()]);
    await expect(tab).toHaveURL(/stramin\.vercel\.app/);
    await expect(page).toHaveURL(/localhost/);
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

test('client-side navigation keeps the cosmos canvas', async ({ page }) => {
  await page.goto('/');
  await page.locator('canvas.cosmos').evaluate((el) => (el.dataset.marker = 'kept'));
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'About' }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator('canvas.cosmos')).toHaveAttribute('data-marker', 'kept');
});

test('the page never scrolls sideways', async ({ page }) => {
  await page.goto('/');
  for (const fraction of [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1]) {
    await page.evaluate(
      (f) => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f),
      fraction,
    );
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `at ${fraction * 100}% of the page`).toBeLessThanOrEqual(0);
  }
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
