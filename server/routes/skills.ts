import { Router, Request, Response } from 'express';
import { eq, gt, ilike, or, sql, and, ne } from 'drizzle-orm';
import { db, skills, occupationSkills, occupations } from '../db';

const router = Router();

// GET /api/skills - List skills with cursor-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { cursor, limit = '20', search, category } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);

    // Build where conditions
    const conditions = [];

    if (cursor) {
      conditions.push(gt(skills.id, cursor as string));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(skills.name, searchTerm),
          ilike(skills.category, searchTerm),
          ilike(skills.description, searchTerm)
        )
      );
    }

    if (category) {
      conditions.push(eq(skills.category, category as string));
    }

    // Query with occupation count, sorted by most connections (occupationCount) descending
    const result = await db
      .select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
        description: skills.description,
        createdAt: skills.createdAt,
        occupationCount: sql<number>`(SELECT COUNT(*)::int FROM occupation_skills WHERE occupation_skills.skill_id = skills.id)`,
      })
      .from(skills)
      .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined)
      .orderBy(sql`(SELECT COUNT(*) FROM occupation_skills WHERE occupation_skills.skill_id = skills.id) DESC`, skills.name)
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
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// GET /api/skills/:id - Get single skill with relationships
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get skill
    const skillResult = await db.select().from(skills).where(eq(skills.id, id));

    if (skillResult.length === 0) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    const skill = skillResult[0];

    // Get occupations requiring this skill with importance level
    const occupationsResult = await db
      .select({
        id: occupations.id,
        title: occupations.title,
        onetCode: occupations.onetCode,
        importance: occupationSkills.importance,
      })
      .from(occupationSkills)
      .innerJoin(occupations, eq(occupationSkills.occupationId, occupations.id))
      .where(eq(occupationSkills.skillId, id));

    // Get related skills (same category)
    let relatedSkills: { id: string; name: string; category: string | null }[] = [];
    if (skill.category) {
      relatedSkills = await db
        .select({
          id: skills.id,
          name: skills.name,
          category: skills.category,
        })
        .from(skills)
        .where(and(eq(skills.category, skill.category), ne(skills.id, id)))
        .limit(10);
    }

    res.json({
      ...skill,
      occupations: occupationsResult,
      relatedSkills,
    });
  } catch (error) {
    console.error('Error fetching skill:', error);
    res.status(500).json({ error: 'Failed to fetch skill' });
  }
});

// POST /api/skills - Create skill
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, category, description } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const result = await db.insert(skills).values({
      name,
      category,
      description,
    }).returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

// PUT /api/skills/:id - Update skill
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, category, description } = req.body;

    const result = await db.update(skills)
      .set({
        name,
        category,
        description,
      })
      .where(eq(skills.id, id))
      .returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

// DELETE /api/skills/:id - Delete skill
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.delete(skills).where(eq(skills.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    res.json({ message: 'Skill deleted', id });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});

export default router;
