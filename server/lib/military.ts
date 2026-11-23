import { eq, sql, type SQL } from 'drizzle-orm';
import { companies, occupations } from '../db/index.js';
import type { Executor } from './audit.js';
import { careerKind, isCodeSystem, isServiceKey, type CodeSystemKey, type ServiceKey } from '../../shared/military.js';

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

/** The company that is this service; null when it is not stored. */
export async function findService(executor: Executor, key: ServiceKey): Promise<CareerService | null> {
  const [row] = await executor.select({ id: companies.id, name: companies.name, slug: companies.slug }).from(companies).where(eq(companies.service, key)).limit(1);
  return row ? { ...row, key } : null;
}
