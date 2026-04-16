import { Router, Request, Response } from 'express';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { db, schools, programs } from '../db';

const router = Router();

// GET /api/schools - List schools with offset-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, state, schoolType, order = 'asc' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    // Build where conditions
    const conditions = [];

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(schools.name, searchTerm),
          ilike(schools.description, searchTerm)
        )
      );
    }

    if (state) {
      conditions.push(eq(schools.state, state as string));
    }

    if (schoolType) {
      conditions.push(eq(schools.schoolType, schoolType as string));
    }

    // Get total count
    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schools)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Build order by clause
    const orderByClause = order === 'desc'
      ? sql`${schools.name} DESC`
      : sql`${schools.name} ASC`;

    // Query with program count
    const result = await db
      .select({
        id: schools.id,
        name: schools.name,
        description: schools.description,
        state: schools.state,
        schoolType: schools.schoolType,
        headquartersLat: schools.headquartersLat,
        headquartersLng: schools.headquartersLng,
        createdAt: schools.createdAt,
        programCount: sql<number>`(SELECT COUNT(*)::int FROM programs WHERE programs.school_id = schools.id)`,
      })
      .from(schools)
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
    console.error('Error fetching schools:', error);
    res.status(500).json({ error: 'Failed to fetch schools' });
  }
});

// GET /api/schools/:id - Get single school with programs
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get school
    const schoolResult = await db.select().from(schools).where(eq(schools.id, id));

    if (schoolResult.length === 0) {
      res.status(404).json({ error: 'School not found' });
      return;
    }

    const school = schoolResult[0];

    // Get programs offered by this school
    const programsResult = await db
      .select({
        id: programs.id,
        title: programs.title,
        credentialType: programs.credentialType,
        cipCode: programs.cipCode,
        durationHours: programs.durationHours,
        skillCount: sql<number>`(SELECT COUNT(*)::int FROM program_skills WHERE program_skills.program_id = programs.id)`,
      })
      .from(programs)
      .where(eq(programs.schoolId, id));

    res.json({
      ...school,
      programs: programsResult,
    });
  } catch (error) {
    console.error('Error fetching school:', error);
    res.status(500).json({ error: 'Failed to fetch school' });
  }
});

// POST /api/schools - Create school
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, headquartersLat, headquartersLng, state, stateId, schoolType } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const result = await db.insert(schools).values({
      name,
      description,
      headquartersLat,
      headquartersLng,
      state,
      stateId,
      schoolType,
    }).returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating school:', error);
    res.status(500).json({ error: 'Failed to create school' });
  }
});

// PUT /api/schools/:id - Update school
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, headquartersLat, headquartersLng, state, stateId, schoolType } = req.body;

    const result = await db.update(schools)
      .set({
        name,
        description,
        headquartersLat,
        headquartersLng,
        state,
        stateId,
        schoolType,
        updatedAt: new Date(),
      })
      .where(eq(schools.id, id))
      .returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'School not found' });
      return;
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating school:', error);
    res.status(500).json({ error: 'Failed to update school' });
  }
});

// DELETE /api/schools/:id - Delete school
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.delete(schools).where(eq(schools.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'School not found' });
      return;
    }

    res.json({ message: 'School deleted', id });
  } catch (error) {
    console.error('Error deleting school:', error);
    res.status(500).json({ error: 'Failed to delete school' });
  }
});

export default router;
