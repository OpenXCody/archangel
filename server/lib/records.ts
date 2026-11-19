import type { Response } from 'express';
import { and, eq, ne, sql, type SQL } from 'drizzle-orm';
import { db, companies, factories, occupations, occupationSkills, skills, occupationAliases, skillAliases } from '../db/index.js';
import { changedFields, recordAudit, type Actor, type Executor } from './audit.js';
import { answerWriteError, coordinate, count, FACTORY_STATUSES, isUuid, optionalName, optionalText, sourceUrl, stateCode, year } from './writes.js';

/**
 * Correcting the four kinds of record an admin keeps: companies, factories,
 * careers and skills. One place checks a change, makes it, and writes the
 * line in the audit log, whichever route it arrived by (the kind's own
 * PUT / DELETE, or Admin Tools). Merging follows the row moves of the data
 * cleanup (scripts/build-cleanup-sql.mjs), in one transaction.
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

const NOT_FOUND: Record<RecordKind, string> = {
  company: 'Company not found',
  factory: 'Plant not found',
  career: 'Occupation not found',
  skill: 'Skill not found',
};

function rowsOf<T = Record<string, unknown>>(result: unknown): T[] {
  return Array.from(result as Iterable<T>);
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** A bare hostname: labels of letters, digits and hyphens, then a letters-only ending. */
const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

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

/** Other names for a record: trimmed, without repeats or the record's own name. Null when the value is not a list of text. */
function cleanAliases(value: unknown, ownName: string): string[] | null {
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
  return list.length <= MAX_ALIASES ? list : null;
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

async function attachedTo(executor: Executor, kind: RecordKind, id: string): Promise<Attached> {
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
      (SELECT COUNT(*)::int FROM factory_occupations WHERE occupation_id = ${id}) AS factories`,
    skill: sql`SELECT
      (SELECT COUNT(*)::int FROM occupation_skills WHERE skill_id = ${id}) AS careers,
      (SELECT COUNT(*)::int FROM job_skills WHERE skill_id = ${id}) AS jobs,
      (SELECT COUNT(*)::int FROM user_skills WHERE skill_id = ${id}) AS people`,
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
  /** Careers: the skills on the path with the stage of each, read fresh (the public career page is cached). */
  path?: { id: string; name: string; category: string | null; stage: number | null }[];
  /** Skills: the tools, machines or software it is done with. */
  tools?: string[];
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
      fields: { title: row.title, description: row.description, onetCode: row.onetCode, pathStatus: row.pathStatus },
      aliases: await aliasesOf(db, 'career', id),
      attached,
      path: await db
        .select({ id: skills.id, name: skills.name, category: skills.category, stage: occupationSkills.stage })
        .from(occupationSkills)
        .innerJoin(skills, eq(skills.id, occupationSkills.skillId))
        .where(eq(occupationSkills.occupationId, id))
        .orderBy(sql`${occupationSkills.stage} ASC NULLS LAST`, skills.name),
    };
  }
  const [row] = await db.select().from(skills).where(eq(skills.id, id)).limit(1);
  if (!row) return null;
  return {
    kind,
    id,
    name: row.name,
    href: `/skills/${id}`,
    fields: { name: row.name, category: row.category, description: row.description, howLearned: row.howLearned },
    tools: row.tools ?? [],
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

async function changeCareer(id: string, body: Body, actor: Actor): Promise<SavedRow> {
  const title = optionalName(body.title);
  if (title === false) refuse('name', 'A career needs a title of up to 200 characters.');
  const description = optionalText(body.description, 2000);
  if (description === false) refuse('description', 'A description is text of up to 2,000 characters.');
  const onetCode = optionalText(body.onetCode, 20);
  if (onetCode === false) refuse('onetCode', 'An O*NET code is text of up to 20 characters.');
  if (title === undefined && description === undefined && onetCode === undefined && body.aliases === undefined) {
    throw new RecordRefusal(400, 'Nothing to change.');
  }

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(occupations).where(eq(occupations.id, id)).limit(1).for('update');
    if (!before) throw new RecordRefusal(404, NOT_FOUND.career);
    const after = {
      title: title ?? before.title,
      description: description === undefined ? before.description : description,
      onetCode: onetCode === undefined ? before.onetCode : onetCode,
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
      const aliases = cleanAliases(body.aliases, after.title);
      if (!aliases) refuse('aliases', `Other names are a list of up to ${MAX_ALIASES} names.`);
      aliasesAfter = [...aliases].sort((a, b) => a.localeCompare(b));
    }
    const changes = changedFields({ ...before, aliases: aliasesBefore }, { ...after, aliases: aliasesAfter }, ['title', 'description', 'onetCode', 'aliases']);
    if (!changes) return before;
    if (changes.aliases) await setAliases(tx, 'career', id, aliasesAfter);
    const [saved] = await tx.update(occupations).set(after).where(eq(occupations.id, id)).returning();
    await recordAudit(tx, { actor, kind: 'career', recordId: id, recordName: saved.title, action: 'edited', detail: { changes } });
    return saved;
  });
}

async function changeSkill(id: string, body: Body, actor: Actor): Promise<SavedRow> {
  const name = optionalName(body.name);
  if (name === false) refuse('name', 'A skill needs a name of up to 200 characters.');
  const category = optionalText(body.category, 80);
  if (category === false) refuse('category', 'A category is text of up to 80 characters.');
  const description = optionalText(body.description, 2000);
  if (description === false) refuse('description', 'A description is text of up to 2,000 characters.');
  const howLearned = optionalText(body.howLearned, 1000);
  if (howLearned === false) refuse('howLearned', 'How it is learned is text of up to 1,000 characters.');
  const tools = toolList(body.tools);
  if (tools === false) refuse('tools', `What it is done with is a list of up to ${MAX_TOOLS} short names.`);

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(skills).where(eq(skills.id, id)).limit(1).for('update');
    if (!before) throw new RecordRefusal(404, NOT_FOUND.skill);
    const after = {
      name: name ?? before.name,
      category: category === undefined ? before.category : category,
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
    const changes = changedFields(
      { ...before, tools: before.tools ?? [], aliases: aliasesBefore },
      { ...after, tools: after.tools ?? [], aliases: aliasesAfter },
      ['name', 'category', 'description', 'howLearned', 'tools', 'aliases']
    );
    if (!changes) return before;
    if (changes.aliases) await setAliases(tx, 'skill', id, aliasesAfter);
    const [saved] = await tx.update(skills).set(after).where(eq(skills.id, id)).returning();
    await recordAudit(tx, { actor, kind: 'skill', recordId: id, recordName: saved.name, action: 'edited', detail: { changes } });
    return saved;
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

// ---------------------------------------------------------------------------
// Merging one record into another
// ---------------------------------------------------------------------------

export interface MergeResult {
  kept: { id: string; name: string; href: string };
  merged: { id: string; name: string };
  /** What now points at the kept record instead. */
  moved: Attached;
}

/**
 * Merge `fromId` into `intoId`: everything that pointed at the first points
 * at the second, the first's name is kept as another name for the second,
 * and the first is deleted. Factories are not merged. Throws RecordRefusal.
 */
export async function mergeRecords(kind: RecordKind, fromId: string, intoId: string, actor: Actor): Promise<MergeResult> {
  if (kind === 'factory') throw new RecordRefusal(400, 'Factories are not merged. Delete the one that is wrong.');
  if (fromId === intoId) throw new RecordRefusal(400, 'Choose a different record to merge into.');
  const table = kind === 'company' ? sql`companies` : kind === 'career' ? sql`occupations` : sql`skills`;
  const nameColumn = kind === 'career' ? sql`title` : sql`name`;

  return db.transaction(async (tx) => {
    // Both rows are held, in one order, so two merges cannot cross.
    const locked = rowsOf<{ id: string; name: string }>(
      await tx.execute(sql`SELECT id, ${nameColumn} AS name FROM ${table} WHERE id IN (${fromId}, ${intoId}) ORDER BY id FOR UPDATE`)
    );
    const from = locked.find((row) => row.id === fromId);
    const into = locked.find((row) => row.id === intoId);
    if (!from) throw new RecordRefusal(404, NOT_FOUND[kind]);
    if (!into) throw new RecordRefusal(404, 'The record to merge into was not found.');
    const moved = await attachedTo(tx, kind, fromId);
    let href = `/${kind === 'career' ? 'occupations' : 'skills'}/${intoId}`;

    if (kind === 'company') {
      const [gone] = await tx.select().from(companies).where(eq(companies.id, fromId)).limit(1);
      await tx.execute(sql`UPDATE factories SET company_id = ${intoId} WHERE company_id = ${fromId}`);
      await tx.execute(sql`UPDATE jobs SET company_id = ${intoId} WHERE company_id = ${fromId}`);
      await tx.execute(sql`UPDATE invites SET company_id = ${intoId} WHERE company_id = ${fromId}`);
      // A person with a row at both keeps the stronger one (access over a request).
      await tx.execute(sql`
        UPDATE company_members y SET status = 'active', decided_at = x.decided_at, decided_by = x.decided_by
        FROM company_members x
        WHERE x.company_id = ${fromId} AND y.company_id = ${intoId} AND y.user_id = x.user_id
          AND x.status = 'active' AND y.status <> 'active'`);
      await tx.execute(sql`
        UPDATE company_members x SET company_id = ${intoId} WHERE company_id = ${fromId}
          AND NOT EXISTS (SELECT 1 FROM company_members y WHERE y.company_id = ${intoId} AND y.user_id = x.user_id)`);
      // Requests for a plant of the company, the companies that are part of it, its people by state and its sources.
      await tx.execute(sql`UPDATE company_requests SET company_id = ${intoId} WHERE company_id = ${fromId}`);
      await tx.execute(sql`UPDATE company_requests SET added_company_id = ${intoId} WHERE added_company_id = ${fromId}`);
      await tx.execute(sql`UPDATE companies SET parent_company_id = ${intoId} WHERE parent_company_id = ${fromId} AND id <> ${intoId}`);
      await tx.execute(sql`
        UPDATE company_state_headcounts x SET company_id = ${intoId} WHERE company_id = ${fromId}
          AND NOT EXISTS (SELECT 1 FROM company_state_headcounts y WHERE y.company_id = ${intoId} AND y.state = x.state)`);
      await tx.execute(sql`
        DELETE FROM external_references x WHERE x.entity_type = 'companies' AND x.entity_id = ${fromId} AND x.source = 'CURATED'
          AND EXISTS (SELECT 1 FROM external_references y WHERE y.entity_type = 'companies' AND y.entity_id = ${intoId} AND y.source = 'CURATED' AND y.url = x.url)`);
      await tx.execute(sql`UPDATE external_references SET entity_id = ${intoId} WHERE entity_type = 'companies' AND entity_id = ${fromId}`);
      // The slug is unique: the row that is going gives it up before the kept row can take it.
      await tx.delete(companies).where(eq(companies.id, fromId));
      // The kept company takes whatever profile it lacks, and remembers the old name.
      const [kept] = rowsOf<{ slug: string | null }>(
        await tx.execute(sql`
          UPDATE companies c SET
            domain = COALESCE(c.domain, ${gone.domain}),
            description = COALESCE(NULLIF(btrim(c.description), ''), ${gone.description}),
            industry = CASE WHEN c.industry IS NULL OR lower(btrim(c.industry)) IN ('', 'manufacturing') THEN COALESCE(${gone.industry}, c.industry) ELSE c.industry END,
            featured = c.featured OR ${gone.featured},
            slug = COALESCE(c.slug, ${gone.slug}),
            parent_company_id = COALESCE(c.parent_company_id, NULLIF(${gone.parentCompanyId}::uuid, c.id)),
            headquarters_state = CASE WHEN c.headquarters_city IS NULL THEN ${gone.headquartersState} ELSE c.headquarters_state END,
            headquarters_country = CASE WHEN c.headquarters_city IS NULL THEN ${gone.headquartersCountry} ELSE c.headquarters_country END,
            headquarters_city = COALESCE(c.headquarters_city, ${gone.headquartersCity}),
            aliases = (
              SELECT array_agg(DISTINCT a) FROM unnest(COALESCE(c.aliases, '{}') || ${sql.param(gone.aliases ?? [], companies.aliases)}::text[] || ARRAY[${gone.name}]::text[]) AS a
              WHERE lower(a) <> lower(c.name)
            ),
            updated_at = now()
          WHERE c.id = ${intoId}
          RETURNING c.slug`)
      );
      href = `/companies/${kept?.slug ?? intoId}`;
    } else if (kind === 'career') {
      const k = intoId;
      const m = fromId;
      await tx.execute(sql`UPDATE occupation_skills x SET occupation_id = ${k} WHERE occupation_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM occupation_skills y WHERE y.occupation_id = ${k} AND y.skill_id = x.skill_id)`);
      await tx.execute(sql`UPDATE user_goals x SET occupation_id = ${k} WHERE occupation_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM user_goals y WHERE y.occupation_id = ${k} AND y.user_id = x.user_id)`);
      await tx.execute(sql`UPDATE industry_occupations x SET occupation_id = ${k} WHERE occupation_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM industry_occupations y WHERE y.occupation_id = ${k} AND y.industry = x.industry)`);
      await tx.execute(sql`UPDATE factory_occupations x SET occupation_id = ${k} WHERE occupation_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM factory_occupations y WHERE y.occupation_id = ${k} AND y.factory_id = x.factory_id)`);
      await tx.execute(sql`UPDATE jobs SET occupation_id = ${k} WHERE occupation_id = ${m}`);
      await tx.execute(sql`UPDATE occupation_aliases SET canonical_occupation_id = ${k} WHERE canonical_occupation_id = ${m}`);
      await tx.execute(sql`INSERT INTO occupation_aliases (alias_text, canonical_occupation_id) VALUES (${from.name}, ${k}) ON CONFLICT (alias_text) DO NOTHING`);
      await tx.execute(sql`UPDATE occupations o SET
          path_status = COALESCE(o.path_status, (SELECT path_status FROM occupations WHERE id = ${m})),
          description = COALESCE(NULLIF(btrim(o.description), ''), (SELECT description FROM occupations WHERE id = ${m}))
        WHERE o.id = ${k}`);
      await tx.delete(occupations).where(eq(occupations.id, m));
    } else {
      const k = intoId;
      const m = fromId;
      await tx.execute(sql`UPDATE occupation_skills x SET skill_id = ${k} WHERE skill_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM occupation_skills y WHERE y.skill_id = ${k} AND y.occupation_id = x.occupation_id)`);
      await tx.execute(sql`UPDATE job_skills x SET skill_id = ${k} WHERE skill_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM job_skills y WHERE y.skill_id = ${k} AND y.job_id = x.job_id)`);
      // A person who marked both keeps the stronger mark (held over learning).
      await tx.execute(sql`UPDATE user_skills y SET status = 'held' FROM user_skills x
        WHERE x.skill_id = ${m} AND y.skill_id = ${k} AND y.user_id = x.user_id AND x.status = 'held'`);
      await tx.execute(sql`UPDATE user_skills x SET skill_id = ${k} WHERE skill_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM user_skills y WHERE y.skill_id = ${k} AND y.user_id = x.user_id)`);
      await tx.execute(sql`UPDATE skills SET parent_skill_id = ${k} WHERE parent_skill_id = ${m} AND id <> ${k}`);
      await tx.execute(sql`UPDATE skills SET parent_skill_id = NULL WHERE id = ${k} AND parent_skill_id = ${m}`);
      await tx.execute(sql`UPDATE skill_aliases SET canonical_skill_id = ${k} WHERE canonical_skill_id = ${m}`);
      await tx.execute(sql`INSERT INTO skill_aliases (alias_text, canonical_skill_id) VALUES (${from.name}, ${k}) ON CONFLICT (alias_text) DO NOTHING`);
      await tx.execute(sql`UPDATE skills s SET
          category = COALESCE(NULLIF(btrim(s.category), ''), (SELECT category FROM skills WHERE id = ${m})),
          description = COALESCE(NULLIF(btrim(s.description), ''), (SELECT description FROM skills WHERE id = ${m}))
        WHERE s.id = ${k}`);
      await tx.delete(skills).where(eq(skills.id, m));
    }

    await recordAudit(tx, {
      actor,
      kind,
      recordId: intoId,
      recordName: into.name,
      action: 'merged',
      detail: { merged: { id: fromId, name: from.name }, ...(Object.keys(moved).length > 0 ? { moved } : {}) },
    });
    return { kept: { id: intoId, name: into.name, href }, merged: { id: fromId, name: from.name }, moved };
  });
}

// ---------------------------------------------------------------------------
// Finding records: by search, and the ones a name comes close to
// ---------------------------------------------------------------------------

export interface FoundRecord {
  id: string;
  name: string;
  /** One line that tells it from its neighbours: a domain and plant count, a place, a category. */
  detail: string | null;
  href: string;
}

function likeLiteral(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

/** "3 factories", "1 skill". */
function counted(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

function found(kind: RecordKind, row: Record<string, unknown>): FoundRecord {
  const id = String(row.id);
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  if (kind === 'company') {
    const detail = [text(row.domain), counted(Number(row.plants) || 0, 'factory', 'factories')].filter(Boolean).join(' · ');
    return { id, name: String(row.name), detail, href: `/companies/${text(row.slug) ?? id}` };
  }
  if (kind === 'factory') {
    const place = [text(row.city), text(row.state)].filter(Boolean).join(', ');
    return { id, name: String(row.name), detail: [text(row.company), place].filter(Boolean).join(' · ') || null, href: `/factories/${id}` };
  }
  if (kind === 'career') {
    const skillsOnPath = Number(row.skills) || 0;
    const detail = skillsOnPath > 0 ? `${counted(skillsOnPath, 'skill', 'skills')}${text(row.path_status) ? `, ${text(row.path_status)}` : ''}` : 'No path';
    return { id, name: String(row.name), detail, href: `/occupations/${id}` };
  }
  return { id, name: String(row.name), detail: text(row.category), href: `/skills/${id}` };
}

/** What each kind's search and near-match queries select, from the table aliased `r`. */
const FOUND_COLUMNS: Record<RecordKind, SQL> = {
  company: sql`r.id, r.name, r.slug, r.domain, (SELECT COUNT(*)::int FROM factories f WHERE f.company_id = r.id) AS plants`,
  factory: sql`r.id, r.name, r.city, r.state, (SELECT c.name FROM companies c WHERE c.id = r.company_id) AS company`,
  career: sql`r.id, r.title AS name, r.path_status, (SELECT COUNT(*)::int FROM occupation_skills os WHERE os.occupation_id = r.id) AS skills`,
  skill: sql`r.id, r.name, r.category`,
};
const FOUND_TABLE: Record<RecordKind, SQL> = {
  company: sql`companies r`,
  factory: sql`factories r`,
  career: sql`occupations r`,
  skill: sql`skills r`,
};
const FOUND_NAME: Record<RecordKind, SQL> = { company: sql`r.name`, factory: sql`r.name`, career: sql`r.title`, skill: sql`r.name` };

/** Whether a record is also known by exactly this name. */
function aliasIs(kind: RecordKind, term: string): SQL {
  if (kind === 'company') return sql`EXISTS (SELECT 1 FROM unnest(COALESCE(r.aliases, '{}')) a WHERE lower(a) = lower(${term}))`;
  if (kind === 'career') return sql`EXISTS (SELECT 1 FROM occupation_aliases a WHERE a.canonical_occupation_id = r.id AND lower(a.alias_text) = lower(${term}))`;
  if (kind === 'skill') return sql`EXISTS (SELECT 1 FROM skill_aliases a WHERE a.canonical_skill_id = r.id AND lower(a.alias_text) = lower(${term}))`;
  return sql`false`;
}

/** Records of one kind whose name, or other name, contains the term. Names that start with it come first. */
export async function searchRecords(kind: RecordKind, term: string, limit = 8): Promise<FoundRecord[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const contains = `%${likeLiteral(q)}%`;
  const alias =
    kind === 'company'
      ? sql`EXISTS (SELECT 1 FROM unnest(COALESCE(r.aliases, '{}')) a WHERE a ILIKE ${contains})`
      : kind === 'career'
        ? sql`EXISTS (SELECT 1 FROM occupation_aliases a WHERE a.canonical_occupation_id = r.id AND a.alias_text ILIKE ${contains})`
        : kind === 'skill'
          ? sql`EXISTS (SELECT 1 FROM skill_aliases a WHERE a.canonical_skill_id = r.id AND a.alias_text ILIKE ${contains})`
          : sql`false`;
  const rows = rowsOf(
    await db.execute(sql`
      SELECT ${FOUND_COLUMNS[kind]}
      FROM ${FOUND_TABLE[kind]}
      WHERE ${FOUND_NAME[kind]} ILIKE ${contains} OR ${alias}
      ORDER BY (lower(${FOUND_NAME[kind]}) = lower(${q})) DESC, (${FOUND_NAME[kind]} ILIKE ${`${likeLiteral(q)}%`}) DESC, ${FOUND_NAME[kind]} ASC, r.id
      LIMIT ${limit}
    `)
  );
  return rows.map((row) => found(kind, row));
}

/** A name without case, punctuation or the endings companies carry ("Inc", "Corp", "LLC"). */
function plainName(column: SQL): SQL {
  return sql`btrim(regexp_replace(regexp_replace(regexp_replace(lower(${column}), '[^a-z0-9]+', ' ', 'g'), '\\m(the|inc|incorporated|corp|corporation|co|company|llc|ltd|lp|plc|holdings|group)\\M', ' ', 'g'), ' +', ' ', 'g'))`;
}

const NEAR = 0.5;
const NEAR_METRES = 150;

export interface SimilarQuery {
  name: string;
  /** A record to leave out: the one being edited. */
  excludeId?: string;
  /** Factories: the company the plant belongs to, and where it is. */
  companyId?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Records a name comes close to: the same name in another case or with
 * another ending, one it is also known by, or one that reads much the same.
 * For a factory: a like-named plant of the same company, or any plant within
 * 150 metres.
 */
export async function similarRecords(kind: RecordKind, query: SimilarQuery): Promise<FoundRecord[]> {
  const name = query.name.trim();
  if (name.length < 3 && kind !== 'factory') return [];
  const column = FOUND_NAME[kind];
  const score = sql`similarity(lower(${column}), lower(${name}))`;
  const exclude = query.excludeId ? sql`r.id <> ${query.excludeId}` : sql`true`;

  let where: SQL;
  if (kind === 'factory') {
    const tests: SQL[] = [];
    if (query.companyId && name.length >= 3) tests.push(sql`(r.company_id = ${query.companyId} AND ${score} >= ${NEAR})`);
    if (query.latitude !== undefined && query.longitude !== undefined) {
      const numeric = sql`'^-?[0-9]+([.][0-9]+)?$'`;
      // About 111 km per degree of latitude; longitude shrinks with the cosine.
      tests.push(sql`(r.latitude ~ ${numeric} AND r.longitude ~ ${numeric}
        AND abs(r.latitude::float8 - ${query.latitude}) < 0.01 AND abs(r.longitude::float8 - ${query.longitude}) < 0.01
        AND sqrt(power((r.latitude::float8 - ${query.latitude}) * 111320, 2) + power((r.longitude::float8 - ${query.longitude}) * 111320 * cos(radians(${query.latitude})), 2)) <= ${NEAR_METRES})`);
    }
    if (tests.length === 0) return [];
    where = sql`(${sql.join(tests, sql` OR `)})`;
  } else {
    const plain = kind === 'company' ? sql`OR ${plainName(column)} = ${plainName(sql`${name}`)}` : sql``;
    where = sql`(lower(${column}) = lower(${name}) OR ${score} >= ${NEAR} ${plain} OR ${aliasIs(kind, name)})`;
  }
  const rows = rowsOf(
    await db.execute(sql`
      SELECT ${FOUND_COLUMNS[kind]}
      FROM ${FOUND_TABLE[kind]}
      WHERE ${exclude} AND ${where}
      ORDER BY ${score} DESC, ${column} ASC
      LIMIT 5
    `)
  );
  return rows.map((row) => found(kind, row));
}
