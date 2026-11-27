// The Atlas's address (client/src/components/atlas/state.ts) and its reading
// against the wheel (view.ts), over the curated taxonomy and the Atlas's
// structure themselves. The wheel's own arithmetic is atlas-wheel.unit.ts, its
// structure atlas-data.unit.ts, a career as a small plate career-atlas.unit.ts.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ATLAS } from '../../shared/atlas';
import type { Taxonomy } from '../../client/src/lib/api';
import { NOTHING, chosen, modeOf, type Mode, type Selection } from '../../client/src/components/atlas/camera';
import { TAU, buildAtlas, isCore, layOver } from '../../client/src/components/atlas/model';
import { atlasHref, readAtlasState, skillsListHref, type AtlasState } from '../../client/src/components/atlas/state';
import { addressOf, domainSelection, leadingField, onlySkillMoved, viewOf } from '../../client/src/components/atlas/view';

interface FileTaxonomy {
  domains: { slug: string; name: string; groups: { slug: string; name: string; skills: { name: string; level: 1 | 2 | 3 }[] }[] }[];
}

// The taxonomy as the API serves it, from the curated file: every skill with an id of its own.
const file = JSON.parse(readFileSync('data/skills/taxonomy.json', 'utf8')) as FileTaxonomy;
const idOf = (name: string) => `id:${name}`;
const taxonomy: Taxonomy = {
  levels: [],
  domains: file.domains.map((domain) => ({
    slug: domain.slug,
    name: domain.name,
    description: '',
    groups: domain.groups.map((group) => ({
      slug: group.slug,
      name: group.name,
      description: '',
      skills: group.skills.map((skill) => ({ id: idOf(skill.name), name: skill.name, level: skill.level, careers: 1, makes: [] })),
    })),
  })),
};
const model = buildAtlas(taxonomy, ATLAS);
const state = (query: string): AtlasState => readAtlasState(new URLSearchParams(query));
const read = (query: string) => viewOf(model, taxonomy, state(query));
/** An address as the page would write it back: read, set against the wheel, written. */
const cleaned = (query: string): string => atlasHref(read(query).address);
const g = (slug: string) => model.groupBySlug.get(slug) as number;
const f = (slug: string) => model.fieldBySlug.get(slug) as number;
const s = (name: string) => model.skillById.get(idOf(name)) as number;
/** A skill's id as a query holds it. */
const q = (name: string) => new URLSearchParams({ x: idOf(name) }).toString().slice(2);

// What the checks below stand on: a field, a group in it, a skill of that group, and the core group the field is built on.
const WELDING = 'welding';
const ARC = 'arc-welding';
const TIG = 'TIG Welding';
const SAFETY = 'workplace-safety';
const weldingRoot = model.G[model.fields[f(WELDING)].roots[0]].slug;

test('what the checks stand on is on the wheel', () => {
  assert.ok(f(WELDING) >= 0 && g(ARC) >= 0 && s(TIG) >= 0 && g(SAFETY) >= 0);
  assert.equal(model.G[g(ARC)].field, f(WELDING));
  assert.equal(model.skillGroup[s(TIG)], g(ARC));
  assert.ok(isCore(model, g(SAFETY)) && !isCore(model, g(ARC)));
  assert.ok(isCore(model, g(weldingRoot)));
});

// ---- writing an address (atlasHref) ---------------------------------------------------------------------------------

test('the address says what is open: the whole wheel, Fundamentals, a field, a group, a skill', () => {
  assert.equal(atlasHref({}), '/atlas');
  assert.equal(atlasHref({ fundamentals: false, field: null, group: null, skill: null, domain: null, career: null, at: null, from: null }), '/atlas');
  assert.equal(atlasHref({ fundamentals: true }), '/atlas?fundamentals=1');
  assert.equal(atlasHref({ field: WELDING }), `/atlas?field=${WELDING}`);
  assert.equal(atlasHref({ group: ARC }), `/atlas?group=${ARC}`);
  assert.equal(atlasHref({ skill: 'abc' }), '/atlas?skill=abc');
});

test('one of them is written, the most specific: a skill says its group, a group its field or Fundamentals', () => {
  assert.equal(atlasHref({ group: ARC, skill: 'abc' }), '/atlas?skill=abc');
  assert.equal(atlasHref({ fundamentals: true, group: SAFETY }), `/atlas?group=${SAFETY}`);
  assert.equal(atlasHref({ fundamentals: true, group: SAFETY, skill: 'abc' }), '/atlas?skill=abc');
  // A field open and Fundamentals open cannot both be: the field is the one written.
  assert.equal(atlasHref({ fundamentals: true, field: WELDING }), `/atlas?field=${WELDING}`);
});

test('a core group reached from inside an open field keeps that field beside it', () => {
  assert.equal(atlasHref({ group: SAFETY, field: WELDING }), `/atlas?group=${SAFETY}&field=${WELDING}`);
  assert.equal(atlasHref({ skill: 'abc', field: WELDING }), `/atlas?skill=abc&field=${WELDING}`);
  assert.equal(atlasHref({ skill: 'abc', group: SAFETY, field: WELDING, fundamentals: true }), `/atlas?skill=abc&field=${WELDING}`);
});

test("the Skills list's domain is written only when nothing more is said", () => {
  assert.equal(atlasHref({ domain: 'quality' }), '/atlas?domain=quality');
  assert.equal(atlasHref({ domain: 'quality', field: WELDING }), `/atlas?field=${WELDING}`);
  assert.equal(atlasHref({ domain: 'quality', group: ARC }), `/atlas?group=${ARC}`);
  assert.equal(atlasHref({ domain: 'quality', skill: 'abc' }), '/atlas?skill=abc');
  assert.equal(atlasHref({ domain: 'quality', fundamentals: true }), '/atlas?fundamentals=1');
  assert.equal(atlasHref({ domain: 'quality', career: 'c1' }), '/atlas?domain=quality&career=c1');
});

test('a career laid over the wheel, a company\'s version of it and a military career under it are kept beside what is open', () => {
  assert.equal(atlasHref({ career: 'c1' }), '/atlas?career=c1');
  assert.equal(atlasHref({ career: 'c1', at: 'boeing' }), '/atlas?career=c1&at=boeing');
  assert.equal(atlasHref({ career: 'c1', from: 'm1' }), '/atlas?career=c1&from=m1');
  assert.equal(atlasHref({ career: 'c1', at: 'boeing', from: 'm1' }), '/atlas?career=c1&at=boeing&from=m1');
  // What is open comes first, then what is laid over it.
  assert.equal(atlasHref({ fundamentals: true, career: 'c1' }), '/atlas?fundamentals=1&career=c1');
  assert.equal(atlasHref({ field: WELDING, career: 'c1', at: 'boeing' }), `/atlas?field=${WELDING}&career=c1&at=boeing`);
  assert.equal(atlasHref({ group: ARC, career: 'c1', from: 'm1' }), `/atlas?group=${ARC}&career=c1&from=m1`);
  assert.equal(atlasHref({ skill: 'abc', career: 'c1', at: 'boeing', from: 'm1' }), '/atlas?skill=abc&career=c1&at=boeing&from=m1');
  assert.equal(atlasHref({ group: SAFETY, field: WELDING, career: 'c1' }), `/atlas?group=${SAFETY}&field=${WELDING}&career=c1`);
  // Without a career there is nothing for a company to have a version of, and nothing to lie under.
  assert.equal(atlasHref({ at: 'boeing' }), '/atlas');
  assert.equal(atlasHref({ from: 'm1' }), '/atlas');
  assert.equal(atlasHref({ field: WELDING, at: 'boeing', from: 'm1' }), `/atlas?field=${WELDING}`);
  // A career does not lie under itself.
  assert.equal(atlasHref({ career: 'c1', from: 'c1' }), '/atlas?career=c1');
  // A value is written so that it reads back whatever it holds.
  assert.equal(state(atlasHref({ career: 'c1', at: 'a&b=c d' }).split('?')[1]).at, 'a&b=c d');
});

// ---- reading an address (readAtlasState) ----------------------------------------------------------------------------

test('an address is read word for word, and nothing it does not say is made up', () => {
  const nothing: AtlasState = { fundamentals: false, field: null, group: null, skill: null, domain: null, career: null, at: null, from: null };
  assert.deepEqual(state(''), nothing);
  assert.deepEqual(state('fundamentals=1'), { ...nothing, fundamentals: true });
  assert.deepEqual(state(`field=${WELDING}`), { ...nothing, field: WELDING });
  assert.deepEqual(state(`group=${ARC}`), { ...nothing, group: ARC });
  assert.deepEqual(state('skill=abc'), { ...nothing, skill: 'abc' });
  assert.deepEqual(state(`group=${SAFETY}&field=${WELDING}`), { ...nothing, group: SAFETY, field: WELDING });
  assert.deepEqual(state('domain=quality'), { ...nothing, domain: 'quality' });
  assert.deepEqual(state('career=c1'), { ...nothing, career: 'c1' });
  assert.deepEqual(state('career=c1&at=boeing'), { ...nothing, career: 'c1', at: 'boeing' });
  assert.deepEqual(state('career=c1&from=m1'), { ...nothing, career: 'c1', from: 'm1' });
  assert.deepEqual(state('skill=abc&career=c1&at=boeing&from=m1'), { ...nothing, skill: 'abc', career: 'c1', at: 'boeing', from: 'm1' });
  // Fundamentals is open only when the address says exactly so.
  for (const other of ['fundamentals=0', 'fundamentals=true', 'fundamentals=', 'fundamentals']) assert.equal(state(other).fundamentals, false, other);
  // A company and a military career mean something only beside a career.
  assert.deepEqual(state('at=boeing&from=m1'), nothing);
  assert.deepEqual(state(`field=${WELDING}&at=boeing`), { ...nothing, field: WELDING });
  // An older Atlas's second career, a career page's old view and anything else are not read.
  assert.deepEqual(state('career=c1&with=c2'), { ...nothing, career: 'c1' });
  assert.deepEqual(state('with=c2&path=atlas&tab=skills&view=whole'), nothing);
});

test('an address the Atlas writes reads back as itself', () => {
  for (const address of [
    '/atlas',
    '/atlas?fundamentals=1',
    `/atlas?field=${WELDING}`,
    `/atlas?group=${ARC}`,
    '/atlas?skill=abc',
    `/atlas?group=${SAFETY}&field=${WELDING}`,
    `/atlas?skill=abc&field=${WELDING}`,
    '/atlas?domain=quality',
    '/atlas?career=c1',
    '/atlas?career=c1&at=boeing',
    '/atlas?career=c1&from=m1',
    `/atlas?field=${WELDING}&career=c1&at=boeing&from=m1`,
    '/atlas?fundamentals=1&career=c1',
    '/atlas?domain=quality&career=c1&at=boeing',
  ]) {
    assert.equal(atlasHref(state(address.split('?')[1] ?? '')), address);
  }
});

// ---- an address read against the wheel (viewOf) -------------------------------------------------------------------

test('what the wheel shows follows from the address: rest, the core, a core group, a field', () => {
  const modes: [string, Selection, Mode][] = [
    ['', NOTHING, 'rest'],
    ['fundamentals=1', { ...NOTHING, core: true }, 'core'],
    [`field=${WELDING}`, { ...NOTHING, field: f(WELDING) }, 'field'],
    // A group is inside its field; a core group is inside Fundamentals.
    [`group=${ARC}`, { core: false, field: f(WELDING), group: g(ARC), skill: -1 }, 'field'],
    [`group=${SAFETY}`, { core: true, field: -1, group: g(SAFETY), skill: -1 }, 'coreGroup'],
    // A skill is in its group.
    [`skill=${q(TIG)}`, { core: false, field: f(WELDING), group: g(ARC), skill: s(TIG) }, 'field'],
  ];
  for (const [query, selection, mode] of modes) {
    assert.deepEqual(read(query).selection, selection, query || '(nothing)');
    assert.equal(modeOf(model, read(query).selection), mode, query || '(nothing)');
    assert.equal(cleaned(query), query ? `/atlas?${query}` : '/atlas');
  }
  // A core group's skill is inside Fundamentals too.
  const first = model.S[model.G[g(SAFETY)].skills[0]];
  assert.deepEqual(read(`skill=${q(first.name)}`).selection, { core: true, field: -1, group: g(SAFETY), skill: s(first.name) });
});

test('a skill says more than a group, a group more than a field, a field more than Fundamentals', () => {
  // A skill named beside another group is in its own group.
  assert.deepEqual(read(`skill=${q(TIG)}&group=${SAFETY}`).selection, { core: false, field: f(WELDING), group: g(ARC), skill: s(TIG) });
  assert.equal(cleaned(`skill=${q(TIG)}&group=${SAFETY}`), `/atlas?skill=${q(TIG)}`);
  // Beside a group that is not a core group the field says nothing the group does not.
  assert.equal(cleaned(`group=${ARC}&field=machining`), `/atlas?group=${ARC}`);
  assert.equal(cleaned(`group=${ARC}&fundamentals=1`), `/atlas?group=${ARC}`);
  assert.equal(cleaned(`field=${WELDING}&fundamentals=1`), `/atlas?field=${WELDING}`);
  assert.equal(cleaned(`fundamentals=1&domain=quality`), '/atlas?fundamentals=1');
});

test('a core group reached from inside an open field keeps the field beside it, and only then', () => {
  const welding = model.fields[f(WELDING)];
  const kept = read(`group=${weldingRoot}&field=${WELDING}`);
  assert.deepEqual(kept.selection, { core: false, field: f(WELDING), group: g(weldingRoot), skill: -1 });
  // The wheel turns to the core group all the same; the list stays on the field.
  assert.equal(modeOf(model, kept.selection), 'coreGroup');
  assert.equal(atlasHref(kept.address), `/atlas?group=${weldingRoot}&field=${WELDING}`);
  // Its skill, chosen there, keeps the field too.
  const skill = model.S[model.G[g(weldingRoot)].skills[0]];
  const inside = read(`skill=${q(skill.name)}&field=${WELDING}`);
  assert.deepEqual(inside.selection, { core: false, field: f(WELDING), group: g(weldingRoot), skill: s(skill.name) });
  assert.equal(atlasHref(inside.address), `/atlas?skill=${q(skill.name)}&field=${WELDING}`);
  // A core group the field does not stand on is in Fundamentals, and the field leaves the address.
  const other = model.core.map((i) => model.G[i].slug).find((slug) => !welding.roots.includes(g(slug))) as string;
  assert.ok(other, 'welding stands on every core group');
  assert.deepEqual(read(`group=${other}&field=${WELDING}`).selection, { core: true, field: -1, group: g(other), skill: -1 });
  assert.equal(cleaned(`group=${other}&field=${WELDING}`), `/atlas?group=${other}`);
  // Every field's own core groups can be opened inside it.
  for (const field of model.fields) {
    for (const root of field.roots) {
      const view = read(`group=${model.G[root].slug}&field=${field.slug}`);
      assert.deepEqual(view.selection, { core: false, field: field.f, group: root, skill: -1 }, `${field.slug} > ${model.G[root].slug}`);
    }
  }
});

test('a career, a company and a military career stay in the address beside whatever is open', () => {
  assert.equal(cleaned('career=c1'), '/atlas?career=c1');
  assert.equal(cleaned(`group=${ARC}&career=c1&at=boeing`), `/atlas?group=${ARC}&career=c1&at=boeing`);
  assert.equal(cleaned(`field=${WELDING}&career=c1&from=m1`), `/atlas?field=${WELDING}&career=c1&from=m1`);
  assert.equal(cleaned(`group=${weldingRoot}&field=${WELDING}&career=c1&at=boeing&from=m1`), `/atlas?group=${weldingRoot}&field=${WELDING}&career=c1&at=boeing&from=m1`);
  // They say nothing about what the wheel shows.
  assert.deepEqual(read(`field=${WELDING}&career=c1&at=boeing&from=m1`).selection, read(`field=${WELDING}`).selection);
});

test('what the address names that is not there is cleaned from it', () => {
  assert.equal(cleaned('group=no-such-group'), '/atlas');
  assert.equal(cleaned('field=no-such-field'), '/atlas');
  assert.equal(cleaned('skill=no-such-skill'), '/atlas');
  assert.equal(cleaned('skill=no-such-skill&career=c1'), '/atlas?career=c1');
  // What it also names that is there is kept.
  assert.equal(cleaned('field=no-such-field&fundamentals=1'), '/atlas?fundamentals=1');
  assert.equal(cleaned(`skill=no-such-skill&group=${ARC}`), `/atlas?group=${ARC}`);
  assert.equal(cleaned(`group=no-such-group&field=${WELDING}`), `/atlas?field=${WELDING}`);
  // An older Atlas's second career is dropped, with or without a first.
  assert.equal(cleaned(`field=${WELDING}&career=c1&with=c2`), `/atlas?field=${WELDING}&career=c1`);
  assert.equal(cleaned('with=c2'), '/atlas');
  // A career that turned out not to exist leaves with what hung on it; a company with no version, or a career that
  // is not a military one, leaves alone.
  const laid = state(`field=${WELDING}&career=c1&at=boeing&from=m1`);
  assert.equal(atlasHref(viewOf(model, taxonomy, laid, { at: true }).address), `/atlas?field=${WELDING}&career=c1&from=m1`);
  assert.equal(atlasHref(viewOf(model, taxonomy, laid, { from: true }).address), `/atlas?field=${WELDING}&career=c1&at=boeing`);
  assert.equal(atlasHref(viewOf(model, taxonomy, laid, { career: true }).address), `/atlas?field=${WELDING}`);
  assert.equal(atlasHref(viewOf(model, taxonomy, laid, {}).address), `/atlas?field=${WELDING}&career=c1&at=boeing&from=m1`);
});

test('an older address that names a domain opens the field that holds most of its groups', () => {
  assert.equal(taxonomy.domains.length, 16);
  for (const domain of taxonomy.domains) {
    const opened = domainSelection(model, taxonomy, domain.slug);
    assert.ok(opened, `${domain.slug} opens nothing`);
    assert.equal(opened.group, -1);
    assert.equal(opened.skill, -1);
    const per = new Map<number, number>();
    for (const group of domain.groups) {
      const field = model.G[g(group.slug)].field;
      if (field >= 0) per.set(field, (per.get(field) ?? 0) + 1);
    }
    // A domain whose groups all stand on the centre ring is in Fundamentals.
    if (per.size === 0) assert.deepEqual(opened, { ...NOTHING, core: true });
    else {
      assert.ok(opened.field >= 0 && !opened.core);
      const most = Math.max(...per.values());
      assert.equal(per.get(opened.field), most, `${domain.slug} opens ${model.F[opened.field].slug}`);
      // Of equals, the first round the wheel.
      assert.equal(opened.field, model.order.find((field) => per.get(field) === most), `${domain.slug}: the first of its largest fields`);
    }
    // The domain is replaced in the address by what it opened, and a career beside it stays.
    const address = read(`domain=${domain.slug}&career=c1`).address;
    assert.ok(!address.domain && (address.field || address.fundamentals), `${domain.slug} stays in the address`);
    assert.equal(address.career, 'c1');
    assert.deepEqual(read(`domain=${domain.slug}`).selection, opened);
    assert.doesNotMatch(cleaned(`domain=${domain.slug}`), /domain=/);
  }
  assert.equal(domainSelection(model, taxonomy, 'no-such-domain'), null);
  assert.equal(cleaned('domain=no-such-domain'), '/atlas');
  // A domain says less than anything else the address names.
  assert.equal(cleaned(`domain=quality&group=${ARC}`), `/atlas?group=${ARC}`);
  assert.equal(cleaned(`domain=quality&field=${WELDING}`), `/atlas?field=${WELDING}`);
});

test('every choice the wheel can make is an address that reads back as the same choice', () => {
  let checked = 0;
  const back = (selection: Selection) => {
    const href = atlasHref(addressOf(model, selection));
    assert.deepEqual(read(href.split('?')[1] ?? '').selection, selection, href);
    checked += 1;
  };
  back(NOTHING);
  back(chosen(model, { f: -1, g: -1, s: -1, core: true }));
  model.G.forEach((group, i) => {
    const hit = { f: group.field, g: i, s: -1 };
    back(chosen(model, hit));
    for (const skill of group.skills) back(chosen(model, { ...hit, s: skill }));
    // In the list a core group is also a row of each field that stands on it.
    if (isCore(model, i)) {
      for (const field of model.fields) {
        if (!field.roots.includes(i)) continue;
        back({ core: false, field: field.f, group: i, skill: -1 });
        back({ core: false, field: field.f, group: i, skill: group.skills[0] });
      }
    }
  });
  model.fields.forEach((field) => back({ ...NOTHING, field: field.f }));
  assert.ok(checked > 2 + model.N + model.S.length + model.fields.length);
});

test('a skill chosen or let go inside its group is no step for Back; anything else is', () => {
  const a: Selection = { core: false, field: f(WELDING), group: g(ARC), skill: -1 };
  assert.equal(onlySkillMoved(a, { ...a, skill: s(TIG) }), true);
  assert.equal(onlySkillMoved({ ...a, skill: s(TIG) }, a), true);
  assert.equal(onlySkillMoved({ ...a, skill: s(TIG) }, { ...a, skill: model.G[g(ARC)].skills.find((each) => each !== s(TIG)) as number }), true);
  assert.equal(onlySkillMoved(a, a), false);
  assert.equal(onlySkillMoved(a, { ...a, group: -1 }), false);
  assert.equal(onlySkillMoved(a, { ...a, group: g(weldingRoot), skill: s(TIG) }), false);
  assert.equal(onlySkillMoved(NOTHING, { ...NOTHING, core: true }), false);
  assert.equal(onlySkillMoved(NOTHING, { ...NOTHING, field: f(WELDING) }), false);
});

test('a career picked opens the field that holds most of its skills', () => {
  const need = [...model.G[g(ARC)].skills, model.G[g('cnc-setup')].skills[0], ...model.G[g(SAFETY)].skills];
  const laid = layOver(model, need, null);
  assert.equal(leadingField(laid.fields), f(WELDING));
  // A career wholly inside Fundamentals reaches no field.
  assert.equal(leadingField(layOver(model, model.G[g(SAFETY)].skills, null).fields), -1);
  assert.equal(leadingField([]), -1);
  // Of equals, the first round the wheel.
  assert.equal(leadingField([{ f: 4, n: 2 }, { f: 9, n: 2 }]), 4);
  assert.equal(leadingField([{ f: 4, n: 2 }, { f: 9, n: 3 }, { f: 11, n: 3 }]), 9);
});

// ---- the Skills list and the Atlas: one switch between two views --------------------------------------------------

test('the Skills list narrowed to a group opens the Atlas on that group, and the Atlas on a group the list narrowed to it', () => {
  assert.equal(skillsListHref(), '/explore?tab=skills');
  assert.equal(skillsListHref('quality'), '/explore?tab=skills&domain=quality');
  assert.equal(skillsListHref('quality', 'calibration'), '/explore?tab=skills&domain=quality&group=calibration');
  // A group is one of a domain's: alone it narrows nothing.
  assert.equal(skillsListHref(null, 'calibration'), '/explore?tab=skills');
  // Every group of the taxonomy is a place on the Atlas the list can lead to, and every domain opens something there.
  for (const domain of taxonomy.domains) {
    assert.doesNotMatch(cleaned(atlasHref({ domain: domain.slug }).split('?')[1]), /domain=/, domain.slug);
    for (const group of domain.groups) {
      const href = atlasHref({ group: group.slug });
      assert.equal(cleaned(href.split('?')[1]), href, `${group.slug} is not on the wheel`);
    }
  }
});

// ---- what the old plate's checks held that the wheel still owes ---------------------------------------------------

test('no safety group is at the top of the wheel: it opens on Measuring at twelve, and Shop safety lies at the lower left', () => {
  // At rest the wheel's own start is at twelve o'clock and its angles go round clockwise (lens.ts, plate.ts).
  const hours = (angle: number) => (angle / TAU) * 12;
  const span = (slug: string) => [hours(model.sp0[g(slug)]), hours(model.sp1[g(slug)])];
  assert.equal(model.G[model.core[0]].slug, 'measurement-tools');
  const [from, to] = span('measurement-tools');
  assert.ok(from >= 0 && from < 0.25 && to < 3, `Measuring runs from ${from.toFixed(2)} to ${to.toFixed(2)} o'clock`);
  // The three of the twelve that are about safety: none reaches within two hours of twelve, and Shop safety,
  // the one with no hue, lies wholly between six and ten.
  for (const slug of ['hazardous-energy', SAFETY, 'hazardous-materials']) {
    const [a, b] = span(slug);
    assert.ok(a >= 2 && b <= 10, `${slug} runs from ${a.toFixed(2)} to ${b.toFixed(2)} o'clock`);
  }
  const [a, b] = span(SAFETY);
  assert.ok(a >= 6 && b <= 10, `Shop safety runs from ${a.toFixed(2)} to ${b.toFixed(2)} o'clock`);
});
