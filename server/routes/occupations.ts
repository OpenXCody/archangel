import { Router, Request, Response } from 'express';
import { eq, gt, ilike, or, sql } from 'drizzle-orm';
import { db, occupations, occupationSkills, skills, factoryOccupations, factories } from '../db';

const router = Router();

// GET /api/occupations - List occupations with cursor-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { cursor, limit = '20', search } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);

    // Build where conditions
    const conditions = [];

    if (cursor) {
      conditions.push(gt(occupations.id, cursor as string));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(occupations.title, searchTerm),
          ilike(occupations.description, searchTerm)
        )
      );
    }

    // Query with skill and factory counts, sorted by most connections (factoryCount + skillCount) descending
    const result = await db
      .select({
        id: occupations.id,
        title: occupations.title,
        description: occupations.description,
        onetCode: occupations.onetCode,
        createdAt: occupations.createdAt,
        skillCount: sql<number>`(SELECT COUNT(*)::int FROM occupation_skills WHERE occupation_skills.occupation_id = occupations.id)`,
        factoryCount: sql<number>`(SELECT COUNT(*)::int FROM factory_occupations WHERE factory_occupations.occupation_id = occupations.id)`,
      })
      .from(occupations)
      .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined)
      .orderBy(
        sql`(SELECT COUNT(*) FROM factory_occupations WHERE factory_occupations.occupation_id = occupations.id) DESC`,
        sql`(SELECT COUNT(*) FROM occupation_skills WHERE occupation_skills.occupation_id = occupations.id) DESC`,
        occupations.title
      )
      .limit(limitNum + 1);

    // Check if there are more results
    const hasMore = result.length > limitNum;
    const data = hasMore ? result.slice(0, limitNum) : result;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    res.json({
      data,
      nextCursor,
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
      })
      .from(occupationSkills)
      .innerJoin(skills, eq(occupationSkills.skillId, skills.id))
      .where(eq(occupationSkills.occupationId, id));

    // Get factories hiring this role with headcount (include coordinates for map fly-to)
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
      .where(eq(factoryOccupations.occupationId, id));

    res.json({
      ...occupation,
      skills: occupationSkillsResult,
      factories: factoriesResult,
    });
  } catch (error) {
    console.error('Error fetching occupation:', error);
    res.status(500).json({ error: 'Failed to fetch occupation' });
  }
});

// POST /api/occupations - Create occupation
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
