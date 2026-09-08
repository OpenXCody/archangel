import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3000/api';

/** Static routes every device profile must render cleanly. */
const STATIC_ROUTES = ['/map', '/explore', '/import', '/import/bulk', '/tree'];

async function firstId(request: APIRequestContext, path: string): Promise<string | null> {
  const res = await request.get(`${API}${path}?limit=1`);
  if (!res.ok()) return null;
  const body = (await res.json()) as { data?: Array<{ id: string }> };
  return body.data?.[0]?.id ?? null;
}

async function assertHealthyLayout(page: Page, label: string): Promise<void> {
  // No sideways scroll: the single most common "broken on mobile" symptom.
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyText: document.body.innerText.trim().length,
    interactive: document.querySelectorAll('canvas, input, button, a[href]').length,
  }));
  expect(metrics.scrollWidth, `${label}: page scrolls horizontally`).toBeLessThanOrEqual(metrics.clientWidth + 1);
  // Something actually rendered (not a blank screen or a crashed boundary):
  // readable text, or — for canvas-first pages like the map — live controls.
  expect(metrics.bodyText > 20 || metrics.interactive >= 3, `${label}: page rendered nothing`).toBe(true);
  await expect(page.getByText('Something went wrong'), `${label}: ErrorBoundary tripped`).toHaveCount(0);
  const file = `test-results/screens/${test.info().project.name}${label.replace(/[/#:]/g, '_')}.png`;
  await page.screenshot({ path: file, fullPage: false });
}

for (const route of STATIC_ROUTES) {
  test(`${route} renders without overflow`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await assertHealthyLayout(page, route);
  });
}

test('entity detail pages render without overflow', async ({ page, request }) => {
  const entities = ['/companies', '/factories', '/skills', '/occupations'];
  for (const base of entities) {
    const id = await firstId(request, base);
    if (!id) continue;
    await page.goto(`${base}/${id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await assertHealthyLayout(page, `${base}/:id`);
  }
});

test('global search opens and is usable', async ({ page }) => {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /search/i }).first().click();
  const input = page.getByRole('textbox').first();
  await expect(input).toBeVisible();
  await input.fill('steel');
  await page.waitForTimeout(1200);
  await assertHealthyLayout(page, '/explore#search');
});
