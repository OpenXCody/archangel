import { Router, Request, Response } from 'express';
import { eq, ilike, or, sql, and, isNull } from 'drizzle-orm';
import { db, skills, occupationSkills, occupations, jobs } from '../db/index.js';
import { uuidParam, uuidQuery } from '../middleware/validateUuid.js';
import { pageLimit, pageOffset } from '../lib/paging.js';
import { answerDuplicate, answerWriteError, optionalText, requiredText } from '../lib/writes.js';
import { answerRefusal, changeRecord, recordAdded, removeRecord, toolList } from '../lib/records.js';
import { listOpenJobs } from '../lib/openJobs.js';

const router = Router();
router.param('id', uuidParam);
router.use(uuidQuery('parent'));

// These name the table outright: in a select list a column reference is
// written bare, and inside a subquery "id" could then mean another table's.
/** How many careers list the skill. */
const careerCount = sql<number>`(SELECT COUNT(*)::int FROM occupation_skills WHERE occupation_skills.skill_id = skills.id)`;
const onACareer = sql`EXISTS (SELECT 1 FROM occupation_skills WHERE occupation_skills.skill_id = skills.id)`;

/** A typed term as a LIKE pattern, with its own wildcards made literal. */
const containing = (term: string) => `%${term.replace(/[\\%_]/g, '\\$&')}%`;

// GET /api/skills - The skills list.
//   Browsing (no `search`): only skills a career uses, the ones most careers
//   use first; `sort=name` puts them in name order (`order=desc` reverses it).
//   Searching (`search`): by name, by another name it is known by
//   (skill_aliases) and by the tools it is done with; the closest names first.
//   A search also finds a skill no career uses yet, so one just added can be
//   picked for a job or a person's list.
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', category, sort, order = 'asc', parent, rootOnly } = req.query;
    const limitNum = pageLimit(limit, 20, 100);
    const offsetNum = pageOffset(offset);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';

    const conditions = [];
    let orderByClause;

    if (search) {
      const pattern = containing(search);
      // Another name or a tool matches from the start of a word: "tig" finds
      // "Orbital TIG Welding", not "Deviation Investigation".
      const starts = pattern.slice(1);
      const midWord = `% ${starts}`;
      const alias = sql`EXISTS (SELECT 1 FROM skill_aliases a WHERE a.canonical_skill_id = skills.id AND (a.alias_text ILIKE ${starts} OR a.alias_text ILIKE ${midWord}))`;
      const tool = sql`EXISTS (SELECT 1 FROM unnest(skills.tools) AS tool WHERE tool ILIKE ${starts} OR tool ILIKE ${midWord})`;
      conditions.push(or(ilike(skills.name, pattern), alias, tool));
      orderByClause = sql`CASE
          WHEN lower(${skills.name}) = lower(${search}) THEN 0
          WHEN ${skills.name} ILIKE ${starts} THEN 1
          WHEN ${skills.name} ILIKE ${pattern} THEN 2
          WHEN ${alias} THEN 3
          ELSE 4 END, ${careerCount} DESC, ${skills.name} ASC`;
    } else {
      conditions.push(onACareer);
      orderByClause =
        sort === 'name'
          ? order === 'desc' ? sql`${skills.name} DESC` : sql`${skills.name} ASC`
          : sql`${careerCount} DESC, ${skills.name} ASC`;
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

    const whereClause = and(...conditions);
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(skills)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    const result = await db
      .select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
        description: skills.description,
        parentSkillId: skills.parentSkillId,
        createdAt: skills.createdAt,
        occupationCount: careerCount,
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

const INDUSTRIES_SHOWN = 8;
const RELATED_SHOWN = 8;
const JOBS_SHOWN = 12;

// GET /api/skills/:id - Everything the skill's page shows, in one answer:
// what it is, how it is learned, what it is done with, the careers that use
// it with the stage of each, the industries those careers work in, the skills
// that most often share a path with it, and the open jobs that ask for it.
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [skill] = await db.select().from(skills).where(eq(skills.id, id));
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    const [careers, industryRows, relatedRows, openJobs] = await Promise.all([
      db
        .select({
          id: occupations.id,
          title: occupations.title,
          onetCode: occupations.onetCode,
          importance: occupationSkills.importance,
          stage: occupationSkills.stage,
        })
        .from(occupationSkills)
        .innerJoin(occupations, eq(occupationSkills.occupationId, occupations.id))
        .where(eq(occupationSkills.skillId, id))
        .orderBy(sql`${occupationSkills.stage} ASC NULLS LAST`, occupations.title),
      // The industries its careers are typical of (industry_occupations),
      // the ones with most of its careers first. `common` careers are found
      // in plants of every industry and so point at none.
      db.execute(sql`
        SELECT io.industry, io.common, COUNT(DISTINCT io.occupation_id)::int AS career_count
        FROM occupation_skills os
        INNER JOIN industry_occupations io ON io.occupation_id = os.occupation_id
        WHERE os.skill_id = ${id}
        GROUP BY io.industry, io.common
        ORDER BY career_count DESC, io.industry ASC
      `),
      // Skills that go with it: those that share its careers' paths, ranked by
      // how much of the two skills' careers overlap, so a companion found on
      // the same few paths comes before one that is simply on every path.
      db.execute(sql`
        WITH mine AS (SELECT occupation_id FROM occupation_skills WHERE skill_id = ${id}),
        shared AS (
          SELECT os.skill_id, COUNT(*)::int AS together
          FROM occupation_skills os INNER JOIN mine ON mine.occupation_id = os.occupation_id
          WHERE os.skill_id <> ${id}
          GROUP BY os.skill_id
        )
        SELECT s.id, s.name, s.category, shared.together
        FROM shared
        INNER JOIN skills s ON s.id = shared.skill_id
        CROSS JOIN LATERAL (SELECT COUNT(*)::int AS n FROM occupation_skills t WHERE t.skill_id = s.id) theirs
        ORDER BY shared.together::float / ((SELECT COUNT(*) FROM mine) + theirs.n - shared.together) DESC,
                 shared.together DESC, s.name ASC
        LIMIT ${RELATED_SHOWN}
      `),
      listOpenJobs(sql`EXISTS (SELECT 1 FROM job_skills js WHERE js.job_id = ${jobs.id} AND js.skill_id = ${id})`, JOBS_SHOWN),
    ]);

    const rows = (result: unknown): Record<string, unknown>[] => Array.from(result as Iterable<Record<string, unknown>>);
    const industries = rows(industryRows);
    const own = industries.filter((r) => !r.common);

    res.json({
      ...skill,
      occupations: careers,
      industries: own.slice(0, INDUSTRIES_SHOWN).map((r) => ({ name: String(r.industry), careerCount: Number(r.career_count) || 0 })),
      // Used only by careers found in plants of every industry.
      everywhere: own.length === 0 && industries.length > 0,
      relatedSkills: rows(relatedRows).map((r) => ({ id: String(r.id), name: String(r.name), category: r.category === null ? null : String(r.category) })),
      jobs: openJobs,
    });
  } catch (error) {
    console.error('Error fetching skill:', error);
    res.status(500).json({ error: 'Failed to fetch skill' });
  }
});

// POST /api/skills - Create skill
router.post('/', async (req: Request, res: Response) => {
  try {
    const name = requiredText(req.body?.name);
    const category = optionalText(req.body?.category, 80);
    const description = optionalText(req.body?.description, 2000);
    const howLearned = optionalText(req.body?.howLearned, 1000);
    const tools = toolList(req.body?.tools);
    if (!name) {
      res.status(400).json({ error: 'A skill needs a name of up to 200 characters.' });
      return;
    }
    if (category === false || description === false) {
      res.status(400).json({ error: 'A category is text of up to 80 characters and a description of up to 2,000.' });
      return;
    }
    if (howLearned === false || tools === false) {
      res.status(400).json({ error: 'How it is learned is text of up to 1,000 characters, and what it is done with a list of up to 12 short names.' });
      return;
    }

    const [existing] = await db
      .select({ id: skills.id, name: skills.name })
      .from(skills)
      .where(sql`lower(${skills.name}) = lower(${name})`)
      .limit(1);
    if (existing) {
      answerDuplicate(res, 'skill', existing);
      return;
    }

    const result = await db.insert(skills).values({
      name,
      category,
      description,
      howLearned,
      tools: tools && tools.length > 0 ? tools : null,
    }).returning();

    await recordAdded('skill', result[0], req.user!);
    res.status(201).json(result[0]);
  } catch (error) {
    answerWriteError(res, error, 'skill');
  }
});

// PUT /api/skills/:id - Change a skill: name, category, description, how it is
// learned, what it is done with, other names.
router.put('/:id', async (req: Request, res: Response) => {
  try {
    res.json(await changeRecord('skill', req.params.id, req.body, req.user!));
  } catch (error) {
    answerRefusal(res, error, 'skill');
  }
});

// DELETE /api/skills/:id - Delete a skill. It leaves every career path, job
// and person that listed it; `removed` counts them.
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const gone = await removeRecord('skill', req.params.id, req.user!);
    if (!gone) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json({ message: 'Skill deleted', id: gone.id, removed: gone.removed });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});

export default router;
