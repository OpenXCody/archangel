import { Router, Request, Response } from 'express';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { db, occupations, occupationSkills, skills, factoryOccupations, factories, jobs } from '../db/index.js';
import { uuidParam } from '../middleware/validateUuid.js';
import { factoryInScope } from '../lib/scope.js';
import { listOpenJobs } from '../lib/openJobs.js';

const router = Router();
router.param('id', uuidParam);

// GET /api/occupations - List occupations with offset-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, order = 'asc' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    // Build where conditions
    const conditions = [];

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(occupations.title, searchTerm),
          ilike(occupations.description, searchTerm)
        )
      );
    }

    // Get total count
    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(occupations)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Build order by clause
    // Careers that have a path come first, so the list opens on the ones with
    // something to follow; within each group, by title.
    const hasPathFirst = sql`(${occupations.pathStatus} IS NULL) ASC`;
    const orderByClause = order === 'desc'
      ? sql`${hasPathFirst}, ${occupations.title} DESC`
      : sql`${hasPathFirst}, ${occupations.title} ASC`;

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
    });
  } catch (error) {
    console.error('Error fetching occupation:', error);
    res.status(500).json({ error: 'Failed to fetch occupation' });
  }
});

// POST /api/occupations - Create occupation
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

router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, description, onetCode } = req.body;

    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const result = await db.insert(occupations).values({
      title,
      description,
      onetCode,
    }).returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating occupation:', error);
    res.status(500).json({ error: 'Failed to create occupation' });
  }
});

// PUT /api/occupations/:id - Update occupation
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, onetCode } = req.body;

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
    console.error('Error updating occupation:', error);
    res.status(500).json({ error: 'Failed to update occupation' });
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
