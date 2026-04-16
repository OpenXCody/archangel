import { Router, Request, Response } from 'express';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { db, persons, personSkillRefs, companies } from '../db';

const router = Router();

// GET /api/persons - List persons with offset-based pagination
// Note: No create/update routes - data lands via import pipeline
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, state, employer, order = 'asc' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    // Build where conditions
    const conditions = [];

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(persons.fullName, searchTerm),
          ilike(persons.currentTitle, searchTerm)
        )
      );
    }

    if (state) {
      conditions.push(eq(persons.locationState, state as string));
    }

    if (employer) {
      conditions.push(eq(persons.currentEmployerId, employer as string));
    }

    // Get total count
    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(persons)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Build order by clause
    const orderByClause = order === 'desc'
      ? sql`${persons.fullName} DESC`
      : sql`${persons.fullName} ASC`;

    // Query with skill count and employer name
    const result = await db
      .select({
        id: persons.id,
        fullName: persons.fullName,
        currentTitle: persons.currentTitle,
        currentEmployerId: persons.currentEmployerId,
        employerName: sql<string>`(SELECT name FROM companies WHERE companies.id = persons.current_employer_id)`,
        locationState: persons.locationState,
        createdAt: persons.createdAt,
        skillCount: sql<number>`(SELECT COUNT(DISTINCT skill_id)::int FROM person_skill_refs WHERE person_skill_refs.person_id = persons.id)`,
      })
      .from(persons)
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
    console.error('Error fetching persons:', error);
    res.status(500).json({ error: 'Failed to fetch persons' });
  }
});

// GET /api/persons/:id - Get single person with proficiencies
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get person
    const personResult = await db.select().from(persons).where(eq(persons.id, id));

    if (personResult.length === 0) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }

    const person = personResult[0];

    // Get current employer info (if any)
    let employer = null;
    if (person.currentEmployerId) {
      const employerResult = await db
        .select({
          id: companies.id,
          name: companies.name,
          industry: companies.industry,
        })
        .from(companies)
        .where(eq(companies.id, person.currentEmployerId));
      employer = employerResult[0] || null;
    }

    // Get proficiencies (skill + optional machine/material refs)
    const proficienciesResult = await db
      .select({
        id: personSkillRefs.id,
        skillId: personSkillRefs.skillId,
        skillName: sql<string>`(SELECT name FROM skills WHERE skills.id = person_skill_refs.skill_id)`,
        machineRefId: personSkillRefs.machineRefId,
        machineRefName: sql<string>`(SELECT name FROM refs WHERE refs.id = person_skill_refs.machine_ref_id)`,
        materialRefId: personSkillRefs.materialRefId,
        materialRefName: sql<string>`(SELECT name FROM refs WHERE refs.id = person_skill_refs.material_ref_id)`,
        level: personSkillRefs.level,
        yearsExperience: personSkillRefs.yearsExperience,
        verifiedAt: personSkillRefs.verifiedAt,
      })
      .from(personSkillRefs)
      .where(eq(personSkillRefs.personId, id));

    res.json({
      ...person,
      employer,
      proficiencies: proficienciesResult,
    });
  } catch (error) {
    console.error('Error fetching person:', error);
    res.status(500).json({ error: 'Failed to fetch person' });
  }
});

export default router;
