import { eq, sql, type SQL } from 'drizzle-orm';
import { companies, db, occupations } from '../db/index.js';
import type { Executor } from './audit.js';
import { likeLiteral } from './like.js';
import { rowsOf } from './rows.js';
import { careerKind, isCodeSystem, isServiceKey, namedCareers, namesForSure, readMilitaryQuery, type CodeSystemKey, type ServiceKey } from '../../shared/military.js';

/**
 * What a military career carries beyond a civilian one, as the API gives it.
 * A career is military when it has a service; the service is a company
 * (`companies.service`). The columns are migration 0061's; the words above the
 * name are derived from the code system (shared/military.ts).
 */

/**
 * "This career is a civilian one." Military careers are an entry for a veteran,
 * not a destination: every default list, count, search and suggestion is of
 * civilian careers, and a military career is reached on purpose (the Careers
 * list asked for them, its own page, a service's careers). `alias` is the name
 * `occupations` goes by in the statement.
 */
export function civilianCareer(alias = 'occupations'): SQL {
  return sql`${sql.identifier(alias)}.service_company_id IS NULL`;
}

/**
 * The same for a path line: `alias` is the name `occupation_skills` goes by in
 * a statement that does not have the career itself. "How many careers use this
 * skill" counts lines of civilian careers.
 */
export function civilianPathLine(alias = 'occupation_skills'): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM occupations military_o WHERE military_o.id = ${sql.identifier(alias)}.occupation_id AND military_o.service_company_id IS NOT NULL)`;
}

/**
 * "Only military careers use this skill": it is on some path, and on no
 * civilian career's. Such a skill is reached on purpose, like the careers that
 * use it (their paths, its own page, a search for it, the Atlas, the Skills
 * list narrowed to its group): the Skills list and Explore's count are of the
 * rest. `alias` is the name `skills` goes by in the statement.
 */
export function militaryOnlySkill(alias = 'skills'): SQL {
  const skill = sql.identifier(alias);
  return sql`(EXISTS (SELECT 1 FROM occupation_skills any_os WHERE any_os.skill_id = ${skill}.id)
    AND NOT EXISTS (SELECT 1 FROM occupation_skills civ_os WHERE civ_os.skill_id = ${skill}.id AND ${civilianPathLine('civ_os')}))`;
}

/** The military careers, or one service's: what a list shows when it is asked for them. */
export function militaryCareer(service: ServiceKey | null, alias = 'occupations'): SQL {
  const career = sql.identifier(alias);
  return service
    ? sql`${career}.service_company_id = (SELECT service_c.id FROM companies service_c WHERE service_c.service = ${service})`
    : sql`${career}.service_company_id IS NOT NULL`;
}

/** Whether this career is a military one. */
export async function isMilitaryCareer(executor: Executor, id: string): Promise<boolean> {
  const [row] = await executor.select({ service: occupations.serviceCompanyId }).from(occupations).where(eq(occupations.id, id)).limit(1);
  return Boolean(row?.service);
}

/** The service a career belongs to: the employer, and which service it is. */
export interface CareerService {
  id: string;
  name: string;
  slug: string | null;
  key: ServiceKey;
}

export interface MilitaryFacts {
  /** Null for a civilian career. */
  service: CareerService | null;
  /** The service's code for the job: "HT", "15T", "2A3X3". */
  code: string | null;
  codeSystem: CodeSystemKey | null;
  /** The words above the name: "Navy rating", "Army MOS", "Air Force specialty". */
  kind: string | null;
  /** The service's own title for the job, without the service in front. */
  officialTitle: string | null;
}

/** For a civilian career: every one of them empty. */
export const NOT_MILITARY: MilitaryFacts = { service: null, code: null, codeSystem: null, kind: null, officialTitle: null };

/**
 * The columns a career's service is read from, for a select over
 * `occupations` left-joined to `companies` on `service_company_id`
 * (`serviceJoin`). `militaryOf` nests a row of them.
 */
export const serviceColumns = {
  serviceId: companies.id,
  serviceName: companies.name,
  serviceSlug: companies.slug,
  serviceKey: companies.service,
  code: occupations.code,
  codeSystem: occupations.codeSystem,
  officialTitle: occupations.officialTitle,
};

/** The join `serviceColumns` needs. */
export const serviceJoin = eq(companies.id, occupations.serviceCompanyId);

interface ServiceRow {
  serviceId: string | null;
  serviceName: string | null;
  serviceSlug: string | null;
  serviceKey: string | null;
  code: string | null;
  codeSystem: string | null;
  officialTitle: string | null;
}

/** A row's service facts, nested as the API gives them. */
export function militaryOf(row: ServiceRow): MilitaryFacts {
  if (!row.serviceId || !row.serviceName || !isServiceKey(row.serviceKey)) return NOT_MILITARY;
  const codeSystem = isCodeSystem(row.codeSystem) ? row.codeSystem : null;
  return {
    service: { id: row.serviceId, name: row.serviceName, slug: row.serviceSlug, key: row.serviceKey },
    code: row.code,
    codeSystem,
    kind: careerKind(codeSystem),
    officialTitle: row.officialTitle,
  };
}

/** One career's service facts, from its own columns. */
export async function militaryFacts(
  executor: Executor,
  career: { serviceCompanyId: string | null; code: string | null; codeSystem: string | null; officialTitle: string | null }
): Promise<MilitaryFacts> {
  if (!career.serviceCompanyId) return NOT_MILITARY;
  const [service] = await executor
    .select({ serviceId: companies.id, serviceName: companies.name, serviceSlug: companies.slug, serviceKey: companies.service })
    .from(companies)
    .where(eq(companies.id, career.serviceCompanyId))
    .limit(1);
  return service ? militaryOf({ ...service, code: career.code, codeSystem: career.codeSystem, officialTitle: career.officialTitle }) : NOT_MILITARY;
}

/**
 * Whether this company is a military service. A service is an employer with
 * careers and nothing else here: nobody joins it to post jobs, it has no plants
 * to add and no version of a civilian career. Every write that would give it
 * one asks this and refuses in `NOT_AN_EMPLOYER_HERE`'s words.
 */
export async function isService(executor: Executor, companyId: string): Promise<boolean> {
  const [row] = await executor.select({ service: companies.service }).from(companies).where(eq(companies.id, companyId)).limit(1);
  return Boolean(row?.service);
}

/** Why a service is not joined, given a plant or given a version: said of the service by name. */
export function notAnEmployerHere(name: string): string {
  return `${name} is a military service. Its careers are listed on its page; it has no jobs, plants or versions of careers here.`;
}

/** The company that is this service; null when it is not stored. */
export async function findService(executor: Executor, key: ServiceKey): Promise<CareerService | null> {
  const [row] = await executor.select({ id: companies.id, name: companies.name, slug: companies.slug }).from(companies).where(eq(companies.service, key)).limit(1);
  return row ? { ...row, key } : null;
}

/** A military career as a list names it: its full title, with what stands in its grey line. */
export interface MilitaryCareerRow {
  id: string;
  title: string;
  /** "Navy rating", and the service's code for the job. */
  kind: string | null;
  code: string | null;
}

/** A military career a query named, and whether the query can be nothing else (it then leads the results). */
export interface NamedMilitaryCareer extends MilitaryCareerRow {
  sure: boolean;
}

/**
 * The military careers a search query names, by title: the one exception to
 * `civilianCareer()` in the site's search. What "names" means is written once,
 * in shared/military.ts (`readMilitaryQuery`, `namesCareer`): the career's code
 * typed alone, or its service with words of its title. An ordinary query
 * ("welder", "electronics technician", "navy") names none, and for those
 * nothing is read here at all. `asking` is for the one search that asks for a
 * military career (Profile's door): there plain letters count as the code they
 * are. `service` keeps to one service's careers.
 */
export async function namedMilitaryCareers(query: string, options: { asking?: boolean; service?: ServiceKey | null } = {}): Promise<NamedMilitaryCareer[]> {
  const asked = readMilitaryQuery(query);
  if (!asked) return [];
  const service = asked.service ?? options.service ?? null;
  if (options.service && asked.service && options.service !== asked.service) return [];
  // The rule is the shared function's; the statement only leaves out another service's careers.
  const rows = rowsOf(
    await db.execute(sql`
      SELECT o.id, o.title, o.official_title, o.code, o.code_system, c.service,
             COALESCE((SELECT array_agg(a.alias_text) FROM occupation_aliases a WHERE a.canonical_occupation_id = o.id), '{}') AS names
      FROM occupations o
      INNER JOIN companies c ON c.id = o.service_company_id
      WHERE ${service ? sql`c.service = ${service}` : sql`TRUE`}
      ORDER BY lower(o.title), o.id
    `)
  );
  return namedCareers(
    query,
    rows.map((row) => ({
      ...asRow(row),
      service: row.service === null ? null : String(row.service),
      codeSystem: row.code_system === null ? null : String(row.code_system),
      officialTitle: row.official_title === null ? null : String(row.official_title),
      names: Array.isArray(row.names) ? row.names.map(String) : [],
    })),
    { asking: options.asking }
  ).map((career) => ({ id: career.id, title: career.title, kind: career.kind, code: career.code, sure: namesForSure(asked, career) }));
}

function asRow(row: Record<string, unknown>): MilitaryCareerRow {
  return {
    id: String(row.id),
    title: String(row.title),
    kind: careerKind(row.code_system === null || row.code_system === undefined ? null : String(row.code_system)),
    code: row.code === null || row.code === undefined ? null : String(row.code),
  };
}

/** The military careers whose path has a skill, by title: a skill's page lists them apart from the civilian careers. */
export async function militaryCareersUsing(skillId: string): Promise<MilitaryCareerRow[]> {
  return rowsOf(
    await db.execute(sql`
      SELECT o.id, o.title, o.code, o.code_system
      FROM occupation_skills os
      INNER JOIN occupations o ON o.id = os.occupation_id AND ${militaryCareer(null, 'o')}
      WHERE os.skill_id = ${skillId}
      ORDER BY lower(o.title), o.id
    `)
  ).map(asRow);
}

/** A service's career, as the service's own page lists it. */
export interface ServiceCareer extends MilitaryCareerRow {
  /** The domain most of its work is in, by name. */
  home: string | null;
  skillCount: number;
}

/** A service's careers, by title: what its company page lists in place of plants. */
export async function careersOfService(companyId: string): Promise<ServiceCareer[]> {
  return rowsOf(
    await db.execute(sql`
      SELECT o.id, o.title, o.code, o.code_system, d.name AS home,
             (SELECT COUNT(*)::int FROM occupation_skills os WHERE os.occupation_id = o.id) AS skill_count
      FROM occupations o
      LEFT JOIN skill_domains d ON d.slug = o.home_domain
      WHERE o.service_company_id = ${companyId}
      ORDER BY lower(o.title), o.id
    `)
  ).map((row) => ({ ...asRow(row), home: row.home === null ? null : String(row.home), skillCount: Number(row.skill_count) || 0 }));
}

/**
 * For a list that was asked for military careers: a career is also found by its
 * code, typed whole or begun ("ht", "15", "2a3"), which the search of titles and
 * other names does not read. `where` is the careers whose code begins with the
 * term; `exact` says the term is the whole code.
 */
export function codeMatch(term: string): { where: SQL; exact: SQL } {
  const code = term.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return {
    where: code ? sql`lower(occupations.code) LIKE ${`${likeLiteral(code)}%`}` : sql`FALSE`,
    exact: code ? sql`(lower(occupations.code) = ${code})` : sql`FALSE`,
  };
}
