import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db, companies, companyCareers, companyMembers, jobs, occupations } from '../db/index.js';
import { isService, notAnEmployerHere } from './military.js';
import { recordAudit, type Executor } from './audit.js';
import type { SessionUser } from './auth.js';
import { listOpenJobs } from './openJobs.js';
import { RecordRefusal } from './records.js';
import { rowsOf } from './rows.js';
import { companyInScope } from './scope.js';
import { byCompanyStanding, companyStandings } from './industries.js';
import { placeOf, placeSql, type SkillPlace } from './taxonomy.js';
import { routeOrder } from './route.js';
import { isUuid } from './writes.js';
import { VERSION_ADDED_MAX, VERSION_MAKES_MAX, versionTitle, type VersionOrigin } from '../../shared/versions.js';

/**
 * A company's version of a career: how the career is done at that company,
 * as changes against the standard (migration 0053).
 *
 * A version is a difference, never a copy of the path. It is read as the
 * career's own skills (occupation_skills), without the ones the company
 * leaves out, with the ones it adds; for a skill that has makes, the makes
 * the company runs. So it follows the standard: a skill that joins the
 * standard is in every version at once. A stored change that no longer
 * applies (a skill left out that the standard has since dropped, one added
 * that the standard has since taken up) is not read, raises nothing, and is
 * dropped the next time the version is saved.
 *
 * Makes hang on the version (company and career), not on a plant: see
 * `company_career_makes`. Nothing here is ever written for a company by us:
 * every write comes from one of its active members or from an admin, through
 * the routes in routes/versions.ts.
 */

export interface VersionCompany {
  id: string;
  name: string;
  slug: string | null;
  domain: string | null;
}

/** A version as a list names it: whose, of what, and how it differs. */
export interface VersionSummary {
  company: VersionCompany;
  occupation: { id: string; title: string };
  /** "Boeing CNC Operator". */
  title: string;
  /** How many skills it adds to the standard, and how many of the standard's it leaves out. */
  added: number;
  leftOut: number;
  /** The makes it runs, by name, each once. */
  makes: string[];
}

export interface VersionMake {
  id: string;
  name: string;
  /** The company runs it. */
  runs: boolean;
}

export interface VersionSkill extends SkillPlace {
  id: string;
  name: string;
  /** How the skill is learned, in the catalogue's sentence. */
  howLearned: string | null;
  /** What the skill is, in the catalogue's words: the version's page previews a skill with it. */
  description: string | null;
  /** Not on the standard path: the company adds it. */
  added: boolean;
  /** Every make of the skill, in the skill's order, each saying whether the company runs it. */
  makes: VersionMake[];
  /** Where the skill stands among all the version names, kept and left out together, in path order. */
  order: number;
}

/** One version as a path ready to draw. */
export interface Version {
  company: VersionCompany;
  occupation: { id: string; title: string; description: string | null };
  title: string;
  origin: VersionOrigin;
  updatedAt: string;
  /** The version's path: the standard's skills it keeps and the ones it adds, in path order. */
  skills: VersionSkill[];
  /** The standard's skills it leaves out, in path order. */
  leftOut: VersionSkill[];
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** A company by its id or, as its page is addressed, its slug. Null when there is none. */
export async function findVersionCompany(executor: Executor, raw: unknown): Promise<VersionCompany | null> {
  if (typeof raw !== 'string') return null;
  const value = raw.toLowerCase();
  const by = isUuid(raw) ? eq(companies.id, raw) : SLUG_RE.test(value) ? eq(companies.slug, value) : null;
  if (!by) return null;
  const [row] = await executor
    .select({ id: companies.id, name: companies.name, slug: companies.slug, domain: companies.domain })
    .from(companies)
    .where(and(by, companyInScope()))
    .limit(1);
  return row ?? null;
}

/**
 * Whether skill `skill` is on the path of the version `cc` (a company_careers
 * row by that alias): one of the standard's that is not left out, or one the
 * version adds. Every reader of a version goes by this one rule.
 */
function onVersionPath(skill: SQL): SQL {
  return sql`(CASE WHEN EXISTS (SELECT 1 FROM occupation_skills vp_os WHERE vp_os.occupation_id = cc.occupation_id AND vp_os.skill_id = ${skill})
    THEN NOT EXISTS (SELECT 1 FROM company_career_skills vp_x WHERE vp_x.company_career_id = cc.id AND vp_x.skill_id = ${skill} AND vp_x.change = 'left_out')
    ELSE EXISTS (SELECT 1 FROM company_career_skills vp_x WHERE vp_x.company_career_id = cc.id AND vp_x.skill_id = ${skill} AND vp_x.change = 'added') END)`;
}

interface SummaryRow {
  company_id: string;
  company_name: string;
  slug: string | null;
  domain: string | null;
  occupation_id: string;
  title: string;
  added: number;
  left_out: number;
  makes: string[] | string;
}

/** The versions matching a condition over `cc` (company_careers), `c` (companies) and `o` (occupations). */
async function listVersions(where: SQL, order: SQL, limit: number): Promise<VersionSummary[]> {
  const rows = rowsOf<SummaryRow>(
    await db.execute(sql`
      SELECT c.id AS company_id, c.name AS company_name, c.slug, c.domain, o.id AS occupation_id, o.title,
        (SELECT COUNT(*)::int FROM company_career_skills x WHERE x.company_career_id = cc.id AND x.change = 'added'
           AND NOT EXISTS (SELECT 1 FROM occupation_skills os WHERE os.occupation_id = cc.occupation_id AND os.skill_id = x.skill_id)) AS added,
        (SELECT COUNT(*)::int FROM company_career_skills x WHERE x.company_career_id = cc.id AND x.change = 'left_out'
           AND EXISTS (SELECT 1 FROM occupation_skills os WHERE os.occupation_id = cc.occupation_id AND os.skill_id = x.skill_id)) AS left_out,
        (SELECT COALESCE(json_agg(g.name ORDER BY g.place), '[]'::json) FROM (
           -- Each name once, where it first stands on the path: in the skills' order, then the makes' own.
           SELECT r.name, MIN(r.place) AS place FROM (
             SELECT m.name, ROW_NUMBER() OVER (ORDER BY ${routeOrder()}, m.position, lower(m.name)) AS place
             FROM company_career_makes cm
             INNER JOIN skill_makes m ON m.id = cm.make_id
             INNER JOIN skills s ON s.id = cm.skill_id
             LEFT JOIN skill_groups sg ON sg.slug = s.group_slug
             LEFT JOIN skill_domains sd ON sd.slug = sg.domain_slug
             WHERE cm.company_career_id = cc.id AND ${onVersionPath(sql`cm.skill_id`)}) r
           GROUP BY r.name) g) AS makes
      FROM company_careers cc
      INNER JOIN companies c ON c.id = cc.company_id
      INNER JOIN occupations o ON o.id = cc.occupation_id
      LEFT JOIN LATERAL (${companyStandings({ of: sql`c.id` })}) cs ON TRUE
      WHERE ${where} AND ${companyInScope('c')}
      ORDER BY ${order}
      LIMIT ${limit}
    `)
  );
  return rows.map((row) => ({
    company: { id: row.company_id, name: row.company_name, slug: row.slug, domain: row.domain },
    occupation: { id: row.occupation_id, title: row.title },
    title: versionTitle(row.company_name, row.title),
    added: Number(row.added) || 0,
    leftOut: Number(row.left_out) || 0,
    makes: typeof row.makes === 'string' ? (JSON.parse(row.makes) as string[]) : (row.makes ?? []),
  }));
}

/** A company's versions, by career title. */
export function versionsOfCompany(companyId: string, limit = 200): Promise<VersionSummary[]> {
  return listVersions(sql`cc.company_id = ${companyId}`, sql`lower(o.title), o.id`, limit);
}

/** The companies with a version of a career, in the order every list of companies has. */
export function versionsOfCareer(occupationId: string, limit = 200): Promise<VersionSummary[]> {
  return listVersions(sql`cc.occupation_id = ${occupationId}`, sql`${byCompanyStanding('cs', sql`c.name`)}, c.id`, limit);
}

interface HeadRow {
  id: string;
  origin: string;
  updated_at: Date | string;
  company_id: string;
  company_name: string;
  slug: string | null;
  domain: string | null;
  occupation_id: string;
  title: string;
  description: string | null;
}

/** One version as a path ready to draw, or null when the company has none of that career. */
export async function readVersion(executor: Executor, companyId: string, occupationId: string): Promise<Version | null> {
  const [head] = rowsOf<HeadRow>(
    await executor.execute(sql`
      SELECT cc.id, cc.origin, cc.updated_at, c.id AS company_id, c.name AS company_name, c.slug, c.domain,
             o.id AS occupation_id, o.title, o.description
      FROM company_careers cc
      INNER JOIN companies c ON c.id = cc.company_id
      INNER JOIN occupations o ON o.id = cc.occupation_id
      WHERE cc.company_id = ${companyId} AND cc.occupation_id = ${occupationId} AND ${companyInScope('c')}
    `)
  );
  if (!head) return null;

  // Every skill the version touches: the standard's, and the ones it adds. In path order.
  const place = placeSql('s');
  const skillRows = rowsOf<{ id: string; name: string; how_learned: string | null; description: string | null; standard: boolean; change: string | null; level: unknown; group_slug: unknown; group_name: unknown; domain_slug: unknown; domain_name: unknown }>(
    await executor.execute(sql`
      SELECT s.id, s.name, s.how_learned, s.description, ${place.columns}, (os.skill_id IS NOT NULL) AS standard, x.change
      FROM skills s
      LEFT JOIN occupation_skills os ON os.skill_id = s.id AND os.occupation_id = ${occupationId}
      LEFT JOIN company_career_skills x ON x.skill_id = s.id AND x.company_career_id = ${head.id}
      ${place.joins}
      WHERE os.skill_id IS NOT NULL OR x.change = 'added'
      ORDER BY ${routeOrder()}
    `)
  );
  const makeRows = rowsOf<{ id: string; name: string; skill_id: string; runs: boolean }>(
    await executor.execute(sql`
      SELECT m.id, m.name, m.skill_id, (cm.make_id IS NOT NULL) AS runs
      FROM skill_makes m
      LEFT JOIN company_career_makes cm ON cm.make_id = m.id AND cm.company_career_id = ${head.id}
      WHERE m.skill_id IN (
        SELECT os.skill_id FROM occupation_skills os WHERE os.occupation_id = ${occupationId}
        UNION
        SELECT x.skill_id FROM company_career_skills x WHERE x.company_career_id = ${head.id} AND x.change = 'added')
      ORDER BY m.skill_id, m.position, lower(m.name)
    `)
  );
  const makesBySkill = new Map<string, VersionMake[]>();
  for (const row of makeRows) {
    const make = { id: String(row.id), name: String(row.name), runs: Boolean(row.runs) };
    const list = makesBySkill.get(String(row.skill_id));
    if (list) list.push(make);
    else makesBySkill.set(String(row.skill_id), [make]);
  }

  const skills: VersionSkill[] = [];
  const leftOut: VersionSkill[] = [];
  for (const [order, row] of skillRows.entries()) {
    const standard = Boolean(row.standard);
    const out = standard && row.change === 'left_out';
    const makes = makesBySkill.get(String(row.id)) ?? [];
    const skill: VersionSkill = {
      id: String(row.id),
      name: String(row.name),
      ...placeOf(row),
      howLearned: row.how_learned,
      description: row.description,
      added: !standard,
      // A skill that is left out runs nothing here, whatever was stored before it was.
      makes: out ? makes.map((make) => ({ ...make, runs: false })) : makes,
      order,
    };
    (out ? leftOut : skills).push(skill);
  }

  return {
    company: { id: head.company_id, name: head.company_name, slug: head.slug, domain: head.domain },
    occupation: { id: head.occupation_id, title: head.title, description: head.description },
    title: versionTitle(head.company_name, head.title),
    origin: head.origin as VersionOrigin,
    updatedAt: new Date(head.updated_at).toISOString(),
    skills,
    leftOut,
  };
}

/** The open jobs for a career at one company: what a version's page lists. */
export function versionJobs(companyId: string, occupationId: string) {
  return listOpenJobs(and(eq(jobs.companyId, companyId), eq(jobs.occupationId, occupationId)) as SQL);
}

/**
 * The skills a job for this career at this company starts from, when the
 * company has a version of the career: the version's path, each skill with its
 * level. Null when it has none, and the standard's skills are the start.
 */
export async function versionPathSkills(companyId: string, occupationId: string): Promise<{ skillId: string; level: number | null }[] | null> {
  const version = await readVersion(db, companyId, occupationId);
  return version ? version.skills.map((skill) => ({ skillId: skill.id, level: skill.level })) : null;
}

/** Whether the company has a version of the career: for a `SELECT` over jobs, as a column. */
export function hasVersionOf(companyId: SQL, occupationId: SQL): SQL<boolean> {
  return sql<boolean>`EXISTS (SELECT 1 FROM company_careers hv WHERE hv.company_id = ${companyId} AND hv.occupation_id = ${occupationId})`;
}

// ---------------------------------------------------------------------------
// Writes: one of the company's active members, or an admin
// ---------------------------------------------------------------------------

/**
 * Whose word a write is. An admin who also belongs to the company writes as
 * one of its people; an admin who does not writes as an admin. (Whether the
 * person may write at all is `canManageCompany`, asked by the route.)
 */
async function originOf(executor: Executor, actor: SessionUser, companyId: string): Promise<VersionOrigin> {
  if (!actor.isAdmin) return 'member';
  const [row] = await executor
    .select({ status: companyMembers.status })
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, actor.id)))
    .limit(1);
  return row?.status === 'active' ? 'member' : 'admin';
}

/**
 * The audit line for an admin's write. A member's write is not in the audit
 * log, which is the record of what admins change: the version itself says who
 * last changed it and when (`updated_by`, `updated_at`).
 */
async function auditVersion(
  tx: Executor,
  actor: SessionUser,
  head: { companyId: string; companyName: string; careerTitle: string },
  action: string,
  detail: Record<string, unknown>
): Promise<void> {
  if (!actor.isAdmin) return;
  await recordAudit(tx, {
    actor,
    kind: 'company',
    recordId: head.companyId,
    recordName: `${head.companyName} · ${head.careerTitle}`,
    action,
    detail: { career: head.careerTitle, ...detail },
  });
}

/** What a version says, in words, for the audit log. */
function versionWords(version: Version): { adds: string[]; leavesOut: string[]; runs: string[] } {
  return {
    adds: version.skills.filter((skill) => skill.added).map((skill) => skill.name),
    leavesOut: version.leftOut.map((skill) => skill.name),
    runs: version.skills.flatMap((skill) => skill.makes.filter((make) => make.runs).map((make) => `${skill.name}: ${make.name}`)),
  };
}

/**
 * Add a company's version of a career, with no changes yet. Throws
 * RecordRefusal: 404 for a company that is not there, 400 for a career that is
 * not, 409 (with `existing`) when the company already has one.
 */
export async function addVersion(actor: SessionUser, companyId: string, occupationId: unknown): Promise<Version> {
  if (!isUuid(occupationId)) throw new RecordRefusal(400, 'Choose a career.', { field: 'occupationId' });
  return db.transaction(async (tx) => {
    const [company] = await tx.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) throw new RecordRefusal(404, 'Company not found');
    // A service's careers are its own: it says nothing of how a civilian career is done.
    if (await isService(tx, company.id)) throw new RecordRefusal(400, notAnEmployerHere(company.name));
    const [career] = await tx
      .select({ id: occupations.id, title: occupations.title, service: occupations.serviceCompanyId })
      .from(occupations)
      .where(eq(occupations.id, occupationId))
      .limit(1);
    if (!career) throw new RecordRefusal(400, 'That career does not exist.', { field: 'occupationId' });
    // A military career is its service's own: no company has a version of it.
    if (career.service) throw new RecordRefusal(400, 'A military career has no company versions.', { field: 'occupationId' });
    const made = await tx
      .insert(companyCareers)
      .values({ companyId, occupationId, origin: await originOf(tx, actor, companyId), createdBy: actor.id, updatedBy: actor.id })
      .onConflictDoNothing()
      .returning({ id: companyCareers.id });
    if (made.length === 0) {
      throw new RecordRefusal(409, `${company.name} already has its version of ${career.title}.`, {
        existing: { companyId, occupationId, title: versionTitle(company.name, career.title) },
      });
    }
    await auditVersion(tx, actor, { companyId, companyName: company.name, careerTitle: career.title }, 'career version added', {});
    return (await readVersion(tx, companyId, occupationId)) as Version;
  });
}

/** A list of ids from a request body: undefined when left out, null when it is not a list of at most `max` ids. */
function readIds(value: unknown, max: number): string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > max || !value.every(isUuid)) return null;
  return [...new Set(value as string[])];
}

/**
 * Change a version: `added` (skills it adds), `leftOut` (skills of the
 * standard it leaves out) and `makes` (the makes it runs), each a whole list
 * of ids, each optional; a list not sent stays as it is. Throws RecordRefusal,
 * naming the `field`:
 *   - only a skill on the career's standard path can be left out;
 *   - only a skill that exists can be added (one the standard already has is
 *     not an addition and is not stored);
 *   - only a make of a skill on the version's path can be chosen. A skill that
 *     leaves the path takes its makes with it.
 */
export async function changeVersion(actor: SessionUser, companyId: string, occupationId: string, body: unknown): Promise<Version> {
  const input = (body && typeof body === 'object' ? body : {}) as { added?: unknown; leftOut?: unknown; makes?: unknown };
  const added = readIds(input.added, VERSION_ADDED_MAX);
  const leftOut = readIds(input.leftOut, 500);
  const makes = readIds(input.makes, VERSION_MAKES_MAX);
  if (added === null) throw new RecordRefusal(400, `added must be a list of at most ${VERSION_ADDED_MAX} skill ids.`, { field: 'added' });
  if (leftOut === null) throw new RecordRefusal(400, 'leftOut must be a list of skill ids.', { field: 'leftOut' });
  if (makes === null) throw new RecordRefusal(400, `makes must be a list of at most ${VERSION_MAKES_MAX} make ids.`, { field: 'makes' });
  if (added === undefined && leftOut === undefined && makes === undefined) throw new RecordRefusal(400, 'Nothing to change.');

  return db.transaction(async (tx) => {
    // The version is held, so two saves of it cannot cross.
    const [head] = rowsOf<{ id: string; company_name: string; title: string }>(
      await tx.execute(sql`
        SELECT cc.id, c.name AS company_name, o.title
        FROM company_careers cc
        INNER JOIN companies c ON c.id = cc.company_id
        INNER JOIN occupations o ON o.id = cc.occupation_id
        WHERE cc.company_id = ${companyId} AND cc.occupation_id = ${occupationId}
        FOR UPDATE OF cc
      `)
    );
    if (!head) throw new RecordRefusal(404, 'This company has no version of that career.');
    const before = actor.isAdmin ? await readVersion(tx, companyId, occupationId) : null;

    const standard = new Set(
      rowsOf<{ skill_id: string }>(await tx.execute(sql`SELECT skill_id FROM occupation_skills WHERE occupation_id = ${occupationId}`)).map((row) => String(row.skill_id))
    );
    const stored = rowsOf<{ skill_id: string; change: string }>(
      await tx.execute(sql`SELECT skill_id, change FROM company_career_skills WHERE company_career_id = ${head.id}`)
    );

    if (leftOut?.some((id) => !standard.has(id))) {
      throw new RecordRefusal(400, 'Only a skill on the standard path can be left out.', { field: 'leftOut' });
    }
    // A skill the standard already has is no addition: it is on the path as it is.
    const adding = added?.filter((id) => !standard.has(id));
    if (adding && adding.length > 0) {
      const known = rowsOf(await tx.execute(sql`SELECT id FROM skills WHERE id IN (${sql.join(adding.map((id) => sql`${id}::uuid`), sql`, `)})`));
      if (known.length !== adding.length) throw new RecordRefusal(400, 'One of the skills to add does not exist.', { field: 'added' });
    }

    // The skills on the version's path once this is saved.
    const nowAdded = adding ?? stored.filter((row) => row.change === 'added' && !standard.has(String(row.skill_id))).map((row) => String(row.skill_id));
    const nowOut = new Set(leftOut ?? stored.filter((row) => row.change === 'left_out').map((row) => String(row.skill_id)));
    const path = new Set([...[...standard].filter((id) => !nowOut.has(id)), ...nowAdded]);

    let running: { id: string; skill_id: string }[] | null = null;
    if (makes) {
      running =
        makes.length > 0
          ? rowsOf<{ id: string; skill_id: string }>(
              await tx.execute(sql`SELECT id, skill_id FROM skill_makes WHERE id IN (${sql.join(makes.map((id) => sql`${id}::uuid`), sql`, `)})`)
            )
          : [];
      if (running.length !== makes.length || running.some((make) => !path.has(String(make.skill_id)))) {
        throw new RecordRefusal(400, "Choose only makes of the skills on this path.", { field: 'makes' });
      }
    }

    // The changes, each kind as the whole list it was given as.
    const replace = async (change: 'added' | 'left_out', ids: string[]) => {
      const keep = ids.length > 0 ? sql`AND skill_id NOT IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
      await tx.execute(sql`DELETE FROM company_career_skills WHERE company_career_id = ${head.id} AND change = ${change} ${keep}`);
      if (ids.length === 0) return;
      // A skill that carried the other kind of change (one that no longer applied) now carries this one.
      await tx.execute(sql`
        INSERT INTO company_career_skills (company_career_id, skill_id, change)
        VALUES ${sql.join(ids.map((id) => sql`(${head.id}::uuid, ${id}::uuid, ${change})`), sql`, `)}
        ON CONFLICT (company_career_id, skill_id) DO UPDATE SET change = EXCLUDED.change`);
    };
    if (adding) await replace('added', adding);
    if (leftOut) await replace('left_out', leftOut);

    if (running) {
      const keep = running.length > 0 ? sql`AND make_id NOT IN (${sql.join(running.map((make) => sql`${make.id}::uuid`), sql`, `)})` : sql``;
      await tx.execute(sql`DELETE FROM company_career_makes WHERE company_career_id = ${head.id} ${keep}`);
      if (running.length > 0) {
        await tx.execute(sql`
          INSERT INTO company_career_makes (company_career_id, skill_id, make_id)
          VALUES ${sql.join(running.map((make) => sql`(${head.id}::uuid, ${make.skill_id}::uuid, ${make.id}::uuid)`), sql`, `)}
          ON CONFLICT DO NOTHING`);
      }
    } else {
      // The makes stay as they are, but for a skill that has just left the path.
      const on = path.size > 0 ? sql`AND skill_id NOT IN (${sql.join([...path].map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
      await tx.execute(sql`DELETE FROM company_career_makes WHERE company_career_id = ${head.id} ${on}`);
    }
    await tx.update(companyCareers).set({ updatedBy: actor.id, updatedAt: new Date() }).where(eq(companyCareers.id, head.id));

    const after = (await readVersion(tx, companyId, occupationId)) as Version;
    if (before) {
      const was = versionWords(before);
      const is = versionWords(after);
      const changes: Record<string, [string[], string[]]> = {};
      for (const key of ['adds', 'leavesOut', 'runs'] as const) {
        if (was[key].join('\n') !== is[key].join('\n')) changes[key] = [was[key], is[key]];
      }
      // A save that changed nothing writes no line.
      if (Object.keys(changes).length > 0) {
        await auditVersion(tx, actor, { companyId, companyName: head.company_name, careerTitle: head.title }, 'career version changed', { changes });
      }
    }
    return after;
  });
}

/** Delete a company's version of a career. Null when it had none. */
export async function removeVersion(actor: SessionUser, companyId: string, occupationId: string): Promise<{ title: string } | null> {
  return db.transaction(async (tx) => {
    const version = await readVersion(tx, companyId, occupationId);
    if (!version) return null;
    await tx.delete(companyCareers).where(and(eq(companyCareers.companyId, companyId), eq(companyCareers.occupationId, occupationId)));
    const words = versionWords(version);
    await auditVersion(tx, actor, { companyId, companyName: version.company.name, careerTitle: version.occupation.title }, 'career version deleted', {
      ...(words.adds.length > 0 ? { adds: words.adds } : {}),
      ...(words.leavesOut.length > 0 ? { leavesOut: words.leavesOut } : {}),
      ...(words.runs.length > 0 ? { runs: words.runs } : {}),
    });
    return { title: version.title };
  });
}

// ---------------------------------------------------------------------------
// Merges (called by recordMerge.ts, inside its transaction)
// ---------------------------------------------------------------------------

/**
 * A company or a career that is merged into another takes its versions with
 * it. Where the kept record already has a version of the same career (or for
 * the same company), that one stands and the merged record's goes with it.
 */
export async function moveVersions(tx: Executor, kind: 'company' | 'career', fromId: string, intoId: string): Promise<void> {
  if (kind === 'company') {
    await tx.execute(sql`UPDATE company_careers x SET company_id = ${intoId} WHERE x.company_id = ${fromId}
      AND NOT EXISTS (SELECT 1 FROM company_careers y WHERE y.company_id = ${intoId} AND y.occupation_id = x.occupation_id)`);
  } else {
    await tx.execute(sql`UPDATE company_careers x SET occupation_id = ${intoId} WHERE x.occupation_id = ${fromId}
      AND NOT EXISTS (SELECT 1 FROM company_careers y WHERE y.occupation_id = ${intoId} AND y.company_id = x.company_id)`);
  }
}

/**
 * The versions' part of merging skill `fromId` into `intoId`, in two steps
 * like the makes' own (`mergeMakes`). Call it before the paths are touched,
 * and its `makes` once the merged skill's makes have moved.
 *
 * A version's change to the merged skill becomes a change to the kept one,
 * unless the version already says something about the kept skill, or it left
 * the merged skill out of a path that also holds the kept one (the company
 * kept that skill, so it stays). The makes a version runs follow their make;
 * where the kept skill already has a make of the same name, they go to it.
 */
export async function mergeVersionSkills(tx: Executor, fromId: string, intoId: string): Promise<{ makes: () => Promise<void> }> {
  await tx.execute(sql`
    UPDATE company_career_skills x SET skill_id = ${intoId}
    WHERE x.skill_id = ${fromId}
      AND NOT EXISTS (SELECT 1 FROM company_career_skills y WHERE y.company_career_id = x.company_career_id AND y.skill_id = ${intoId})
      AND NOT (x.change = 'left_out' AND EXISTS (
        SELECT 1 FROM company_careers cc INNER JOIN occupation_skills os ON os.occupation_id = cc.occupation_id
        WHERE cc.id = x.company_career_id AND os.skill_id = ${intoId}))`);
  return {
    makes: async () => {
      // Makes that moved to the kept skill took their rows along (the foreign key follows the make).
      // What is left names a make the kept skill already had under the same name.
      await tx.execute(sql`
        INSERT INTO company_career_makes (company_career_id, skill_id, make_id)
        SELECT cm.company_career_id, ${intoId}, y.id
        FROM company_career_makes cm
        INNER JOIN skill_makes x ON x.id = cm.make_id
        INNER JOIN skill_makes y ON y.skill_id = ${intoId} AND lower(y.name) = lower(x.name)
        WHERE cm.skill_id = ${fromId}
        ON CONFLICT DO NOTHING`);
    },
  };
}
