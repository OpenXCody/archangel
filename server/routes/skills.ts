import { Router, Request, Response } from 'express';
import { eq, ilike, or, sql, and, ne, isNull } from 'drizzle-orm';
import { db, skills, occupationSkills, occupations, skillRefs, refs, programSkills, programs } from '../db/index.js';
import { uuidParam, uuidQuery } from '../middleware/validateUuid.js';
import { programInScope } from '../lib/scope.js';
import { pageLimit, pageOffset } from '../lib/paging.js';
import { answerWriteError, optionalName, requiredText } from '../lib/writes.js';

const router = Router();
router.param('id', uuidParam);
router.use(uuidQuery('parent'));

// GET /api/skills - List skills with offset-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, category, order = 'asc', parent, rootOnly } = req.query;
    const limitNum = pageLimit(limit, 20, 100);
    const offsetNum = pageOffset(offset);

    // Build where conditions
    const conditions = [];

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

    // Filter by parent skill (for tree navigation)
    if (parent) {
      conditions.push(eq(skills.parentSkillId, parent as string));
    }

    // Filter to only root skills (no parent)
    if (rootOnly === 'true') {
      conditions.push(isNull(skills.parentSkillId));
    }

    // Get total count
    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(skills)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Build order by clause
    const orderByClause = order === 'desc'
      ? sql`${skills.name} DESC`
      : sql`${skills.name} ASC`;

    // Query with occupation count, program count, and tree info
    const result = await db
      .select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
        description: skills.description,
        parentSkillId: skills.parentSkillId,
        createdAt: skills.createdAt,
        occupationCount: sql<number>`(SELECT COUNT(*)::int FROM occupation_skills WHERE occupation_skills.skill_id = skills.id)`,
        programCount: sql<number>`(SELECT COUNT(*)::int FROM program_skills ps INNER JOIN programs p ON p.id = ps.program_id WHERE ps.skill_id = skills.id AND ${programInScope('p')})`,
        childCount: sql<number>`(SELECT COUNT(*)::int FROM skills AS children WHERE children.parent_skill_id = skills.id)`,
      })
      .from(skills)
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

    // Get parent skill (if any)
    let parent = null;
    if (skill.parentSkillId) {
      const parentResult = await db
        .select({
          id: skills.id,
          name: skills.name,
          category: skills.category,
        })
        .from(skills)
        .where(eq(skills.id, skill.parentSkillId));
      parent = parentResult[0] || null;
    }

    // Get child skills (direct children only)
    const children = await db
      .select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
        childCount: sql<number>`(SELECT COUNT(*)::int FROM skills AS grandchildren WHERE grandchildren.parent_skill_id = skills.id)`,
      })
      .from(skills)
      .where(eq(skills.parentSkillId, id));

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

    // Get in-scope programs teaching this skill
    const programsResult = await db
      .select({
        id: programs.id,
        title: programs.title,
        credentialType: programs.credentialType,
        importance: programSkills.importance,
      })
      .from(programSkills)
      .innerJoin(programs, eq(programSkills.programId, programs.id))
      .where(and(eq(programSkills.skillId, id), programInScope()));

    // Get referenced elements (refs) grouped by type
    const refsResult = await db
      .select({
        id: refs.id,
        name: refs.name,
        type: refs.type,
        manufacturer: refs.manufacturer,
      })
      .from(skillRefs)
      .innerJoin(refs, eq(skillRefs.refId, refs.id))
      .where(eq(skillRefs.skillId, id));

    // Group refs by type
    const refsByType: Record<string, typeof refsResult> = {};
    for (const ref of refsResult) {
      if (!refsByType[ref.type]) {
        refsByType[ref.type] = [];
      }
      refsByType[ref.type].push(ref);
    }

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
      parent,
      children,
      occupations: occupationsResult,
      programs: programsResult,
      refs: refsByType,
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
    const { category, description } = req.body;
    const name = requiredText(req.body?.name);
    if (!name) {
      res.status(400).json({ error: 'A skill needs a name of up to 200 characters.' });
      return;
    }

    const result = await db.insert(skills).values({
      name,
      category,
      description,
    }).returning();

    res.status(201).json(result[0]);
  } catch (error) {
    answerWriteError(res, error, 'skill');
  }
});

// PUT /api/skills/:id - Update skill
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { category, description } = req.body;
    const name = optionalName(req.body?.name);
    if (name === false) {
      res.status(400).json({ error: 'A skill needs a name of up to 200 characters.' });
      return;
    }

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
    answerWriteError(res, error, 'skill');
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
