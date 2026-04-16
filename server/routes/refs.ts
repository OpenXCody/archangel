import { Router, Request, Response } from 'express';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { db, refs, refAliases, skillRefs, skills } from '../db';

const router = Router();

// GET /api/refs - List refs with offset-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, type, order = 'asc' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    // Build where conditions
    const conditions = [];

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(refs.name, searchTerm),
          ilike(refs.description, searchTerm),
          ilike(refs.manufacturer, searchTerm)
        )
      );
    }

    if (type) {
      conditions.push(eq(refs.type, type as 'material' | 'machine' | 'standard' | 'process' | 'certification'));
    }

    // Get total count
    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(refs)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Build order by clause
    const orderByClause = order === 'desc'
      ? sql`${refs.name} DESC`
      : sql`${refs.name} ASC`;

    // Query with skill count
    const result = await db
      .select({
        id: refs.id,
        type: refs.type,
        name: refs.name,
        description: refs.description,
        manufacturer: refs.manufacturer,
        tags: refs.tags,
        createdAt: refs.createdAt,
        skillCount: sql<number>`(SELECT COUNT(*)::int FROM skill_refs WHERE skill_refs.ref_id = refs.id)`,
      })
      .from(refs)
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
    console.error('Error fetching refs:', error);
    res.status(500).json({ error: 'Failed to fetch refs' });
  }
});

// GET /api/refs/:id - Get single ref with relationships
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get ref
    const refResult = await db.select().from(refs).where(eq(refs.id, id));

    if (refResult.length === 0) {
      res.status(404).json({ error: 'Ref not found' });
      return;
    }

    const ref = refResult[0];

    // Get skills that reference this element
    const skillsResult = await db
      .select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
      })
      .from(skillRefs)
      .innerJoin(skills, eq(skillRefs.skillId, skills.id))
      .where(eq(skillRefs.refId, id));

    // Get aliases
    const aliasesResult = await db
      .select({
        id: refAliases.id,
        aliasText: refAliases.aliasText,
      })
      .from(refAliases)
      .where(eq(refAliases.canonicalRefId, id));

    res.json({
      ...ref,
      skills: skillsResult,
      aliases: aliasesResult,
    });
  } catch (error) {
    console.error('Error fetching ref:', error);
    res.status(500).json({ error: 'Failed to fetch ref' });
  }
});

// POST /api/refs - Create ref
router.post('/', async (req: Request, res: Response) => {
  try {
    const { type, name, description, properties, manufacturer, tags } = req.body;

    if (!type || !name) {
      res.status(400).json({ error: 'Type and name are required' });
      return;
    }

    const result = await db.insert(refs).values({
      type,
      name,
      description,
      properties,
      manufacturer,
      tags,
    }).returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating ref:', error);
    res.status(500).json({ error: 'Failed to create ref' });
  }
});

// PUT /api/refs/:id - Update ref
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type, name, description, properties, manufacturer, tags } = req.body;

    const result = await db.update(refs)
      .set({
        type,
        name,
        description,
        properties,
        manufacturer,
        tags,
        updatedAt: new Date(),
      })
      .where(eq(refs.id, id))
      .returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Ref not found' });
      return;
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating ref:', error);
    res.status(500).json({ error: 'Failed to update ref' });
  }
});

// DELETE /api/refs/:id - Delete ref
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.delete(refs).where(eq(refs.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Ref not found' });
      return;
    }

    res.json({ message: 'Ref deleted', id });
  } catch (error) {
    console.error('Error deleting ref:', error);
    res.status(500).json({ error: 'Failed to delete ref' });
  }
});

export default router;
