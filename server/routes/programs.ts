import { Router, Request, Response } from 'express';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { db, programs, programSkills, skills, schools, programAliases } from '../db';

const router = Router();

// GET /api/programs - List programs with offset-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, school, cipCode, credentialType, isOpenSource, order = 'asc' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    // Build where conditions
    const conditions = [];

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(programs.title, searchTerm),
          ilike(programs.description, searchTerm)
        )
      );
    }

    if (school) {
      conditions.push(eq(programs.schoolId, school as string));
    }

    if (cipCode) {
      conditions.push(eq(programs.cipCode, cipCode as string));
    }

    if (credentialType) {
      conditions.push(eq(programs.credentialType, credentialType as string));
    }

    if (isOpenSource === 'true') {
      conditions.push(eq(programs.isOpenSource, true));
    }

    // Get total count
    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(programs)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Build order by clause
    const orderByClause = order === 'desc'
      ? sql`${programs.title} DESC`
      : sql`${programs.title} ASC`;

    // Query with skill count and school name
    const result = await db
      .select({
        id: programs.id,
        title: programs.title,
        description: programs.description,
        schoolId: programs.schoolId,
        schoolName: sql<string>`(SELECT name FROM schools WHERE schools.id = programs.school_id)`,
        cipCode: programs.cipCode,
        credentialType: programs.credentialType,
        durationHours: programs.durationHours,
        isOpenSource: programs.isOpenSource,
        createdAt: programs.createdAt,
        skillCount: sql<number>`(SELECT COUNT(*)::int FROM program_skills WHERE program_skills.program_id = programs.id)`,
      })
      .from(programs)
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
    console.error('Error fetching programs:', error);
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

// GET /api/programs/:id - Get single program with relationships
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get program
    const programResult = await db.select().from(programs).where(eq(programs.id, id));

    if (programResult.length === 0) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }

    const program = programResult[0];

    // Get school info (if any)
    let school = null;
    if (program.schoolId) {
      const schoolResult = await db
        .select({
          id: schools.id,
          name: schools.name,
          schoolType: schools.schoolType,
          state: schools.state,
        })
        .from(schools)
        .where(eq(schools.id, program.schoolId));
      school = schoolResult[0] || null;
    }

    // Get skills taught by this program
    const skillsResult = await db
      .select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
        importance: programSkills.importance,
      })
      .from(programSkills)
      .innerJoin(skills, eq(programSkills.skillId, skills.id))
      .where(eq(programSkills.programId, id));

    // Get aliases
    const aliasesResult = await db
      .select({
        id: programAliases.id,
        aliasText: programAliases.aliasText,
      })
      .from(programAliases)
      .where(eq(programAliases.canonicalProgramId, id));

    res.json({
      ...program,
      school,
      skills: skillsResult,
      aliases: aliasesResult,
    });
  } catch (error) {
    console.error('Error fetching program:', error);
    res.status(500).json({ error: 'Failed to fetch program' });
  }
});

// POST /api/programs - Create program
router.post('/', async (req: Request, res: Response) => {
  try {
    const { schoolId, title, description, cipCode, credentialType, durationHours, isOpenSource, curriculumUrl } = req.body;

    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const result = await db.insert(programs).values({
      schoolId,
      title,
      description,
      cipCode,
      credentialType,
      durationHours,
      isOpenSource,
      curriculumUrl,
    }).returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating program:', error);
    res.status(500).json({ error: 'Failed to create program' });
  }
});

// PUT /api/programs/:id - Update program
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { schoolId, title, description, cipCode, credentialType, durationHours, isOpenSource, curriculumUrl } = req.body;

    const result = await db.update(programs)
      .set({
        schoolId,
        title,
        description,
        cipCode,
        credentialType,
        durationHours,
        isOpenSource,
        curriculumUrl,
        updatedAt: new Date(),
      })
      .where(eq(programs.id, id))
      .returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating program:', error);
    res.status(500).json({ error: 'Failed to update program' });
  }
});

// DELETE /api/programs/:id - Delete program
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.delete(programs).where(eq(programs.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }

    res.json({ message: 'Program deleted', id });
  } catch (error) {
    console.error('Error deleting program:', error);
    res.status(500).json({ error: 'Failed to delete program' });
  }
});

export default router;
