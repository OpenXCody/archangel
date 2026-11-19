import { Router, Request, Response } from 'express';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { db, occupations, occupationSkills, skills, skillDomains, skillGroups, factoryOccupations, factories, jobs } from '../db/index.js';
import { comesFrom, findDomain, homeColumns, homeOf, leadsTo } from '../lib/careers.js';
import { uuidParam } from '../middleware/validateUuid.js';
import { factoryInScope } from '../lib/scope.js';
import { listOpenJobs } from '../lib/openJobs.js';
import { pageLimit, pageOffset } from '../lib/paging.js';
import { answerDuplicate, answerWriteError, isUuid, optionalText, refuseDeleteWithJobs, requiredText } from '../lib/writes.js';
import { careerMatch, careerNearMiss, readCareerTerm, withoutLevel, type CareerMatch } from '../lib/careerSearch.js';
import { answerRefusal, changeRecord, recordAdded, removeRecord } from '../lib/records.js';
import { recordAudit } from '../lib/audit.js';
import { rowsOf } from '../lib/rows.js';
import { placeColumns, placeOf } from '../lib/taxonomy.js';

const router = Router();
router.param('id', uuidParam);

// GET /api/occupations - List occupations with offset-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, sort, order = 'asc', domain } = req.query;
    const limitNum = pageLimit(limit, 20, 100);
    const offsetNum = pageOffset(offset);
    // Narrowed to the careers whose home is one domain (a slug). A slug no
    // domain has matches nothing, as on the skills list.
    const inDomain = typeof domain === 'string' && domain ? eq(occupations.homeDomain, domain) : undefined;

    // Search reads titles and the other names careers go by, tolerant of
    // "&", punctuation, plurals and word order (see lib/careerSearch.ts). When
    // the term as typed finds nothing it is tried without its level and shift
    // words ("welder II"), and then against the closest titles ("machinst").
    const term = readCareerTerm(search);
    const tries: CareerMatch[] = [];
    if (term) {
      tries.push(careerMatch(term));
      const plain = withoutLevel(term);
      if (plain) tries.push(careerMatch(plain));
      if (term.length >= 4) tries.push(careerNearMiss(plain ?? term));
    }

    // Get total count: the first way of reading the term that finds anything.
    let match: CareerMatch | null = null;
    let total = 0;
    if (!term) {
      const [row] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(occupations).where(inDomain);
      total = row?.count ?? 0;
    }
    for (const [index, candidate] of tries.entries()) {
      let count = 0;
      try {
        const [row] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(occupations).where(and(candidate.where, inDomain));
        count = row?.count ?? 0;
      } catch (error) {
        // Only the closest titles (the last try) may fail: they need the
        // pg_trgm extension. Without it the answer is the plain one: nothing matched.
        if (index === 0) throw error;
        console.error('Career search: a fallback failed:', error instanceof Error ? error.name : 'error');
        break;
      }
      match = candidate;
      total = count;
      if (total > 0) break;
    }
    const whereClause = match ? and(match.where, inDomain) : inDomain;

    // Build order by clause
    // The list opens on the careers with something to follow: those with a
    // path, then those with the most skills, so a career that is only a title
    // comes last; among equals, by title. `sort=name` (or `title`) is the
    // plain name order, `order=desc` reversing it.
    const hasPathFirst = sql`(${occupations.pathStatus} IS NULL) ASC`;
    const mostSkillsFirst = sql`(SELECT COUNT(*) FROM occupation_skills os_n WHERE os_n.occupation_id = ${occupations.id}) DESC`;
    // By the letters, whatever their case ("ALD …" is not ahead of "Additive …").
    const byTitle = order === 'desc' ? sql`lower(${occupations.title}) DESC` : sql`lower(${occupations.title}) ASC`;
    const byName = sort === 'name' || sort === 'title';
    // With a search, the closest match first; among equals, careers with a
    // path, then the shorter title ("Machinist" before "Casting CNC Machinist").
    const orderByClause = match
      ? sql`${match.relevance}, ${hasPathFirst}, length(${occupations.title}), ${byTitle}`
      : byName
        ? sql`${byTitle}, ${occupations.id}`
        : sql`${hasPathFirst}, ${mostSkillsFirst}, lower(${occupations.title}) ASC, ${occupations.id}`;

    // Query with skill and factory counts (in-scope factories only)
    const result = await db
      .select({
        id: occupations.id,
        title: occupations.title,
        description: occupations.description,
        onetCode: occupations.onetCode,
        pathStatus: occupations.pathStatus,
        createdAt: occupations.createdAt,
        ...homeColumns,
        // The other name a search found it by, when its title did not match.
        alsoCalled: match ? match.otherName : sql<string | null>`NULL`,
        skillCount: sql<number>`(SELECT COUNT(*)::int FROM occupation_skills WHERE occupation_skills.occupation_id = occupations.id)`,
        // Skills at each level (Fundamentals, Intermediate, Advanced); null when the career has no skills.
        levelCounts: sql<[number, number, number] | null>`(
          SELECT CASE WHEN COUNT(*) FILTER (WHERE os.stage IN (1, 2, 3)) = 0 THEN NULL ELSE json_build_array(
            COUNT(*) FILTER (WHERE os.stage = 1), COUNT(*) FILTER (WHERE os.stage = 2), COUNT(*) FILTER (WHERE os.stage = 3)) END
          FROM occupation_skills os WHERE os.occupation_id = occupations.id)`,
        factoryCount: sql<number>`(SELECT COUNT(*)::int FROM factory_occupations fo INNER JOIN factories f ON f.id = fo.factory_id WHERE fo.occupation_id = occupations.id AND ${factoryInScope('f')})`,
      })
      .from(occupations)
      .leftJoin(skillDomains, eq(skillDomains.slug, occupations.homeDomain))
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limitNum)
      .offset(offsetNum);

    const hasMore = offsetNum + result.length < total;

    res.json({
      data: result.map(({ homeSlug, homeName, ...row }) => ({ ...row, home: homeOf({ homeSlug, homeName }) })),
      total,
      offset: offsetNum,
      limit: limitNum,
      hasMore,
    });
  } catch (error) {
    console.error('Error fetching occupations:', error);
    res.status(500).json({ error: 'Failed to fetch occupations' });
  }
});

// GET /api/occupations/:id - Get single occupation with relationships
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get occupation
    const occupationResult = await db.select().from(occupations).where(eq(occupations.id, id));

    if (occupationResult.length === 0) {
      res.status(404).json({ error: 'Occupation not found' });
      return;
    }

    const { homeDomain, ...occupation } = occupationResult[0];
    // Its home domain, and its place on a ladder: where a person comes from and where it leads.
    const [home, ladderOn, ladderBack] = await Promise.all([findDomain(db, homeDomain), leadsTo(db, id), comesFrom(db, id)]);

    // The career's path: its skills, each with its level, group and domain,
    // in the order a path is laid out: by level, and within a level by domain
    // and group as the taxonomy orders them.
    const occupationSkillsResult = (
      await db
        .select({
          id: skills.id,
          name: skills.name,
          importance: occupationSkills.importance,
          ...placeColumns,
        })
        .from(occupationSkills)
        .innerJoin(skills, eq(occupationSkills.skillId, skills.id))
        .leftJoin(skillGroups, eq(skillGroups.slug, skills.groupSlug))
        .leftJoin(skillDomains, eq(skillDomains.slug, skillGroups.domainSlug))
        .where(eq(occupationSkills.occupationId, id))
        .orderBy(
          sql`${skills.level} ASC NULLS LAST`,
          sql`${skillDomains.position} ASC NULLS LAST`,
          sql`${skillGroups.position} ASC NULLS LAST`,
          sql`${skills.groupPosition} ASC NULLS LAST`,
          skills.name
        )
    ).map(({ level, groupSlug, groupName, domainSlug, domainName, ...skill }) => ({
      ...skill,
      ...placeOf({ level, groupSlug, groupName, domainSlug, domainName }),
    }));

    // Industries where this work is typically done, with how many in-scope
    // factories each has and the states with the most of them.
    const industriesResult = rowsOf(
      await db.execute(sql`
        SELECT io.industry, io.common, COUNT(f.id)::int AS factory_count
        FROM industry_occupations io
        LEFT JOIN factories f ON f.primary_naics_description = io.industry AND ${factoryInScope('f')}
        WHERE io.occupation_id = ${id}
        GROUP BY io.industry, io.common, io.rank
        ORDER BY io.common ASC, factory_count DESC, io.industry ASC
      `)
    ).map((r) => ({ name: String(r.industry), common: Boolean(r.common), factoryCount: Number(r.factory_count) || 0 }));
    // A career found everywhere is not pinned to industries; one that is, lists them.
    const ownIndustries = industriesResult.filter((i) => !i.common);
    const everywhere = ownIndustries.length === 0 && industriesResult.length > 0;
    // Listed for some industries and present in all the others too.
    const elsewhereToo = ownIndustries.length > 0 && industriesResult.some((i) => i.common);
    const topStates = everywhere || ownIndustries.length === 0
      ? []
      : rowsOf(
          await db.execute(sql`
            SELECT f.state AS code, COUNT(*)::int AS factory_count
            FROM factories f
            INNER JOIN industry_occupations io ON io.industry = f.primary_naics_description
            WHERE io.occupation_id = ${id} AND io.common = false AND ${factoryInScope('f')} AND f.state ~ '^[A-Z]{2}$'
            GROUP BY f.state ORDER BY factory_count DESC, f.state ASC LIMIT 6
          `)
        ).map((r) => ({ code: String(r.code), factoryCount: Number(r.factory_count) || 0 }));

    // Get in-scope factories hiring this role with headcount (include coordinates for map fly-to)
    const factoriesResult = await db
      .select({
        id: factories.id,
        name: factories.name,
        city: factories.city,
        state: factories.state,
        companyId: factories.companyId,
        companyName: sql<string>`(SELECT name FROM companies WHERE companies.id = ${factories.companyId})`,
        headcount: factoryOccupations.headcount,
        avgSalaryMin: factoryOccupations.avgSalaryMin,
        avgSalaryMax: factoryOccupations.avgSalaryMax,
        latitude: factories.latitude,
        longitude: factories.longitude,
      })
      .from(factoryOccupations)
      .innerJoin(factories, eq(factoryOccupations.factoryId, factories.id))
      .where(and(eq(factoryOccupations.occupationId, id), factoryInScope()));

    // Open jobs for this career at in-scope factories.
    const jobsResult = await listOpenJobs(eq(jobs.occupationId, id));

    res.json({
      ...occupation,
      home,
      leadsTo: ladderOn,
      comesFrom: ladderBack,
      skills: occupationSkillsResult,
      factories: factoriesResult,
      jobs: jobsResult,
      // Where the work is done, by industry. `everywhere` means the career is
      // found in plants of every industry rather than a few.
      industries: ownIndustries.map(({ name, factoryCount }) => ({ name, factoryCount })),
      everywhere,
      elsewhereToo,
      topStates,
    });
  } catch (error) {
    console.error('Error fetching occupation:', error);
    res.status(500).json({ error: 'Failed to fetch occupation' });
  }
});

// PUT /api/occupations/:id/path - set which skills a career needs.
// Body: { skills: [{ skillId }], replace?: boolean, status?: 'draft' | 'approved' }.
// With `replace`, skills not listed are removed from the career. `status` records
// whether a person has reviewed the path. Admin-only (a write).
// A path has no stages of its own: each skill sits at its own level, and the
// database writes that level to occupation_skills.stage on every write
// (migration 0042). A `stage` sent with a skill is not read.
router.put('/:id/path', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const items: unknown = req.body?.skills;
    if (!Array.isArray(items) || items.length > 500) {
      res.status(400).json({ error: 'skills must be a list of { skillId }.' });
      return;
    }
    const rows: { occupationId: string; skillId: string }[] = [];
    for (const item of items as { skillId?: unknown }[]) {
      if (!isUuid(item?.skillId)) {
        res.status(400).json({ error: 'Each entry needs a skillId.' });
        return;
      }
      rows.push({ occupationId: id, skillId: item.skillId });
    }
    const [occupation] = await db
      .select({ id: occupations.id, title: occupations.title, pathStatus: occupations.pathStatus })
      .from(occupations)
      .where(eq(occupations.id, id));
    if (!occupation) {
      res.status(404).json({ error: 'Occupation not found' });
      return;
    }
    const wanted = [...new Set(rows.map((row) => row.skillId))];
    if (wanted.length > 0) {
      const known = await db.select({ id: skills.id }).from(skills).where(inArray(skills.id, wanted));
      if (known.length !== wanted.length) {
        res.status(400).json({ error: 'One of the skills does not exist.' });
        return;
      }
    }
    const status: unknown = req.body?.status;
    if (status !== undefined && status !== 'draft' && status !== 'approved') {
      res.status(400).json({ error: "status must be 'draft' or 'approved'." });
      return;
    }
    await db.transaction(async (tx) => {
      const pathNow = () =>
        tx
          .select({ skillId: occupationSkills.skillId, name: skills.name })
          .from(occupationSkills)
          .innerJoin(skills, eq(skills.id, occupationSkills.skillId))
          .where(eq(occupationSkills.occupationId, id));
      const before = await pathNow();
      if (status !== undefined) {
        await tx.update(occupations).set({ pathStatus: status }).where(eq(occupations.id, id));
      }
      if (req.body?.replace === true) {
        // Skills not listed go; the ones that stay keep what else is recorded of them.
        await tx
          .delete(occupationSkills)
          .where(wanted.length > 0 ? and(eq(occupationSkills.occupationId, id), notInArray(occupationSkills.skillId, wanted)) : eq(occupationSkills.occupationId, id));
      }
      // A skill already on the path stays as it is.
      if (rows.length > 0) await tx.insert(occupationSkills).values(rows).onConflictDoNothing();
      // The line in the audit log: which skills came or went, and the path's state.
      const after = await pathNow();
      const was = new Map(before.map((row) => [row.skillId, row]));
      const is = new Map(after.map((row) => [row.skillId, row]));
      const added = after.filter((row) => !was.has(row.skillId)).map((row) => row.name);
      const removed = before.filter((row) => !is.has(row.skillId)).map((row) => row.name);
      const statusChanged = status !== undefined && status !== occupation.pathStatus;
      if (statusChanged || added.length > 0 || removed.length > 0) {
        await recordAudit(tx, {
          actor: req.user!,
          kind: 'career',
          recordId: id,
          recordName: occupation.title,
          // A path written for the first time becomes a draft: that is an edit, not a return.
          action: statusChanged && status === 'approved' ? 'path approved' : statusChanged && occupation.pathStatus === 'approved' ? 'path returned to draft' : 'path edited',
          detail: {
            ...(statusChanged ? { changes: { pathStatus: [occupation.pathStatus, status] } } : {}),
            ...(added.length > 0 ? { skillsAdded: added.slice(0, 40) } : {}),
            ...(removed.length > 0 ? { skillsRemoved: removed.slice(0, 40) } : {}),
          },
        });
      }
    });
    res.json({ occupationId: id, skills: rows.length });
  } catch (error) {
    console.error('Error saving career path:', error);
    res.status(500).json({ error: 'Failed to save the career path' });
  }
});

// POST /api/occupations - Create occupation
router.post('/', async (req: Request, res: Response) => {
  try {
    const title = requiredText(req.body?.title);
    const description = optionalText(req.body?.description, 2000);
    // The same check a change to a career makes (changeCareer in lib/records.ts).
    const onetCode = optionalText(req.body?.onetCode, 20);
    if (!title) {
      res.status(400).json({ error: 'A career needs a title of up to 200 characters.' });
      return;
    }
    if (description === false) {
      res.status(400).json({ error: 'A description is text of up to 2,000 characters.' });
      return;
    }
    if (onetCode === false) {
      res.status(400).json({ error: 'An O*NET code is text of up to 20 characters.' });
      return;
    }
    // A home is optional: a domain's slug when given.
    const wantsHome = req.body?.home !== undefined && req.body?.home !== null && req.body?.home !== '';
    const home = wantsHome ? await findDomain(db, req.body.home) : null;
    if (wantsHome && !home) {
      res.status(400).json({ error: 'Choose a domain, or none.', field: 'home' });
      return;
    }

    const [existing] = await db
      .select({ id: occupations.id, name: occupations.title })
      .from(occupations)
      .where(sql`lower(${occupations.title}) = lower(${title})`)
      .limit(1);
    if (existing) {
      answerDuplicate(res, 'career', existing);
      return;
    }

    const result = await db.insert(occupations).values({
      title,
      description,
      onetCode,
      homeDomain: home?.slug ?? null,
    }).returning();

    await recordAdded('career', { id: result[0].id, name: result[0].title }, req.user!);
    const { homeDomain: _slug, ...added } = result[0];
    res.status(201).json({ ...added, home });
  } catch (error) {
    answerWriteError(res, error, 'career');
  }
});

// PUT /api/occupations/:id - Change a career: title, description, onetCode, aliases,
// `home` (a domain's slug, or null for none) and `leadsTo` (up to three career ids, in order).
router.put('/:id', async (req: Request, res: Response) => {
  try {
    res.json(await changeRecord('career', req.params.id, req.body, req.user!));
  } catch (error) {
    answerRefusal(res, error, 'career');
  }
});

// DELETE /api/occupations/:id - Delete a career. Refused (409) when one of
// its jobs has applications. Otherwise its path, the jobs nobody applied to
// and people's goals go with it; `removed` counts them.
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (await refuseDeleteWithJobs(res, 'career', req.params.id)) return;
    const gone = await removeRecord('career', req.params.id, req.user!);
    if (!gone) {
      res.status(404).json({ error: 'Occupation not found' });
      return;
    }
    res.json({ message: 'Occupation deleted', id: gone.id, removed: gone.removed });
  } catch (error) {
    console.error('Error deleting occupation:', error);
    res.status(500).json({ error: 'Failed to delete occupation' });
  }
});

export default router;
