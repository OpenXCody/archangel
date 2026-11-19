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

  // A skill's page says where the skill sits: its domain and group, each a link into the Skills list, and its level.
  const skill = await firstId(request, '/skills');
  expect(skill, 'the API returned a skill to open').toBeTruthy();
  await page.goto(`/skills/${skill}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-skill-domain]')).toHaveAttribute('href', /^\/explore\?tab=skills&domain=[a-z0-9-]+$/);
  await expect(page.locator('[data-skill-group]')).toHaveAttribute('href', /^\/explore\?tab=skills&domain=[a-z0-9-]+&group=[a-z0-9-]+$/);
  await expect(page.locator('[data-skill-level]')).toHaveText(/^(Fundamentals|Intermediate|Advanced)$/);

  const company = await firstId(request, '/companies');
  expect(company, 'the API returned a company to open').toBeTruthy();
  await page.goto(`/companies/${company}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-entity-view="companies"]')).toHaveCount(1);
  await expect(page.locator('#skills')).toHaveCount(0);
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
