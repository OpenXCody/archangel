import type { Response } from 'express';
import { and, eq, ne, sql, type SQL } from 'drizzle-orm';
import { db, companies, factories, occupations, occupationSkills, skills, skillDomains, skillGroups, occupationAliases, skillAliases } from '../db/index.js';
import { changedFields, recordAudit, type Actor, type Executor } from './audit.js';
import { answerWriteError, coordinate, count, FACTORY_STATUSES, HOSTNAME, isUuid, optionalName, optionalText, sourceUrl, stateCode, year } from './writes.js';
import { rowsOf } from './rows.js';
import { findGroup, placeColumns, placeOf, readLevel, type SkillPlace } from './taxonomy.js';
import { skillLevelName } from '../../shared/skillLevels.js';
import { adminSetFacts, factsOfFields } from './provenance.js';
import { LADDER_LOCK, MAX_LEADS_TO, findDomain, ladderFrom, leadsTo, setLeadsTo, type CareerRef } from './careers.js';
import { skillMakes } from '../db/index.js';
import { MAKES_MAX, MAKE_NAME_MAX, makeName, makesForEditor, makesOf, type Make } from './makes.js';

/**
 * Correcting the four kinds of record an admin keeps: companies, factories,
 * careers and skills. One place checks a change, makes it, and writes the
 * line in the audit log, whichever route it arrived by (the kind's own
 * PUT / DELETE, or Admin Tools). Merging two records is in recordMerge.ts;
 * finding one by name, and the ones a name comes close to, in recordSearch.ts.
 */

const RECORD_KINDS = ['company', 'factory', 'career', 'skill'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === 'string' && (RECORD_KINDS as readonly string[]).includes(value);
}

/** A change that cannot be made, with the status and words to answer with. */
export class RecordRefusal extends Error {
  status: number;
  extra: Record<string, unknown>;
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Answers a failed record write: the refusal as it was worded, or what the database said. */
export function answerRefusal(res: Response, error: unknown, what: string): void {
  if (error instanceof RecordRefusal) res.status(error.status).json({ error: error.message, ...error.extra });
  else answerWriteError(res, error, what);
}

export const NOT_FOUND: Record<RecordKind, string> = {
  company: 'Company not found',
  factory: 'Plant not found',
  career: 'Occupation not found',
  skill: 'Skill not found',
};

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * A web domain as it is stored: what a person pastes ("https://www.Tesla.com/about")
 * is brought down to the bare host ("tesla.com"). Null when emptied, false when
 * what is left is not a domain.
 */
function cleanDomain(value: unknown): string | null | false {
  if (value === null) return null;
  if (typeof value !== 'string') return false;
  let host = value.trim().toLowerCase();
  if (host === '') return null;
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  host = host.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  return HOSTNAME.test(host) ? host : false;
}

const MAX_ALIASES = 30;
/** A career also keeps every title that was folded into it: the catalogue's fullest has 42 of them. */
const MAX_CAREER_ALIASES = 80;

/** Other names for a record: trimmed, without repeats or the record's own name. Null when the value is not a list of text. */
function cleanAliases(value: unknown, ownName: string, most = MAX_ALIASES): string[] | null {
  if (value === null) return [];
  if (!Array.isArray(value) || value.length > 200) return null;
  const seen = new Set<string>([ownName.trim().toLowerCase()]);
  const list: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const text = item.replace(/\s+/g, ' ').trim();
    if (text.length > 200) return null;
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    list.push(text);
  }
  return list.length <= most ? list : null;
}

const MAX_TOOLS = 12;
/**
 * What a skill is done with: a short list of tools, machines or software.
 * Undefined when left out, an empty list when cleared, false when it is not a
 * list of short names.
 */
export function toolList(value: unknown): string[] | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value) || value.length > 50) return false;
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return false;
    const text = item.replace(/\s+/g, ' ').trim();
    if (text.length > 120) return false;
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    list.push(text);
  }
  return list.length <= MAX_TOOLS ? list : false;
}

/** One line of text: spaces collapsed, null when emptied, false when not text or too long. */
function oneLine(value: unknown, max: number): string | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return false;
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length > max) return false;
  return text || null;
}

function refuse(field: string, message: string): never {
  throw new RecordRefusal(400, message, { field });
}

// ---------------------------------------------------------------------------
// What a record carries with it
// ---------------------------------------------------------------------------

/** Counts of what points at a record: what a merge moves and a deletion takes. Zeroes are left out. */
export type Attached = Record<string, number>;

export async function attachedTo(executor: Executor, kind: RecordKind, id: string): Promise<Attached> {
  const query: Record<RecordKind, SQL> = {
    company: sql`SELECT
      (SELECT COUNT(*)::int FROM factories WHERE company_id = ${id}) AS factories,
      (SELECT COUNT(*)::int FROM jobs WHERE company_id = ${id}) AS jobs,
      (SELECT COUNT(*)::int FROM applications a INNER JOIN jobs j ON j.id = a.job_id WHERE j.company_id = ${id}) AS applications,
      (SELECT COUNT(*)::int FROM company_members WHERE company_id = ${id} AND status = 'active') AS members,
      (SELECT COUNT(*)::int FROM company_members WHERE company_id = ${id} AND status <> 'active') AS requests,
      (SELECT COUNT(*)::int FROM invites WHERE company_id = ${id} AND accepted_at IS NULL AND expires_at > now()) AS invites`,
    factory: sql`SELECT
      (SELECT COUNT(*)::int FROM jobs WHERE factory_id = ${id}) AS jobs,
      (SELECT COUNT(*)::int FROM applications a INNER JOIN jobs j ON j.id = a.job_id WHERE j.factory_id = ${id}) AS applications,
      (SELECT COUNT(*)::int FROM factory_occupations WHERE factory_id = ${id}) AS careers`,
    career: sql`SELECT
      (SELECT COUNT(*)::int FROM occupation_skills WHERE occupation_id = ${id}) AS skills,
      (SELECT COUNT(*)::int FROM jobs WHERE occupation_id = ${id}) AS jobs,
      (SELECT COUNT(*)::int FROM applications a INNER JOIN jobs j ON j.id = a.job_id WHERE j.occupation_id = ${id}) AS applications,
      (SELECT COUNT(*)::int FROM user_goals WHERE occupation_id = ${id}) AS goals,
      (SELECT COUNT(*)::int FROM industry_occupations WHERE occupation_id = ${id}) AS industries,
      (SELECT COUNT(*)::int FROM factory_occupations WHERE occupation_id = ${id}) AS factories,
      (SELECT COUNT(*)::int FROM occupation_links WHERE from_occupation_id = ${id} OR to_occupation_id = ${id}) AS links`,
    skill: sql`SELECT
      (SELECT COUNT(*)::int FROM occupation_skills WHERE skill_id = ${id}) AS careers,
      (SELECT COUNT(*)::int FROM job_skills WHERE skill_id = ${id}) AS jobs,
      (SELECT COUNT(*)::int FROM user_skills WHERE skill_id = ${id}) AS people,
      (SELECT COUNT(*)::int FROM skill_makes WHERE skill_id = ${id}) AS makes`,
  };
  const [row] = rowsOf<Record<string, number>>(await executor.execute(query[kind]));
  const attached: Attached = {};
  for (const [key, value] of Object.entries(row ?? {})) if (Number(value) > 0) attached[key] = Number(value);
  return attached;
}

// ---------------------------------------------------------------------------
// Reading one record for the editor
// ---------------------------------------------------------------------------

export interface RecordView {
  kind: RecordKind;
  id: string;
  /** What the record is called: a career's title, otherwise its name. */
  name: string;
  /** The record's own page. */
  href: string;
  fields: Record<string, unknown>;
  /** Other names it is known by. Factories have none. */
  aliases: string[];
  attached: Attached;
  /** Factories: the industries a plant can be filed under. */
  industries?: string[];
  /** Careers: the skills on the path, each with its level, group and domain, read fresh (the public career page is cached). */
  path?: ({ id: string; name: string } & SkillPlace)[];
  /** Careers: the careers this one leads to, in order. */
  leadsTo?: CareerRef[];
  /** Skills: the tools, machines or software it is done with. */
  tools?: string[];
  /** Skills: its makes in the order they are shown, each with how many people marked it. */
  makes?: (Make & { people: number })[];
}

async function aliasesOf(executor: Executor, kind: 'career' | 'skill', id: string): Promise<string[]> {
  const rows =
    kind === 'career'
      ? await executor.select({ text: occupationAliases.aliasText }).from(occupationAliases).where(eq(occupationAliases.canonicalOccupationId, id))
      : await executor.select({ text: skillAliases.aliasText }).from(skillAliases).where(eq(skillAliases.canonicalSkillId, id));
  return rows.map((row) => row.text).sort((a, b) => a.localeCompare(b));
}

/** The industries a plant can be filed under: the curated ones, and any a plant already carries. */
async function factoryIndustries(executor: Executor): Promise<string[]> {
  const rows = rowsOf<{ industry: string }>(
    await executor.execute(sql`
      SELECT industry FROM industry_occupations
      UNION
      SELECT primary_naics_description FROM factories WHERE primary_naics_description IS NOT NULL
      ORDER BY 1
    `)
  );
  return rows.map((row) => row.industry);
}

export async function readRecord(kind: RecordKind, id: string): Promise<RecordView | null> {
  const attached = await attachedTo(db, kind, id);
  if (kind === 'company') {
    const [row] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (!row) return null;
    return {
      kind,
      id,
      name: row.name,
      href: `/companies/${row.slug ?? row.id}`,
      fields: {
        name: row.name,
        industry: row.industry,
        description: row.description,
        domain: row.domain,
        featured: row.featured,
        headquartersLat: row.headquartersLat,
        headquartersLng: row.headquartersLng,
        headquartersCity: row.headquartersCity,
        headquartersState: row.headquartersState,
        headquartersCountry: row.headquartersCountry,
        parentCompanyId: row.parentCompanyId,
        parentName: row.parentCompanyId
          ? ((await db.select({ name: companies.name }).from(companies).where(eq(companies.id, row.parentCompanyId)).limit(1))[0]?.name ?? null)
          : null,
      },
      aliases: row.aliases ?? [],
      attached,
    };
  }
  if (kind === 'factory') {
    const [row] = await db
      .select({
        name: factories.name,
        companyId: factories.companyId,
        companyName: companies.name,
        address: factories.address,
        city: factories.city,
        state: factories.state,
        latitude: factories.latitude,
        longitude: factories.longitude,
        industry: factories.primaryNaicsDescription,
        workforceSize: factories.workforceSize,
        workforceYear: factories.workforceYear,
        workforceSource: factories.workforceSource,
        workforceNote: factories.workforceNote,
        products: factories.products,
        openedYear: factories.openedYear,
        status: factories.status,
      })
      .from(factories)
      .leftJoin(companies, eq(companies.id, factories.companyId))
      .where(eq(factories.id, id))
      .limit(1);
    if (!row) return null;
    return { kind, id, name: row.name, href: `/factories/${id}`, fields: row, aliases: [], attached, industries: await factoryIndustries(db) };
  }
  if (kind === 'career') {
    const [row] = await db.select().from(occupations).where(eq(occupations.id, id)).limit(1);
    if (!row) return null;
    return {
      kind,
      id,
      name: row.title,
      href: `/occupations/${id}`,
      // `home` is the slug the form sends back; `homeName` is for showing.
      fields: {
        title: row.title,
        description: row.description,
        onetCode: row.onetCode,
        pathStatus: row.pathStatus,
        home: row.homeDomain,
        homeName: (await findDomain(db, row.homeDomain))?.name ?? null,
      },
      aliases: await aliasesOf(db, 'career', id),
      attached,
      leadsTo: await leadsTo(db, id),
      path: (
        await db
          .select({ id: skills.id, name: skills.name, ...placeColumns })
          .from(occupationSkills)
          .innerJoin(skills, eq(skills.id, occupationSkills.skillId))
          .leftJoin(skillGroups, eq(skillGroups.slug, skills.groupSlug))
          .leftJoin(skillDomains, eq(skillDomains.slug, skillGroups.domainSlug))
          .where(eq(occupationSkills.occupationId, id))
          .orderBy(sql`${skills.level} ASC NULLS LAST`, skills.name)
      ).map((skill) => ({ id: skill.id, name: skill.name, ...placeOf(skill) })),
    };
  }
  const [row] = await db
    .select({ name: skills.name, description: skills.description, howLearned: skills.howLearned, tools: skills.tools, ...placeColumns })
    .from(skills)
    .leftJoin(skillGroups, eq(skillGroups.slug, skills.groupSlug))
    .leftJoin(skillDomains, eq(skillDomains.slug, skillGroups.domainSlug))
    .where(eq(skills.id, id))
    .limit(1);
  if (!row) return null;
  return {
    kind,
    id,
    name: row.name,
    href: `/skills/${id}`,
    // `group` is the slug the form sends back; `groupName` and `domain` are for showing.
    fields: { name: row.name, group: row.groupSlug, groupName: row.groupName, domain: row.domainName, level: row.level, description: row.description, howLearned: row.howLearned },
    tools: row.tools ?? [],
    makes: await makesForEditor(db, id),
    aliases: await aliasesOf(db, 'skill', id),
    attached,
  };
}

// ---------------------------------------------------------------------------
// Changing a record
// ---------------------------------------------------------------------------

type Body = Record<string, unknown>;

/** The stored row after a change, as the kind's own route returns it. */
export type SavedRow = Record<string, unknown> & { id: string };

async function changeCompany(id: string, body: Body, actor: Actor): Promise<SavedRow> {
  const name = optionalName(body.name);
  if (name === false) refuse('name', 'A company needs a name of up to 200 characters.');
  const industry = oneLine(body.industry, 80);
  if (industry === false) refuse('industry', 'Industry is text of up to 80 characters.');
  const description = oneLine(body.description, 600);
  if (description === false) refuse('description', 'A description is text of up to 600 characters.');
  const domain = body.domain === undefined ? undefined : cleanDomain(body.domain);
  if (domain === false) refuse('domain', 'Enter a domain such as tesla.com.');
  if (body.featured !== undefined && typeof body.featured !== 'boolean') refuse('featured', 'featured must be true or false.');
  const featured = body.featured as boolean | undefined;

  const point = (field: 'headquartersLat' | 'headquartersLng', kind: 'latitude' | 'longitude') => {
    const value = body[field];
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return coordinate(value, kind) ?? refuse(field, kind === 'latitude' ? 'A latitude is a number from -90 to 90.' : 'A longitude is a number from -180 to 180.');
  };
  const headquartersLat = point('headquartersLat', 'latitude');
  const headquartersLng = point('headquartersLng', 'longitude');
  const headquartersCity = oneLine(body.headquartersCity, 120);
  if (headquartersCity === false) refuse('headquartersCity', 'A city is text of up to 120 characters.');
  const headquartersCountry = oneLine(body.headquartersCountry, 60);
  if (headquartersCountry === false) refuse('headquartersCountry', 'A country is text of up to 60 characters.');
  const headquartersState = body.headquartersState === undefined ? undefined : body.headquartersState === null || body.headquartersState === '' ? null : stateCode(body.headquartersState);
  if (body.headquartersState !== undefined && body.headquartersState !== null && body.headquartersState !== '' && headquartersState === null) {
    refuse('headquartersState', 'Choose a state, or none for a headquarters outside the United States.');
  }
  if (body.parentCompanyId !== undefined && body.parentCompanyId !== null && !isUuid(body.parentCompanyId)) refuse('parent', 'Choose the company it is part of.');
  const parentCompanyId = body.parentCompanyId as string | null | undefined;

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(companies).where(eq(companies.id, id)).limit(1).for('update');
    if (!before) throw new RecordRefusal(404, NOT_FOUND.company);

    const after = {
      name: name ?? before.name,
      industry: industry === undefined ? before.industry : industry,
      description: description === undefined ? before.description : description,
      domain: domain === undefined ? before.domain : domain,
      featured: featured ?? before.featured,
      headquartersLat: headquartersLat === undefined ? before.headquartersLat : headquartersLat,
      headquartersLng: headquartersLng === undefined ? before.headquartersLng : headquartersLng,
      headquartersCity: headquartersCity === undefined ? before.headquartersCity : headquartersCity,
      headquartersState: headquartersState === undefined ? before.headquartersState : headquartersState,
      headquartersCountry: headquartersCountry === undefined ? before.headquartersCountry : headquartersCountry,
      parentCompanyId: parentCompanyId === undefined ? before.parentCompanyId : parentCompanyId,
      aliases: before.aliases,
    };
    // "Part of": a company that exists, is not this one, and is not itself part of this one (followed a few steps up).
    let parent: [string | null, string | null] | null = null;
    if (after.parentCompanyId !== before.parentCompanyId) {
      const nameOf = async (company: string | null) =>
        company ? ((await tx.select({ name: companies.name }).from(companies).where(eq(companies.id, company)).limit(1))[0]?.name ?? null) : null;
      let above = after.parentCompanyId;
      for (let step = 0; above && step < 8; step += 1) {
        if (above === id) refuse('parent', 'A company cannot be part of itself, or of a company that is part of it.');
        const [row] = await tx.select({ parent: companies.parentCompanyId }).from(companies).where(eq(companies.id, above)).limit(1);
        if (!row) refuse('parent', 'That company does not exist.');
        above = row.parent;
      }
      parent = [await nameOf(before.parentCompanyId), await nameOf(after.parentCompanyId)];
    }
    if ((after.headquartersLat === null) !== (after.headquartersLng === null)) {
      refuse(after.headquartersLat === null ? 'headquartersLat' : 'headquartersLng', 'Headquarters take both a latitude and a longitude, or neither.');
    }
    if (body.aliases !== undefined) {
      const aliases = cleanAliases(body.aliases, after.name);
      if (!aliases) refuse('aliases', `Other names are a list of up to ${MAX_ALIASES} names.`);
      after.aliases = aliases.length > 0 ? aliases : null;
    }
    if (after.name.toLowerCase() !== before.name.toLowerCase()) {
      const [taken] = await tx
        .select({ id: companies.id, name: companies.name, slug: companies.slug })
        .from(companies)
        .where(and(sql`lower(${companies.name}) = lower(${after.name})`, ne(companies.id, id)))
        .limit(1);
      if (taken) throw new RecordRefusal(409, 'A company with that name already exists.', { field: 'name', existing: taken });
    }

    const changes = changedFields(
      { ...before, aliases: before.aliases ?? [] },
      { ...after, aliases: after.aliases ?? [] },
      ['name', 'industry', 'description', 'domain', 'featured', 'aliases', 'headquartersLat', 'headquartersLng', 'headquartersCity', 'headquartersState', 'headquartersCountry']
    );
    if (!changes && !parent) return before;
    const [saved] = await tx.update(companies).set({ ...after, updatedAt: new Date() }).where(eq(companies.id, id)).returning();
    await recordAudit(tx, {
      actor,
      kind: 'company',
      recordId: id,
      recordName: saved.name,
      action: 'edited',
      detail: { changes: { ...(parent ? { parent } : {}), ...(changes ?? {}) } },
    });
    return saved;
  });
}

async function changeFactory(id: string, body: Body, actor: Actor): Promise<SavedRow> {
  const name = optionalName(body.name, 300);
  if (name === false) refuse('name', 'A plant needs a name of up to 300 characters.');
  if (body.companyId !== undefined && !isUuid(body.companyId)) refuse('company', 'Choose the company that runs it.');
  const companyId = body.companyId as string | undefined;
  const state = body.state === undefined ? undefined : stateCode(body.state);
  if (state === null) refuse('state', 'Choose a state.');
  const latitude = body.latitude === undefined ? undefined : coordinate(body.latitude, 'latitude');
  if (latitude === null) refuse('latitude', 'A latitude is a number from -90 to 90.');
  const longitude = body.longitude === undefined ? undefined : coordinate(body.longitude, 'longitude');
  if (longitude === null) refuse('longitude', 'A longitude is a number from -180 to 180.');
  const city = optionalText(body.city, 120);
  if (city === false) refuse('city', 'A city is text of up to 120 characters.');
  const address = optionalText(body.address, 300);
  if (address === false) refuse('address', 'An address is text of up to 300 characters.');
  const industry = optionalText(body.industry, 120);
  if (industry === false) refuse('industry', 'Choose an industry from the list.');
  const specialization = optionalText(body.specialization, 300);
  const description = optionalText(body.description, 2000);
  if (specialization === false || description === false) refuse('description', 'A specialization is text of up to 300 characters and a description of up to 2,000.');
  const workforceSize = body.workforceSize === undefined ? undefined : count(body.workforceSize);
  const openPositions = body.openPositions === undefined ? undefined : count(body.openPositions);
  if (workforceSize === false || openPositions === false) refuse('workforceSize', 'People and open positions are whole numbers from 0 up.');
  const workforceYear = body.workforceYear === undefined ? undefined : year(body.workforceYear, 1900);
  if (workforceYear === false) refuse('workforceYear', 'The year the figure is for, such as 2024.');
  const workforceSource = body.workforceSource === undefined ? undefined : sourceUrl(body.workforceSource);
  if (workforceSource === false) refuse('workforceSource', 'A web address that starts with http:// or https://.');
  const workforceNote = oneLine(body.workforceNote, 300);
  if (workforceNote === false) refuse('workforceNote', 'A note is text of up to 300 characters.');
  const products = oneLine(body.products, 300);
  if (products === false) refuse('products', 'What it makes is one line of up to 300 characters.');
  const openedYear = body.openedYear === undefined ? undefined : year(body.openedYear);
  if (openedYear === false) refuse('openedYear', 'The year it opened, such as 1997.');
  if (body.status !== undefined && !(FACTORY_STATUSES as readonly unknown[]).includes(body.status)) refuse('status', 'Choose operating or under construction.');
  const status = body.status as string | undefined;

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(factories).where(eq(factories.id, id)).limit(1).for('update');
    if (!before) throw new RecordRefusal(404, NOT_FOUND.factory);

    const companyName = async (company: string | null) => {
      if (!company) return null;
      const [row] = await tx.select({ name: companies.name }).from(companies).where(eq(companies.id, company)).limit(1);
      return row?.name ?? null;
    };
    const after = {
      name: name ?? before.name,
      companyId: companyId ?? before.companyId,
      state: state ?? before.state,
      latitude: latitude ?? before.latitude,
      longitude: longitude ?? before.longitude,
      city: city === undefined ? before.city : city,
      address: address === undefined ? before.address : address,
      primaryNaicsDescription: industry === undefined ? before.primaryNaicsDescription : industry,
      // The code belongs to the industry it was filed under: a plant moved to another industry has none on record.
      primaryNaics: industry === undefined || industry === before.primaryNaicsDescription ? before.primaryNaics : null,
      specialization: specialization === undefined ? before.specialization : specialization,
      description: description === undefined ? before.description : description,
      workforceSize: workforceSize === undefined ? before.workforceSize : workforceSize,
      openPositions: openPositions === undefined ? before.openPositions : openPositions,
      workforceYear: workforceYear === undefined ? before.workforceYear : workforceYear,
      workforceSource: workforceSource === undefined ? before.workforceSource : workforceSource,
      workforceNote: workforceNote === undefined ? before.workforceNote : workforceNote,
      products: products === undefined ? before.products : products,
      openedYear: openedYear === undefined ? before.openedYear : openedYear,
      status: status ?? before.status,
      curated: before.curated,
    };
    // A year, a source and a note belong to a headcount: with no figure there is nothing for them to describe.
    if (after.workforceSize === null) {
      after.workforceYear = null;
      after.workforceSource = null;
      after.workforceNote = null;
    }
    // A plant an admin has described is a described plant.
    if (after.workforceSize !== null || after.products !== null || after.openedYear !== null) after.curated = true;

    let company: [string | null, string | null] | null = null;
    if (after.companyId !== before.companyId) {
      const moved = await companyName(after.companyId);
      if (!moved) refuse('company', 'That company does not exist.');
      company = [await companyName(before.companyId), moved];
    }
    if (after.primaryNaicsDescription && after.primaryNaicsDescription !== before.primaryNaicsDescription) {
      if (!(await factoryIndustries(tx)).includes(after.primaryNaicsDescription)) refuse('industry', 'Choose an industry from the list.');
    }
    // One company does not have two plants of the same name in one state.
    const moves = after.companyId !== before.companyId || after.state !== before.state || after.name.toLowerCase() !== before.name.toLowerCase();
    if (moves && after.companyId && after.state) {
      const [taken] = await tx
        .select({ id: factories.id, name: factories.name })
        .from(factories)
        .where(and(eq(factories.companyId, after.companyId), eq(factories.state, after.state), sql`lower(${factories.name}) = lower(${after.name})`, ne(factories.id, id)))
        .limit(1);
      if (taken) throw new RecordRefusal(409, 'That company already has a plant with that name in that state.', { field: 'name', existing: taken });
    }

    const changes = changedFields({ ...before, industry: before.primaryNaicsDescription }, { ...after, industry: after.primaryNaicsDescription }, [
      'name',
      'state',
      'latitude',
      'longitude',
      'city',
      'address',
      'industry',
      'specialization',
      'description',
      'workforceSize',
      'openPositions',
      'workforceYear',
      'workforceSource',
      'workforceNote',
      'products',
      'openedYear',
      'status',
    ]);
    if (!changes && !company) return before;
    const [saved] = await tx.update(factories).set({ ...after, updatedAt: new Date() }).where(eq(factories.id, id)).returning();
    await recordAudit(tx, {
      actor,
      kind: 'factory',
      recordId: id,
      recordName: saved.name,
      action: 'edited',
      detail: { changes: { ...(company ? { company } : {}), ...(changes ?? {}) } },
    });
    // The facts this edit set are an admin's from now on: no source replaces them.
    await adminSetFacts(tx, id, factsOfFields(Object.keys(changes ?? {})), actor.id);
    return saved;
  });
}

/**
 * Sets the other names of a career or a skill to `wanted`. A name another
 * record is known by, or is called, is refused.
 */
async function setAliases(tx: Executor, kind: 'career' | 'skill', id: string, wanted: string[]): Promise<void> {
  const what = kind === 'career' ? 'career' : 'skill';
  for (const alias of wanted) {
    const [named] =
      kind === 'career'
        ? await tx.select({ id: occupations.id }).from(occupations).where(and(sql`lower(${occupations.title}) = lower(${alias})`, ne(occupations.id, id))).limit(1)
        : await tx.select({ id: skills.id }).from(skills).where(and(sql`lower(${skills.name}) = lower(${alias})`, ne(skills.id, id))).limit(1);
    if (named) throw new RecordRefusal(409, `“${alias}” is the name of another ${what}.`, { field: 'aliases' });
    const [held] =
      kind === 'career'
        ? await tx.select({ id: occupationAliases.id }).from(occupationAliases).where(and(eq(occupationAliases.aliasText, alias), ne(occupationAliases.canonicalOccupationId, id))).limit(1)
        : await tx.select({ id: skillAliases.id }).from(skillAliases).where(and(eq(skillAliases.aliasText, alias), ne(skillAliases.canonicalSkillId, id))).limit(1);
    if (held) throw new RecordRefusal(409, `“${alias}” is already another name for a different ${what}.`, { field: 'aliases' });
  }
  if (kind === 'career') {
    await tx.delete(occupationAliases).where(eq(occupationAliases.canonicalOccupationId, id));
    if (wanted.length > 0) await tx.insert(occupationAliases).values(wanted.map((aliasText) => ({ aliasText, canonicalOccupationId: id })));
  } else {
    await tx.delete(skillAliases).where(eq(skillAliases.canonicalSkillId, id));
    if (wanted.length > 0) await tx.insert(skillAliases).values(wanted.map((aliasText) => ({ aliasText, canonicalSkillId: id })));
  }
}

/**
 * The careers a career is to lead to, as a request gives them: a list of up
 * to three ids, none twice. Undefined when left out, false when it is not
 * such a list.
 */
function leadsToIds(value: unknown): string[] | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_LEADS_TO) return false;
  const ids: string[] = [];
  for (const item of value) {
    // An id, or a career as the record's own view gives it.
    const id = item && typeof item === 'object' ? (item as { id?: unknown }).id : item;
    if (!isUuid(id) || ids.includes(id)) return false;
    ids.push(id);
  }
  return ids;
}

async function changeCareer(id: string, body: Body, actor: Actor): Promise<SavedRow> {
  const title = optionalName(body.title);
  if (title === false) refuse('name', 'A career needs a title of up to 200 characters.');
  const description = optionalText(body.description, 2000);
  if (description === false) refuse('description', 'A description is text of up to 2,000 characters.');
  const onetCode = optionalText(body.onetCode, 20);
  if (onetCode === false) refuse('onetCode', 'An O*NET code is text of up to 20 characters.');
  const nextIds = leadsToIds(body.leadsTo);
  if (nextIds === false) refuse('leadsTo', `A career leads to at most ${MAX_LEADS_TO} others, each listed once.`);
  if (nextIds?.includes(id)) refuse('leadsTo', 'A career cannot lead to itself.');
  if (title === undefined && description === undefined && onetCode === undefined && body.aliases === undefined && body.home === undefined && nextIds === undefined) {
    throw new RecordRefusal(400, 'Nothing to change.');
  }

  return db.transaction(async (tx) => {
    if (nextIds !== undefined) await tx.execute(sql`SELECT pg_advisory_xact_lock(${LADDER_LOCK})`);
    const [before] = await tx.select().from(occupations).where(eq(occupations.id, id)).limit(1).for('update');
    if (!before) throw new RecordRefusal(404, NOT_FOUND.career);
    // A home is a domain, chosen by its slug. Unlike a skill's group it can be emptied: a career need not have one.
    const homeBefore = await findDomain(tx, before.homeDomain);
    const homeAfter = body.home === undefined ? homeBefore : body.home === null || body.home === '' ? null : await findDomain(tx, body.home);
    if (body.home !== undefined && body.home !== null && body.home !== '' && !homeAfter) refuse('home', 'Choose a domain, or none.');
    const after = {
      title: title ?? before.title,
      description: description === undefined ? before.description : description,
      onetCode: onetCode === undefined ? before.onetCode : onetCode,
      homeDomain: homeAfter?.slug ?? null,
    };
    if (after.title.toLowerCase() !== before.title.toLowerCase()) {
      const [taken] = await tx
        .select({ id: occupations.id, name: occupations.title })
        .from(occupations)
        .where(and(sql`lower(${occupations.title}) = lower(${after.title})`, ne(occupations.id, id)))
        .limit(1);
      if (taken) throw new RecordRefusal(409, 'A career with that name already exists.', { field: 'name', existing: taken });
    }
    const aliasesBefore = await aliasesOf(tx, 'career', id);
    let aliasesAfter = aliasesBefore;
    if (body.aliases !== undefined) {
      const aliases = cleanAliases(body.aliases, after.title, MAX_CAREER_ALIASES);
      if (!aliases) refuse('aliases', `Other names are a list of up to ${MAX_CAREER_ALIASES} names.`);
      aliasesAfter = [...aliases].sort((a, b) => a.localeCompare(b));
    }
    // The ladder: each career it leads to exists, and none of them already
    // leads back here, in however many steps.
    const ladderBefore = await leadsTo(tx, id);
    let ladderAfter = ladderBefore;
    if (nextIds !== undefined && nextIds.join() !== ladderBefore.map((career) => career.id).join()) {
      ladderAfter = [];
      for (const nextId of nextIds) {
        const [next] = await tx.select({ id: occupations.id, title: occupations.title }).from(occupations).where(eq(occupations.id, nextId)).limit(1);
        if (!next) refuse('leadsTo', 'One of those careers does not exist.');
        const back = await ladderFrom(tx, nextId, id);
        if (back) {
          refuse('leadsTo', `${next.title} already leads to ${after.title} (${back.join(' → ')}). A ladder cannot come back to where it started.`);
        }
        ladderAfter.push(next);
      }
    }
    // The log names the home and the ladder as a person reads them.
    const titles = (list: CareerRef[]) => list.map((career) => career.title);
    const changes = changedFields(
      { ...before, home: homeBefore?.name ?? null, leadsTo: titles(ladderBefore), aliases: aliasesBefore },
      { ...after, home: homeAfter?.name ?? null, leadsTo: titles(ladderAfter), aliases: aliasesAfter },
      ['title', 'home', 'description', 'onetCode', 'leadsTo', 'aliases']
    );
    const answer = ({ homeDomain: _slug, ...row }: typeof before): SavedRow => ({ ...row, home: homeAfter, leadsTo: ladderAfter });
    if (!changes) return answer(before);
    if (changes.aliases) await setAliases(tx, 'career', id, aliasesAfter);
    if (changes.leadsTo) await setLeadsTo(tx, id, ladderAfter.map((career) => career.id));
    const [saved] = await tx.update(occupations).set(after).where(eq(occupations.id, id)).returning();
    await recordAudit(tx, { actor, kind: 'career', recordId: id, recordName: saved.title, action: 'edited', detail: { changes } });
    return answer(saved);
  });
}

async function changeSkill(id: string, body: Body, actor: Actor): Promise<SavedRow> {
  const name = optionalName(body.name);
  if (name === false) refuse('name', 'A skill needs a name of up to 200 characters.');
  const description = optionalText(body.description, 2000);
  if (description === false) refuse('description', 'A description is text of up to 2,000 characters.');
  const howLearned = optionalText(body.howLearned, 1000);
  if (howLearned === false) refuse('howLearned', 'How it is learned is text of up to 1,000 characters.');
  const tools = toolList(body.tools);
  if (tools === false) refuse('tools', `What it is done with is a list of up to ${MAX_TOOLS} short names.`);
  // A skill always has a level: one can be changed, never cleared.
  const level = body.level === undefined ? undefined : readLevel(body.level);
  if (level === null) refuse('level', 'Choose a level: Fundamentals, Intermediate or Advanced.');

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(skills).where(eq(skills.id, id)).limit(1).for('update');
    if (!before) throw new RecordRefusal(404, NOT_FOUND.skill);
    // A group is chosen by its slug and fixes the domain. Like the level, it is changed, never cleared.
    const placeBefore = before.groupSlug ? await findGroup(tx, before.groupSlug) : null;
    const placeAfter = body.group === undefined || body.group === before.groupSlug ? placeBefore : await findGroup(tx, body.group);
    if (body.group !== undefined && !placeAfter) refuse('group', 'Choose the group the skill belongs to.');
    const moved = placeAfter?.group.slug !== placeBefore?.group.slug;
    const after = {
      name: name ?? before.name,
      groupSlug: placeAfter?.group.slug ?? null,
      // Its place in a group is the taxonomy file's: a skill moved by hand goes after the ones the file placed.
      groupPosition: moved ? null : before.groupPosition,
      // The domain's name, as the taxonomy migration writes it; nothing reads it.
      category: moved ? (placeAfter?.domain.name ?? null) : before.category,
      level: level ?? before.level,
      description: description === undefined ? before.description : description,
      howLearned: howLearned === undefined ? before.howLearned : howLearned,
      tools: tools === undefined ? before.tools : tools.length > 0 ? tools : null,
    };
    if (after.name.toLowerCase() !== before.name.toLowerCase()) {
      const [taken] = await tx
        .select({ id: skills.id, name: skills.name })
        .from(skills)
        .where(and(sql`lower(${skills.name}) = lower(${after.name})`, ne(skills.id, id)))
        .limit(1);
      if (taken) throw new RecordRefusal(409, 'A skill with that name already exists.', { field: 'name', existing: taken });
    }
    const aliasesBefore = await aliasesOf(tx, 'skill', id);
    let aliasesAfter = aliasesBefore;
    if (body.aliases !== undefined) {
      const aliases = cleanAliases(body.aliases, after.name);
      if (!aliases) refuse('aliases', `Other names are a list of up to ${MAX_ALIASES} names.`);
      aliasesAfter = [...aliases].sort((a, b) => a.localeCompare(b));
    }
    // The log names the group, the domain and the level as a person reads them.
    const shown = (place: typeof placeBefore, level: number | null) => ({
      group: place?.group.name ?? null,
      domain: place?.domain.name ?? null,
      level: skillLevelName(level),
    });
    const changes = changedFields(
      { ...before, ...shown(placeBefore, before.level), tools: before.tools ?? [], aliases: aliasesBefore },
      { ...after, ...shown(placeAfter, after.level), tools: after.tools ?? [], aliases: aliasesAfter },
      ['name', 'group', 'domain', 'level', 'description', 'howLearned', 'tools', 'aliases']
    );
    const answer = (row: typeof before): SavedRow => ({
      id: row.id,
      name: row.name,
      description: row.description,
      howLearned: row.howLearned,
      tools: row.tools,
      createdAt: row.createdAt,
      level: row.level,
      group: placeAfter?.group ?? null,
      domain: placeAfter?.domain ?? null,
    });
    if (!changes) return answer(before);
    if (changes.aliases) await setAliases(tx, 'skill', id, aliasesAfter);
    // A new level reaches every career path the skill is on: the database
    // moves occupation_skills.stage with skills.level (migration 0042).
    const [saved] = await tx.update(skills).set(after).where(eq(skills.id, id)).returning();
    await recordAudit(tx, { actor, kind: 'skill', recordId: id, recordName: saved.name, action: 'edited', detail: { changes } });
    return answer(saved);
  });
}

// ---------------------------------------------------------------------------
// A skill's makes
// ---------------------------------------------------------------------------

/**
 * The makes of a skill are corrected one act at a time: add, rename, remove,
 * reorder. Each holds the skill's row, so two admins cannot cross, and writes
 * its own line in the log, in words. A refusal carries `field: 'make'`.
 */
async function withSkillMakes<T>(skillId: string, act: (tx: Executor, skill: { id: string; name: string }, makes: Make[]) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const [skill] = await tx.select({ id: skills.id, name: skills.name }).from(skills).where(eq(skills.id, skillId)).limit(1).for('update');
    if (!skill) throw new RecordRefusal(404, NOT_FOUND.skill);
    return act(tx, skill, await makesOf(tx, skillId));
  });
}

function cleanMakeName(value: unknown, makes: Make[], exceptId?: string): string {
  const name = makeName(value);
  if (!name) refuse('make', `A make is a name of up to ${MAKE_NAME_MAX} characters.`);
  if (makes.some((make) => make.id !== exceptId && make.name.toLowerCase() === name.toLowerCase())) {
    throw new RecordRefusal(409, `“${name}” is already a make of this skill.`, { field: 'make' });
  }
  return name;
}

/** Add a make to a skill, after the ones it has. */
export function addSkillMake(skillId: string, nameGiven: unknown, actor: Actor): Promise<Make> {
  return withSkillMakes(skillId, async (tx, skill, makes) => {
    const name = cleanMakeName(nameGiven, makes);
    if (makes.length >= MAKES_MAX) refuse('make', `A skill has at most ${MAKES_MAX} makes.`);
    const [{ last }] = await tx.select({ last: sql<number>`COALESCE(MAX(${skillMakes.position}), 0)::int` }).from(skillMakes).where(eq(skillMakes.skillId, skillId));
    const [added] = await tx.insert(skillMakes).values({ skillId, name, position: last + 1 }).returning({ id: skillMakes.id, name: skillMakes.name });
    await recordAudit(tx, { actor, kind: 'skill', recordId: skillId, recordName: skill.name, action: 'make added', detail: { make: added.name } });
    return added;
  });
}

/** Rename one of a skill's makes. People's marks stay on it. */
export function renameSkillMake(skillId: string, makeId: string, nameGiven: unknown, actor: Actor): Promise<Make> {
  return withSkillMakes(skillId, async (tx, skill, makes) => {
    const make = makes.find((each) => each.id === makeId);
    if (!make) throw new RecordRefusal(404, 'Make not found');
    const name = cleanMakeName(nameGiven, makes, makeId);
    if (name === make.name) return make;
    await tx.update(skillMakes).set({ name }).where(eq(skillMakes.id, makeId));
    await recordAudit(tx, { actor, kind: 'skill', recordId: skillId, recordName: skill.name, action: 'make renamed', detail: { changes: { make: [make.name, name] } } });
    return { id: makeId, name };
  });
}

/** Remove one of a skill's makes, and with it the marks people put on it; `people` is how many had. */
export function removeSkillMake(skillId: string, makeId: string, actor: Actor): Promise<Make & { people: number }> {
  return withSkillMakes(skillId, async (tx, skill, makes) => {
    const make = makes.find((each) => each.id === makeId);
    if (!make) throw new RecordRefusal(404, 'Make not found');
    const people = (await makesForEditor(tx, skillId)).find((each) => each.id === makeId)?.people ?? 0;
    await tx.delete(skillMakes).where(eq(skillMakes.id, makeId));
    await recordAudit(tx, {
      actor,
      kind: 'skill',
      recordId: skillId,
      recordName: skill.name,
      action: 'make removed',
      detail: { make: make.name, ...(people > 0 ? { removed: { people } } : {}) },
    });
    return { ...make, people };
  });
}

/** Put a skill's makes in a new order: `order` is every one of its make ids, once each. */
export function orderSkillMakes(skillId: string, order: unknown, actor: Actor): Promise<Make[]> {
  return withSkillMakes(skillId, async (tx, skill, makes) => {
    const ids = Array.isArray(order) && order.every(isUuid) ? (order as string[]) : null;
    if (!ids) refuse('make', "The order is a list of the skill's make ids.");
    const byId = new Map(makes.map((make) => [make.id, make]));
    if (ids.length !== makes.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
      throw new RecordRefusal(409, 'The makes of this skill have changed. Open it again.', { field: 'make' });
    }
    const after = ids.map((id) => byId.get(id) as Make);
    if (after.every((make, i) => make.id === makes[i].id)) return makes;
    for (const [i, make] of after.entries()) await tx.update(skillMakes).set({ position: i + 1 }).where(eq(skillMakes.id, make.id));
    await recordAudit(tx, {
      actor,
      kind: 'skill',
      recordId: skillId,
      recordName: skill.name,
      action: 'makes reordered',
      detail: { changes: { makeOrder: [makes.map((make) => make.name), after.map((make) => make.name)] } },
    });
    return after;
  });
}

/**
 * Change one record. Only the fields given change; each is checked, and a
 * refusal names the field it is about. Throws RecordRefusal.
 */
export function changeRecord(kind: RecordKind, id: string, body: unknown, actor: Actor): Promise<SavedRow> {
  const fields: Body = body && typeof body === 'object' && !Array.isArray(body) ? (body as Body) : {};
  if (kind === 'company') return changeCompany(id, fields, actor);
  if (kind === 'factory') return changeFactory(id, fields, actor);
  if (kind === 'career') return changeCareer(id, fields, actor);
  return changeSkill(id, fields, actor);
}

/** The line for a record that was just added by hand. */
export function recordAdded(kind: RecordKind, row: { id: string; name: string }, actor: Actor): Promise<void> {
  return recordAudit(db, { actor, kind, recordId: row.id, recordName: row.name, action: 'added' });
}

// ---------------------------------------------------------------------------
// Deleting a record
// ---------------------------------------------------------------------------

/**
 * Delete one record and everything that hangs from it (ON DELETE CASCADE).
 * The log keeps its name and the counts of what went with it. Null when there
 * is no such record.
 */
export async function removeRecord(kind: RecordKind, id: string, actor: Actor): Promise<{ id: string; name: string; removed: Attached } | null> {
  return db.transaction(async (tx) => {
    const removed = await attachedTo(tx, kind, id);
    const [gone] =
      kind === 'company'
        ? await tx.delete(companies).where(eq(companies.id, id)).returning({ name: companies.name })
        : kind === 'factory'
          ? await tx.delete(factories).where(eq(factories.id, id)).returning({ name: factories.name })
          : kind === 'career'
            ? await tx.delete(occupations).where(eq(occupations.id, id)).returning({ name: occupations.title })
            : await tx.delete(skills).where(eq(skills.id, id)).returning({ name: skills.name });
    if (!gone) return null;
    // Where the record came from is not tied to it by the database: it goes with it here.
    if (kind === 'company') {
      await tx.execute(sql`DELETE FROM external_references WHERE entity_type = 'companies' AND entity_id = ${id}`);
    } else if (kind === 'factory') {
      await tx.execute(sql`DELETE FROM external_references WHERE entity_type = 'factories' AND entity_id = ${id}`);
    }
    await recordAudit(tx, {
      actor,
      kind,
      recordId: id,
      recordName: gone.name,
      action: 'deleted',
      detail: Object.keys(removed).length > 0 ? { removed } : null,
    });
    return { id, name: gone.name, removed };
  });
}
