import { Router, Request, Response } from 'express';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, occupations, occupationSkills, skills, factoryOccupations, factories, jobs } from '../db/index.js';
import { uuidParam } from '../middleware/validateUuid.js';
import { factoryInScope } from '../lib/scope.js';
import { listOpenJobs } from '../lib/openJobs.js';
import { pageLimit, pageOffset } from '../lib/paging.js';
import { answerDuplicate, answerWriteError, optionalName, optionalText, requiredText } from '../lib/writes.js';
import { careerMatch, careerNearMiss, readCareerTerm, withoutLevel, type CareerMatch } from '../lib/careerSearch.js';

const router = Router();
router.param('id', uuidParam);

// GET /api/occupations - List occupations with offset-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, order = 'asc' } = req.query;
    const limitNum = pageLimit(limit, 20, 100);
    const offsetNum = pageOffset(offset);

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
      const [row] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(occupations);
      total = row?.count ?? 0;
    }
    for (const candidate of tries) {
      const [row] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(occupations).where(candidate.where);
      match = candidate;
      total = row?.count ?? 0;
      if (total > 0) break;
    }
    const whereClause = match?.where;

    // Build order by clause
    // Careers that have a path come first, so the list opens on the ones with
    // something to follow; within each group, by title.
    const hasPathFirst = sql`(${occupations.pathStatus} IS NULL) ASC`;
    // By the letters, whatever their case ("ALD …" is not ahead of "Additive …").
    const byTitle = order === 'desc' ? sql`lower(${occupations.title}) DESC` : sql`lower(${occupations.title}) ASC`;
    // With a search, the closest match first; among equals, careers with a
    // path, then the shorter title ("Machinist" before "Casting CNC Machinist").
    const orderByClause = match
      ? sql`${match.relevance}, ${hasPathFirst}, length(${occupations.title}), ${byTitle}`
      : sql`${hasPathFirst}, ${byTitle}`;

    // Query with skill and factory counts (in-scope factories only)
    const result = await db
      .select({
        id: occupations.id,
        title: occupations.title,
        description: occupations.description,
        onetCode: occupations.onetCode,
        pathStatus: occupations.pathStatus,
        createdAt: occupations.createdAt,
        skillCount: sql<number>`(SELECT COUNT(*)::int FROM occupation_skills WHERE occupation_skills.occupation_id = occupations.id)`,
        // Skills at each stage of the path; null when the career has no staged skills.
        stageCounts: sql<[number, number, number] | null>`(
          SELECT CASE WHEN COUNT(*) FILTER (WHERE os.stage IN (1, 2, 3)) = 0 THEN NULL ELSE json_build_array(
            COUNT(*) FILTER (WHERE os.stage = 1), COUNT(*) FILTER (WHERE os.stage = 2), COUNT(*) FILTER (WHERE os.stage = 3)) END
          FROM occupation_skills os WHERE os.occupation_id = occupations.id)`,
        factoryCount: sql<number>`(SELECT COUNT(*)::int FROM factory_occupations fo INNER JOIN factories f ON f.id = fo.factory_id WHERE fo.occupation_id = occupations.id AND ${factoryInScope('f')})`,
      })
      .from(occupations)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limitNum)
      .offset(offsetNum);

    const hasMore = offsetNum + result.length < total;

    res.json({
      data: result,
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

    const occupation = occupationResult[0];

    // Get required skills with importance level
    const occupationSkillsResult = await db
      .select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
        importance: occupationSkills.importance,
        // 1 Introduction, 2 Fundamentals, 3 Advanced; null until someone sets it.
        stage: occupationSkills.stage,
      })
      .from(occupationSkills)
      .innerJoin(skills, eq(occupationSkills.skillId, skills.id))
      .where(eq(occupationSkills.occupationId, id))
      .orderBy(sql`${occupationSkills.stage} ASC NULLS LAST`, skills.name);

    // Industries where this work is typically done, with how many in-scope
    // factories each has and the states with the most of them.
    const industriesResult = Array.from(
      (await db.execute(sql`
        SELECT io.industry, io.common, COUNT(f.id)::int AS factory_count
        FROM industry_occupations io
        LEFT JOIN factories f ON f.primary_naics_description = io.industry AND ${factoryInScope('f')}
        WHERE io.occupation_id = ${id}
        GROUP BY io.industry, io.common, io.rank
        ORDER BY io.common ASC, factory_count DESC, io.industry ASC
      `)) as Iterable<Record<string, unknown>>
    ).map((r) => ({ name: String(r.industry), common: Boolean(r.common), factoryCount: Number(r.factory_count) || 0 }));
    // A career found everywhere is not pinned to industries; one that is, lists them.
    const ownIndustries = industriesResult.filter((i) => !i.common);
    const everywhere = ownIndustries.length === 0 && industriesResult.length > 0;
    // Listed for some industries and present in all the others too.
    const elsewhereToo = ownIndustries.length > 0 && industriesResult.some((i) => i.common);
    const topStates = everywhere || ownIndustries.length === 0
      ? []
      : Array.from(
          (await db.execute(sql`
            SELECT f.state AS code, COUNT(*)::int AS factory_count
            FROM factories f
            INNER JOIN industry_occupations io ON io.industry = f.primary_naics_description
            WHERE io.occupation_id = ${id} AND io.common = false AND ${factoryInScope('f')} AND f.state ~ '^[A-Z]{2}$'
            GROUP BY f.state ORDER BY factory_count DESC, f.state ASC LIMIT 6
          `)) as Iterable<Record<string, unknown>>
        ).map((r) => ({ code: String(r.code), factoryCount: Number(r.factory_count) || 0 }));

    // Get in-scope factories hiring this role with headcount (include coordinates for map fly-to)
    const factoriesResult = await db
      .select({
        id: factories.id,
        name: factories.name,
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

// PUT /api/occupations/:id/path - set which skills a career needs and the
// stage of each (1 Introduction, 2 Fundamentals, 3 Advanced, or null).
// Body: { skills: [{ skillId, stage }], replace?: boolean, status?: 'draft' | 'approved' }.
// With `replace`, skills not listed are removed from the career. `status` records
// whether a person has reviewed the path. Admin-only (a write).
router.put('/:id/path', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const items: unknown = req.body?.skills;
    if (!Array.isArray(items) || items.length > 500) {
      res.status(400).json({ error: 'skills must be a list of { skillId, stage }.' });
      return;
    }
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const rows: { occupationId: string; skillId: string; stage: number | null }[] = [];
    for (const item of items as { skillId?: unknown; stage?: unknown }[]) {
      const stage = item?.stage ?? null;
      if (typeof item?.skillId !== 'string' || !UUID.test(item.skillId) || ![null, 1, 2, 3].includes(stage as number | null)) {
        res.status(400).json({ error: 'Each entry needs a skillId and a stage of 1, 2, 3 or null.' });
        return;
      }
      rows.push({ occupationId: id, skillId: item.skillId, stage: stage as number | null });
    }
    const [occupation] = await db.select({ id: occupations.id }).from(occupations).where(eq(occupations.id, id));
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
      if (status !== undefined) {
        await tx.update(occupations).set({ pathStatus: status }).where(eq(occupations.id, id));
      }
      if (req.body?.replace === true) {
        await tx.delete(occupationSkills).where(eq(occupationSkills.occupationId, id));
      }
      for (const row of rows) {
        await tx
          .insert(occupationSkills)
          .values(row)
          .onConflictDoUpdate({
            target: [occupationSkills.occupationId, occupationSkills.skillId],
            set: { stage: row.stage },
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
    const { onetCode } = req.body;
    const title = requiredText(req.body?.title);
    const description = optionalText(req.body?.description, 2000);
    if (!title) {
      res.status(400).json({ error: 'A career needs a title of up to 200 characters.' });
      return;
    }
    if (description === false) {
      res.status(400).json({ error: 'A description is text of up to 2,000 characters.' });
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
    }).returning();

    res.status(201).json(result[0]);
  } catch (error) {
    answerWriteError(res, error, 'career');
  }
});

// PUT /api/occupations/:id - Update occupation
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { description, onetCode } = req.body;
    const title = optionalName(req.body?.title);
    if (title === false) {
      res.status(400).json({ error: 'A career needs a title of up to 200 characters.' });
      return;
    }
    if (title === undefined && description === undefined && onetCode === undefined) {
      res.status(400).json({ error: 'Nothing to change.' });
      return;
    }

    const result = await db.update(occupations)
      .set({
        title,
        description,
        onetCode,
      })
      .where(eq(occupations.id, id))
      .returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Occupation not found' });
      return;
    }

    res.json(result[0]);
  } catch (error) {
    answerWriteError(res, error, 'career');
  }
});

// DELETE /api/occupations/:id - Delete occupation
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.delete(occupations).where(eq(occupations.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Occupation not found' });
      return;
    }

    res.json({ message: 'Occupation deleted', id });
  } catch (error) {
    console.error('Error deleting occupation:', error);
    res.status(500).json({ error: 'Failed to delete occupation' });
  }
});

export default router;
