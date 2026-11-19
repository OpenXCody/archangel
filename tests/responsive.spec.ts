import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

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
    const kind = { '/companies': 'Company', '/factories': 'Plant', '/skills': 'Skill', '/occupations': 'Career' }[base];
    await expect(view.locator('[data-detail-kind]'), `${base}/:id names its kind`).toHaveText(kind as string);
  }
});

test('a career page shows its path, a company page its plants', async ({ page, request }) => {
  const career = await firstId(request, '/occupations');
  expect(career, 'the API returned a career to open').toBeTruthy();
  await page.goto(`/occupations/${career}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-entity-view="occupations"]')).toHaveCount(1);
  await expect(page.locator('#skills')).toBeVisible();
  // The list opens on a career with a path: its skills under the three levels, by their names.
  await expect(page.locator('#skills')).toContainText(/Fundamentals[\s\S]*Intermediate[\s\S]*Advanced/);
  // The path is one diagram: three levels, each a list of skill groups, each a frame of tags.
  const flow = page.locator('[data-path-flow]');
  await expect(flow).toHaveCount(1);
  await expect(flow.locator('[data-path-level]')).toHaveCount(3);
  expect(await flow.locator('[data-group-box]').count(), 'the path has skill groups').toBeGreaterThan(0);
  const tags = flow.locator('[data-skill-tag]');
  expect(await tags.count(), 'the groups hold skills').toBeGreaterThan(0);
  // To a visitor a tag is the skill's name, which opens its page, with no mark and no progress beside it.
  await expect(tags.first().locator('a')).toHaveAttribute('href', /^\/skills\/[0-9a-f-]{36}$/);
  await expect(flow.locator('[data-skill-tag] button')).toHaveCount(0);
  await expect(flow.locator('[data-level-count], [data-group-count]')).toHaveCount(0);
  await expect(page.locator('[data-held-count]')).toHaveCount(0);
  // Every tag is a full finger's height and stays inside the diagram, however long its name.
  const diagram = await flow.boundingBox();
  for (const box of await tags.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().toJSON() as { left: number; right: number; height: number }))) {
    expect(box.height, 'a tag is at least 44px tall').toBeGreaterThanOrEqual(44);
    expect(box.left, 'a tag starts inside the diagram').toBeGreaterThanOrEqual((diagram?.x ?? 0) - 1);
    expect(box.right, 'a tag ends inside the diagram').toBeLessThanOrEqual((diagram?.x ?? 0) + (diagram?.width ?? 0) + 1);
  }
  // The same skills among all the others.
  await expect(page.locator('[data-atlas-link]')).toHaveAttribute('href', `/atlas?career=${career}`);
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
    skills: unknown[];
  };
}

test('a career stands on its ladder, and the Careers list narrows to a home', async ({ page, request }) => {
  // Seven careers lead to this one and it leads to three: the widest ladder in the catalogue.
  const wide = await careerByTitle(request, 'Maintenance Technician');
  expect(wide.comesFrom.length, 'several careers lead to it').toBeGreaterThan(4);
  await page.goto(`/occupations/${wide.id}`, { waitUntil: 'domcontentloaded' });
  const flow = page.locator('[data-path-flow]');
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
  // Every rung is a full finger's height and stays inside the diagram, however long its title.
  const diagram = await flow.boundingBox();
  for (const box of await flow.locator('[data-path-ladder] a').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().toJSON() as { left: number; right: number; height: number }))) {
    expect(box.height, 'a rung is at least 44px tall').toBeGreaterThanOrEqual(44);
    expect(box.left, 'a rung starts inside the diagram').toBeGreaterThanOrEqual((diagram?.x ?? 0) - 1);
    expect(box.right, 'a rung ends inside the diagram').toBeLessThanOrEqual((diagram?.x ?? 0) + (diagram?.width ?? 0) + 1);
  }
  await assertHealthyLayout(page, '/occupations/:id ladder open');

  // A first rung with three after it: nothing stands before the first level.
  const first = await careerByTitle(request, 'Production Operator');
  expect([first.comesFrom.length, first.leadsTo.length]).toEqual([0, 3]);
  await page.goto(`/occupations/${first.id}`, { waitUntil: 'domcontentloaded' });
  await expect(flow.locator('[data-path-level]')).toHaveCount(3);
  await expect(flow.locator('[data-path-ladder="before"]')).toHaveCount(0);
  await expect(flow.locator('[data-path-ladder="after"] a')).toHaveText(first.leadsTo.map((career) => career.title));
  await assertHealthyLayout(page, '/occupations/:id first rung');

  // A career on no ladder: the path alone.
  const alone = await careerByTitle(request, 'Hydraulics Technician');
  expect(alone.comesFrom.length + alone.leadsTo.length).toBe(0);
  await page.goto(`/occupations/${alone.id}`, { waitUntil: 'domcontentloaded' });
  await expect(flow.locator('[data-path-level]')).toHaveCount(3);
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

  // The industry with the most plants in the sample's fullest state: a page with every part.
  const res = await request.get(`${API}/industries?state=TX`);
  expect(res.ok(), 'the API lists industries for a state').toBe(true);
  const list = (await res.json()) as { industries: { slug: string; plants: number }[] };
  const fullest = [...list.industries].sort((a, b) => b.plants - a.plants)[0];
  expect(fullest?.plants ?? 0, 'the sample has plants with an industry in Texas').toBeGreaterThan(0);
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
  const order = ['States and areas', 'Industries', 'Companies', 'Plants', 'Careers', 'Skills', 'Jobs'];
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
  expect(names).toEqual(['Overview', 'Industries', 'Companies', 'Plants', 'Careers', 'Skills']);
  await expect(tabs.locator('[aria-current="page"]')).toHaveAccessibleName('Overview');
  // The overview's sections are the tabs' words in the tabs' order.
  // (Asked until it is so: the page holds its place with three of them while the answer loads.)
  await expect.poll(() => page.locator('main h2').allInnerTexts()).toEqual(['Industries', 'Companies', 'Plants', 'Careers', 'Skills']);

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

  // The plants list says plants, and a list's own count follows its filters.
  await page.goto('/explore?tab=factories&state=TX', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-explore-count]')).toHaveText(/^[\d,]+ plants?$/);
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
  await expect(plate.locator('[data-atlas-label="group"]:not([data-far])')).toHaveCount(domain.groups.length);
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

test("a seeker marks a path's skills and the figures follow; an employer sees none", async ({ page, baseURL, request }) => {
  // Writes: it makes two accounts, marks one skill and deletes them. Never against a deployed copy.
  test.skip(!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL ?? ''), 'creates accounts: local only');
  const password = 'correct horse battery';
  const stamp = `${test.info().project.name}-${Date.now().toString(36)}`;
  const career = await firstId(request, '/occupations');
  expect(career, 'the API returned a career to open').toBeTruthy();
  /** "2 of 6" (with or without the words around it) as [2, 6]. */
  const figure = async (locator: ReturnType<Page['locator']>): Promise<[number, number]> => {
    const match = /(\d+) of (\d+)/.exec((await locator.textContent()) ?? '');
    expect(match, 'the figure reads "N of M"').toBeTruthy();
    return [Number(match?.[1]), Number(match?.[2])];
  };

  for (const purpose of ['work', 'hire'] as const) {
    const made = await page.request.post(`${API}/auth/sign-up`, {
      data: { email: `path-${purpose}-${stamp}@device.test`, name: `Path ${purpose}`, password, purpose },
    });
    expect(made.status(), `${purpose}: account made`).toBe(201);
    try {
      await page.goto(`/occupations/${career}`, { waitUntil: 'domcontentloaded' });
      const flow = page.locator('[data-path-flow]');
      await expect(flow.locator('[data-skill-tag]').first()).toBeVisible();
      if (purpose === 'hire') {
        // Someone here to hire reads the same diagram with no marks and no progress.
        await expect(flow.locator('[data-path-level]')).toHaveCount(3);
        await expect(flow.locator('[data-skill-tag] button')).toHaveCount(0);
        await expect(flow.locator('[data-level-count], [data-group-count]')).toHaveCount(0);
        await expect(page.locator('[data-held-count]')).toHaveCount(0);
        continue;
      }
      // A seeker: every tag carries its mark, a full finger's size, and the three figures start at nothing held.
      const tag = flow.locator('[data-skill-tag]').first();
      const mark = tag.locator('button');
      await expect(mark).toHaveAttribute('aria-pressed', 'false');
      const size = await mark.boundingBox();
      expect(Math.min(size?.width ?? 0, size?.height ?? 0), 'the mark is at least 44px each way').toBeGreaterThanOrEqual(44);
      const whole = page.locator('[data-held-count]');
      const level = tag.locator('xpath=ancestor::*[@data-path-level][1]').locator('[data-level-count]');
      const group = tag.locator('xpath=ancestor::*[@data-group-box][1]').locator('[data-group-count]');
      const total = (await figure(whole))[1];
      expect(total, 'the career counts every skill on the path').toBe(await flow.locator('[data-skill-tag]').count());
      expect((await figure(whole))[0]).toBe(0);
      expect((await figure(level))[0]).toBe(0);
      expect((await figure(group))[0]).toBe(0);
      // One tap: the tag is lit and all three figures follow, before any reload.
      await mark.click();
      await expect(tag).toHaveAttribute('data-status', 'held');
      await expect(mark).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await figure(whole))[0], { message: 'the career follows' }).toBe(1);
      expect((await figure(level))[0], 'the level follows').toBe(1);
      expect((await figure(group))[0], 'the group follows').toBe(1);
      await assertHealthyLayout(page, '/occupations/:id marked');
      // It was saved, not only drawn.
      await expect
        .poll(async () => ((await (await page.request.get(`${API}/me/skills`)).json()) as { skills: unknown[] }).skills.length, { message: 'the mark was saved' })
        .toBe(1);
      // And one more tap clears it everywhere.
      await mark.click();
      await expect(tag).toHaveAttribute('data-status', 'none');
      await expect.poll(async () => (await figure(whole))[0]).toBe(0);
      expect((await figure(level))[0]).toBe(0);
      expect((await figure(group))[0]).toBe(0);
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
  expect(plant, 'the API returned a plant to open').toBeTruthy();
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
  // The plant itself, under another name once an admin has changed something.
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
  await page.getByRole('tab', { name: 'Data' }).click();
  await page.locator('#record-name').fill('Changed By The Check');
  await page.getByRole('button', { name: 'Add company' }).click();
  await expect(page.locator('[data-record-added]')).toBeVisible();

  // Back to the plant on the map: it is read again, not shown as it was before the change.
  for (let step = 0; step < 4 && !/\/map\?/.test(page.url()); step++) await page.goBack();
  expect(page.url(), 'back on the map').toContain(`/map?factory=${plant}`);
  await expect(page).toHaveTitle('Renamed Works · Archangel');
});

test("a plant's page says its county, with the official figures and no source", async ({ page, request }) => {
  // The county is worked out from coordinates by a script, outside the app: its answer is stood in for here.
  const plant = await firstId(request, '/factories');
  expect(plant, 'the API returned a plant to open').toBeTruthy();
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

  // A plant with no county, or a county with nothing published, says nothing.
  for (const none of [{ county: null, metro: null, manufacturing: null }, { county: { fips: '15005', name: 'Kalawao County', state: 'HI' }, metro: null, manufacturing: null }]) {
    answer = none;
    await page.goto(`/factories/${plant}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-entity-view="factories"] [data-detail-kind]')).toHaveText('Plant');
    await page.waitForTimeout(600);
    await expect(line).toHaveCount(0);
  }
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
  // Fifty-one states' worth of counts, shaped like production's: Texas largest, most plants without a headcount.
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

  await page.goto('/admin?tab=data', { waitUntil: 'domcontentloaded' });
  const table = page.locator('[data-quality-table]');
  await expect(table).toBeVisible();
  await table.scrollIntoViewIfNeeded();
  // The table may be wider than a phone: it scrolls inside its own card, never the page.
  await assertHealthyLayout(page, '/admin?tab=data:quality');
  await expect(table.locator('tbody tr')).toHaveCount(states.length + 1);
  const cells = table.locator('[data-quality-total] td');
  const count = (n: number) => n.toLocaleString('en-US');
  // Shares first: a part of the plants as a percentage; plants and the two tallies stay counts.
  await expect(cells.nth(0)).toHaveText(count(total.plants));
  await expect(cells.nth(1)).toHaveText(`${((total.industry / total.plants) * 100).toFixed(1)}%`);
  await expect(cells.nth(7)).toHaveText(count(total.onePlantCompanies));
  await expect(cells.nth(8)).toHaveText(count(total.duplicates));
  // "100%" only when it is every plant: Texas is two short of it.
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
  await expect(definitions).toContainText(`${count(total.duplicates)} plants at ${count(total.duplicateGroups)} spots`);
  await definitions.scrollIntoViewIfNeeded();
  await assertHealthyLayout(page, '/admin?tab=data:quality-definitions');
});

test('two rows that may be one plant are set side by side, and merged or kept apart', async ({ page }) => {
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

  // The Data tab says some wait, and leads to them; the quality table's count leads to the ones on one spot.
  await page.goto('/admin?tab=data', { waitUntil: 'domcontentloaded' });
  const way = page.locator('[data-pairs-waiting]');
  await expect(way).toContainText('991 pairs');
  await expect(page.locator('[data-quality-duplicates="TX"]')).toHaveAttribute('href', '/admin?tab=data&pairs=spot&state=TX');
  await way.click();
  await expect(page).toHaveURL(/pairs=id/);

  const card = page.locator(`[data-pair="${A}:${B}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('[data-pair-reason]')).toContainText('EPA registry id 110000460466');
  await expect(card.locator('[data-pair-reason]')).toContainText('One plant under two companies');
  await assertHealthyLayout(page, '/admin?tab=data&pairs=id');
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

  // Two plants: said in one press, with a way back.
  await locked.locator('[data-pair-apart]').click();
  await expect.poll(() => apart).toEqual({ a: C, b: E, apart: true });
  await expect(page.getByText('Kept FMC TECHNOLOGIES INC and TechnipFMC Stephenville as two plants.')).toBeVisible();

  // Merge asks first, naming both rows; then says what it did.
  await card.locator('[data-pair-merge]').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('ATLANTIC INERTIAL SYSTEMS INC. PART OF UTC AEROSPACE SYSTEMS');
  await expect(dialog).toContainText('Cannot be undone.');
  await assertHealthyLayout(page, '/admin?tab=data&pairs=id:confirm');
  await dialog.getByRole('button', { name: 'Merge' }).click();
  await expect.poll(() => merged).toEqual({ into: B });
  await expect(page.getByText(/^Merged ATLANTIC INERTIAL SYSTEMS INC\. PART OF UTC/)).toBeVisible();
});
