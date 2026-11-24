import { test, expect, type Locator, type Page, type APIRequestContext } from '@playwright/test';

// Through the app's own address (the dev server proxies /api), so the suite
// tests whichever copy of the app BASE_URL points at.
const API = '/api';

/** Static routes every device profile must render cleanly. */
const STATIC_ROUTES = ['/map', '/explore', '/jobs', '/sign-in'];

async function firstId(request: APIRequestContext, path: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await request.get(`${API}${path}?limit=1`);
      if (!res.ok()) return null;
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      return body.data?.[0]?.id ?? null;
    } catch {
      // the dev API can drop a connection under parallel map loads — try once more
    }
  }
  return null;
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
  await expect(page.getByText('This page could not be shown'), `${label}: ErrorBoundary tripped`).toHaveCount(0);
  // Evidence, not an assertion: a slow tile or font server must not fail a layout check.
  const file = `test-results/screens/${test.info().project.name}${label.replace(/[^A-Za-z0-9._-]/g, '_')}.png`;
  await page.screenshot({ path: file, fullPage: false, timeout: 10_000 }).catch(() => undefined);
}

/**
 * A path is one route down the page at every width: every row that is drawn
 * stands on one left edge, each under the one before it, and no level is
 * named. (The flow before it stood in three level columns from a tablet up.)
 */
async function expectOneRoute(route: Locator, label: string): Promise<void> {
  await expect(route, `${label}: one route`).toHaveCount(1);
  await expect(route, `${label}: no level is named on a route`).not.toContainText(/Fundamentals|Intermediate|Advanced/);
  const rows = await route
    .locator('[data-skill-tag], [data-route-section] > .route-head')
    .evaluateAll((items) => items.filter((item) => (item as HTMLElement).offsetParent !== null).map((item) => item.getBoundingClientRect().toJSON() as { left: number; top: number; bottom: number; height: number }));
  expect(rows.length, `${label}: the route draws rows`).toBeGreaterThan(0);
  for (const [at, row] of rows.entries()) {
    expect(Math.abs(row.left - rows[0].left), `${label}: row ${at} stands in the one column`).toBeLessThanOrEqual(1);
    expect(row.height, `${label}: row ${at} is a full finger tall`).toBeGreaterThanOrEqual(44);
    if (at > 0) expect(row.top, `${label}: row ${at} stands under the one before it`).toBeGreaterThanOrEqual(rows[at - 1].bottom - 1);
  }
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
    // No record means the API is down or empty: that is a failure, not a pass.
    expect(id, `${base}: the API returned a record to open`).toBeTruthy();
    await page.goto(`${base}/${id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await assertHealthyLayout(page, `${base}/:id`);
    // The page drawn is the one for this kind of record, and it has content:
    // a career must not come out as a company page, nor as an empty one.
    const view = page.locator(`[data-entity-view="${base.slice(1)}"]`);
    await expect(view, `${base}/:id draws its own view`).toHaveCount(1);
    expect(await view.locator('section, h2, h3').count(), `${base}/:id has content`).toBeGreaterThan(0);
    // Every detail page says what kind of thing it is in the same place: one word above the name.
    const kind = { '/companies': 'Company', '/factories': 'Factory', '/skills': 'Skill', '/occupations': 'Career' }[base];
    await expect(view.locator('[data-detail-kind]'), `${base}/:id names its kind`).toHaveText(kind as string);
  }
});

test('a career page shows its path, a company page its factories', async ({ page, request }) => {
  const career = await firstId(request, '/occupations');
  expect(career, 'the API returned a career to open').toBeTruthy();
  await page.goto(`/occupations/${career}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-entity-view="occupations"]')).toHaveCount(1);
  await expect(page.locator('#skills')).toBeVisible();
  // The path is one route: stops down one line, a section for each run of one skill group, at every width.
  const flow = page.locator('[data-route]');
  await expectOneRoute(flow, 'a career');
  const tags = flow.locator('[data-skill-tag]');
  expect(await tags.count(), 'the route holds skills').toBeGreaterThan(0);
  await expect(flow.locator('[data-route-count]')).toHaveText(new RegExp(`^${await tags.count()} skills?$`));
  // To a visitor a row is the skill's name, which opens its page: no mark, ring, Next or figure but a section's size.
  await expect(tags.first().locator('a')).toHaveAttribute('href', /^\/skills\/[0-9a-f-]{36}$/);
  await expect(flow.locator('[data-skill-tag] button')).toHaveCount(0);
  await expect(flow.locator('[data-status], [data-route-state], [data-next], [data-share-ring], [data-skill-mark]')).toHaveCount(0);
  await expect(page.locator('[data-next-up], [data-route-aside], [data-held-count]')).toHaveCount(0);
  for (const figure of await flow.locator('[data-section-count]').allInnerTexts()) expect(figure).toMatch(/^\d+ skills$/);
  // Every section is open for a visitor, so every skill of the path is there to read.
  await expect(flow.locator('[data-route-section]:not([data-open])')).toHaveCount(0);
  expect(await tags.evaluateAll((items) => items.every((item) => (item as HTMLElement).offsetParent !== null))).toBe(true);
  // Every row stays inside the route, however long its name, and from a tablet up the route is one narrow column.
  const diagram = await flow.boundingBox();
  for (const box of await tags.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().toJSON() as { left: number; right: number; height: number }))) {
    expect(box.left, 'a row starts inside the route').toBeGreaterThanOrEqual((diagram?.x ?? 0) - 13);
    expect(box.right, 'a row ends inside the route').toBeLessThanOrEqual((diagram?.x ?? 0) + (diagram?.width ?? 0) + 1);
    expect(box.right - box.left, 'the route is one column, never wider than 560px and its marks').toBeLessThanOrEqual(573);
  }
  // The same skills among all the others: one switch away, on the Atlas.
  const pathViews = page.getByRole('navigation', { name: 'Path as' });
  await expect(pathViews.locator('[aria-current="page"]')).toHaveText('Route');
  await expect(pathViews.getByRole('link', { name: 'Atlas' })).toHaveAttribute('href', `/occupations/${career}?path=atlas`);
  await assertHealthyLayout(page, '/occupations/:id path');

  // A skill's page says where the skill sits: its domain and group, each a link into the Skills list, and its level.
  const skill = await firstId(request, '/skills');
  expect(skill, 'the API returned a skill to open').toBeTruthy();
  await page.goto(`/skills/${skill}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-skill-domain]')).toHaveAttribute('href', /^\/explore\?tab=skills&domain=[a-z0-9-]+$/);
  await expect(page.locator('[data-skill-group]')).toHaveAttribute('href', /^\/explore\?tab=skills&domain=[a-z0-9-]+&group=[a-z0-9-]+$/);
  await expect(page.locator('[data-skill-level]')).toHaveText(/^(Fundamentals|Intermediate|Advanced)$/);

  // A skill with others in its group is shown among them: the group's frame, this skill the one tag that is not a link.
  const path = (await (await request.get(`${API}/occupations/${career}`)).json()) as { skills: Array<{ id: string }> };
  for (const each of path.skills) {
    const detail = (await (await request.get(`${API}/skills/${each.id}`)).json()) as { name: string; group: { name: string }; groupSkills: unknown[] };
    if (detail.groupSkills.length === 0) continue;
    await page.goto(`/skills/${each.id}`, { waitUntil: 'domcontentloaded' });
    const group = page.locator('#group [data-group-box]');
    await expect(group.locator('legend')).toContainText(detail.group.name);
    await expect(group.locator('[data-skill-tag]')).toHaveCount(detail.groupSkills.length + 1);
    await expect(group.locator('[data-skill-tag][data-current]')).toHaveText(detail.name);
    await expect(group.locator('[data-skill-tag][data-current] a')).toHaveCount(0);
    await assertHealthyLayout(page, '/skills/:id group');
    break;
  }

  const company = await firstId(request, '/companies');
  expect(company, 'the API returned a company to open').toBeTruthy();
  await page.goto(`/companies/${company}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-entity-view="companies"]')).toHaveCount(1);
  await expect(page.locator('#skills')).toHaveCount(0);
});

/** A career of the catalogue, by its exact title, with its ladder as the API gives it. */
async function careerByTitle(request: APIRequestContext, title: string) {
  const list = (await (await request.get(`${API}/occupations?search=${encodeURIComponent(title)}&limit=20`)).json()) as { data: Array<{ id: string; title: string }> };
  const found = list.data.find((career) => career.title === title);
  expect(found, `the catalogue has ${title}`).toBeTruthy();
  return (await (await request.get(`${API}/occupations/${found!.id}`)).json()) as {
    id: string;
    title: string;
    home: { slug: string; name: string } | null;
    leadsTo: Array<{ id: string; title: string }>;
    comesFrom: Array<{ id: string; title: string }>;
    skills: Array<{ id: string; name: string; group: { slug: string; name: string } | null }>;
  };
}

test('a career stands on its ladder, and the Careers list narrows to a home', async ({ page, request }) => {
  // Seven careers lead to this one and it leads to three: the widest ladder in the catalogue.
  const wide = await careerByTitle(request, 'Maintenance Technician');
  expect(wide.comesFrom.length, 'several careers lead to it').toBeGreaterThan(4);
  await page.goto(`/occupations/${wide.id}`, { waitUntil: 'domcontentloaded' });
  const flow = page.locator('[data-route]');
  const before = flow.locator('[data-path-ladder="before"]');
  const after = flow.locator('[data-path-ladder="after"]');
  await expect(before).toContainText('Comes from');
  // Three are named and the rest wait behind one word, so the path itself is not pushed off the screen.
  await expect(before.locator('a')).toHaveText(wide.comesFrom.slice(0, 3).map((career) => career.title));
  await expect(before.locator('[data-ladder-more]')).toHaveText(`${wide.comesFrom.length - 3} more`);
  await assertHealthyLayout(page, '/occupations/:id ladder');
  await before.locator('[data-ladder-more]').click();
  await expect(before.locator('a')).toHaveText(wide.comesFrom.map((career) => career.title));
  await expect(before.locator('[data-ladder-more]')).toHaveCount(0);
  // Where it leads, in the order the catalogue keeps, each to that career's page.
  await expect(after).toContainText('Leads to');
  await expect(after.locator('a')).toHaveText(wide.leadsTo.map((career) => career.title));
  await expect(after.locator('a').first()).toHaveAttribute('href', `/occupations/${wide.leadsTo[0].id}`);
  // Every rung is a full finger's height and stays inside the route, however long its title.
  const diagram = await flow.boundingBox();
  for (const box of await flow.locator('[data-path-ladder] a').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().toJSON() as { left: number; right: number; height: number }))) {
    expect(box.height, 'a rung is at least 44px tall').toBeGreaterThanOrEqual(44);
    expect(box.left, 'a rung starts inside the diagram').toBeGreaterThanOrEqual((diagram?.x ?? 0) - 1);
    expect(box.right, 'a rung ends inside the diagram').toBeLessThanOrEqual((diagram?.x ?? 0) + (diagram?.width ?? 0) + 1);
  }
  await assertHealthyLayout(page, '/occupations/:id ladder open');

  // A first rung with three after it: nothing stands before the first stop.
  const first = await careerByTitle(request, 'Production Operator');
  expect([first.comesFrom.length, first.leadsTo.length]).toEqual([0, 3]);
  await page.goto(`/occupations/${first.id}`, { waitUntil: 'domcontentloaded' });
  await expectOneRoute(flow, 'a first rung');
  await expect(flow.locator('[data-path-ladder="before"]')).toHaveCount(0);
  await expect(flow.locator('[data-path-ladder="after"] a')).toHaveText(first.leadsTo.map((career) => career.title));
  await assertHealthyLayout(page, '/occupations/:id first rung');

  // A career on no ladder: the path alone.
  const alone = await careerByTitle(request, 'Hydraulics Technician');
  expect(alone.comesFrom.length + alone.leadsTo.length).toBe(0);
  await page.goto(`/occupations/${alone.id}`, { waitUntil: 'domcontentloaded' });
  await expectOneRoute(flow, 'a career on no ladder');
  await expect(flow.locator('[data-path-ladder]')).toHaveCount(0);

  // A career whose path is not written yet still stands between the careers around it.
  const unwritten = await careerByTitle(request, 'Aircraft Engine Mechanic');
  if (unwritten.skills.length === 0) {
    await page.goto(`/occupations/${unwritten.id}`, { waitUntil: 'domcontentloaded' });
    const bare = page.locator('[data-path-unwritten]');
    await expect(bare).toContainText('Path not written yet.');
    await expect(bare.locator('[data-path-ladder="before"] a')).toHaveText(unwritten.comesFrom.map((career) => career.title));
    await expect(bare.locator('[data-path-ladder="after"] a')).toHaveText(unwritten.leadsTo.map((career) => career.title));
    await assertHealthyLayout(page, '/occupations/:id unwritten');
  }

  // The home stands under the name and opens the Careers list narrowed to it.
  await page.goto(`/occupations/${wide.id}`, { waitUntil: 'domcontentloaded' });
  const home = page.locator('[data-career-home]');
  await expect(home).toHaveText(wide.home!.name);
  await home.click();
  await expect(page).toHaveURL(new RegExp(`/explore\\?tab=occupations&domain=${wide.home!.slug}$`));
  await expect(page.getByRole('button', { name: `Domain: ${wide.home!.name}` })).toBeVisible();
  const inHome = (await (await request.get(`${API}/occupations?domain=${wide.home!.slug}&limit=1`)).json()) as { total: number };
  await expect(page.locator('[data-explore-count]')).toHaveText(`${inHome.total} careers`);
  // The rows are of that domain, and do not each repeat what the filter says.
  const row = page.locator('main a[href^="/occupations/"]').first();
  await expect(row).toBeVisible();
  await expect(row).not.toContainText(`${wide.home!.name} ·`);
  await assertHealthyLayout(page, '/explore?tab=occupations&domain');

  // Another domain is chosen from the list of them, and written to the address; Clear puts the list back.
  const facets = (await (await request.get(`${API}/explore/facets`)).json()) as { careerDomains: { slug: string; name: string }[] };
  const other = facets.careerDomains.find((domain) => domain.slug !== wide.home!.slug)!;
  await page.getByRole('button', { name: `Domain: ${wide.home!.name}` }).click();
  await page.getByRole('menuitemradio', { name: other.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`domain=${other.slug}(&|$)`));
  await expect(page.getByRole('button', { name: `Domain: ${other.name}` })).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page).not.toHaveURL(/domain=/);
  const all = (await (await request.get(`${API}/occupations?limit=1`)).json()) as { total: number };
  await expect(page.locator('[data-explore-count]')).toHaveText(`${all.total} careers`);
  // With every domain in the list, a row says which is its career's home.
  await expect(page.getByRole('button', { name: 'Domain: All domains' })).toBeVisible();
  await expect(page.locator('main a[href^="/occupations/"]').first()).toContainText(/^[\s\S]*(Production|Machining|Fabrication|Materials|Assembly|Electronics|Semiconductor|Battery and electric drive|Process|Quality|Nondestructive testing|Test|Maintenance|Automation|Engineering) · \d+ skills/);

  // A title that was folded into a career finds that career, which says the name it was found by.
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await dialog.getByRole('combobox').fill('Cleanroom Technician');
  const hit = dialog.getByRole('option', { name: /Wafer Fab Operator/ });
  await expect(hit).toBeVisible();
  await expect(hit).toContainText('Also called Cleanroom Technician');
  await assertHealthyLayout(page, '/explore#search folded title');
});

test('industry pages render without overflow', async ({ page, request }) => {
  await page.goto('/industries', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-industries-view] [data-figure-list] a').first(), 'the list of industries is drawn').toBeVisible();
  await assertHealthyLayout(page, '/industries');

  // The industry with the most factories in the sample's fullest state: a page with every part.
  const res = await request.get(`${API}/industries?state=TX`);
  expect(res.ok(), 'the API lists industries for a state').toBe(true);
  const list = (await res.json()) as { industries: { slug: string; plants: number }[] };
  const fullest = [...list.industries].sort((a, b) => b.plants - a.plants)[0];
  expect(fullest?.plants ?? 0, 'the sample has factories with an industry in Texas').toBeGreaterThan(0);
  await page.goto(`/industries/${fullest.slug}?state=TX`, { waitUntil: 'domcontentloaded' });
  const view = page.locator('[data-industry-view]');
  await expect(view.locator('[data-figures]'), 'the figures are drawn').toBeVisible();
  await expect(page.locator('[data-place-choice]'), 'the place can be changed').toBeVisible();
  await expect(view.locator('[data-open-map]'), 'the way to the map is there').toHaveAttribute('href', /^\/map\?industry=.+&state=TX$/);
  expect(await view.locator('section').count(), 'the page has its parts').toBeGreaterThan(0);
  await expect(page).toHaveTitle(/ in Texas · Archangel$/);
  await assertHealthyLayout(page, '/industries/:slug?state=TX');

  // The same industry for the country: the states it is largest in, each a link to that state's page.
  await page.goto(`/industries/${fullest.slug}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#where a[href*="?state="]').first(), 'the states are listed').toBeVisible();
  await assertHealthyLayout(page, '/industries/:slug');

  // An address that names no industry says so and offers the list.
  await page.goto('/industries/not-an-industry', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('This industry is not listed')).toBeVisible();
});

test('global search opens and is usable', async ({ page }) => {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Search' });
  const input = dialog.getByRole('combobox');
  await expect(input).toBeVisible();
  // With nothing typed there is the field and nothing else to choose.
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await input.fill('tex');
  // The groups come in the one order every search here uses, under its words.
  await expect(dialog.getByRole('option').first()).toBeVisible();
  const headings = await dialog.locator('[role="group"] > [role="presentation"]').allInnerTexts();
  const order = ['States and areas', 'Industries', 'Companies', 'Factories', 'Careers', 'Skills', 'Jobs'];
  const found = headings.map((heading) => order.findIndex((word) => word.toLowerCase() === heading.trim().toLowerCase()));
  expect(found.every((at) => at !== -1), `group headings are the shared words: ${headings.join(', ')}`).toBe(true);
  expect(found, 'groups are in the shared order').toEqual([...found].sort((a, b) => a - b));
  expect(headings[0].trim().toLowerCase(), 'the state the text starts leads').toBe('states and areas');
  await assertHealthyLayout(page, '/explore#search');
});

test('Explore holds every level, and the header says where you are', async ({ page, request }) => {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' });
  const tabs = page.getByRole('navigation', { name: 'Explore' });
  // By their names: each label also holds an unseen copy of itself, which keeps its width when it turns bold.
  await expect(tabs.getByRole('link').first()).toBeVisible();
  const names = await tabs.getByRole('link').evaluateAll((links) => links.map((link) => (link as HTMLElement).innerText.trim()));
  expect(names).toEqual(['Overview', 'Industries', 'Companies', 'Factories', 'Careers', 'Skills']);
  await expect(tabs.locator('[aria-current="page"]')).toHaveAccessibleName('Overview');
  // Six labels do not fit a phone, and the row scrolls. At rest on a 375 px phone the first four are whole:
  // "Factories" is not cut at the row's edge.
  const screen = page.viewportSize();
  if (screen && screen.width >= 375 && screen.width < 640) {
    await page.setViewportSize({ width: 375, height: screen.height });
    await expect
      .poll(() =>
        tabs.evaluate((row) => {
          const edge = row.getBoundingClientRect().right;
          return [...row.querySelectorAll('a')].filter((link) => link.getBoundingClientRect().right <= edge + 0.5).map((link) => (link as HTMLElement).innerText.trim());
        })
      )
      .toEqual(['Overview', 'Industries', 'Companies', 'Factories']);
    await page.setViewportSize(screen);
  }
  // The overview's sections are the tabs' words in the tabs' order.
  // (Asked until it is so: the page holds its place with three of them while the answer loads.)
  await expect.poll(() => page.locator('main h2').allInnerTexts()).toEqual(['Industries', 'Companies', 'Factories', 'Careers', 'Skills']);

  // The header names its three places in words at every width, and lights the one this page belongs to.
  const main = page.getByRole('navigation', { name: 'Main' });
  await expect(main.getByRole('link')).toHaveText(['Map', 'Explore', 'Jobs']);
  for (const link of await main.getByRole('link').all()) await expect(link).toBeVisible();
  await expect(main.locator('[aria-current="page"]')).toHaveText('Explore');

  // The industries are a tab of Explore, at their own address.
  await tabs.getByRole('link', { name: 'Industries' }).click();
  await expect(page).toHaveURL(/\/industries$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore');
  await expect(tabs.locator('[aria-current="page"]')).toHaveAccessibleName('Industries');
  await expect(main.locator('[aria-current="page"]')).toHaveText('Explore');

  // The last tab: where the row is wider than the screen it has scrolled the current tab into sight.
  await page.goto('/explore?tab=skills', { waitUntil: 'domcontentloaded' });
  const current = tabs.locator('[aria-current="page"]');
  await expect(current).toHaveAccessibleName('Skills');
  await expect(page.locator('[data-explore-count]')).toHaveText(/^[\d,]+ skills$/);
  const seen = await current.evaluate((el) => {
    const nav = el.closest('nav') as HTMLElement;
    const a = el.getBoundingClientRect();
    const b = nav.getBoundingClientRect();
    return a.left >= b.left - 1 && a.right <= b.right + 1;
  });
  expect(seen, 'the current tab is in sight').toBe(true);
  await assertHealthyLayout(page, '/explore?tab=skills');

  // The Skills list narrows by domain, then by one of its groups; a row's grey line is its group and level.
  await expect(page.getByRole('button', { name: 'Domain: All domains' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Group:/ })).toHaveCount(0);
  const facets = (await (await request.get(`${API}/explore/facets`)).json()) as {
    skillDomains: { slug: string; name: string; groups: { slug: string; name: string }[] }[];
  };
  const domain = facets.skillDomains[0];
  const group = domain.groups[0];
  const narrowed = `/explore?tab=skills&domain=${domain.slug}&group=${group.slug}`;
  await page.goto(narrowed, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: `Domain: ${domain.name}` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Group: ${group.name}` })).toBeVisible();
  // The list opens in the taxonomy's order: the domain's heading, the group's over its skills, each skill with its level.
  await expect(page.getByRole('button', { name: 'Sort: By domain' })).toBeVisible();
  await expect(page.locator(`[data-skill-domain="${domain.slug}"] h2`)).toHaveText(domain.name);
  await expect(page.locator('[data-skill-group]')).toHaveCount(1);
  await expect(page.locator(`[data-skill-group="${group.slug}"] h3`)).toHaveText(group.name);
  const rows = page.locator(`[data-skill-group="${group.slug}"] a[href^="/skills/"]`);
  await expect(rows.first().locator('[data-skill-level]')).toHaveText(/^(Fundamentals|Intermediate|Advanced)$/);
  await expect(page.locator('[data-explore-count]')).toHaveText(new RegExp(`^${await rows.count()} skills?$`));
  // One switch leads to the same group on the Atlas, and the domain's heading to the domain there.
  const views = page.getByRole('navigation', { name: 'Skills as' });
  await expect(views.locator('[aria-current="page"]')).toHaveText('List');
  await expect(views.getByRole('link', { name: 'Atlas' })).toHaveAttribute('href', `/atlas?group=${group.slug}`);
  await expect(page.locator(`[data-skill-domain="${domain.slug}"] a[href^="/atlas"]`)).toHaveAttribute('href', `/atlas?domain=${domain.slug}`);
  await assertHealthyLayout(page, narrowed);
  // Sorted another way it is a plain list again; a row's grey line is its group and level.
  await page.goto(`${narrowed}&sort=careers-desc`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main a[href^="/skills/"]').first()).toContainText(new RegExp(`${group.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · (Fundamentals|Intermediate|Advanced)`));
  await expect(page.locator('[data-skill-tree]')).toHaveCount(0);

  // The factories list says factories, and a list's own count follows its filters.
  await page.goto('/explore?tab=factories&state=TX', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-explore-count]')).toHaveText(/^[\d,]+ (factory|factories)$/);
  await assertHealthyLayout(page, '/explore?tab=factories&state=TX');

  // A record's page belongs to Explore; the wordmark, where there is room for it, leads to the map.
  const company = await firstId(request, '/companies');
  await page.goto(`/companies/${company}`, { waitUntil: 'domcontentloaded' });
  await expect(main.locator('[aria-current="page"]')).toHaveText('Explore');
  const wordmark = page.getByRole('link', { name: 'Archangel: the map' });
  if (await wordmark.isVisible()) await expect(wordmark).toHaveAttribute('href', '/map');
});

interface AtlasTaxonomy {
  domains: { slug: string; name: string; groups: { slug: string; name: string; skills: { id: string; name: string; level: number }[] }[] }[];
}

test('the Atlas draws every skill, opens a domain and a group, and takes a career laid over it', async ({ page, request }) => {
  const taxonomy = (await (await request.get(`${API}/skills/taxonomy`)).json()) as AtlasTaxonomy;
  const skills = taxonomy.domains.flatMap((domain) => domain.groups.flatMap((group) => group.skills));
  expect(skills.length, 'the API returned the taxonomy').toBeGreaterThan(0);
  const placed = new Set(skills.map((skill) => skill.id));

  // The whole atlas: one leaf per skill, every domain named, the plate as wide as the page lets it be and square.
  await page.goto('/atlas', { waitUntil: 'domcontentloaded' });
  const plate = page.locator('.atlas-plate');
  await expect(plate).toHaveAttribute('data-atlas-view', 'whole');
  await expect(plate.locator('.atlas-leaf')).toHaveCount(skills.length);
  await expect(plate.locator('.atlas-name')).toHaveText(taxonomy.domains.map((domain) => domain.name));
  await expect(plate.locator('.atlas-name').first()).toBeVisible();
  const box = await plate.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  // The rim, read from the drawing itself: where each domain's name is set, in the drawing's own units, and its colour.
  await page.evaluate(() => document.fonts.ready);
  const rim = await plate.locator('.atlas-name').evaluateAll((names) =>
    names.map((name) => {
      const text = name as SVGTextElement;
      const count = text.getNumberOfChars();
      const start = text.getStartPositionOfChar(0);
      const end = text.getEndPositionOfChar(count - 1);
      const middle = text.getStartPositionOfChar(Math.floor(count / 2));
      const clock = (point: DOMPoint) => (Math.atan2(point.x, -point.y) + Math.PI * 2) % (Math.PI * 2);
      const view = (text.ownerSVGElement as SVGSVGElement).viewBox.baseVal;
      return {
        slug: text.getAttribute('data-atlas-domain'),
        row: text.getAttribute('data-row'),
        // Whichever way the text runs, its two ends as angles clockwise from the top.
        ends: [clock(start), clock(end)],
        x: middle.x,
        y: middle.y,
        reach: Math.max(Math.hypot(start.x, start.y), Math.hypot(end.x, end.y)),
        half: view.width / 2,
        fill: getComputedStyle(text).fill,
        size: parseFloat(getComputedStyle(text).fontSize) * (text.ownerSVGElement as SVGSVGElement).getBoundingClientRect().width / view.width,
      };
    })
  );
  expect(rim.length).toBe(taxonomy.domains.length);
  // The last domain (Safety) is never at the top: its name is in the lower left of the plate, and the name at the top is another's.
  const lastName = rim[rim.length - 1];
  expect(lastName.x < 0 && lastName.y > 0, `the last domain, ${lastName.slug}, is at the lower left`).toBe(true);
  const topName = [...rim].sort((a, b) => a.y - b.y)[0];
  expect(topName.slug, 'the name at the top of the plate').not.toBe(lastName.slug);
  expect(rim.every((name) => name.y >= topName.y), 'nothing is above the top name').toBe(true);
  // Every name is whole and inside the frame, large enough to read, and none runs into another on its row.
  for (const name of rim) {
    expect(name.reach, `${name.slug} is inside the frame`).toBeLessThan(name.half);
    expect(name.size, `${name.slug} is set at a readable size`).toBeGreaterThanOrEqual(9.5);
  }
  const span = (ends: number[]) => {
    // The short way between the two ends: a name never takes half the rim.
    const [a, b] = ends;
    const gap = (b - a + Math.PI * 2) % (Math.PI * 2);
    return gap <= Math.PI ? { from: a, size: gap } : { from: b, size: Math.PI * 2 - gap };
  };
  for (const a of rim) {
    for (const b of rim) {
      if (a === b || a.row !== b.row) continue;
      const one = span(a.ends);
      const other = span(b.ends);
      const offset = (other.from - one.from + Math.PI * 2) % (Math.PI * 2);
      expect(offset >= one.size - 1e-6 && Math.PI * 2 - offset >= other.size - 1e-6, `${a.slug} and ${b.slug} do not overlap on the rim`).toBe(true);
    }
  }
  // Each domain has its hue, on the rim: no arc is its neighbour's colour, a domain's leaves are tinted with its arc's
  // colour, and the swatch beside its word in the panel is the same. The names are ink, all one colour and none a hue.
  const arcs = await plate.locator('.atlas-base .atlas-ring').evaluateAll((rings) => rings.map((ring) => getComputedStyle(ring).stroke));
  expect(arcs.length).toBe(taxonomy.domains.length);
  arcs.forEach((arc, i) => expect(arc, `${taxonomy.domains[i].slug} and the next domain differ in colour`).not.toBe(arcs[(i + 1) % arcs.length]));
  const firstDomain = plate.locator(`.atlas-base [data-domain="${taxonomy.domains[0].slug}"]`);
  expect(await firstDomain.locator('.atlas-leaf').first().evaluate((leaf) => getComputedStyle(leaf).fill)).toBe(arcs[0]);
  expect(await page.locator(`[data-atlas-row="${taxonomy.domains[0].slug}"] .domain-swatch`).evaluate((swatch) => getComputedStyle(swatch).backgroundColor)).toBe(arcs[0]);
  expect(new Set(rim.map((name) => name.fill)).size, 'the names are one ink').toBe(1);
  expect(arcs, 'no name is set in a hue').not.toContain(rim[0].fill);
  expect(box && Math.abs(box.width - box.height) <= 1, 'the plate is square').toBe(true);
  expect(box && box.x >= 0 && box.x + box.width <= width + 1, 'the plate is inside the page').toBe(true);
  if (width < 600) expect(box && box.width >= width - 40, 'on a phone the plate is the full width').toBe(true);
  await assertHealthyLayout(page, '/atlas');
  // It lives under Explore's heading and the Skills tab, with the one switch back to the list.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore');
  await expect(page.getByRole('navigation', { name: 'Explore' }).locator('[aria-current="page"]')).toHaveAccessibleName('Skills');
  await expect(page.getByRole('navigation', { name: 'Main' }).locator('[aria-current="page"]')).toHaveText('Explore');
  const views = page.getByRole('navigation', { name: 'Skills as' });
  await expect(views.locator('[aria-current="page"]')).toHaveText('Atlas');
  await expect(views.getByRole('link', { name: 'List' })).toHaveAttribute('href', '/explore?tab=skills');
  // The same tree as a list of links: every domain.
  const panel = page.locator('[data-atlas-panel]');
  await expect(panel.locator('[data-atlas-row]')).toHaveCount(taxonomy.domains.length);

  // Pressing the drawing opens the domain under the finger; Back returns to the whole.
  if (box) await page.mouse.click(box.x + box.width * 0.24, box.y + box.height * 0.5);
  await expect(page).toHaveURL(/\/atlas\?domain=[a-z0-9-]+$/);
  await expect(plate).toHaveAttribute('data-atlas-view', 'domain');
  await page.goBack();
  await expect(page).toHaveURL(/\/atlas$/);
  await expect(plate).toHaveAttribute('data-atlas-view', 'whole');

  // Choosing a domain in the list turns to it and names its groups, in the drawing and in the list.
  const domain = taxonomy.domains[Math.min(4, taxonomy.domains.length - 1)];
  await panel.locator(`[data-atlas-row="${domain.slug}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/atlas\\?domain=${domain.slug}$`));
  await expect(plate).toHaveAttribute('data-atlas-view', 'domain');
  await expect(plate.locator('[data-atlas-label="group"]')).toHaveCount(domain.groups.length);
  // Its groups are named level, in one column inside the frame, none on another, and clear of the way back to the whole.
  await page.waitForTimeout(900);
  const frameBox = await plate.boundingBox();
  const whole = await page.locator('[data-atlas-whole]').boundingBox();
  const named = await plate.locator('[data-atlas-label]').evaluateAll((labels) =>
    labels.map((label) => {
      const box = label.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, level: !label.hasAttribute('transform') };
    })
  );
  for (const [i, label] of named.entries()) {
    expect(label.level, 'a name beside the open domain is level').toBe(true);
    if (frameBox) expect(label.x >= frameBox.x && label.right <= frameBox.x + frameBox.width + 1 && label.y >= frameBox.y && label.bottom <= frameBox.y + frameBox.height + 1, 'inside the frame').toBe(true);
    if (i > 0) expect(label.y, 'one under another').toBeGreaterThanOrEqual(named[i - 1].bottom - 2);
    if (whole) expect(label.x > whole.x + whole.width || label.bottom < whole.y || label.y > whole.y + whole.height, 'clear of "Whole atlas"').toBe(true);
  }
  expect(new Set(named.map((label) => Math.round(label.x))).size, 'one column').toBe(1);
  await expect(panel.locator('[data-atlas-heading]')).toHaveText(domain.name);
  await expect(panel.locator('[data-atlas-row]')).toHaveCount(domain.groups.length);
  await expect(views.getByRole('link', { name: 'List' })).toHaveAttribute('href', `/explore?tab=skills&domain=${domain.slug}`);
  await assertHealthyLayout(page, '/atlas?domain');

  // A group: its skills are named on the drawing and are tags in the list, under their levels.
  const group = domain.groups[0];
  await panel.locator(`[data-atlas-row="${group.slug}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/atlas\\?group=${group.slug}$`));
  await expect(plate.locator('[data-atlas-label="skill"]')).toHaveCount(group.skills.length);
  await expect(panel.locator('[data-atlas-tag]')).toHaveCount(group.skills.length);
  await expect(panel.locator('[data-atlas-level-block] h4').first()).toHaveText(/^(Fundamentals|Intermediate|Advanced)$/);
  await assertHealthyLayout(page, '/atlas?group');

  // A skill: its level, how many careers use it, and the way to its page. The crumbs lead back up.
  const skill = group.skills[0];
  await panel.locator(`[data-atlas-tag="${skill.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/atlas\\?skill=${skill.id}$`));
  await expect(plate.locator('[data-atlas-chosen]')).toHaveAttribute('data-atlas-chosen', skill.id);
  await expect(panel.locator('[data-atlas-skill] [data-atlas-heading]')).toHaveText(skill.name);
  await expect(panel.locator('[data-atlas-level]')).toHaveText(/^(Fundamentals|Intermediate|Advanced)$/);
  await expect(panel.locator('[data-atlas-open]')).toHaveAttribute('href', `/skills/${skill.id}`);
  await expect(page.locator('[data-atlas-crumbs] a')).toHaveText(['Atlas', domain.name, group.name]);
  await assertHealthyLayout(page, '/atlas?skill');
  await page.locator('[data-atlas-whole]').click();
  await expect(page).toHaveURL(/\/atlas$/);

  // A career laid over the atlas lights its skills, and one line says what is shown.
  const list = (await (await request.get(`${API}/occupations?limit=2`)).json()) as { data: { id: string; title: string }[] };
  expect(list.data.length, 'the API returned two careers').toBe(2);
  const paths = await Promise.all(
    list.data.map(async (career) => {
      const detail = (await (await request.get(`${API}/occupations/${career.id}`)).json()) as { skills: { id: string; domain: { slug: string } | null }[] };
      return detail.skills.filter((s) => placed.has(s.id));
    })
  );
  const [first, second] = paths;
  expect(first.length, 'the first career in the list has a path').toBeGreaterThan(0);
  const domains = new Set(first.map((s) => s.domain?.slug)).size;
  await page.goto(`/atlas?career=${list.data[0].id}`, { waitUntil: 'domcontentloaded' });
  await expect(plate.locator('[data-atlas-lit]')).toHaveCount(first.length);
  await expect(page.locator(`[data-atlas-career="${list.data[0].id}"]`)).toContainText(
    `${list.data[0].title} · ${first.length} ${first.length === 1 ? 'skill' : 'skills'} across ${domains} ${domains === 1 ? 'domain' : 'domains'}`
  );
  await expect(plate.locator('.atlas-base')).toHaveAttribute('data-dim', 'true');
  // Under a career the plate is ink again, so the accent reads alone: every leaf one colour, and only the domains
  // the career reaches keep their hue, on the rim.
  const inks = await plate.locator('.atlas-base .atlas-leaf').evaluateAll((leaves) => [...new Set(leaves.map((leaf) => getComputedStyle(leaf).fill))]);
  expect(inks.length, 'the leaves under a career are one ink').toBe(1);
  await expect(plate.locator('[data-atlas-reached]')).toHaveCount(domains);
  // Every domain the career reaches is named; the others in a quieter ink, or, where the rim has no room for all sixteen, not at all.
  await expect(plate.locator('.atlas-name:not([data-off])')).toHaveCount(domains);
  const off = await plate.locator('.atlas-name[data-off]').count();
  expect([0, taxonomy.domains.length - domains], 'the domains it does not reach').toContain(off);
  await assertHealthyLayout(page, '/atlas?career');

  // A second career over the first: what they share is told apart from what is each one's own.
  const shared = second.filter((s) => first.some((f) => f.id === s.id)).length;
  await page.goto(`/atlas?career=${list.data[0].id}&with=${list.data[1].id}`, { waitUntil: 'domcontentloaded' });
  await expect(plate.locator('[data-atlas-lit]')).toHaveCount(first.length + second.length - shared);
  await expect(plate.locator('[data-atlas-lit="shared"]')).toHaveCount(shared);
  await expect(plate.locator('[data-atlas-lit="second"]')).toHaveCount(second.length - shared);
  await expect(page.locator('[data-atlas-shared]')).toContainText(`${first.length - shared} and ${second.length - shared} of their own`);
  await assertHealthyLayout(page, '/atlas?career&with');
  // Taking the first off leaves the second, alone.
  await page.locator(`[data-atlas-career="${list.data[0].id}"] a[aria-label^="Take"]`).click();
  await expect(page).toHaveURL(new RegExp(`/atlas\\?career=${list.data[1].id}$`));

  // The Explore overview leads here from its Skills section.
  await page.goto('/explore', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main a[href="/atlas"]')).toHaveText('Atlas');
});

test('a seeker and an employer are given different tools', async ({ page, baseURL }) => {
  // The one check here that writes: it makes two accounts and deletes them. Never against a deployed copy.
  test.skip(!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL ?? ''), 'creates accounts: local only');
  const password = 'correct horse battery';
  const stamp = `${test.info().project.name}-${Date.now().toString(36)}`;
  const tools: Record<string, { menu: string[]; jobs: string | null; word: string }> = {};

  for (const purpose of ['work', 'hire'] as const) {
    const made = await page.request.post(`${API}/auth/sign-up`, {
      data: { email: `tools-${purpose}-${stamp}@device.test`, name: `Tools ${purpose}`, password, purpose },
    });
    expect(made.status(), `${purpose}: account made`).toBe(201);
    try {
      await page.goto('/settings', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await assertHealthyLayout(page, `/settings:${purpose}`);
      // The header's third item: the open jobs for a seeker, their own jobs for an employer.
      const third = page.locator('header nav a').nth(2);
      const jobs = await third.getAttribute('href');
      const word = (await third.innerText()).trim();
      await page.getByRole('button', { name: /Account menu/ }).click();
      const menu = (await page.getByRole('menuitem').allInnerTexts()).map((text) => text.trim());
      await page.keyboard.press('Escape');
      tools[purpose] = { menu, jobs, word };
      // On the Atlas a seeker's own skills carry the product's mark; someone here to hire has none drawn.
      const skill = ((await (await page.request.get(`${API}/skills?limit=1`)).json()) as { data: { id: string }[] }).data[0];
      expect((await page.request.put(`${API}/me/skills/${skill.id}`, { data: { status: 'held' } })).ok(), `${purpose}: a skill marked held`).toBe(true);
      await page.goto('/atlas', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.atlas-plate .atlas-leaf').first()).toBeAttached();
      await expect(page.locator('.atlas-plate [data-atlas-mark="held"]'), `${purpose}: marks on the atlas`).toHaveCount(purpose === 'work' ? 1 : 0);
    } finally {
      const gone = await page.request.delete(`${API}/me`, { data: { password } });
      expect(gone.ok(), `${purpose}: account removed`).toBe(true);
    }
  }

  expect(tools.work.menu, 'a seeker is led to their own page').toEqual(['Profile', 'Settings', 'Sign out']);
  // An employer's jobs are in the header, by name; the menu does not say them again.
  expect(tools.hire.menu, 'an employer is led to their jobs by the header').toEqual(['Settings', 'Sign out']);
  expect(tools.work.jobs).toBe('/jobs');
  expect(tools.work.word).toBe('Jobs');
  expect(tools.hire.jobs).toBe('/employer');
  expect(tools.hire.word).toBe('Your jobs');
});

/** A path cut into its stops as the page cuts it: a run of two or more skills of one group is a section, a run of one a single. */
function stopsOf<S extends { group: { slug: string; name: string } | null }>(skills: S[]): { section: string | null; skills: S[] }[] {
  const runs: S[][] = [];
  for (const skill of skills) {
    const last = runs[runs.length - 1];
    if (last && skill.group && last[0].group?.slug === skill.group.slug) last.push(skill);
    else runs.push([skill]);
  }
  return runs.map((run) => ({ section: run.length > 1 ? (run[0].group?.name ?? null) : null, skills: run }));
}

test("a seeker's route says what is held and what is next, and marks nothing; an employer sees no marks", async ({ page, baseURL, request }) => {
  // Writes: it makes two accounts, marks skills through the API and deletes them. Never against a deployed copy.
  test.skip(!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL ?? ''), 'creates accounts: local only');
  test.setTimeout(90_000);
  const password = 'correct horse battery';
  const stamp = `${test.info().project.name}-${Date.now().toString(36)}`;
  // The order is the API's (the route's, read from the taxonomy as it stands): nothing here assumes which domain comes first.
  const career = await careerByTitle(request, 'CNC Machinist');
  const path = career.skills;
  const stops = stopsOf(path);
  const sections = stops.filter((stop) => stop.section !== null);
  expect(sections.length, 'the path has sections').toBeGreaterThan(2);
  expect(stops.some((stop) => stop.section === null), 'and a skill that stands by itself').toBe(true);
  /** The stops a person would see open: the sections that hold one of the first three skills not held. */
  const nextOf = (held: Set<string>) => path.filter((skill) => !held.has(skill.id)).slice(0, 3);
  const opened = (held: Set<string>) => {
    const next = nextOf(held);
    return sections.filter((stop) => stop.skills.some((skill) => next.includes(skill))).map((stop) => (stop.section ?? '').toLowerCase());
  };
  /** "2 of 6" (with or without the words around it) as [2, 6]. */
  const figure = async (locator: Locator): Promise<[number, number]> => {
    const match = /(\d+) of (\d+)/.exec((await locator.textContent()) ?? '');
    expect(match, 'the figure reads "N of M"').toBeTruthy();
    return [Number(match?.[1]), Number(match?.[2])];
  };
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;

  for (const purpose of ['work', 'hire'] as const) {
    const made = await page.request.post(`${API}/auth/sign-up`, {
      data: { email: `path-${purpose}-${stamp}@device.test`, name: `Path ${purpose}`, password, purpose },
    });
    expect(made.status(), `${purpose}: account made`).toBe(201);
    try {
      await page.goto(`/occupations/${career.id}`, { waitUntil: 'domcontentloaded' });
      const flow = page.locator('[data-route]');
      const row = (skill: { id: string }) => flow.locator(`[data-skill-tag="${skill.id}"]`);
      const openSections = () => flow.locator('[data-route-section][data-open] .route-head-name').allInnerTexts().then((all) => all.map((each) => each.toLowerCase()));
      await expect(flow.locator('[data-skill-tag]').first()).toBeVisible();
      // Nobody marks a skill or sets a goal on a career's page: there is no toggle on a row and no action in the heading.
      const noControls = async () => {
        await expect(flow.locator('[data-skill-tag] button, [data-skill-tag] [aria-pressed], [data-skill-tag] [role="checkbox"]')).toHaveCount(0);
        await expect(page.locator('[data-detail-action] button, [data-detail-action] a')).toHaveCount(0);
        await expect(page.getByText(/Set as goal|I have done this/)).toHaveCount(0);
      };
      await noControls();
      if (purpose === 'hire') {
        // Someone here to hire reads the same route with every section open: no mark, ring, Next or figure but a section's size.
        await expectOneRoute(flow, 'here to hire');
        await expect(flow.locator('[data-status], [data-next], [data-share-ring], [data-skill-mark]')).toHaveCount(0);
        await expect(page.locator('[data-held-count], [data-next-up], [data-route-aside]')).toHaveCount(0);
        await expect(flow.locator('[data-route-section]:not([data-open])')).toHaveCount(0);
        continue;
      }
      const hold = async (skill: { id: string }, status: 'held' | 'learning' = 'held') =>
        expect((await page.request.put(`${API}/me/skills/${skill.id}`, { data: { status } })).ok(), 'the skill was marked through the API').toBe(true);

      // A seeker with nothing held. The first three skills are next: the first says NEXT, the two after THEN.
      const whole = page.locator('[data-held-count]');
      await expect(whole).toContainText(`0 of ${path.length} skills`);
      let held = new Set<string>();
      const check = async (label: string) => {
        const next = nextOf(held);
        await expect(flow.locator('[data-next="next"]'), `${label}: one skill is next`).toHaveCount(next.length > 0 ? 1 : 0);
        await expect(flow.locator('[data-next="then"]')).toHaveCount(Math.max(0, next.length - 1));
        for (const [at, skill] of next.entries()) await expect(row(skill), `${label}: ${skill.name}`).toHaveAttribute('data-next', at === 0 ? 'next' : 'then');
        // The sections open are the ones that hold a next skill, and no other, at every width.
        expect(await openSections(), `${label}: the open sections`).toEqual(opened(held));
        expect((await figure(whole))[0], `${label}: the figure`).toBe(held.size);
        for (const id of held) await expect(row({ id })).toHaveAttribute('data-status', 'held');
        // Next in words: above the route on a narrow screen, in the column beside it from 1024px. One or the other.
        await expect(wide ? beside : above).toBeVisible();
        await expect(wide ? above : beside).toBeHidden();
        await expect(wide ? beside : above).toContainText(next[0].name);
        await expectOneRoute(flow, label);
        await noControls();
      };
      const above = page.locator('[data-next-up]');
      const beside = page.locator('[data-route-aside]');
      await check('nothing held');
      const first = nextOf(held)[0];
      await expect(row(first).locator('.route-row-word')).toHaveText('Next');
      await expect(row(first).locator('[data-row-said]')).toHaveText('Not held, next');
      await expect(row(first).locator('a')).toHaveAttribute('href', `/skills/${first.id}`);
      // A skill that stands by itself says its group under its name; one inside a section does not.
      const single = stops.find((stop) => stop.section === null && stop.skills[0].group)!.skills[0];
      await flow.locator('[data-route-open-all]').click();
      await expect(row(single).locator('[data-tag-note]')).toHaveText(single.group!.name);
      await expect(row(sections[0].skills[0]).locator('[data-tag-note]')).toHaveCount(0);
      await flow.locator('[data-route-open-all]').click();
      // What a person opened and closed holds for the visit: forgotten here, so the next reads are a fresh visit's.
      await page.evaluate(() => sessionStorage.clear());
      if (wide) {
        const [second, third] = nextOf(held).slice(1);
        await expect(beside).toContainText(new RegExp(`Next[\\s\\S]*${first.name}[\\s\\S]*Then[\\s\\S]*${second.name}[\\s\\S]*${third.name}`));
        // The route does not run across: the column beside it is to its right, and the rows are still one column.
        const [left, right] = [await flow.locator('.route-main').boundingBox(), await beside.boundingBox()];
        expect(right?.x ?? 0, 'the side column stands to the right of the route').toBeGreaterThanOrEqual((left?.x ?? 0) + (left?.width ?? 0));
        expect(Math.round(right?.width ?? 0)).toBe(288);
      }

      // Skills marked elsewhere (Profile; here, the API): the first skill, then the whole of the first section, and one being learned.
      const section = sections[0];
      const sectionOf = (skill: { id: string }) => flow.locator('[data-route-section]').filter({ has: page.locator(`[data-skill-tag="${skill.id}"]`) });
      const place = sectionOf(section.skills[0]);
      const head = place.getByRole('button').first();
      await hold(path[0]);
      await hold(section.skills[0]);
      held = new Set([path[0].id, section.skills[0].id]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(whole).toContainText(`${held.size} of ${path.length} skills`);
      await check('two held');
      // A section's figure: "1 of N" part done, its size untouched, nothing when it is whole.
      expect(await figure(place.locator('[data-section-count]'))).toEqual([section.skills.filter((skill) => held.has(skill.id)).length, section.skills.length]);
      const untouched = sections[sections.length - 1];
      await expect(sectionOf(untouched.skills[0]).locator('[data-section-count]')).toHaveText(`${untouched.skills.length} skills`);
      for (const skill of section.skills) await hold(skill);
      const learning = path.find((skill) => !held.has(skill.id) && !section.skills.includes(skill))!;
      await hold(learning, 'learning');
      held = new Set([path[0].id, ...section.skills.map((skill) => skill.id)]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(whole).toContainText(`${held.size} of ${path.length} skills`);
      await check('a section whole');
      await expect(place).toHaveAttribute('data-complete', 'true');
      await expect(place.locator('[data-section-count]')).toHaveCount(0);
      // A skill being learned is not held: it keeps its half mark, is not in the figure, and is still next where the route has it.
      await expect(row(learning)).toHaveAttribute('data-status', 'learning');
      await expect(row(learning).locator('[data-row-said]')).toContainText('Learning');

      // Next in words leads to its row: the row's name takes focus.
      const next = nextOf(held)[0];
      await (wide ? beside.locator('[data-side-next]') : above.getByRole('button')).click();
      await expect(row(next).locator('a')).toBeFocused();

      // A section opens and closes by keyboard, and closed its rows are out of the tab order.
      const inside = place.locator('[data-skill-tag]');
      if ((await head.getAttribute('aria-expanded')) === 'true') await head.click();
      await expect(head).toHaveAttribute('aria-expanded', 'false');
      await expect(inside.first()).toBeHidden();
      const size = await head.boundingBox();
      expect(size?.height ?? 0, 'a section\'s line is a full finger tall').toBeGreaterThanOrEqual(44);
      await head.focus();
      await page.keyboard.press('Enter');
      await expect(head).toHaveAttribute('aria-expanded', 'true');
      await expect(inside).toHaveCount(section.skills.length);
      await expect(inside.first()).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(inside.first().locator('a')).toBeFocused();
      await head.focus();
      await page.keyboard.press('Space');
      await expect(head).toHaveAttribute('aria-expanded', 'false');
      await expect(inside.first()).toBeHidden();
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-route-section]:not([data-open]) ul'))), 'Tab passes a closed section by').toBe(false);
      // What a person opened themselves holds for the visit; Open all opens every section, and then closes them.
      await head.click();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(head).toHaveAttribute('aria-expanded', 'true');
      const all = flow.locator('[data-route-open-all]');
      await expect(all).toHaveText('Open all');
      await all.click();
      await expect(flow.locator('[data-route-section]:not([data-open])')).toHaveCount(0);
      await expect(all).toHaveText('Close all');
      await expectOneRoute(flow, 'a seeker, all open');
      await all.click();
      await expect(flow.locator('[data-route-section][data-open]')).toHaveCount(0);
      await assertHealthyLayout(page, '/occupations/:id route');

      // The same on the Atlas view: the marks are read there too, and no tag is a toggle.
      await page.goto(`/occupations/${career.id}?path=atlas`, { waitUntil: 'domcontentloaded' });
      const atlasTags = page.locator('[data-career-atlas] [data-skill-tag]');
      await expect(atlasTags).toHaveCount(path.length);
      await expect(page.locator(`[data-career-atlas] [data-skill-tag="${path[0].id}"]`)).toHaveAttribute('data-status', 'held');
      await expect(page.locator('[data-career-atlas] [data-skill-tag] button')).toHaveCount(0);
      // The view is kept for the visit: forgotten, so the next person here starts on the route.
      await page.evaluate(() => sessionStorage.clear());
    } finally {
      const gone = await page.request.delete(`${API}/me`, { data: { password } });
      expect(gone.ok(), `${purpose}: account removed`).toBe(true);
    }
  }
});

/** A skill that has makes, and one that has none, from the taxonomy. Null when the database holds no makes. */
async function skillsByMakes(request: APIRequestContext): Promise<{ withMakes: { id: string; name: string; makes: string[] }; without: { id: string } } | null> {
  const taxonomy = (await (await request.get(`${API}/skills/taxonomy`)).json()) as {
    domains: { groups: { skills: { id: string; name: string; makes: string[] }[] }[] }[];
  };
  const skills = taxonomy.domains.flatMap((domain) => domain.groups.flatMap((group) => group.skills));
  const withMakes = skills.find((skill) => skill.makes.length >= 3);
  const without = skills.find((skill) => skill.makes.length === 0);
  return withMakes && without ? { withMakes, without } : null;
}

test("a skill's makes are plain chips to a visitor, after its group", async ({ page, request }) => {
  const found = await skillsByMakes(request);
  expect(found, 'the taxonomy has a skill with makes and one without').toBeTruthy();
  const { withMakes: skill, without } = found!;
  await page.goto(`/skills/${skill.id}`, { waitUntil: 'domcontentloaded' });
  const section = page.locator('#makes');
  await expect(section.getByRole('heading', { name: 'Makes' })).toBeVisible();
  // The makes by name, in the order the API gives them, as chips that do nothing.
  const chips = section.locator('[data-skill-makes] [data-make]');
  await expect(chips).toHaveText(skill.makes);
  await expect(section.locator('button, a')).toHaveCount(0);
  await expect(section).not.toContainText('Mark the ones');
  // No counts and no icons: the section is its heading and the names.
  await expect(section.locator('svg')).toHaveCount(0);
  expect(((await section.textContent()) ?? '').replace('Makes', ''), 'nothing but the names').toBe(skill.makes.join(''));
  // In the template's order: after the group, before how it is learned.
  const order = await page.evaluate(() => ['group', 'makes', 'learned'].map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? null));
  if (order[0] !== null) expect(order[0], 'the group comes first').toBeLessThan(order[1] as number);
  if (order[2] !== null) expect(order[1], 'then the makes').toBeLessThan(order[2] as number);
  await assertHealthyLayout(page, '/skills/:id makes');
  // A skill with no makes has no section.
  await page.goto(`/skills/${without.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('#makes')).toHaveCount(0);
});

test("a skill's page shows a seeker the makes they have run and marks nothing, and Profile says them under the skill", async ({ page, baseURL, request }) => {
  // Writes: it makes two accounts, marks a skill and two makes and deletes them. Never against a deployed copy.
  test.skip(!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL ?? ''), 'creates accounts: local only');
  const found = await skillsByMakes(request);
  expect(found, 'the taxonomy has a skill with makes').toBeTruthy();
  const skill = found!.withMakes;
  const password = 'correct horse battery';
  const stamp = `${test.info().project.name}-${Date.now().toString(36)}`;

  for (const purpose of ['work', 'hire'] as const) {
    const made = await page.request.post(`${API}/auth/sign-up`, {
      data: { email: `makes-${purpose}-${stamp}@device.test`, name: `Makes ${purpose}`, password, purpose },
    });
    expect(made.status(), `${purpose}: account made`).toBe(201);
    try {
      await page.goto(`/skills/${skill.id}`, { waitUntil: 'domcontentloaded' });
      const list = page.locator('#makes [data-skill-makes]');
      await expect(list.locator('[data-make]')).toHaveText(skill.makes);
      // Without the skill on their list, and for someone here to hire, the chips are plain.
      await expect(list.locator('button')).toHaveCount(0);
      await expect(page.locator('#makes')).not.toContainText('Mark the ones');
      if (purpose === 'hire') continue;

      // A skill's page has no Not held / Learning / Held control in its heading, for anyone: a skill is marked on Profile.
      await expect(page.getByRole('radiogroup')).toHaveCount(0);
      await expect(page.locator('[data-detail-action] button, [data-detail-action] a')).toHaveCount(0);
      await expect(page.getByText(/Sign in to track this skill/)).toHaveCount(0);

      // Holding the skill (marked elsewhere: here, through the API) changes no chip into a control: the page marks nothing.
      const setStatus = async (status: 'held' | 'learning' | null) => {
        const answer = status ? await page.request.put(`${API}/me/skills/${skill.id}`, { data: { status } }) : await page.request.delete(`${API}/me/skills/${skill.id}`);
        expect(answer.ok(), 'the skill was marked through the API').toBe(true);
        await page.reload({ waitUntil: 'domcontentloaded' });
      };
      const noControls = async () => {
        await expect(list.locator('button, [aria-pressed]')).toHaveCount(0);
        await expect(page.locator('#makes')).not.toContainText('Mark the ones');
        // Nor is any tag of its group, or any skill that goes with it, a toggle: their marks are read.
        await expect(page.locator('#group button, #group [aria-pressed], #related button, #related [aria-pressed]')).toHaveCount(0);
      };
      await setStatus('held');
      const chips = list.locator('[data-make]');
      await expect(chips).toHaveText(skill.makes);
      await expect(list.locator('[data-ran]')).toHaveCount(0);
      await noControls();
      // The group's tags show the person's mark, this skill's among them, held.
      if ((await page.locator('#group').count()) > 0) {
        await expect(page.locator(`#group [data-skill-tag="${skill.id}"]`)).toHaveAttribute('data-status', 'held');
        await expect(page.locator(`#group [data-skill-tag="${skill.id}"] [data-skill-mark="held"]`)).toHaveCount(1);
      }
      // Two makes marked as run (through the API): both chips are brighter, and still no chip is a control.
      const all = ((await (await page.request.get(`${API}/skills/${skill.id}`)).json()) as { makes: { id: string; name: string }[] }).makes;
      const run = async (makes: { id: string }[]) => {
        expect((await page.request.put(`${API}/me/skills/${skill.id}/makes`, { data: { makes: makes.map((make) => make.id) } })).ok(), 'the makes were marked through the API').toBe(true);
        await page.reload({ waitUntil: 'domcontentloaded' });
      };
      await run([all[0], all[2]]);
      await expect(list.locator('[data-ran]')).toHaveCount(2);
      await expect(chips.nth(0)).toHaveAttribute('data-ran', 'true');
      await expect(chips.nth(2)).toHaveAttribute('data-ran', 'true');
      await expect(chips.nth(1)).not.toHaveAttribute('data-ran', 'true');
      const weight = (at: number) => chips.nth(at).evaluate((chip) => getComputedStyle(chip).fontWeight);
      expect(Number(await weight(0)), 'a make the person has run is heavier').toBeGreaterThan(Number(await weight(1)));
      await noControls();
      await assertHealthyLayout(page, '/skills/:id makes marked');

      // Profile: the skill's tag carries the makes as its second line.
      await page.goto('/me', { waitUntil: 'domcontentloaded' });
      const tag = page.locator(`[data-my-skills] [data-skill-tag="${skill.id}"]`);
      await expect(tag).toContainText(skill.name);
      await expect(tag).toContainText(`${skill.makes[0]}, ${skill.makes[2]}`);
      await assertHealthyLayout(page, '/me makes');

      // Off the list, the skill's makes go with it: no chip is brighter, and none is when the skill comes back.
      await page.goto(`/skills/${skill.id}`, { waitUntil: 'domcontentloaded' });
      await expect(list.locator('[data-ran]')).toHaveCount(2);
      await setStatus(null);
      await expect(list.locator('[data-make]')).toHaveCount(skill.makes.length);
      await expect(list.locator('[data-ran]')).toHaveCount(0);
      await setStatus('learning');
      await expect(list.locator('[data-make]')).toHaveCount(skill.makes.length);
      await expect(list.locator('[data-ran]')).toHaveCount(0);
      await noControls();
    } finally {
      const gone = await page.request.delete(`${API}/me`, { data: { password } });
      expect(gone.ok(), `${purpose}: account removed`).toBe(true);
    }
  }
});

test('settings offers the theme to a visitor', async ({ page }) => {
  // The theme is kept in the browser, so nobody has to make an account to change it.
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await page.locator('[data-choice="theme"] [data-value="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('[data-choice="theme"] [data-value="dark"]').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-settings-sign-in] a').first(), 'the rest of settings is behind signing in').toHaveAttribute('href', /^\/sign-in\?next=%2Fsettings$/);
  await assertHealthyLayout(page, '/settings:visitor');
});

test('a read that gets no answer gives up and says so', async ({ page, baseURL, request }) => {
  // Writes: it makes an account with one goal and deletes it. Never against a deployed copy.
  test.skip(!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL ?? ''), 'creates an account: local only');
  const password = 'correct horse battery';
  const stamp = `${test.info().project.name}-${Date.now().toString(36)}`;
  const career = await firstId(request, '/occupations');
  expect(career, 'the API returned a career to aim for').toBeTruthy();
  const made = await page.request.post(`${API}/auth/sign-up`, {
    data: { email: `slow-${stamp}@device.test`, name: 'Slow answer', password, purpose: 'work' },
  });
  expect(made.status(), 'account made').toBe(201);
  try {
    // With a goal the profile is the full page, which asks for the careers within reach.
    expect((await page.request.put(`${API}/me/goals/${career}`)).ok(), 'goal set').toBe(true);
    // That one request is never answered; the page's clock is ours to move.
    await page.clock.install();
    await page.route('**/api/me/careers/reach', () => new Promise(() => undefined));
    await page.goto('/me', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Goals' })).toBeVisible();
    // Every request to the API gives up after 20 seconds, is tried once more, and then says so.
    const gaveUp = page.getByText('The server took too long to answer');
    for (let minute = 0; minute < 3 && !(await gaveUp.isVisible()); minute++) await page.clock.runFor(30_000);
    await expect(gaveUp, 'the list says the server did not answer').toBeVisible();
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const gone = await page.request.delete(`${API}/me`, { data: { password } });
    expect(gone.ok(), 'account removed').toBe(true);
  }
});

test("an admin's change reaches the map's panel", async ({ page, request }) => {
  // Nothing is written: the account, Admin Tools' answers and the add itself are stood in for here.
  const plant = await firstId(request, '/factories');
  expect(plant, 'the API returned a factory to open').toBeTruthy();
  let changed = false;
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        user: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@device.test', name: 'Device Admin', isAdmin: true, homeZip: null, about: null, emailNotices: true, purpose: 'work' },
        memberships: [],
        isEmployer: false,
      },
    })
  );
  await page.route('**/api/me/news', (route) => route.fulfill({ json: { applications: false, applicants: false, access: false } }));
  // Whatever Admin Tools asks for while it is open: nobody waiting, nothing found.
  await page.route('**/api/admin/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/overview')) return route.fulfill({ json: { users: 1, pendingMemberships: 0, openJobs: 0, applications: 0, draftPaths: 0 } });
    if (path.endsWith('/quality')) return route.fulfill({ json: { total: { state: null, plants: 0, industry: 0, code: 0, county: 0, people: 0, address: 0, outsideId: 0, onePlantCompanies: 0, duplicates: 0, duplicateGroups: 0, companies: 0 }, states: [] } });
    return route.fulfill({ json: { users: [], total: 0, memberships: [], requests: [], paths: [], records: [], entries: [], hasMore: false } });
  });
  await page.route('**/api/companies', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    changed = true;
    return route.fulfill({ status: 201, json: { id: '00000000-0000-4000-8000-000000000002', name: 'Changed By The Check', slug: null } });
  });
  // The factory itself, under another name once an admin has changed something.
  await page.route(`**/api/factories/${plant}`, async (route) => {
    const response = await route.fetch();
    const record = (await response.json()) as { name: string };
    await route.fulfill({ response, json: changed ? { ...record, name: 'Renamed Works' } : record });
  });

  await page.goto(`/map?factory=${plant}`, { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveTitle(/^Map · /);
  const before = await page.title();
  expect(before).not.toContain('Renamed Works');

  // To Admin Tools without loading the app again, so what the map read is still held.
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Admin Tools' }).click();
  await page.locator('[data-admin-page="add"]').click();
  await page.locator('#company-name').fill('Changed By The Check');
  await page.getByRole('button', { name: 'Add without a factory' }).click();
  await expect(page.locator('[data-record-added]')).toBeVisible();

  // Back to the factory on the map: it is read again, not shown as it was before the change.
  for (let step = 0; step < 4 && !/\/map\?/.test(page.url()); step++) await page.goBack();
  expect(page.url(), 'back on the map').toContain(`/map?factory=${plant}`);
  await expect(page).toHaveTitle('Renamed Works · Archangel');
});

test("a factory's page says its county, with the official figures and no source", async ({ page, request }) => {
  // The county is worked out from coordinates by a script, outside the app: its answer is stood in for here.
  const plant = await firstId(request, '/factories');
  expect(plant, 'the API returned a factory to open').toBeTruthy();
  let answer: unknown = {
    county: { fips: '48453', name: 'Travis County', state: 'TX' },
    metro: { code: '12420', name: 'Austin-Round Rock-San Marcos, TX', kind: 'metropolitan' },
    manufacturing: { year: 2025, establishments: 1354, employment: 60968, avgAnnualPay: 136250, source: 'U.S. Bureau of Labor Statistics, Quarterly Census of Employment and Wages', sourceUrl: 'https://www.bls.gov/cew/' },
  };
  await page.route('**/api/map/factories/*/county', (route) => route.fulfill({ json: answer }));

  await page.goto(`/factories/${plant}`, { waitUntil: 'domcontentloaded' });
  const line = page.locator('[data-entity-view="factories"] [data-county-line]');
  await expect(line).toHaveText(
    'Travis County: 60,968 people work in manufacturing, at 1,354 establishments. Average pay $136,250 a year.'
  );
  // The page states the figure and never where it was read.
  await expect(line.getByRole('link')).toHaveCount(0);
  await assertHealthyLayout(page, '/factories/:id:county');

  // A figure the source withheld is left out, never shown as 0.
  answer = { county: { fips: '01011', name: 'Bullock County', state: 'AL' }, metro: null, manufacturing: { year: 2025, establishments: 6, employment: null, avgAnnualPay: null, source: 'U.S. Bureau of Labor Statistics', sourceUrl: null } };
  await page.goto(`/factories/${plant}`, { waitUntil: 'domcontentloaded' });
  await expect(line).toHaveText('Bullock County: 6 establishments in manufacturing.');

  // A factory with no county, or a county with nothing published, says nothing.
  for (const none of [{ county: null, metro: null, manufacturing: null }, { county: { fips: '15005', name: 'Kalawao County', state: 'HI' }, metro: null, manufacturing: null }]) {
    answer = none;
    await page.goto(`/factories/${plant}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-entity-view="factories"] [data-detail-kind]')).toHaveText('Factory');
    await page.waitForTimeout(600);
    await expect(line).toHaveCount(0);
  }
});

test('Admin Tools: an index of pages, a company added by its address, one notice', async ({ page }) => {
  // Nothing is written and no account is made: the admin, the geocoder and the add itself are stood in for here.
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        user: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@device.test', name: 'Device Admin', isAdmin: true, homeZip: null, about: null, emailNotices: true, purpose: 'work' },
        memberships: [],
        isEmployer: false,
      },
    })
  );
  await page.route('**/api/me/news', (route) => route.fulfill({ json: { applications: false, applicants: false, access: false } }));
  await page.route('**/api/admin/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/overview')) return route.fulfill({ json: { users: 1, pendingMemberships: 2, openJobs: 0, applications: 0, draftPaths: 3, waitingMatches: 1 } });
    if (path.endsWith('/plants/pairs')) return route.fulfill({ json: { pairs: [], total: 5 } });
    if (path.endsWith('/postings/places')) return route.fulfill({ json: { places: [], total: 4 } });
    if (path.endsWith('/records/company')) return route.fulfill({ json: { records: [{ id: '00000000-0000-4000-8000-0000000000c1', name: 'Device Works', detail: 'deviceworks.example · 1 factory', href: '/companies/x' }] } });
    if (path.endsWith('/records/skill')) return route.fulfill({ json: { records: [{ id: '00000000-0000-4000-8000-0000000000c2', name: 'Device Calibration', detail: 'Metrology', href: '/skills/x' }] } });
    return route.fulfill({ json: { users: [], total: 0, memberships: [], requests: [], paths: [], records: [], entries: [], hasMore: false } });
  });
  // The geocoder: the address is known; anything else is not.
  await page.route('https://api.maptiler.com/geocoding/**', (route) => {
    const known = decodeURIComponent(new URL(route.request().url()).pathname).includes('1 Tesla Road');
    return route.fulfill({
      json: {
        features: known
          ? [{ id: 'address.1', text: 'Tesla Road', place_name: '1 Tesla Road, Travis, Texas 78725, United States', center: [-97.613429, 30.224096], place_type: ['address'], relevance: 0.79, context: [{ id: 'postal_code.1', text: '78725' }, { id: 'county.1', text: 'Travis' }, { id: 'region.1', text: 'Texas' }] }]
          : [],
      },
    });
  });
  let sent: unknown = null;
  await page.route('**/api/companies', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    sent = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: { id: '00000000-0000-4000-8000-0000000000c1', name: 'Device Works', slug: null, factory: { id: '00000000-0000-4000-8000-0000000000f1', name: 'Device Works Austin', city: 'Austin', state: 'TX' } },
    });
  });

  // The index: each page a row with what it is for, and a count where something waits.
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  const index = page.locator('[data-admin-index]');
  await expect(index.locator('[data-admin-page]')).toHaveCount(7);
  await expect(index.locator('[data-admin-page="review"]')).toContainText('13 waiting');
  await expect(index.locator('[data-admin-page="access"]')).toContainText('2 waiting');
  await expect(index.locator('[data-admin-page="add"]')).not.toContainText('waiting');
  await assertHealthyLayout(page, '/admin');

  // Review is the four lists with their counts, and nothing else.
  await index.locator('[data-admin-page="review"]').click();
  await expect(page).toHaveURL(/\/admin\/review$/);
  const review = page.locator('[data-review]');
  await expect(review.locator('[data-review-row]')).toHaveCount(4);
  await expect(review.locator('[data-review-row="paths"]')).toHaveAttribute('data-review-count', '3');
  await expect(review.locator('[data-review-row="places"]')).toHaveAttribute('data-review-count', '4');
  await expect(page.locator('[data-admin-panel]')).toHaveCount(1);

  // Add: a company and its first factory, the address looked up by the form.
  await page.goto('/admin/add', { waitUntil: 'domcontentloaded' });
  const form = page.locator('[data-company-add]');
  await expect(form).toBeVisible();
  // Every field of the form is inside one edged panel, under its heading.
  await expect(page.locator('[data-admin-panel][data-add="company"] h2')).toHaveText('Add a company');
  await expect(form.getByLabel('Latitude')).toHaveCount(0);
  await form.locator('#company-name').fill('Device Works');
  await form.locator('#company-website').fill('https://www.deviceworks.example/about');
  await form.locator('#company-place-street').fill('1 Tesla Road');
  await form.locator('#company-place-city').fill('Austin');
  await form.locator('#company-place-state').click();
  await page.getByRole('option', { name: 'Texas', exact: true }).click();
  await form.locator('#company-place-zip').fill('78725');
  await expect(form.locator('[data-place-label]')).toHaveText('Found: 1 Tesla Road, Travis County, TX 78725');
  await expect(form.locator('#company-factory-name')).toHaveAttribute('placeholder', 'Device Works Austin');
  await assertHealthyLayout(page, '/admin/add:found');
  await form.locator('[data-add-with-factory]').click();
  await expect.poll(() => sent).toEqual({
    name: 'Device Works',
    domain: 'deviceworks.example',
    factory: { address: '1 Tesla Road', city: 'Austin', state: 'TX', zip: '78725', latitude: 30.224096, longitude: -97.613429 },
  });

  // What it did is said in one bar, with a link to each thing made, inside the screen; it closes.
  const notice = page.locator('[data-admin-notice]');
  await expect(notice.locator('[data-admin-notice-message]')).toHaveText('Added Device Works and its factory in Austin, TX.');
  await expect(notice.locator('[data-admin-notice-link]')).toHaveText(['Device Works', 'Device Works Austin']);
  const bar = await notice.boundingBox();
  const screen = page.viewportSize()!;
  expect(bar && bar.x >= 0 && bar.x + bar.width <= screen.width && bar.y >= 0 && bar.y + bar.height <= screen.height, 'the notice is on the screen').toBe(true);
  // On a phone it stands above the bottom edge; on a wide screen under the header.
  if (screen.width < 640) expect(bar!.y, 'the notice is at the bottom of a phone').toBeGreaterThan(screen.height / 2);
  else expect(bar!.y, 'the notice is at the top of a wide screen').toBeLessThan(screen.height / 3);
  await assertHealthyLayout(page, '/admin/add:added');
  await notice.locator('[data-admin-notice-close]').click();
  await expect(notice).toHaveCount(0);
  await expect(page.locator('[data-record-added]')).toContainText('Added Device Works and its factory in Austin, TX.');

  // An address that is not found says so and offers the coordinates; with none, the company alone can still be added.
  await form.locator('#company-name').fill('Device Works Two');
  await form.locator('#company-place-street').fill('9 Nowhere Lane');
  await form.locator('#company-place-city').fill('Austin');
  await form.locator('#company-place-state').click();
  await page.getByRole('option', { name: 'Texas', exact: true }).click();
  await expect(form.locator('[data-place-missing]')).toContainText('That address was not found.');
  await form.locator('[data-place-by-hand]').click();
  await expect(form.getByLabel('Latitude')).toBeVisible();
  await assertHealthyLayout(page, '/admin/add:coordinates');
  sent = null;
  await form.locator('[data-add-without-factory]').click();
  await expect.poll(() => sent).toEqual({ name: 'Device Works Two' });

  // Records: one field across every kind, the kind a quiet word on each result.
  await page.goto('/admin/records', { waitUntil: 'domcontentloaded' });
  await page.locator('#record-find').fill('device');
  const results = page.locator('[data-record-result]');
  await expect(results).toHaveCount(2);
  await expect(results.nth(0)).toContainText('Device Works');
  await expect(results.nth(0)).toContainText('Company');
  await expect(results.nth(1)).toContainText('Skill');
  await expect(results.nth(0)).toHaveAttribute('href', '/admin/records?kind=company&id=00000000-0000-4000-8000-0000000000c1');
  await assertHealthyLayout(page, '/admin/records');

  // Addresses from before the pages still lead somewhere.
  for (const [old, now] of [['/admin?tab=access', '/admin/access'], ['/admin?tab=history&show=company', '/admin/activity?show=company'], ['/admin?tab=data', '/admin/records'], ['/admin?tab=people&q=ana', '/admin/people?q=ana']]) {
    await page.goto(old, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-admin-home]')).toBeVisible();
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(now);
  }
  await assertHealthyLayout(page, '/admin/people');
});

test('the data quality table fits the screen, and says what it counts', async ({ page }) => {
  // Nothing is written and no account is made: the admin and the counts are stood in for here.
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        user: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@device.test', name: 'Device Admin', isAdmin: true, homeZip: null, about: null, emailNotices: true, purpose: 'work' },
        memberships: [],
        isEmployer: false,
      },
    })
  );
  await page.route('**/api/me/news', (route) => route.fulfill({ json: { applications: false, applicants: false, access: false } }));
  // Fifty-one states' worth of counts, shaped like production's: Texas largest, most factories without a headcount.
  const codes = 'TX CA OH IL PA MI NY IN WI NC GA FL TN MN MO NJ MA AL SC KY VA WA IA LA OR AR OK KS MS AZ CO CT MD UT NE WV NH ME ID NV NM DE SD RI ND MT VT AK HI WY DC'.split(' ');
  const states = codes.map((state, i) => {
    const plants = Math.round(4300 / (1 + i * 0.35)) + 3;
    return {
      state, plants,
      industry: Math.round(plants * 0.62), code: Math.round(plants * 0.55), county: plants - (i % 7 === 0 ? 2 : 0), people: i === 0 ? 540 : i % 5 === 0 ? 3 : 0,
      address: Math.round(plants * 0.97), outsideId: Math.round(plants * 0.98), onePlantCompanies: Math.round(plants * 0.5), duplicates: i % 4 === 0 ? 6 : 0, duplicateGroups: i % 4 === 0 ? 3 : 0,
    };
  });
  const sum = (key: 'plants' | 'industry' | 'code' | 'county' | 'people' | 'address' | 'outsideId' | 'onePlantCompanies' | 'duplicates' | 'duplicateGroups') => states.reduce((n, s) => n + s[key], 0);
  const total = { state: null, plants: sum('plants'), industry: sum('industry'), code: sum('code'), county: sum('county'), people: sum('people'), address: sum('address'), outsideId: sum('outsideId'), onePlantCompanies: sum('onePlantCompanies'), duplicates: sum('duplicates'), duplicateGroups: sum('duplicateGroups'), companies: 28082 };
  await page.route('**/api/admin/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/quality')) return route.fulfill({ json: { total, states } });
    if (path.endsWith('/overview')) return route.fulfill({ json: { users: 1, pendingMemberships: 0, openJobs: 0, applications: 0, draftPaths: 0 } });
    return route.fulfill({ json: { users: [], total: 0, memberships: [], requests: [], paths: [], records: [], entries: [], hasMore: false } });
  });

  await page.goto('/admin/activity?view=quality', { waitUntil: 'domcontentloaded' });
  const table = page.locator('[data-quality-table]');
  await expect(table).toBeVisible();
  await table.scrollIntoViewIfNeeded();
  // The table may be wider than a phone: it scrolls inside its own card, never the page.
  await assertHealthyLayout(page, '/admin/activity?view=quality');
  await expect(table.locator('tbody tr')).toHaveCount(states.length + 1);
  const cells = table.locator('[data-quality-total] td');
  const count = (n: number) => n.toLocaleString('en-US');
  // Shares first: a part of the factories as a percentage; factories and the two tallies stay counts.
  await expect(cells.nth(0)).toHaveText(count(total.plants));
  await expect(cells.nth(1)).toHaveText(`${((total.industry / total.plants) * 100).toFixed(1)}%`);
  await expect(cells.nth(7)).toHaveText(count(total.onePlantCompanies));
  await expect(cells.nth(8)).toHaveText(count(total.duplicates));
  // "100%" only when it is every factory: Texas is two short of it.
  const texas = table.locator('[data-quality-row="TX"] td');
  await expect(texas.nth(3)).not.toHaveText('100%');
  await expect(table.locator('[data-quality-row="CA"] td').nth(3)).toHaveText('100%');
  // Counts: the exact numbers behind the shares.
  await page.getByRole('radio', { name: 'Counts' }).click();
  await expect(cells.nth(1)).toHaveText(count(total.industry));
  await expect(texas.nth(3)).toHaveText(count(states[0].plants - 2));
  // A column's heading orders the states by it; the state column stays put while the rest scrolls.
  await page.getByRole('button', { name: 'People' }).click();
  await expect(table.locator('tbody tr').nth(1)).toHaveAttribute('data-quality-row', 'TX');
  await page.getByRole('button', { name: 'State', exact: true }).click();
  await expect(table.locator('tbody tr').nth(1)).toHaveAttribute('data-quality-row', 'AL');
  await expect(table.locator('thead th').first()).toHaveAttribute('aria-sort', 'ascending');
  // What each column counts is written under the table, with the two figures the table cannot show.
  const definitions = page.locator('[data-quality-definitions]');
  await expect(definitions).toContainText(`${count(total.onePlantCompanies)} of ${count(total.companies)} companies`);
  await expect(definitions).toContainText(`${count(total.duplicates)} factories at ${count(total.duplicateGroups)} spots`);
  await definitions.scrollIntoViewIfNeeded();
  await assertHealthyLayout(page, '/admin/activity?view=quality:definitions');
});

// ---------------------------------------------------------------------------
// A company's version of a career
// ---------------------------------------------------------------------------

interface DeviceVersionSkill {
  id: string;
  name: string;
  added: boolean;
  makes: { id: string; name: string; runs: boolean }[];
}
interface DeviceVersion {
  company: { id: string; name: string; slug: string | null };
  occupation: { id: string; title: string };
  title: string;
  skills: DeviceVersionSkill[];
  leftOut: DeviceVersionSkill[];
}

/**
 * A version to look at: one of the local sample's (a made-up company's), the
 * one that differs most from its standard. Null in a database with no version.
 */
async function sampleVersion(request: APIRequestContext): Promise<DeviceVersion | null> {
  const found = (await (await request.get(`${API}/companies?search=${encodeURIComponent('Pacific Aerospace Components')}&limit=5`)).json()) as { data: { id: string; name: string }[] };
  const company = found.data.find((each) => each.name === 'Pacific Aerospace Components');
  if (!company) return null;
  const list = (await (await request.get(`${API}/companies/${company.id}/careers`)).json()) as { versions: { occupation: { id: string }; added: number; leftOut: number; makes: string[] }[] };
  const most = [...list.versions].sort((a, b) => b.added + b.leftOut + b.makes.length - (a.added + a.leftOut + a.makes.length))[0];
  if (!most) return null;
  return (await (await request.get(`${API}/companies/${company.id}/careers/${most.occupation.id}`)).json()) as DeviceVersion;
}

test("a company's version of a career, as a visitor: the same page, its changes said, one tap back to the standard", async ({ page, request }) => {
  const version = await sampleVersion(request);
  expect(version, "the sample has a made-up company's version of a career").toBeTruthy();
  const { company, occupation, skills, leftOut } = version!;
  const address = `/occupations/${occupation.id}?at=${company.id}`;

  await page.goto(address, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(version!.title);
  await expect(page).toHaveTitle(`${version!.title} · Archangel`);
  await expect(page.locator('[data-detail-kind]')).toHaveText('Career');
  // The path is drawn with the same parts: one route, the version's skills as its rows, no marks for a visitor.
  const flow = page.locator('[data-route]');
  await expectOneRoute(flow, "a company's version");
  await expect(flow.locator('[data-skill-tag]')).toHaveCount(skills.length);
  await expect(page.getByText('Set as goal')).toHaveCount(0);
  await expect(flow.locator('[data-skill-tag] button')).toHaveCount(0);
  await expect(page.locator('[data-held-count]')).toHaveCount(0);
  // A skill the company adds says so on its tag, and only those do.
  const added = skills.filter((skill) => skill.added);
  await expect(flow.locator('[data-skill-tag][data-added]')).toHaveCount(added.length);
  for (const skill of added.slice(0, 2)) await expect(flow.locator(`[data-skill-tag="${skill.id}"] [data-tag-added]`)).toHaveText('Added');
  // A tag names the makes the company runs on its second line; a skill it runs none of has no second line.
  const withMakes = skills.find((skill) => skill.makes.some((make) => make.runs));
  if (withMakes) {
    await expect(flow.locator(`[data-skill-tag="${withMakes.id}"] [data-tag-make]`)).toHaveText(withMakes.makes.filter((make) => make.runs).map((make) => make.name));
  }
  const plain = skills.find((skill) => !skill.added && !skill.makes.some((make) => make.runs));
  if (plain) await expect(flow.locator(`[data-skill-tag="${plain.id}"] [data-tag-line]`)).toHaveCount(0);
  // What it leaves out is not drawn: one line says how many, and opens them.
  for (const skill of leftOut) await expect(flow.locator(`[data-skill-tag="${skill.id}"]`)).toHaveCount(0);
  const line = page.locator('[data-left-out]');
  if (leftOut.length > 0) {
    await expect(line.locator('summary')).toHaveText(`${leftOut.length} ${leftOut.length === 1 ? 'skill' : 'skills'} of the standard path left out`);
    await expect(line.locator('[data-skill-tag]').first()).toBeHidden();
    await line.locator('summary').click();
    await expect(line.locator('[data-skill-tag]')).toHaveText(leftOut.map((skill) => skill.name));
  } else {
    await expect(line).toHaveCount(0);
  }
  await assertHealthyLayout(page, '/occupations/:id?at=company');

  // One tap returns to the standard, which says the company has its own version; the row opens it again.
  const standard = page.locator('[data-standard-link]');
  // It is a tag in the heading, as the company is (components/layout/RecordTag.tsx): a full finger tall on a phone.
  await expect(standard).toContainText(`Standard ${occupation.title}`);
  const reach = await standard.boundingBox();
  expect(reach?.height ?? 0, 'the way back to the standard is a full finger tall').toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 0) < 640 ? 44 : 36);
  await standard.click();
  await expect(page).toHaveURL(new RegExp(`/occupations/${occupation.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(occupation.title);
  await expect(page.locator('[data-route] [data-skill-tag][data-added]')).toHaveCount(0);
  const row = page.locator(`#companies [data-career-version="${company.id}"]`);
  await expect(row).toContainText(company.name);
  await row.scrollIntoViewIfNeeded();
  await assertHealthyLayout(page, '/occupations/:id companies');
  await row.locator('a').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(version!.title);

  // The company's page lists its careers, each opening its version.
  await page.goto(`/companies/${company.id}`, { waitUntil: 'domcontentloaded' });
  const career = page.locator(`#occupations [data-company-version="${occupation.id}"]`);
  await expect(career).toContainText(occupation.title);
  await expect(career.locator('a')).toHaveAttribute('href', new RegExp(`/occupations/${occupation.id}\\?at=`));

  // The Atlas takes the version: the company's skills laid over every skill there is, named as the version is.
  await page.goto(address, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-atlas-link]')).toHaveAttribute('href', `/atlas?career=${occupation.id}&at=${company.slug ?? company.id}`);
  await page.locator('[data-atlas-link]').click();
  const laid = page.locator(`[data-atlas-career="${occupation.id}"]`);
  await expect(laid.locator('a').first()).toHaveText(version!.title);
  await expect(laid.locator('a').first()).toHaveAttribute('href', new RegExp(`/occupations/${occupation.id}\\?at=`));
  await expect(laid.locator('[data-atlas-career-facts]')).toContainText(`${skills.length} ${skills.length === 1 ? 'skill' : 'skills'} across`);
  await assertHealthyLayout(page, '/atlas?career&at');

  // A company with no version of the career says so, and leads back to the standard.
  const other = (await (await request.get(`${API}/companies?limit=5`)).json()) as { data: { id: string }[] };
  const none = other.data.find((each) => each.id !== company.id);
  if (none) {
    const has = await request.get(`${API}/companies/${none.id}/careers/${occupation.id}`);
    if (has.status() === 404) {
      await page.goto(`/occupations/${occupation.id}?at=${none.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('No version of this career here')).toBeVisible();
      await expect(page.locator('[data-standard-link]')).toHaveAttribute('href', `/occupations/${occupation.id}`);
    }
  }
});

test("a seeker's progress on a company's version counts its skills, and a make they have run is lit", async ({ page, baseURL, request }) => {
  // Writes: it makes an account, marks skills and a make, and deletes the account. Never against a deployed copy.
  test.skip(!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL ?? ''), 'creates an account: local only');
  const version = await sampleVersion(request);
  expect(version, "the sample has a made-up company's version of a career").toBeTruthy();
  const { company, occupation, skills } = version!;
  const password = 'correct horse battery';
  const stamp = `${test.info().project.name}-${Date.now().toString(36)}`;
  const made = await page.request.post(`${API}/auth/sign-up`, { data: { email: `version-${stamp}@device.test`, name: 'Version Seeker', password, purpose: 'work' } });
  expect(made.status(), 'account made').toBe(201);
  try {
    // The person holds one skill the company runs makes for, and has run the first of those makes.
    const skill = skills.find((each) => each.makes.some((make) => make.runs));
    const ran = skill?.makes.find((make) => make.runs);
    if (skill && ran) {
      expect((await page.request.put(`${API}/me/skills/${skill.id}`, { data: { status: 'held' } })).ok()).toBe(true);
      expect((await page.request.put(`${API}/me/skills/${skill.id}/makes`, { data: { makes: [ran.id] } })).ok()).toBe(true);
    }
    await page.goto(`/occupations/${occupation.id}?at=${company.id}`, { waitUntil: 'domcontentloaded' });
    const flow = page.locator('[data-route]');
    await expect(flow.locator('[data-skill-tag]')).toHaveCount(skills.length);
    // Progress is counted against the version's skills, not the standard's.
    const whole = page.locator('[data-held-count]');
    await expect(whole).toContainText(`${skill ? 1 : 0} of ${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`);
    if (skill && ran) {
      const tag = flow.locator(`[data-skill-tag="${skill.id}"]`);
      await expect(tag).toHaveAttribute('data-status', 'held');
      // The make the person has run is lit; the company's others are not. Brightness only: the same family of colour.
      await expect(tag.locator('[data-tag-make="lit"]')).toHaveText([ran.name]);
      await expect(tag.locator('[data-tag-make]')).toHaveCount(skill.makes.filter((make) => make.runs).length);
    }
    // The version's page reads a person's marks and changes none: no row is a toggle and the heading has no "Set as goal".
    await expect(flow.locator('[data-skill-tag] button')).toHaveCount(0);
    await expect(page.locator('[data-detail-action] button')).toHaveCount(0);
    // A skill marked elsewhere is counted here the next time the page is read, as on the standard.
    const next = skills.find((each) => each.id !== skill?.id);
    if (next) {
      expect((await page.request.put(`${API}/me/skills/${next.id}`, { data: { status: 'held' } })).ok()).toBe(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(flow.locator(`[data-skill-tag="${next.id}"]`)).toHaveAttribute('data-status', 'held');
      await expect(whole).toContainText(`${skill ? 2 : 1} of ${skills.length}`);
    }
    await expectOneRoute(flow, "a seeker on a company's version");
    await assertHealthyLayout(page, '/occupations/:id?at=company seeker');
  } finally {
    const gone = await page.request.delete(`${API}/me`, { data: { password } });
    expect(gone.ok(), 'account removed').toBe(true);
  }
});

test("an employer edits the company's version of a career with a thumb: a tap leaves a skill out, a chip says a make, each saved as it is made", async ({ page, request }) => {
  // Nothing is written: the person, their company and the saves are stood in for here, over the sample's own version.
  const version = await sampleVersion(request);
  expect(version, "the sample has a made-up company's version of a career").toBeTruthy();
  const { company, occupation } = version!;
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        user: { id: '00000000-0000-4000-8000-000000000003', email: 'employer@device.test', name: 'Device Employer', isAdmin: false, homeZip: null, about: null, emailNotices: true, purpose: 'hire' },
        memberships: [{ companyId: company.id, companyName: company.name, role: 'member', status: 'active' }],
        isEmployer: true,
      },
    })
  );
  await page.route('**/api/me/news', (route) => route.fulfill({ json: { applications: false, applicants: false, access: false } }));
  await page.route('**/api/employer', (route) =>
    route.fulfill({
      json: { companies: [{ companyId: company.id, companyName: company.name, role: 'member', status: 'active', decidedAt: null, askAgainAt: null, factories: [], jobs: [] }] },
    })
  );
  await page.route('**/api/employer/company-requests', (route) => route.fulfill({ json: { requests: [] } }));
  // A save is answered as the server would: the version as it stands, with the lists that were sent laid over it.
  const saves: { added?: string[]; leftOut?: string[]; makes?: string[] }[] = [];
  let current = version!;
  await page.route(`**/api/companies/${company.id}/careers/${occupation.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    const body = route.request().postDataJSON() as { added?: string[]; leftOut?: string[]; makes?: string[] };
    saves.push(body);
    const every = [...current.skills, ...current.leftOut];
    const out = new Set(body.leftOut ?? current.leftOut.map((skill) => skill.id));
    const runs = new Set(body.makes ?? []);
    const stand = (skill: DeviceVersionSkill) => ({ ...skill, makes: skill.makes.map((make) => ({ ...make, runs: !out.has(skill.id) && runs.has(make.id) })) });
    const on = (skill: DeviceVersionSkill) => (skill.added ? (body.added ?? []).includes(skill.id) : !out.has(skill.id));
    current = { ...current, skills: every.filter(on).map(stand), leftOut: every.filter((skill) => !skill.added && out.has(skill.id)).map(stand) };
    return route.fulfill({ json: current });
  });

  // Your jobs: under the company, its careers, and the way to add one.
  await page.goto('/employer', { waitUntil: 'domcontentloaded' });
  const careers = page.locator(`[data-company-careers="${company.id}"]`);
  const row = careers.locator(`[data-version-row="${occupation.id}"]`);
  await expect(row).toContainText(occupation.title);
  await expect(careers.locator('[data-add-career]')).toHaveText('Add a career');
  await careers.scrollIntoViewIfNeeded();
  await assertHealthyLayout(page, '/employer careers');
  // Adding one is choosing a career: the picker, and nothing else to fill in.
  await careers.locator('[data-add-career]').click();
  await expect(careers.getByRole('combobox')).toBeVisible();
  await expect(careers.locator('input, textarea, select')).toHaveCount(1);

  // Editing one is the path itself.
  await row.locator('a').click();
  await expect(page).toHaveURL(new RegExp(`/employer\\?company=${company.id}&career=${occupation.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(version!.title);
  const editor = page.locator('[data-version-editor]');
  const every = [...version!.skills, ...version!.leftOut];
  await expect(editor.locator('[data-edit-skill]')).toHaveCount(every.length);
  // Drawn on the route: one column, sections that open and close, and each row the switch it was.
  await expect(editor.locator('[data-route][data-route-plain]')).toHaveCount(1);
  await expect(editor).not.toContainText(/Fundamentals|Intermediate|Advanced/);
  expect(await editor.locator('[data-edit-skill]').evaluateAll((items) => new Set(items.map((item) => Math.round(item.getBoundingClientRect().left))).size), 'the rows are one column').toBe(1);
  await expect(editor.locator('[data-edit-skill][data-on="false"]')).toHaveCount(version!.leftOut.length);
  await expect(page.locator('form')).toHaveCount(0);
  await assertHealthyLayout(page, '/employer?career editor');

  // Every tag is a switch a full finger tall.
  const kept = version!.skills.find((skill) => !skill.added && skill.makes.length === 0) ?? version!.skills[0];
  const tag = editor.locator(`[data-edit-skill="${kept.id}"]`);
  const box = tag.getByRole('checkbox');
  await expect(box).toHaveAttribute('aria-checked', 'true');
  expect((await box.boundingBox())?.height ?? 0, 'a tag is at least 44px tall').toBeGreaterThanOrEqual(44);
  // One tap leaves it out, and that is saved at once; one more puts it back.
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'false');
  await expect(tag).toContainText('Left out');
  await expect.poll(() => saves.at(-1)?.leftOut?.includes(kept.id), { message: 'the tap was saved' }).toBe(true);
  await expect(page.locator('[data-version-saved]')).toHaveText('Saved');
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => saves.at(-1)?.leftOut?.includes(kept.id), { message: 'and so was the tap that put it back' }).toBe(false);

  // Under a skill that has makes: its makes as chips to tap.
  const withMakes = version!.skills.find((skill) => skill.makes.length > 0);
  if (withMakes) {
    const chips = editor.locator(`[data-edit-skill="${withMakes.id}"] [data-edit-makes] button`);
    await expect(chips).toHaveText(withMakes.makes.map((make) => make.name));
    const make = withMakes.makes.find((each) => !each.runs) ?? withMakes.makes[0];
    const chip = editor.locator(`[data-edit-skill="${withMakes.id}"] [data-make="${make.id}"]`);
    await expect(chip).toHaveAttribute('aria-pressed', String(make.runs));
    const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    expect((await chip.boundingBox())?.height ?? 0, 'a chip is a full finger tall on a touch screen').toBeGreaterThanOrEqual(touch ? 44 : 36);
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', String(!make.runs));
    await expect.poll(() => saves.at(-1)?.makes?.includes(make.id), { message: 'the make was saved' }).toBe(!make.runs);
    // A skill that is left out shows no chips; put back, they are as they were left.
    const owner = editor.locator(`[data-edit-skill="${withMakes.id}"]`).getByRole('checkbox');
    if (!withMakes.added) {
      await owner.click();
      await expect(editor.locator(`[data-edit-skill="${withMakes.id}"] [data-edit-makes]`)).toHaveCount(0);
      await expect.poll(() => saves.at(-1)?.makes?.includes(make.id), { message: 'a skill left out sends no makes' }).toBe(false);
      await owner.click();
      await expect(chip).toHaveAttribute('aria-pressed', String(!make.runs));
    }
  }
  // Every save sent the three lists whole.
  expect(saves.length).toBeGreaterThanOrEqual(2);
  for (const save of saves) expect(Object.keys(save).sort()).toEqual(['added', 'leftOut', 'makes']);
  await assertHealthyLayout(page, '/employer?career editor tapped');

  // A search adds a skill; deleting the version asks first.
  await expect(page.getByRole('combobox', { name: 'Add a skill' })).toBeVisible();
  await page.locator('[data-version-delete]').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(version!.title);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-version-page]')).toHaveAttribute('href', new RegExp(`/occupations/${occupation.id}\\?at=`));
});

test('two rows that may be one factory are set side by side, and merged or kept apart', async ({ page }) => {
  // Nothing is written and no account is made: the admin, the pairs and the answers are stood in for here.
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        user: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@device.test', name: 'Device Admin', isAdmin: true, homeZip: null, about: null, emailNotices: true, purpose: 'work' },
        memberships: [],
        isEmployer: false,
      },
    })
  );
  await page.route('**/api/me/news', (route) => route.fulfill({ json: { applications: false, applicants: false, access: false } }));
  const side = (id: string, name: string, company: string, more: Record<string, unknown> = {}) => ({
    id, name, company, companyId: `c-${company}`, address: '2825 W WASHINGTON ST', city: 'STEPHENVILLE', state: 'TX', zip: '76401',
    industry: null, people: null, products: null, openedYear: null, curated: false, jobs: 0, ids: ['EPA_ECHO 110000460466'], takes: [], ...more,
  });
  const A = '00000000-0000-4000-8000-0000000000a1';
  const B = '00000000-0000-4000-8000-0000000000b1';
  const C = '00000000-0000-4000-8000-0000000000c1';
  const E = '00000000-0000-4000-8000-0000000000e1';
  const pairs = [
    // Under two companies, names as long as the registry writes them.
    {
      a: side(A, 'ATLANTIC INERTIAL SYSTEMS INC. PART OF UTC AEROSPACE SYSTEMS - CHESHIRE MANUFACTURING FACILITY', 'United Technologies', { takes: ['industry', 'zip'] }),
      b: side(B, 'ATLANTIC INERTIAL SYSTEMS', 'Atlantic Inertial Systems', { industry: 'Computer and Electronic Product Manufacturing', takes: ['address'] }),
      keep: B, metres: 159, by: 'id', shared: 'EPA_ECHO 110000460466', reason: 'two companies', apart: false,
    },
    // One written from sources: it is the one kept.
    {
      a: side(C, 'FMC TECHNOLOGIES INC', 'Fmc'),
      b: side(E, 'TechnipFMC Stephenville', 'TechnipFMC', { curated: true, people: 1200, industry: 'Machinery Manufacturing' }),
      keep: E, metres: 12400, by: 'id', shared: 'EPA_ECHO 110000485975', reason: 'far apart', apart: false,
    },
  ];
  let merged: unknown = null;
  let apart: unknown = null;
  await page.route('**/api/admin/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/plants/pairs')) return route.fulfill({ json: { pairs, total: 991 } });
    if (path.endsWith('/plants/apart')) {
      apart = request.postDataJSON();
      return route.fulfill({ json: { apart: true } });
    }
    if (path.endsWith(`/records/factory/${A}/merge`)) {
      merged = request.postDataJSON();
      return route.fulfill({ json: { kept: { id: B, name: pairs[0].b.name, href: `/factories/${B}` }, merged: { id: A, name: pairs[0].a.name }, moved: {}, took: ['address'] } });
    }
    if (path.endsWith('/quality')) return route.fulfill({ json: { total: { state: null, plants: 10, industry: 5, code: 5, county: 10, people: 0, address: 10, outsideId: 10, onePlantCompanies: 2, duplicates: 4, duplicateGroups: 2, companies: 6 }, states: [{ state: 'TX', plants: 10, industry: 5, code: 5, county: 10, people: 0, address: 10, outsideId: 10, onePlantCompanies: 2, duplicates: 4, duplicateGroups: 2 }] } });
    if (path.endsWith('/overview')) return route.fulfill({ json: { users: 1, pendingMemberships: 0, openJobs: 0, applications: 0, draftPaths: 0 } });
    return route.fulfill({ json: { users: [], total: 0, memberships: [], requests: [], paths: [], records: [], entries: [], hasMore: false } });
  });

  // The quality table's count leads to the ones on one spot.
  await page.goto('/admin/activity?view=quality', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-quality-duplicates="TX"]')).toHaveAttribute('href', '/admin/review?pairs=spot&state=TX');
  // Review says some wait, and leads to them. (An address from before the pages lands there.)
  await page.goto('/admin?tab=data&pairs=spot&state=TX', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/admin\/review\?pairs=spot&state=TX$/);
  await page.goto('/admin/review', { waitUntil: 'domcontentloaded' });
  const way = page.locator('[data-review-row="pairs"]');
  await expect(way).toContainText('991');
  await assertHealthyLayout(page, '/admin/review');
  await way.click();
  await expect(page).toHaveURL(/pairs=id/);

  const card = page.locator(`[data-pair="${A}:${B}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('[data-pair-reason]')).toContainText('EPA registry id 110000460466');
  await expect(card.locator('[data-pair-reason]')).toContainText('One factory under two companies');
  await assertHealthyLayout(page, '/admin/review?pairs=id');
  // The two rows stand side by side on a wide screen and one above the other on a phone, never past the edge.
  const edges = await card.locator('[data-pair-side]').evaluateAll((sides) => sides.map((el) => el.getBoundingClientRect().right));
  for (const right of edges) expect(right, 'a row of the pair runs past the screen').toBeLessThanOrEqual(page.viewportSize()!.width);

  // The rule's choice is kept to begin with; choosing the other row changes what is taken and whose company it stays under.
  const sideA = card.locator(`[data-pair-side="${A}"]`);
  const sideB = card.locator(`[data-pair-side="${B}"]`);
  await expect(sideB).toHaveAttribute('aria-checked', 'true');
  await expect(card.locator('[data-pair-takes]')).toContainText('It takes from the other: address. It stays under Atlantic Inertial Systems.');
  await sideA.click({ position: { x: 8, y: 8 } });
  await expect(sideA).toHaveAttribute('aria-checked', 'true');
  await expect(card.locator('[data-pair-takes]')).toContainText('industry, ZIP code. It stays under United Technologies.');
  await sideB.click({ position: { x: 8, y: 8 } });

  // A row written from sources cannot be the one that goes.
  const locked = page.locator(`[data-pair="${C}:${E}"]`);
  // (Pressed all the same: the row is marked aria-disabled, which the test runner would otherwise wait out.)
  await locked.locator(`[data-pair-side="${C}"]`).click({ position: { x: 8, y: 8 }, force: true });
  await expect(locked.locator(`[data-pair-side="${E}"]`)).toHaveAttribute('aria-checked', 'true');
  await expect(locked.locator('[data-pair-takes]')).toContainText('The row written from sources is the one kept.');

  // Two factories: said in one press, with a way back.
  await locked.locator('[data-pair-apart]').click();
  await expect.poll(() => apart).toEqual({ a: C, b: E, apart: true });
  await expect(page.getByText('Kept FMC TECHNOLOGIES INC and TechnipFMC Stephenville as two factories.')).toBeVisible();

  // Merge asks first, naming both rows; then says what it did.
  await card.locator('[data-pair-merge]').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('ATLANTIC INERTIAL SYSTEMS INC. PART OF UTC AEROSPACE SYSTEMS');
  await expect(dialog).toContainText('Cannot be undone.');
  await assertHealthyLayout(page, '/admin/review?pairs=id:confirm');
  await dialog.getByRole('button', { name: 'Merge' }).click();
  await expect.poll(() => merged).toEqual({ into: B });
  await expect(page.getByText(/^Merged ATLANTIC INERTIAL SYSTEMS INC\. PART OF UTC/)).toBeVisible();
});

// ---------------------------------------------------------------------------
// A career's path, seen on the Atlas
// ---------------------------------------------------------------------------

interface CareerOnPlate {
  id: string;
  title: string;
  /** Its skills the taxonomy places, as the plate draws them. */
  skills: { id: string; name: string; domain: { slug: string } | null }[];
}

/** The first career of the list, with the skills of it that have a leaf on the plate. */
async function careerOnPlate(request: APIRequestContext): Promise<CareerOnPlate> {
  const taxonomy = (await (await request.get(`${API}/skills/taxonomy`)).json()) as AtlasTaxonomy;
  const placed = new Set(taxonomy.domains.flatMap((domain) => domain.groups.flatMap((group) => group.skills.map((skill) => skill.id))));
  const id = await firstId(request, '/occupations');
  expect(id, 'the API returned a career to open').toBeTruthy();
  const detail = (await (await request.get(`${API}/occupations/${id}`)).json()) as { title: string; skills: CareerOnPlate['skills'] };
  const skills = detail.skills.filter((skill) => placed.has(skill.id));
  expect(skills.length, 'the career has skills on the plate').toBeGreaterThan(0);
  return { id: id as string, title: detail.title, skills };
}

test("a career's path is seen on the Atlas: its shape and its skills as tags, with no marks for a visitor", async ({ page, request }) => {
  const career = await careerOnPlate(request);
  const domains = [...new Set(career.skills.map((skill) => skill.domain?.slug))];
  const views = page.getByRole('navigation', { name: 'Path as' });
  const view = page.locator('[data-career-atlas]');
  const plate = view.locator('.atlas-plate');

  // The switch: one press from the route, written into the address.
  await page.goto(`/occupations/${career.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-route]')).toHaveCount(1);
  await views.getByRole('link', { name: 'Atlas' }).click();
  await expect(page).toHaveURL(new RegExp(`/occupations/${career.id}\\?path=atlas$`));
  await expect(views.locator('[aria-current="page"]')).toHaveText('Atlas');
  await expect(page.locator('[data-route]')).toHaveCount(0);

  // The plate, with this career laid over it: every skill of it lit, the rest stepped back, nothing marked.
  await expect(plate).toHaveAttribute('data-atlas-view', 'whole');
  await expect(plate.locator('[data-atlas-lit]')).toHaveCount(career.skills.length);
  await expect(plate.locator('.atlas-base')).toHaveAttribute('data-dim', 'true');
  await expect(plate.locator('[data-atlas-walk], [data-atlas-mark], [data-ahead]')).toHaveCount(0);
  // Under it, the same skills as tags: names that open the skill, no mark and no progress.
  const tags = view.locator('[data-skill-tag]');
  await expect(tags).toHaveCount(career.skills.length);
  await expect(tags.first().locator('a')).toHaveAttribute('href', /^\/skills\/[0-9a-f-]{36}$/);
  await expect(view.locator('[data-skill-tag] button')).toHaveCount(0);
  await expect(page.locator('[data-held-count], [data-section-count]')).toHaveCount(0);
  // The tags follow the route, not the levels: no level is named under the plate.
  await expect(view.locator('.career-atlas-list')).not.toContainText(/Fundamentals|Intermediate|Advanced/);
  await expect(page.locator('#skills')).toContainText('to see which of these skills you have');
  await expect(view.locator('[data-atlas-link]')).toHaveAttribute('href', `/atlas?career=${career.id}`);

  // The plate is square, inside the page, and never taller than about half the screen, so tags are in reach under it.
  const size = page.viewportSize() ?? { width: 0, height: 0 };
  const box = await plate.boundingBox();
  expect(box && Math.abs(box.width - box.height) <= 1, 'the plate is square').toBe(true);
  expect(box && box.x >= 0 && box.x + box.width <= size.width + 1, 'the plate is inside the page').toBe(true);
  if (size.width < 600) expect(box && box.width >= Math.min(size.width - 40, size.height * 0.47 - 1), 'on a phone the plate takes the room it is given').toBe(true);
  // From 1024px the view stands in the page's column: the plate under the Path heading, the tags under the switch, and the plate no taller than the window.
  if (size.width >= 1024) {
    const heading = await page.locator('#skills h2').first().boundingBox();
    const switchBox = await views.boundingBox();
    const list = await view.locator('.career-atlas-list').boundingBox();
    expect(box && heading && Math.abs(box.x - heading.x) <= 2, 'the plate starts under the heading').toBe(true);
    expect(list && switchBox && Math.abs(list.x + list.width - (switchBox.x + switchBox.width)) <= 2, 'the tags end under the switch').toBe(true);
    expect(box && box.height <= size.height - 56, 'the plate fits the window under the header').toBe(true);
  }
  await assertHealthyLayout(page, '/occupations/:id?path=atlas');

  // On a screen tall enough the plate holds still while the tags move under it.
  if (size.height >= 560) {
    await tags.last().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 120));
    const held = await plate.boundingBox();
    const tagsEnd = await tags.last().boundingBox();
    if (held && tagsEnd && tagsEnd.y > held.y + held.height) {
      expect(held.y, 'the plate stays under the header').toBeGreaterThanOrEqual(40);
      expect(held.y, 'the plate stays at the top of the screen').toBeLessThanOrEqual(120);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  // The choice is kept: across a reload, and for the next career opened in this visit.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(views.locator('[aria-current="page"]')).toHaveText('Atlas');
  await expect(plate.locator('[data-atlas-lit]')).toHaveCount(career.skills.length);
  await page.goto(`/occupations/${career.id}`, { waitUntil: 'domcontentloaded' });
  await expect(views.locator('[aria-current="page"]')).toHaveText('Atlas');
  await expect(view).toHaveCount(1);

  // A domain the career reaches: its word under the plate turns to it and narrows the tags to the career's part of it.
  if (domains.length > 1) {
    const slug = domains[domains.length - 1] as string;
    const part = career.skills.filter((skill) => skill.domain?.slug === slug).length;
    await view.locator(`[data-career-atlas-domain-link="${slug}"]`).click();
    await expect(page).toHaveURL(new RegExp(`\\?path=atlas&domain=${slug}$`));
    await expect(plate).toHaveAttribute('data-atlas-view', 'domain');
    await expect(tags).toHaveCount(part);
    await assertHealthyLayout(page, '/occupations/:id?path=atlas&domain');
    // One press back shows the whole.
    await view.locator('[data-career-atlas-whole]').click();
    await expect(page).toHaveURL(new RegExp(`\\?path=atlas$`));
    await expect(plate).toHaveAttribute('data-atlas-view', 'whole');
    await expect(tags).toHaveCount(career.skills.length);
    // Pressing the plate on one of the career's skills opens that skill's domain.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#skills').scrollIntoViewIfNeeded();
    // The plate is still turning back to the whole: its leaves are where they will be once it has stopped.
    await page.waitForTimeout(900);
    const dot = await plate.locator('[data-atlas-lit] circle').first().boundingBox();
    expect(dot, 'the career has a skill drawn').toBeTruthy();
    if (dot) await page.mouse.click(dot.x + dot.width / 2, dot.y + dot.height / 2);
    await expect(page).toHaveURL(/\?path=atlas&domain=[a-z0-9-]+$/);
    await expect(plate).toHaveAttribute('data-atlas-view', 'domain');
    await page.goBack();
    await expect(plate).toHaveAttribute('data-atlas-view', 'whole');
  }

  // Back to the route, and that is kept too.
  await views.getByRole('link', { name: 'Route' }).click();
  await expect(page).toHaveURL(new RegExp(`/occupations/${career.id}\\?path=route$`));
  await expect(page.locator('[data-route]')).toHaveCount(1);
  await page.goto(`/occupations/${career.id}`, { waitUntil: 'domcontentloaded' });
  await expect(views.locator('[aria-current="page"]')).toHaveText('Route');
  // The route was the flow: an old link still opens it, over an Atlas kept from earlier in the visit.
  await page.goto(`/occupations/${career.id}?path=atlas`, { waitUntil: 'domcontentloaded' });
  await expect(view).toHaveCount(1);
  await page.goto(`/occupations/${career.id}?path=flow`, { waitUntil: 'domcontentloaded' });
  await expect(views.locator('[aria-current="page"]')).toHaveText('Route');
  await expect(page.locator('[data-route]')).toHaveCount(1);
});

test("a seeker's career on the Atlas: read on its page, filled in on /atlas, a small plate on Profile; an employer sees its shape", async ({ page, baseURL, request }) => {
  // Writes: it makes two accounts, marks skills, sets a goal and deletes the accounts. Never against a deployed copy.
  test.skip(!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL ?? ''), 'creates accounts: local only');
  const password = 'correct horse battery';
  const stamp = `${test.info().project.name}-${Date.now().toString(36)}`;
  const career = await careerOnPlate(request);
  const total = career.skills.length;
  const held = async (): Promise<number> => {
    const match = /(\d+) of (\d+)/.exec((await page.locator('[data-held-count]').textContent()) ?? '');
    expect(match, 'the page says "N of M"').toBeTruthy();
    return Number(match?.[1]);
  };

  for (const purpose of ['hire', 'work'] as const) {
    const made = await page.request.post(`${API}/auth/sign-up`, {
      data: { email: `catlas-${purpose}-${stamp}@device.test`, name: `Atlas ${purpose}`, password, purpose },
    });
    expect(made.status(), `${purpose}: account made`).toBe(201);
    try {
      await page.goto(`/occupations/${career.id}?path=atlas`, { waitUntil: 'domcontentloaded' });
      const view = page.locator('[data-career-atlas]');
      const plate = view.locator('.atlas-plate');
      // What moves while a career is filled in is a drawing of its own over the plate: the ring at the centre, a mark arriving.
      const moving = view.locator('.atlas-moving');
      await expect(plate.locator('[data-atlas-lit]')).toHaveCount(total);
      if (purpose === 'hire') {
        // Someone here to hire sees the career's shape: no marks on the plate, none on the tags, no progress.
        await expect(view.locator('[data-skill-tag]')).toHaveCount(total);
        await expect(view.locator('[data-skill-tag] button')).toHaveCount(0);
        await expect(plate.locator('[data-atlas-walk], [data-atlas-mark], [data-ahead]')).toHaveCount(0);
        await expect(moving).toHaveCount(0);
        await expect(page.locator('[data-held-count]')).toHaveCount(0);
        await assertHealthyLayout(page, '/occupations/:id?path=atlas hire');
        continue;
      }

      // A seeker: every skill of the career is ahead, an open mark; the ring at the centre is empty and the page agrees.
      await expect(plate).toHaveAttribute('data-atlas-walking', 'true');
      await expect(plate.locator('[data-ahead]')).toHaveCount(total);
      await expect(moving.locator('[data-atlas-share]')).toHaveAttribute('data-atlas-share', `0/${total}`);
      await expect(plate.locator('[data-atlas-mark]')).toHaveCount(0);
      expect(await held()).toBe(0);
      const leaves = await plate.locator('.atlas-leaf').count();

      // The career's page reads a person's marks and changes none: under the plate a tag shows its mark and is no toggle.
      const tag = view.locator('[data-skill-tag]').first();
      const skill = await tag.getAttribute('data-skill-tag');
      await expect(view.locator('[data-skill-tag] button')).toHaveCount(0);
      await expect(tag.locator('[data-skill-mark]')).toHaveCount(1);
      // A skill marked elsewhere (Profile; here, the API): its leaf is filled, the way to it is drawn, the ring has moved, and the page's count agrees.
      expect((await page.request.put(`${API}/me/skills/${skill}`, { data: { status: 'held' } })).ok(), 'a skill marked held').toBe(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(tag).toHaveAttribute('data-status', 'held');
      await expect(plate.locator('[data-atlas-mark="held"]')).toHaveCount(1);
      await expect(plate.locator(`[data-atlas-mark-of="${skill}"]`)).toHaveCount(1);
      await expect(plate.locator('[data-atlas-walked]')).toHaveCount(1);
      await expect(plate.locator(`[data-atlas-walked="${skill}"]`)).toHaveCount(1);
      await expect(moving.locator('[data-atlas-share]')).toHaveAttribute('data-atlas-share', `1/${total}`);
      await expect.poll(held, { message: 'the page follows' }).toBe(1);
      expect(await plate.locator('[data-atlas-mark="held"]').count(), 'the plate and the page agree').toBe(await held());
      expect(await plate.locator('.atlas-leaf').count()).toBe(leaves);
      // The moving drawing lies exactly over the plate.
      const [under, over] = [await plate.boundingBox(), await moving.boundingBox()];
      expect(under && over && Math.abs(under.x - over.x) <= 1 && Math.abs(under.y - over.y) <= 1 && Math.abs(under.width - over.width) <= 1, 'the two drawings are one').toBe(true);
      await assertHealthyLayout(page, '/occupations/:id?path=atlas marked');
      expect((await page.request.delete(`${API}/me/skills/${skill}`)).ok(), 'the mark cleared').toBe(true);

      // Every skill held: the career is whole on the plate, with nothing left ahead to say so.
      for (const each of career.skills) {
        expect((await page.request.put(`${API}/me/skills/${each.id}`, { data: { status: 'held' } })).ok(), 'a skill marked held').toBe(true);
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(plate.locator('[data-atlas-walk]')).toHaveAttribute('data-atlas-whole-career', 'true');
      await expect(plate.locator('[data-atlas-walked]')).toHaveCount(total);
      await expect(moving.locator('[data-atlas-share]')).toHaveAttribute('data-atlas-share', `${total}/${total}`);
      await expect(moving.locator('.atlas-share-whole')).toHaveCount(1);
      // All but two, for what follows.
      for (const each of career.skills.slice(2)) await page.request.delete(`${API}/me/skills/${each.id}`);
      const kept = Math.min(2, total);

      // The same on /atlas with the career laid over it: its line says how much is held, and a group's tags for its skills carry the mark.
      await page.goto(`/atlas?career=${career.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-atlas-career-facts]')).toHaveText(` · ${kept} of ${total} ${total === 1 ? 'skill' : 'skills'} held`);
      const atlas = page.locator('[data-atlas] .atlas-plate');
      await expect(atlas).toHaveAttribute('data-atlas-walking', 'true');
      await expect(atlas.locator('[data-atlas-walked]')).toHaveCount(kept);
      const ahead = career.skills[total - 1];
      if (total > 2) {
        await page.goto(`/atlas?career=${career.id}&skill=${ahead.id}`, { waitUntil: 'domcontentloaded' });
        const markable = page.locator(`[data-atlas-panel] [data-atlas-markable="${ahead.id}"]`);
        await expect(markable).toHaveCount(1);
        // Only the career's skills carry the mark; the group's others stay links.
        const inGroup = await page.locator('[data-atlas-panel] [data-atlas-tag]').count();
        const marked = await page.locator('[data-atlas-panel] [data-atlas-markable]').count();
        expect(marked, 'the career has skills in this group').toBeGreaterThan(0);
        expect(marked).toBeLessThanOrEqual(inGroup);
        await markable.locator('button').click();
        await expect(markable).toHaveAttribute('data-status', 'held');
        await expect(page.locator('[data-atlas-career-facts]')).toHaveText(` · ${kept + 1} of ${total} skills held`);
        await expect(atlas.locator(`[data-atlas-walked="${ahead.id}"]`)).toHaveCount(1);
        await assertHealthyLayout(page, '/atlas?career&skill marked');
        await markable.locator('button').click();
        await expect(page.locator('[data-atlas-career-facts]')).toHaveText(` · ${kept} of ${total} skills held`);
        await expect
          .poll(async () => ((await (await page.request.get(`${API}/me/skills`)).json()) as { skills: unknown[] }).skills.length, { message: 'the mark was cleared' })
          .toBe(kept);
      }
      // Without a career the panel's tags are links, as they were.
      await page.goto(`/atlas?skill=${ahead.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-atlas-panel] [data-atlas-tag]').first()).toBeVisible();
      await expect(page.locator('[data-atlas-panel] [data-atlas-markable]')).toHaveCount(0);

      // Profile: the goal shows its career as a small plate, filled as far as it is held, and opens that view.
      expect((await page.request.put(`${API}/me/goals/${career.id}`)).ok(), 'the career set as a goal').toBe(true);
      await page.goto('/me', { waitUntil: 'domcontentloaded' });
      const goal = page.locator(`[data-goal="${career.id}"]`);
      await expect(goal.locator('[data-goal-plate]')).toHaveAttribute('data-goal-plate', `${kept}/${total}`);
      await expect(page.locator('[data-goal-plate-ground]')).toHaveCount(1);
      const small = await goal.locator('[data-goal-plate]').boundingBox();
      expect(small && Math.abs(small.width - small.height) <= 1 && small.width >= 44 && small.width <= 80, 'the plate is the size of a thumb').toBe(true);
      await expect(goal.locator('[data-goal-held]')).toContainText(`${kept} of ${total}`);
      await assertHealthyLayout(page, '/me goal plate');
      await expect(goal.locator('[data-goal-plate-link]')).toHaveAttribute('href', `/occupations/${career.id}?path=atlas#skills`);
      await goal.locator('[data-goal-plate-link]').click();
      await expect(page).toHaveURL(new RegExp(`/occupations/${career.id}\\?path=atlas#skills$`));
      await expect(page.getByRole('navigation', { name: 'Path as' }).locator('[aria-current="page"]')).toHaveText('Atlas');
      await expect(page.locator('[data-career-atlas] [data-atlas-walked]')).toHaveCount(kept);
    } finally {
      const gone = await page.request.delete(`${API}/me`, { data: { password } });
      expect(gone.ok(), `${purpose}: account removed`).toBe(true);
    }
  }
});

// ---------------------------------------------------------------------------
// Jobs that come from employers' own postings. Nothing is written and no
// account is made: the list, the job and the reader are stood in for here, at
// the size a real board gives (thousands of jobs, long titles).
// ---------------------------------------------------------------------------

const POSTED_JOB = '00000000-0000-4000-8000-00000000a0b1';
// The job's address: its company, its career and its number (shared/jobs.ts).
const POSTED_JOB_PATH = '/jobs/space-exploration-technologies/cnc-machinist/1000';
const SKILL = (n: number) => `00000000-0000-4000-8000-0000000005${String(n).padStart(2, '0')}`;

function postedJobs(offset: number, limit: number) {
  const titles = [
    'CNC Machinist, Tool & Die - Level 4/5', 'Senior Manufacturing Engineer, Injection Molding (Starlink)', 'Welder', 'Quality Inspector, 1st Shift',
    'Maintenance Technician II (2nd Shift) - Composite Structures Fabrication and Assembly', 'Production Operator',
  ];
  return Array.from({ length: limit }, (_, i) => {
    const n = offset + i;
    return {
      id: n === 0 ? POSTED_JOB : `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      serial: 1000 + n, title: titles[n % titles.length],
      // What a posting does not state is not said: pay on some, the type on some.
      employmentType: n % 3 === 0 ? 'full-time' : null, shift: n % 4 === 0 ? '2nd shift' : null,
      payMin: n % 2 === 0 ? 2800 : null, payMax: n % 2 === 0 ? 4200 : null, payPeriod: 'hour', status: 'open',
      postedAt: new Date(Date.now() - n * 3_600_000).toISOString(), expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      companyId: '00000000-0000-4000-8000-0000000000c1', companyName: 'Space Exploration Technologies', companyDomain: null,
      factoryId: '00000000-0000-4000-8000-0000000000f1', factoryName: 'SPACE EXPLORATION TECHNOLOGIES BASTROP', city: 'BASTROP', state: 'TX',
      latitude: '30.1', longitude: '-97.3', occupationId: '00000000-0000-4000-8000-0000000000d1', occupationTitle: 'CNC Machinist',
    };
  });
}

async function standInForPostedJobs(page: Page, options: { total?: number; canManage?: boolean } = {}) {
  const total = options.total ?? 4812;
  await page.route('**/api/jobs/summary', (route) => route.fulfill({ json: { total, states: [{ state: 'TX', jobs: 2100 }, { state: 'CA', jobs: 1900 }, { state: 'WA', jobs: 812 }] } }));
  await page.route(/\/api\/jobs\?/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    const offset = Number(query.get('offset') ?? 0);
    const limit = Number(query.get('limit') ?? 40);
    return route.fulfill({ json: { jobs: postedJobs(offset, Math.min(limit, total - offset)), total, limit, offset } });
  });
  // The page reads the job by the number its address ends in; an older link reads it by id.
  const place = (level: number, group: string, domain: string) => ({ level, group: { slug: group.toLowerCase().replace(/ /g, '-'), name: group }, domain: { slug: domain.toLowerCase(), name: domain } });
  const on = (n: number, name: string, where: ReturnType<typeof place>, more: Record<string, unknown> = {}) => ({ id: SKILL(n), name, ...where, named: false, optional: false, added: false, held: false, makes: [], ...more });
  const answer = {
    job: {
      ...postedJobs(0, 1)[0], companySlug: null, description: null, applyUrl: 'https://boards.greenhouse.io/spacex/jobs/8643277002?gh_jid=8643277002', closedReason: null, isOpen: true,
      hasVersion: false, fromSource: true, levelWord: 'Senior', levelRank: 3, lastSeenAt: new Date().toISOString(),
      requirements: { yearsMin: 5, education: 'High school diploma or equivalent', certifications: ['NIMS Machining Level I', 'AWS D17.1'], clearance: 'Secret clearance', citizenship: 'US person (ITAR)' },
      href: POSTED_JOB_PATH,
    },
    // What the posting's text was read to name: four skills, one of them not on the career's path.
    skills: [
      { id: SKILL(1), name: 'CNC Control Operation', required: true, held: false, makes: [{ id: 'm1', name: 'Mazak' }, { id: 'm2', name: 'Okuma' }, { id: 'm3', name: 'Heidenhain' }] },
      { id: SKILL(2), name: 'Blueprint Reading', required: true, held: false, makes: [] },
      { id: SKILL(3), name: 'Coordinate Measuring Machine Operation and Programming', required: true, held: false, makes: [] },
      { id: SKILL(4), name: 'GD&T Interpretation', required: true, held: false, makes: [] },
    ],
    // What the page draws: the career's whole path, with what the posting names marked.
    path: {
      of: 'career',
      skills: [
        on(2, 'Blueprint Reading', place(1, 'Shop basics', 'Production'), { named: true }),
        on(5, 'Shop Math', place(1, 'Shop basics', 'Production')),
        on(6, 'Micrometer Measurement', place(1, 'Measurement tools', 'Quality')),
        on(1, 'CNC Control Operation', place(2, 'CNC setup', 'Machining'), { named: true, makes: [{ id: 'm1', name: 'Mazak' }, { id: 'm2', name: 'Okuma' }, { id: 'm3', name: 'Heidenhain' }] }),
        on(7, 'Tool and Work Offsets', place(2, 'CNC setup', 'Machining')),
        on(8, 'CNC Milling', place(2, 'CNC machining', 'Machining')),
        on(4, 'GD&T Interpretation', place(2, 'Part inspection', 'Quality'), { named: true }),
        on(9, 'Five-Axis Machining Setup and First-Article Prove-Out', place(3, 'CNC machining', 'Machining')),
      ],
      alsoNamed: [on(3, 'Coordinate Measuring Machine Operation and Programming', place(2, 'Coordinate measuring', 'Quality'), { named: true })],
    },
    others: {
      career: { jobs: postedJobs(6, 2).map((job) => ({ ...job, companySlug: null })), total: 9 },
      factory: { jobs: postedJobs(2, 1).map((job) => ({ ...job, companySlug: null, occupationTitle: 'Welder' })), total: 1 },
    },
    myApplication: null,
    canManage: Boolean(options.canManage),
  };
  await page.route(`**/api/jobs/${POSTED_JOB}`, (route) => route.fulfill({ json: answer }));
  await page.route('**/api/jobs/by-number/1000', (route) => route.fulfill({ json: answer }));
}

test('the Jobs list at volume: two fields, how many match in all, and a page at a time', async ({ page }) => {
  await standInForPostedJobs(page);
  await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status').filter({ hasText: 'open jobs' })).toHaveText(/4,812 open jobs/);
  // Two fields and a list, whatever the list's length.
  await expect(page.getByRole('searchbox', { name: 'Job, company or career' })).toBeVisible();
  const cards = page.locator('a[href^="/jobs/"]');
  await expect(cards).toHaveCount(40);
  // A posting that states no pay says nothing about pay; a city stored in capitals is read as a name.
  await expect(cards.nth(1)).not.toContainText(/Pay not listed|an hour/);
  await expect(cards.nth(0)).toContainText('$28–$42 an hour');
  await expect(cards.nth(0)).toContainText('Bastrop, TX');
  await assertHealthyLayout(page, '/jobs at volume');
  // The next page is asked for, never the whole of a long list.
  const more = page.locator('[data-more-jobs]');
  await more.scrollIntoViewIfNeeded();
  await expect(page.locator('[data-jobs-shown]')).toHaveText('40 of 4,812');
  const box = await more.boundingBox();
  expect(box?.height ?? 0, 'Show more is a full finger tall').toBeGreaterThanOrEqual(40);
  await more.click();
  await expect(cards).toHaveCount(80);
  await expect(page.locator('[data-jobs-shown]')).toHaveText('80 of 4,812');
  await assertHealthyLayout(page, '/jobs at volume, a second page');
  // What is typed is counted over everything that matches, not over what is on screen.
  await page.getByRole('searchbox', { name: 'Job, company or career' }).fill('machinist');
  await expect(page.getByRole('status').filter({ hasText: 'match' })).toHaveText(/4,812 jobs match/);
});

test("a job from a company's careers site, as a visitor: tags, facts, one way to apply and the career's whole path", async ({ page }) => {
  await standInForPostedJobs(page);
  // An older link, by the job's id, opens the job and is replaced by its address.
  await page.goto(`/jobs/${POSTED_JOB}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-detail-kind]')).toHaveText('Job');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('CNC Machinist, Tool & Die - Level 4/5');
  await expect(page).toHaveURL(new RegExp(`${POSTED_JOB_PATH}$`));
  // Under the title, the company, the factory and the career as tags, each opening its page.
  const tags = page.locator('[data-job-tags] a');
  await expect(tags).toHaveCount(3);
  await expect(tags.nth(0)).toHaveAttribute('href', /^\/companies\//);
  await expect(tags.nth(0)).toContainText('Space Exploration Technologies');
  await expect(tags.nth(1)).toHaveAttribute('href', /^\/factories\//);
  await expect(tags.nth(1)).toContainText('Bastrop, TX');
  await expect(tags.nth(2)).toHaveAttribute('href', /^\/occupations\//);
  await expect(tags.nth(2)).toContainText('CNC Machinist');
  const narrow = (page.viewportSize()?.width ?? 0) < 640;
  for (let i = 0; i < 3; i += 1) {
    const box = await tags.nth(i).boundingBox();
    expect(box?.height ?? 0, 'a tag is a full finger tall on a phone').toBeGreaterThanOrEqual(narrow ? 44 : 36);
    expect(await tags.nth(i).evaluate((node) => getComputedStyle(node).borderRadius)).toBe('8px');
  }
  // The one action: Apply, on the company's own page, in a new tab.
  const apply = page.locator('[data-apply-on-site]');
  await expect(apply).toHaveCount(1);
  await expect(apply).toHaveAttribute('href', 'https://boards.greenhouse.io/spacex/jobs/8643277002?gh_jid=8643277002');
  await expect(apply).toHaveAttribute('target', '_blank');
  await expect(apply).toHaveAttribute('rel', /noopener/);
  expect((await apply.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
  // Beside it, whose page that is, by the company's name: never the hiring system's host.
  await expect(page.locator('[data-apply-where]')).toHaveText(/^On .+ careers site$/);
  await expect(page.locator('main')).not.toContainText('boards.greenhouse.io');
  // The facts the posting states, each under its word; nothing for what it does not say.
  const terms = page.locator('[data-job-terms]');
  await expect(terms).toContainText('$28–$42 an hour');
  await expect(terms).toContainText('Senior');
  await expect(terms.locator('[data-job-requirement="experience"]')).toHaveText('5 years or more');
  await expect(terms.locator('[data-job-requirement="schooling"]')).toHaveText('High school diploma or equivalent');
  await expect(terms.locator('[data-job-requirement="certificates"]')).toHaveText('NIMS Machining Level I, AWS D17.1');
  await expect(terms.locator('[data-job-requirement="clearance"]')).toHaveText('Secret clearance');
  await expect(terms.locator('[data-job-requirement="citizenship"]')).toHaveText('US person (ITAR)');
  // The skills are the career's path, by skill group with no level named: eight, of which the posting names three, and one more after them.
  const path = page.locator('[data-job-path="career"]');
  await expect(path.locator('[data-job-groups]')).toHaveCount(1);
  await expect(path).not.toContainText(/Fundamentals|Intermediate|Advanced/i);
  await expect(path.locator('[data-group-box] [data-skill-tag]')).toHaveCount(8);
  await expect(path.locator('[data-group-box] [data-skill-tag][data-named]')).toHaveCount(3);
  await expect(path.locator(`[data-skill-tag="${SKILL(2)}"]`)).toContainText('Named in the posting');
  await expect(path.locator(`[data-skill-tag="${SKILL(5)}"]`)).not.toContainText('Named in the posting');
  await expect(page.locator('[data-job-also-named]')).toContainText('Also named in the posting');
  // One sentence says how much of the path the posting itself names.
  await expect(page.locator('[data-job-named-count]')).toHaveText('The posting names 3 of these 8, and 1 more.');
  // The way out is one button in the facts panel; for a visitor it is Apply, and there is no second one.
  await expect(page.locator('[data-job-panel] [data-job-action] [data-apply-on-site]')).toHaveCount(1);
  await expect(page.locator('[data-view-on-site]')).toHaveCount(0);
  await expect(page.locator('[data-job-also-named] [data-skill-tag]')).toHaveCount(1);
  // Read, not worked on: no mark and no control on a tag; a visitor is shown the way to sign in, and back.
  await expect(page.locator('[data-skill-tag] button')).toHaveCount(0);
  await expect(page.locator('[data-job-overlap]')).toHaveCount(0);
  await expect(page.locator('[data-job-overlap-sign-in] a')).toHaveAttribute('href', new RegExp(`^/sign-in\\?next=${encodeURIComponent(POSTED_JOB_PATH)}`));
  // The equipment the posting names, each make beside its skill.
  const equipment = page.locator('[data-job-equipment] li');
  await expect(equipment).toHaveCount(1);
  await expect(equipment.first()).toContainText('Mazak, Okuma, Heidenhain');
  await expect(equipment.first()).toContainText('CNC Control Operation');
  // Other open jobs, each at its own address.
  await expect(page.locator('#more-for-career a[href^="/jobs/space-exploration-technologies/cnc-machinist/"]')).toHaveCount(2);
  await expect(page.locator('#more-for-career [data-all-jobs]')).toHaveText('All 9');
  await expect(page.locator('#more-at-factory li')).toHaveCount(1);
  // Nothing of a job posted here: no description, no form, nothing to manage.
  await expect(page.getByText('About the job')).toHaveCount(0);
  await expect(page.locator('#apply, #applicants, #manage-job')).toHaveCount(0);
  await expect(page.getByText(/Post another like this|Sign in to apply/)).toHaveCount(0);
  await assertHealthyLayout(page, '/jobs/:company/:career/:number from a posting');
  // An address whose words are wrong, with the right number, is the same job at the right address.
  await page.goto('/jobs/some-other-company/a-renamed-career/1000', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('CNC Machinist, Tool & Die - Level 4/5');
  await expect(page).toHaveURL(new RegExp(`${POSTED_JOB_PATH}$`));
  // The jobs list writes the same address.
  await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('a[href^="/jobs/"]').first()).toHaveAttribute('href', POSTED_JOB_PATH);
});

test("a job from a company's careers site, as a seeker and as the company: a count and ticks for one, a line and nothing to edit for the other", async ({ page }) => {
  const person = (purpose: 'work' | 'hire', memberships: unknown[] = []) => ({
    user: { id: '00000000-0000-4000-8000-000000000002', email: 'person@device.test', name: 'Device Person', isAdmin: false, homeZip: null, about: null, emailNotices: true, purpose },
    memberships, isEmployer: memberships.length > 0,
  });
  await page.route('**/api/me/news', (route) => route.fulfill({ json: { applications: false, applicants: false, access: false } }));
  await page.route('**/api/me/skills', (route) =>
    route.fulfill({ json: { skills: [
      { skillId: SKILL(1), name: 'CNC Control Operation', status: 'held', updatedAt: new Date().toISOString(), makes: [{ id: 'm1', name: 'Mazak' }] },
      { skillId: SKILL(2), name: 'Blueprint Reading', status: 'learning', updatedAt: new Date().toISOString(), makes: [] },
      { skillId: SKILL(6), name: 'Micrometer Measurement', status: 'held', updatedAt: new Date().toISOString(), makes: [] },
    ] } })
  );
  // A seeker: one line with the ring says how many of the path's skills they hold, and those are ticked. Nothing is marked here.
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: person('work') }));
  await standInForPostedJobs(page);
  await page.goto(POSTED_JOB_PATH, { waitUntil: 'domcontentloaded' });
  const overlap = page.locator('[data-job-overlap]');
  await expect(overlap).toHaveText('You hold 2 of 8');
  await expect(overlap.locator('[data-share-ring]')).toHaveCount(1);
  await expect(page.locator('[data-job-overlap-sign-in]')).toHaveCount(0);
  await expect(page.locator(`[data-skill-tag="${SKILL(1)}"]`)).toHaveAttribute('data-status', 'held');
  await expect(page.locator(`[data-skill-tag="${SKILL(1)}"] [data-skill-mark="held"]`)).toHaveCount(1);
  await expect(page.locator(`[data-skill-tag="${SKILL(2)}"]`)).toHaveAttribute('data-status', 'learning');
  await expect(page.locator(`[data-skill-tag="${SKILL(5)}"]`)).toHaveAttribute('data-status', 'none');
  await expect(page.locator('[data-skill-tag] button')).toHaveCount(0);
  // A make they have run stands in full ink among the equipment.
  await expect(page.locator('[data-job-equipment] [data-make="lit"]')).toContainText('Mazak');
  await expect(page.locator('[data-job-equipment] [data-make="lit"]')).toHaveCount(1);
  await expect(page.locator('[data-apply-on-site]')).toHaveCount(1);
  await assertHealthyLayout(page, 'a job from a posting, a seeker');

  // Someone who manages the company's jobs: told where it comes from, with nothing to change, nothing to apply to and no count.
  await page.unroute('**/api/auth/me');
  await page.unroute(`**/api/jobs/${POSTED_JOB}`);
  await page.unroute('**/api/jobs/by-number/1000');
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: person('hire', [{ companyId: '00000000-0000-4000-8000-0000000000c1', companyName: 'Space Exploration Technologies', role: 'member', status: 'active' }]) })
  );
  await standInForPostedJobs(page, { canManage: true });
  await page.goto(POSTED_JOB_PATH, { waitUntil: 'domcontentloaded' });
  // One quiet line in the facts panel, beside the button that opens the posting on the company's site.
  await expect(page.locator('[data-job-panel] [data-job-from-source]')).toContainText("careers site and is kept in step with it");
  const view = page.locator('[data-job-panel] [data-view-on-site]');
  await expect(view).toHaveText(/^View on Space Exploration Technologies' careers site/);
  await expect(view).toHaveAttribute('href', 'https://boards.greenhouse.io/spacex/jobs/8643277002?gh_jid=8643277002');
  await expect(view).toHaveAttribute('target', '_blank');
  expect((await view.boundingBox())?.height ?? 0, 'the way to the posting is a button').toBeGreaterThanOrEqual(40);
  await expect(page.locator('[data-detail-kind]')).toHaveText('Job');
  await expect(page.locator('[data-apply-on-site], #applicants, #manage-job')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Edit$|Post another like this/ })).toHaveCount(0);
  await expect(page.locator('[data-job-overlap], [data-job-overlap-sign-in], [data-skill-mark]')).toHaveCount(0);
  await expect(page.locator('[data-job-path] [data-skill-tag]')).toHaveCount(9);
  await expect(page.locator('[data-skill-tag] button')).toHaveCount(0);
  await assertHealthyLayout(page, 'a job from a posting, the company');

  // Someone here to hire who is not of this company: the same button to the posting, no line about managing, no Apply.
  await page.unroute('**/api/auth/me');
  await page.unroute(`**/api/jobs/${POSTED_JOB}`);
  await page.unroute('**/api/jobs/by-number/1000');
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: person('hire') }));
  await standInForPostedJobs(page);
  await page.goto(POSTED_JOB_PATH, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-view-on-site]')).toHaveCount(1);
  await expect(page.locator('[data-apply-on-site], [data-job-from-source], [data-job-overlap], [data-job-overlap-sign-in]')).toHaveCount(0);

  // Your jobs, for a member who has posted nothing: what is already listed from the company's site is said before the form.
  await page.route('**/api/employer', (route) =>
    route.fulfill({
      json: {
        companies: [
          { companyId: '00000000-0000-4000-8000-0000000000c1', companyName: 'Space Exploration Technologies', role: 'member', status: 'active', decidedAt: null, askAgainAt: null, factories: [], jobs: [], listedJobs: 485 },
        ],
      },
    })
  );
  await page.route('**/api/employer/company-requests', (route) => route.fulfill({ json: { requests: [] } }));
  await page.route('**/api/companies/*/careers', (route) => route.fulfill({ json: { versions: [] } }));
  await page.goto('/employer', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-listed-jobs]')).toContainText("485 open jobs come from the company's careers site and are kept in step with it.");
  await expect(page.getByRole('heading', { name: 'Post a job' })).toBeVisible();
  await assertHealthyLayout(page, '/employer with listed jobs and none posted');
});

// ─── Military careers: reached on purpose ──────────────────────────────────────

/** A military career by its code, as the Careers list gives it when asked for them. */
async function militaryCareer(request: APIRequestContext, code: string) {
  const list = (await (await request.get(`${API}/occupations?military=1&search=${encodeURIComponent(code)}&limit=5`)).json()) as {
    data: Array<{ id: string; title: string; code: string; kind: string; officialTitle: string; skillCount: number; service: { slug: string; name: string } }>;
  };
  const found = list.data.find((career) => career.code === code);
  expect(found, `the military careers have ${code}`).toBeTruthy();
  return found!;
}

const SERVICE_TITLE = /^(Navy|Army|Air Force) /;
const KIND_LINE = /(Navy rating|Army MOS|Air Force specialty) · [A-Z0-9]+/;

test('military careers stay out of the lists until asked for: the Careers filter, a civilian career, the header search and the map search', async ({ page, request }) => {
  const counts = async (query: string) => ((await (await request.get(`${API}/occupations?${query}limit=1`)).json()) as { total: number }).total;
  const [civilian, military, navy] = [await counts(''), await counts('military=1&'), await counts('service=navy&')];

  // The Careers list is of civilian careers, and says so in the filter that asks for the others.
  await page.goto('/explore?tab=occupations', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-explore-count]')).toHaveText(`${civilian} careers`);
  await expect(page.locator('main a[href^="/occupations/"]').first()).toBeVisible();
  await expect(page.locator('main a[href^="/occupations/"]').filter({ hasText: KIND_LINE })).toHaveCount(0);
  // A two-sided switch, Industry (the default) and Military; the branch is offered only on the military side.
  const sides = page.getByRole('radiogroup', { name: 'Careers' });
  await expect(sides.getByRole('radio', { name: 'Industry' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: /^Branch: / })).toHaveCount(0);
  await assertHealthyLayout(page, '/explore?tab=occupations');

  // Asked for, the list is the military careers alone, each row with its kind and code; the address says so.
  await sides.getByRole('radio', { name: 'Military' }).click();
  await expect(page).toHaveURL(/tab=occupations&military=1$/);
  await expect(page.locator('[data-explore-count]')).toHaveText(`${military} military careers`);
  const rows = page.locator('main a[href^="/occupations/"]');
  await expect(rows.first()).toContainText(KIND_LINE);
  for (const text of await rows.allInnerTexts()) expect(text, 'every row is a military career').toMatch(KIND_LINE);
  await assertHealthyLayout(page, '/explore?tab=occupations&military=1');

  // Narrowed to one service, and back.
  await page.getByRole('button', { name: 'Branch: All branches' }).click();
  expect((await page.getByRole('menuitemradio').allInnerTexts()).map((text) => text.trim())).toEqual(['All branches', 'Navy', 'Army', 'Air Force', 'Marine Corps']);
  await page.getByRole('menuitemradio', { name: 'Navy', exact: true }).click();
  await expect(page).toHaveURL(/tab=occupations&service=navy$/);
  await expect(page.locator('[data-explore-count]')).toHaveText(`${navy} Navy careers`);
  await expect(rows.first()).toContainText(/Navy rating · [A-Z]+/);
  for (const text of await rows.allInnerTexts()) expect(text, 'every row is a Navy rating').toContain('Navy rating · ');
  await assertHealthyLayout(page, '/explore?tab=occupations&service=navy');
  // Clear puts back what narrows the side that is on; the switch goes back to the careers of industry.
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page).toHaveURL(/tab=occupations&military=1$/);
  await sides.getByRole('radio', { name: 'Industry' }).click();
  await expect(page).not.toHaveURL(/military=|service=/);
  await expect(page.locator('[data-explore-count]')).toHaveText(`${civilian} careers`);
  // Explore's own count of careers is the civilian one.
  const stats = (await (await request.get(`${API}/stats/counts`)).json()) as { occupations: number; skills: number };
  expect(stats.occupations, "Explore's count is civilian").toBe(civilian);

  // One service's list offers only the homes that service has a career in: no choice leads to an empty list.
  const facets = (await (await request.get(`${API}/explore/facets`)).json()) as { militaryCareerDomains: { name: string; services: string[] }[] };
  await page.goto('/explore?tab=occupations&service=navy', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-explore-count]')).toHaveText(`${navy} Navy careers`);
  await page.getByRole('button', { name: 'Domain: All domains' }).click();
  await expect(page.getByRole('menuitemradio').first()).toBeVisible();
  expect((await page.getByRole('menuitemradio').allInnerTexts()).map((text) => text.trim())).toEqual([
    'All domains',
    ...facets.militaryCareerDomains.filter((domain) => domain.services.includes('navy')).map((domain) => domain.name),
  ]);
  await page.keyboard.press('Escape');
  // A service with no careers yet, named by the address: the filter says which service, as the count under it does.
  await page.goto('/explore?tab=occupations&service=marine-corps', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-explore-count]')).toHaveText('0 Marine Corps careers');
  await expect(page.getByRole('button', { name: 'Branch: Marine Corps' })).toBeVisible();
  await assertHealthyLayout(page, '/explore?tab=occupations&service=marine-corps');

  // Skills only military careers use: the Skills list leaves them out and counts what it lists, as Explore does;
  // narrowed to their own group (where a skill's page and the Atlas lead) it lists them, in every order.
  await page.goto('/explore?tab=skills', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-explore-count]')).toHaveText(`${stats.skills} skills`);
  await expect(page.locator('[data-skill-group="weapons-and-munitions"]')).toHaveCount(0);
  await page.goto('/explore?tab=skills&domain=assembly&group=weapons-and-munitions', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-explore-count]')).toHaveText(/^[1-9]\d* skills$/);
  const inGroup = await page.locator('[data-explore-count]').innerText();
  await expect(page.locator('[data-skill-group="weapons-and-munitions"]')).toBeVisible();
  await page.goto('/explore?tab=skills&domain=assembly&group=weapons-and-munitions&sort=careers-desc', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-explore-count]')).toHaveText(inGroup);
  await expect(page.getByRole('button', { name: 'Group: Weapons and munitions' })).toBeVisible();
  await assertHealthyLayout(page, '/explore?tab=skills a group only military careers use');

  // A civilian career's page ends in the military careers that reach it, each with how much of the path it holds.
  const welder = await careerByTitle(request, 'Welder');
  await page.goto(`/occupations/${welder.id}`, { waitUntil: 'domcontentloaded' });
  const section = page.locator('#military');
  await expect(section.getByRole('heading', { name: 'Military careers that reach this' })).toBeVisible();
  const reaching = section.locator('[data-military-career]');
  await expect(reaching.first()).toBeVisible();
  for (const text of await reaching.allInnerTexts()) {
    expect(text, 'a row is a military career by its full title').toMatch(SERVICE_TITLE);
    expect(text, 'with its kind, its code and its share of this path').toMatch(new RegExp(`${KIND_LINE.source} · \\d+ of ${welder.skills.length} skills`));
  }
  expect(await page.locator('[data-entity-view] section').last().getAttribute('id'), 'it is the last section').toBe('military');
  await section.scrollIntoViewIfNeeded();
  await assertHealthyLayout(page, '/occupations/:id military careers that reach this');

  // The header's search lists a military career when the query is its code, with the careers, under its kind and code.
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await dialog.getByRole('combobox').fill('HT');
  const hit = dialog.getByRole('option', { name: /Navy Hull Maintenance Technician/ });
  await expect(hit).toBeVisible();
  await expect(hit).toContainText('Navy rating · HT');
  await assertHealthyLayout(page, '/occupations/:id#search HT');
  // Letters alone lead nothing: where companies' names begin with them, a company is the first row, which Enter takes.
  await dialog.getByRole('combobox').fill('ame');
  await expect(dialog.getByRole('option').filter({ hasText: 'Navy rating · AME' })).toBeVisible();
  await expect(dialog.getByRole('option').first()).toContainText('American');
  await expect(dialog.getByRole('option').first()).not.toContainText(KIND_LINE);
  // A code that can be nothing else leads.
  await dialog.getByRole('combobox').fill('15T');
  await expect(dialog.getByRole('option').first()).toContainText('Army MOS · 15T');
  // A service's name is the service: it has no factories, and is found by its name alone.
  await dialog.getByRole('combobox').fill('navy');
  await expect(dialog.getByRole('option').first()).toContainText('U.S. Navy');
  await expect(dialog.getByRole('option').first()).toContainText('Military service');
  await expect(dialog.getByRole('option').filter({ hasText: KIND_LINE })).toHaveCount(0);
  // A plain title lists civilian careers only.
  await dialog.getByRole('combobox').fill('electronics technician');
  await expect(dialog.getByRole('option', { name: /^Electronics Technician/ }).first()).toBeVisible();
  await expect(dialog.getByRole('option').filter({ hasText: KIND_LINE })).toHaveCount(0);
  await dialog.getByRole('combobox').fill('welder');
  await expect(dialog.getByRole('option', { name: /^Welder/ }).first()).toBeVisible();
  await expect(dialog.getByRole('option').filter({ hasText: KIND_LINE })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The map's search never lists one: the same code, asked there, brings no career of a service.
  await page.goto('/map', { waitUntil: 'domcontentloaded' });
  const field = page.getByRole('combobox', { name: 'Place, company or career' });
  await expect(field).toBeVisible();
  const answered = page.waitForResponse((response) => /\/api\/search\?/.test(response.url()) && /[?&]q=HT(&|$)/.test(response.url()));
  await field.fill('HT');
  const answer = await answered;
  expect(answer.url(), 'the map does not ask for military careers').not.toContain('military=');
  const found = (await answer.json()) as { results: { occupations: { items: { name: string; named?: boolean }[] } } };
  expect(found.results.occupations.items.filter((item) => item.named || SERVICE_TITLE.test(item.name))).toEqual([]);
  await expect(page.getByRole('listbox', { name: 'Search results' }).getByRole('option').first()).toBeVisible();
  await expect(page.getByRole('option').filter({ hasText: /Hull Maintenance|Navy rating/ })).toHaveCount(0);
  await assertHealthyLayout(page, '/map#search HT');

  // Nor is one the map's subject, nor its service: a link that names either is told so, and the address is cleaned.
  const rating = await militaryCareer(request, 'HT');
  await page.goto(`/map?career=${rating.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('That career is not on the map.')).toBeVisible();
  await expect(page).not.toHaveURL(/career=/);
  await page.goto(`/map?company=${rating.service.slug}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('That company is not on the map.')).toBeVisible();
  await expect(page).not.toHaveURL(/company=/);
});

test('Profile asks nothing about military service: one question on an empty page, no door at the end of Skills', async ({ page, baseURL, request }) => {
  // Writes: it makes an account, marks skills and deletes it. Never against a deployed copy.
  test.skip(!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL ?? ''), 'creates accounts: local only');
  const password = 'correct horse battery';
  const stamp = `${test.info().project.name}-${Date.now().toString(36)}`;
  const ht = await militaryCareer(request, 'HT');
  const noDoor = async () => {
    await expect(page.getByText('Start with what you have done')).toHaveCount(0);
    await expect(page.locator('[data-service-door], #door-career')).toHaveCount(0);
  };

  const made = await page.request.post(`${API}/auth/sign-up`, { data: { email: `door-work-${stamp}@device.test`, name: 'Door Seeker', password, purpose: 'work' } });
  expect(made.status(), 'seeker: account made').toBe(201);
  try {
    // With nothing on the page: the one question, and its search lists no military career.
    await page.goto('/me', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Start with a career' })).toBeVisible();
    await noDoor();
    await page.locator('#starter-career').fill('Navy Hull');
    await expect(page.getByRole('option', { name: /Navy Hull Maintenance Technician/ })).toHaveCount(0);
    await assertHealthyLayout(page, '/me one question');

    // The route the door used is kept (a military career's own page writes through it): with its skills held,
    // Profile lists civilian careers within reach, never a military one, and still has no door.
    const held = await page.request.post(`${API}/me/careers/${ht.id}/held`);
    expect(held.ok(), 'the route is kept').toBe(true);
    await page.goto('/me', { waitUntil: 'domcontentloaded' });
    const reach = page.locator('[data-careers-in-reach]');
    await expect(reach.locator('li').first()).toBeVisible();
    await expect(reach.getByRole('heading', { name: 'Within reach' })).toBeVisible();
    await expect(reach.locator('li').filter({ hasText: SERVICE_TITLE })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Skills', exact: true })).toBeVisible();
    await noDoor();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await assertHealthyLayout(page, '/me with skills, no door');
  } finally {
    expect((await page.request.delete(`${API}/me`, { data: { password } })).ok(), 'seeker: account removed').toBe(true);
  }
});

test('what the owner asked for: one order of companies with no sort, Safety last, the credit on Settings, the header menu, a wider Factories list', async ({ page, request }) => {
  const width = page.viewportSize()?.width ?? 0;
  const touch = test.info().project.use.hasTouch === true;

  // Companies: no sort to choose, the one filter where the sort was, and an old ?sort= is not read.
  await page.goto('/explore?tab=companies&sort=name-asc', { waitUntil: 'domcontentloaded' });
  const firstRow = page.locator('main a[href^="/companies/"]').first();
  await expect(firstRow).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sort: / })).toHaveCount(0);
  const industry = page.getByRole('button', { name: 'Industry: All industries' });
  await expect(industry).toBeVisible();
  const box = await industry.boundingBox();
  if (width >= 640) expect((box?.x ?? 0) + (box?.width ?? 0), 'the filter stands at the right').toBeGreaterThan(width / 2);
  const listed = (await (await request.get(`${API}/companies?limit=1`)).json()) as { data: { name: string; people: number | null; openJobCount: number; factoryCount: number }[] };
  const lead = listed.data[0];
  await expect(firstRow).toContainText(lead.people ? `${lead.people.toLocaleString('en-US')} people` : lead.openJobCount ? 'open job' : 'factor');
  await assertHealthyLayout(page, '/explore?tab=companies');

  // Domains in the taxonomy's order wherever they are listed: Safety is last, never first.
  const taxonomy = (await (await request.get(`${API}/skills/taxonomy`)).json()) as { domains: { name: string }[] };
  expect(taxonomy.domains.at(-1)?.name).toBe('Safety');
  expect(taxonomy.domains[0].name).toBe('Materials');
  await page.goto('/explore?tab=skills', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-skill-domain]').first()).toHaveAttribute('data-skill-domain', 'materials');

  // The basemap's credit: off the map, on Settings with both links.
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  const credits = page.locator('[data-map-credits]');
  await expect(credits.getByRole('link', { name: '© MapTiler' })).toHaveAttribute('href', 'https://www.maptiler.com/copyright/');
  await expect(credits.getByRole('link', { name: '© OpenStreetMap contributors' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  await page.goto('/map', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.maplibregl-ctrl-attrib')).toHaveCount(0);

  // The Factories list: one column on a phone, three from 1280 px, four from 1600 px.
  await page.goto('/explore?tab=factories', { waitUntil: 'domcontentloaded' });
  const rows = page.locator('main a[href^="/factories/"]');
  await expect(rows.nth(4)).toBeVisible();
  const top = (await rows.first().boundingBox())?.y ?? 0;
  const tops = await rows.evaluateAll((all) => all.slice(0, 5).map((row) => Math.round(row.getBoundingClientRect().top)));
  expect(tops.filter((y) => Math.abs(y - Math.round(top)) < 2).length, `columns at ${width}px`).toBe(width >= 1600 ? 4 : width >= 1280 ? 3 : width >= 1024 ? 2 : 1);
  await assertHealthyLayout(page, '/explore?tab=factories');

  // Explore in the header: a mouse over it, or the keyboard on it, opens its six views; a tap just goes to Explore.
  const explore = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Explore', exact: true });
  const menu = page.locator('[data-explore-menu]');
  if (touch) {
    await explore.tap();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(menu).toHaveCount(0);
  } else {
    await explore.hover();
    expect((await menu.getByRole('link').allInnerTexts()).map((text) => text.trim())).toEqual(['Overview', 'Industries', 'Companies', 'Factories', 'Careers', 'Skills']);
    expect(await menu.locator('ul').evaluate((el) => getComputedStyle(el).boxShadow), 'no shadow').toBe('none');
    await menu.getByRole('link', { name: 'Careers' }).click();
    await expect(page).toHaveURL(/\/explore\?tab=occupations$/);
    await page.mouse.move(width / 2, 400);
    await expect(menu).toHaveCount(0);
    await explore.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(menu).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('link', { name: 'Overview' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(explore).toBeFocused();
    // On the map the menu stands over the search field: every one of its links is what the pointer meets.
    await page.goto('/map', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await explore.hover();
    const covered = await menu.getByRole('link').evaluateAll((links) =>
      links
        .filter((link) => {
          const box = link.getBoundingClientRect();
          const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return !at || !link.contains(at);
        })
        .map((link) => link.textContent),
    );
    expect(covered, 'menu links under something on the map').toEqual([]);
  }
});

test("a military career's page: its kind and code above the service's own title, no goal, no action, and the civilian careers within reach", async ({ page, baseURL, request }) => {
  // Writes: it makes two accounts, marks skills and deletes them. Never against a deployed copy.
  test.skip(!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL ?? ''), 'creates accounts: local only');
  const password = 'correct horse battery';
  const stamp = `${test.info().project.name}-${Date.now().toString(36)}`;
  const ht = await militaryCareer(request, 'HT');
  const record = (await (await request.get(`${API}/occupations/${ht.id}`)).json()) as {
    withinReach: { id: string; title: string; held: number; total: number; missing: { name: string }[] }[];
    skills: unknown[];
  };
  expect(record.withinReach.length, 'the rating reaches civilian careers').toBeGreaterThan(0);

  // A visitor: the career page, with the kind and code where "Career" stands and the service's own title under it.
  await page.goto(`/occupations/${ht.id}`, { waitUntil: 'domcontentloaded' });
  const view = page.locator('[data-entity-view="occupations"]');
  await expect(view.locator('[data-detail-kind]')).toHaveText('Navy rating · HT');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ht.officialTitle);
  expect(ht.title, 'lists keep the full title').toBe(`Navy ${ht.officialTitle}`);
  await expect(page).toHaveTitle(`${ht.title} · Archangel`);
  // Its service is the record the page belongs to: a tag under the title that leads to the service's page.
  const service = view.locator('[data-career-service]');
  await expect(service).toContainText(ht.service.name);
  await expect(service).toHaveAttribute('href', `/companies/${ht.service.slug}`);
  await expect(service).toHaveAttribute('data-record-tag', 'military service');
  // It is no goal, and its page has no action: nothing here sets a goal or marks a skill, for anyone.
  await expect(view.getByRole('button', { name: /goal/i })).toHaveCount(0);
  await expect(view.getByRole('link', { name: /goal/i })).toHaveCount(0);
  await expect(view.locator('[data-detail-action] button, [data-detail-action] a')).toHaveCount(0);
  await expect(page.getByText(/I have done this|Sign in to mark its skills held/)).toHaveCount(0);
  // Its path draws from the same parts as any career's: one route. The Atlas view is one press away.
  await expectOneRoute(view.locator('[data-route]'), 'a military career');
  await expect(view.locator('[data-route] [data-skill-tag]')).toHaveCount(record.skills.length);
  // Whether a person has reviewed the path is an admin's business: nobody else is shown the word Draft.
  await expect(view.locator('[data-draft-path]')).toHaveCount(0);
  await expect(view.getByRole('link', { name: 'Atlas', exact: true }).or(view.getByRole('button', { name: 'Atlas', exact: true })).or(view.getByRole('radio', { name: 'Atlas', exact: true })).first()).toBeVisible();
  // It has no ladder, industries, jobs, companies or factories: none of those sections is drawn, and none is empty.
  await expect(view.locator('#where, #jobs, #companies, #factories, #military')).toHaveCount(0);
  await expect(view.getByText(/Comes from|Leads to/)).toHaveCount(0);
  // Where it leads comes first, then its path.
  expect(await view.locator('section').evaluateAll((sections) => sections.map((section) => section.id))).toEqual(['reach', 'skills']);
  // The civilian careers its path covers most, each with how much; the closest is chosen and says what carries over and what is missing.
  const reach = view.locator('#reach');
  await expect(reach.getByRole('heading', { name: 'Civilian careers within reach' })).toBeVisible();
  const rows = reach.locator('[data-reach-career]');
  const closest = record.withinReach[0];
  await expect(rows.first()).toContainText(closest.title);
  await expect(rows.first()).toContainText(`${closest.held} of ${closest.total} skills`);
  await expect(rows.first()).toHaveAttribute('aria-checked', 'true');
  const panel = reach.locator(`[data-reach-panel="${closest.id}"]`);
  // The skills missing are named in the civilian career's own order, and no level is named with them.
  await expect(panel.locator('[data-next-skills] li')).toHaveText(closest.missing.map((skill) => skill.name));
  await expect(reach).not.toContainText(/Fundamentals|Intermediate|Advanced/);
  await expect(panel.locator('[data-reach-open]')).toHaveAttribute('href', `/occupations/${closest.id}`);
  await expect(panel.locator('[data-reach-compare]')).toHaveAttribute('href', `/atlas?career=${ht.id}&with=${closest.id}`);
  for (const text of await rows.allInnerTexts()) expect(text, 'no military career is within reach of one').not.toMatch(KIND_LINE);
  await reach.scrollIntoViewIfNeeded();
  await assertHealthyLayout(page, '/occupations/:id military, within reach');
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertHealthyLayout(page, '/occupations/:id military');
  // "Compare on the atlas" says which career it compares with, to someone who hears the links alone.
  await expect(panel.locator('[data-reach-compare]')).toHaveAttribute('aria-label', `Compare with ${closest.title} on the atlas`);
  // A service's title that runs past any career's of the catalogue is set smaller on a phone, as a job's long title is.
  const titleSize = () => page.getByRole('heading', { level: 1 }).evaluate((heading) => parseFloat(getComputedStyle(heading).fontSize));
  const usual = await titleSize();
  const all = (await (await request.get(`${API}/occupations?military=1&limit=100`)).json()) as { data: { id: string; officialTitle: string }[] };
  const longest = all.data.reduce((a, b) => (b.officialTitle.length > a.officialTitle.length ? b : a));
  expect(longest.officialTitle.length, 'a military title longer than any civilian career\'s').toBeGreaterThan(40);
  await page.goto(`/occupations/${longest.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(longest.officialTitle);
  if ((page.viewportSize()?.width ?? 0) < 640) expect(await titleSize(), 'a long title is smaller on a phone').toBe(24);
  else expect(await titleSize(), 'and the usual size from a tablet up').toBe(usual);
  await assertHealthyLayout(page, '/occupations/:id military, a long title');
  // The path on the Atlas, for the same career.
  await page.goto(`/occupations/${ht.id}?path=atlas`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.atlas-plate .atlas-leaf').first()).toBeAttached();
  await expect(view.locator('[data-detail-kind]')).toHaveText('Navy rating · HT');
  await assertHealthyLayout(page, '/occupations/:id military on the atlas');

  // A seeker: the page says how much of the path they hold and has no action.
  const made = await page.request.post(`${API}/auth/sign-up`, { data: { email: `mil-work-${stamp}@device.test`, name: 'Mil Seeker', password, purpose: 'work' } });
  expect(made.status(), 'seeker: account made').toBe(201);
  try {
    await page.goto(`/occupations/${ht.id}`, { waitUntil: 'domcontentloaded' });
    const action = view.locator('[data-detail-action]');
    await expect(page.locator('[data-held-count]')).toContainText(`0 of ${record.skills.length}`);
    await expect(action.locator('button, a')).toHaveCount(0);
    await expect(page.getByText('I have done this')).toHaveCount(0);
    await expect(view.locator('[data-route] [data-skill-tag] button')).toHaveCount(0);
    await expect(view.locator('[data-draft-path]')).toHaveCount(0);
    // Marked held where that is done (Profile's door; here, the same write through the API), the page follows.
    expect((await page.request.post(`${API}/me/careers/${ht.id}/held`)).ok(), 'the path marked held').toBe(true);
    await page.goto('/me', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-careers-in-reach]')).toContainText(closest.title);
    await page.goto(`/occupations/${ht.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-held-count]')).toContainText(`${record.skills.length} of ${record.skills.length}`);
    // Everything held: every section closed and whole, nothing next, and still nothing to press but the sections.
    await expect(view.locator('[data-route] [data-next]')).toHaveCount(0);
    await expect(page.locator('[data-next-up], [data-route-aside]')).toHaveCount(0);
    await expect(view.locator('[data-route] [data-route-section][data-open]')).toHaveCount(0);
    await expect(view.locator('[data-route] [data-section-count]')).toHaveCount(0);
    await expect(action.locator('button, a')).toHaveCount(0);
    await assertHealthyLayout(page, '/occupations/:id military, held whole');
  } finally {
    expect((await page.request.delete(`${API}/me`, { data: { password } })).ok(), 'seeker: account removed').toBe(true);
  }

  // An admin is the one person shown that the path is a draft.
  const account = { id: '00000000-0000-4000-8000-000000000009', email: 'admin@device.test', name: 'Device Admin', isAdmin: true, homeZip: null, about: null, emailNotices: true, purpose: 'work' };
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: account, memberships: [], isEmployer: false } }));
  await page.route('**/api/me/**', (route) => route.fulfill({ json: { skills: [], goals: [], careers: [], applications: false, applicants: false, access: false } }));
  await page.goto(`/occupations/${ht.id}`, { waitUntil: 'domcontentloaded' });
  await expect(view.locator('[data-draft-path]')).toBeVisible();
  await expect(view.locator('[data-draft-path]')).toHaveText(/^Draft/);
  await page.unroute('**/api/auth/me');
  await page.unroute('**/api/me/**');

  // Someone here to hire reads the same page with no action at all.
  const hire = await page.request.post(`${API}/auth/sign-up`, { data: { email: `mil-hire-${stamp}@device.test`, name: 'Mil Hirer', password, purpose: 'hire' } });
  expect(hire.status(), 'employer: account made').toBe(201);
  try {
    await page.goto(`/occupations/${ht.id}`, { waitUntil: 'domcontentloaded' });
    await expect(view.locator('[data-detail-kind]')).toHaveText('Navy rating · HT');
    await expect(view.locator('#reach [data-reach-career]').first()).toBeVisible();
    await expect(view.locator('[data-detail-action] button, [data-detail-action] a')).toHaveCount(0);
    await expect(page.getByText('I have done this')).toHaveCount(0);
    await expect(page.locator('[data-held-count]')).toHaveCount(0);
  } finally {
    expect((await page.request.delete(`${API}/me`, { data: { password } })).ok(), 'employer: account removed').toBe(true);
  }

  // The service's page lists its careers and has no map action; a service with none says so.
  await page.goto(`/companies/${ht.service.slug}`, { waitUntil: 'domcontentloaded' });
  const company = page.locator('[data-entity-view="companies"]');
  await expect(company.locator('[data-detail-kind]')).toHaveText('Military service');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ht.service.name);
  await expect(company.locator('[data-open-map]')).toHaveCount(0);
  await expect(company.locator('[data-service-career]').first()).toContainText(/^Navy /);
  await assertHealthyLayout(page, '/companies/us-navy');
  await page.goto('/companies/us-marine-corps', { waitUntil: 'domcontentloaded' });
  await expect(company.locator('#occupations')).toContainText('None yet.');
  await expect(company.locator('[data-service-career]')).toHaveCount(0);
  await assertHealthyLayout(page, '/companies/us-marine-corps');
});

test("a military career's flow into industry: drawn from a tablet up, a list on a phone, one career chosen at a time and from the keyboard", async ({ page, request }) => {
  const ht = await militaryCareer(request, 'HT');
  const record = (await (await request.get(`${API}/occupations/${ht.id}`)).json()) as {
    withinReach: { id: string; title: string; held: number; total: number; shared: string[]; missing: { name: string }[]; industries: string[]; everywhere: boolean }[];
    skills: { id: string; name: string }[];
  };
  const careers = record.withinReach;
  expect(careers.length, 'the rating reaches more than one civilian career').toBeGreaterThan(2);
  // A list a row or two longer than its cut is shown whole; a longer one is cut: at twelve in the drawing, at five on a phone.
  const wide = (page.viewportSize()?.width ?? 0) >= 768;
  const cut = wide ? 12 : 5;
  const shown = careers.length > cut + 2 ? careers.slice(0, cut) : careers;
  const linksOf = (career: (typeof careers)[number]) => career.industries.length || (career.everywhere ? 1 : 0);
  const nameOf = new Map(record.skills.map((skill) => [skill.id, skill.name]));

  await page.goto(`/occupations/${ht.id}`, { waitUntil: 'domcontentloaded' });
  const reach = page.locator('#reach');
  const radios = reach.getByRole('radio');
  await expect(radios).toHaveCount(shown.length);
  const flow = reach.locator('[data-reach-flow]');
  if (wide) {
    // The drawing: one image with a name, a line for every skill shared and one for every career's industry.
    await expect(flow).toBeVisible();
    await expect(flow.getByRole('img')).toHaveAttribute('aria-label', new RegExp(`${shown.length} civilian careers`));
    await expect(flow.locator('path.reach-line')).toHaveCount(shown.reduce((sum, career) => sum + career.held + linksOf(career), 0));
    // The chosen career's lines are the ones drawn in the accent.
    await expect(flow.locator('path.reach-line[data-on]')).toHaveCount(careers[0].held + linksOf(careers[0]));
    // The careers are buttons over their rows, and the names on either side keep clear of them.
    const first = await radios.first().boundingBox();
    const last = await radios.last().boundingBox();
    expect(first && first.height >= 36, 'a career is a button a pointer can press').toBe(true);
    for (const right of await flow.locator('.reach-flow-group').evaluateAll((names) => names.map((name) => name.getBoundingClientRect().right))) {
      expect(right, "a group's name stands left of the careers").toBeLessThanOrEqual(first!.x);
    }
    for (const left of await flow.locator('.reach-flow-industry').evaluateAll((names) => names.map((name) => name.getBoundingClientRect().left))) {
      expect(left, "an industry's name stands right of the careers").toBeGreaterThanOrEqual(last!.x + last!.width);
    }
  } else {
    // On a phone the same careers are a list, the chosen one open under its button: no drawing.
    await expect(flow).toHaveCount(0);
    await expect(reach.locator('[data-reach-list]')).toBeVisible();
    for (const height of await radios.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height))) {
      expect(height, 'a career is a full finger tall').toBeGreaterThanOrEqual(44);
    }
  }
  await assertHealthyLayout(page, '/occupations/:id military, the flow');

  // The keyboard: the careers are one stop, on the chosen one; the arrows move the choice.
  await expect(radios.first()).toHaveAttribute('aria-checked', 'true');
  await page.locator('[data-career-home]').focus();
  await page.keyboard.press('Tab');
  await expect(radios.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const second = careers[1];
  await expect(radios.nth(1)).toBeFocused();
  await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(radios.first()).toHaveAttribute('aria-checked', 'false');
  // Chosen, it says the skills it shares with the rating, by group, and the ones still missing, in its own order.
  const panel = reach.locator(`[data-reach-panel="${second.id}"]`);
  await expect(panel).toBeVisible();
  for (const id of second.shared) await expect(panel.locator('[data-reach-shared]')).toContainText(nameOf.get(id)!);
  await expect(panel.locator('[data-next-skills] li')).toHaveText(second.missing.map((skill) => skill.name));
  await expect(panel.locator('[data-reach-open]')).toHaveAttribute('href', `/occupations/${second.id}`);
  await expect(panel.locator('[data-reach-compare]')).toHaveAttribute('href', `/atlas?career=${ht.id}&with=${second.id}`);
  if (wide) await expect(flow.locator('path.reach-line[data-on]')).toHaveCount(second.held + linksOf(second));
  // A press chooses as well.
  await radios.nth(2).click();
  await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true');
  await expect(reach.locator(`[data-reach-panel="${careers[2].id}"]`)).toBeVisible();
  await expect(reach.locator('[data-reach-panel]')).toHaveCount(1);
  await assertHealthyLayout(page, '/occupations/:id military, a career chosen');
  // The rest are one press away; the one chosen stays chosen.
  if (careers.length > shown.length) {
    await reach.getByRole('button', { name: `Show all ${careers.length}` }).click();
    await expect(radios).toHaveCount(careers.length);
    await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true');
    if (wide) await expect(flow.locator('path.reach-line')).toHaveCount(careers.reduce((sum, career) => sum + career.held + linksOf(career), 0));
    await assertHealthyLayout(page, '/occupations/:id military, every career within reach');
  }
});
