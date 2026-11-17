import { Router } from 'express';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import {
  db,
  users,
  skills,
  occupations,
  userSkills,
  userGoals,
  applications,
  jobs,
  companies,
  factories,
} from '../db/index.js';
import { cleanText, handle, requireUser } from '../lib/auth.js';
import { uuidParam } from '../middleware/validateUuid.js';

/** A signed-in person's own data: profile, skills, goals, applications. */
const router = Router();
router.use(requireUser);
router.param('skillId', uuidParam);
router.param('occupationId', uuidParam);

const SKILL_STATUSES = new Set(['learning', 'held']);

/** A skill on a career's path the person does not hold yet. */
interface NextSkill {
  id: string;
  name: string;
  stage: number | null;
}

/** How many careers "within reach" returns, and how many next skills each carries. */
const REACH_LIMIT = 8;
const NEXT_SKILLS = 3;
/** A path shorter than this says too little to rank a career by. */
const REACH_MIN_PATH = 5;

/**
 * The first skills of a career the person does not hold yet, as a JSON array
 * of { id, name, stage }: earliest stage first, and within a stage the ones
 * they are already learning ahead of the rest.
 */
function nextSkillsSql(occupationId: SQL, userId: string): SQL<NextSkill[]> {
  return sql<NextSkill[]>`COALESCE((
    SELECT json_agg(json_build_object('id', n.id, 'name', n.name, 'stage', n.stage) ORDER BY n.ord)
    FROM (
      SELECT s.id, s.name, os.stage,
             ROW_NUMBER() OVER (ORDER BY os.stage ASC NULLS LAST, (us.status IS NULL), s.name) AS ord
      FROM occupation_skills os
      JOIN skills s ON s.id = os.skill_id
      LEFT JOIN user_skills us ON us.skill_id = os.skill_id AND us.user_id = ${userId}
      WHERE os.occupation_id = ${occupationId} AND us.status IS DISTINCT FROM 'held'
      ORDER BY ord
      LIMIT ${NEXT_SKILLS}
    ) n
  ), '[]'::json)`;
}

// PATCH /api/me { name?, homeZip?, about? }
router.patch(
  '/',
  handle(async (req, res) => {
    const user = req.user!;
    const patch: { name?: string; homeZip?: string | null; about?: string | null; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (req.body?.name !== undefined) {
      const name = cleanText(req.body.name, 80, 1);
      if (!name) return res.status(400).json({ error: 'Enter your name.' });
      patch.name = name;
    }
    if (req.body?.homeZip !== undefined) {
      const zip = cleanText(req.body.homeZip, 10) ?? '';
      if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) return res.status(400).json({ error: 'Enter a 5-digit ZIP code.' });
      patch.homeZip = zip || null;
    }
    if (req.body?.about !== undefined) {
      const about = cleanText(req.body.about, 2000);
      if (about === null) return res.status(400).json({ error: 'Keep "about" under 2,000 characters.' });
      patch.about = about || null;
    }
    const [updated] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning({
      id: users.id,
      email: users.email,
      name: users.name,
      isAdmin: users.isAdmin,
      homeZip: users.homeZip,
      about: users.about,
    });
    res.json({ user: updated });
  })
);

// GET /api/me/skills
router.get(
  '/skills',
  handle(async (req, res) => {
    const rows = await db
      .select({ skillId: skills.id, name: skills.name, status: userSkills.status, updatedAt: userSkills.updatedAt })
      .from(userSkills)
      .innerJoin(skills, eq(skills.id, userSkills.skillId))
      .where(eq(userSkills.userId, req.user!.id))
      .orderBy(skills.name);
    res.json({ skills: rows });
  })
);

// PUT /api/me/skills/:skillId { status: 'learning' | 'held' }
router.put(
  '/skills/:skillId',
  handle(async (req, res) => {
    const status = req.body?.status;
    if (typeof status !== 'string' || !SKILL_STATUSES.has(status)) {
      return res.status(400).json({ error: "status must be 'learning' or 'held'." });
    }
    const [skill] = await db.select({ id: skills.id }).from(skills).where(eq(skills.id, req.params.skillId)).limit(1);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    await db
      .insert(userSkills)
      .values({ userId: req.user!.id, skillId: skill.id, status })
      .onConflictDoUpdate({
        target: [userSkills.userId, userSkills.skillId],
        set: { status, updatedAt: new Date() },
      });
    res.json({ skillId: skill.id, status });
  })
);

// DELETE /api/me/skills/:skillId
router.delete(
  '/skills/:skillId',
  handle(async (req, res) => {
    await db
      .delete(userSkills)
      .where(and(eq(userSkills.userId, req.user!.id), eq(userSkills.skillId, req.params.skillId)));
    res.json({ ok: true });
  })
);

// GET /api/me/goals - careers the person is aiming at, with how many of each
// career's skills they already hold and the next ones to pick up.
router.get(
  '/goals',
  handle(async (req, res) => {
    const userId = req.user!.id;
    const rows = await db
      .select({
        occupationId: occupations.id,
        title: occupations.title,
        createdAt: userGoals.createdAt,
        totalSkills: sql<number>`(
          SELECT COUNT(*)::int FROM occupation_skills os WHERE os.occupation_id = ${occupations.id}
        )`,
        heldSkills: sql<number>`(
          SELECT COUNT(*)::int FROM occupation_skills os
          JOIN user_skills us ON us.skill_id = os.skill_id AND us.user_id = ${userId} AND us.status = 'held'
          WHERE os.occupation_id = ${occupations.id}
        )`,
        next: nextSkillsSql(sql`${occupations.id}`, userId),
      })
      .from(userGoals)
      .innerJoin(occupations, eq(occupations.id, userGoals.occupationId))
      .where(eq(userGoals.userId, userId))
      .orderBy(userGoals.createdAt);
    res.json({ goals: rows });
  })
);

// PUT /api/me/goals/:occupationId
router.put(
  '/goals/:occupationId',
  handle(async (req, res) => {
    const [occupation] = await db
      .select({ id: occupations.id })
      .from(occupations)
      .where(eq(occupations.id, req.params.occupationId))
      .limit(1);
    if (!occupation) return res.status(404).json({ error: 'Career not found' });
    await db.insert(userGoals).values({ userId: req.user!.id, occupationId: occupation.id }).onConflictDoNothing();
    res.json({ occupationId: occupation.id });
  })
);

// DELETE /api/me/goals/:occupationId
router.delete(
  '/goals/:occupationId',
  handle(async (req, res) => {
    await db
      .delete(userGoals)
      .where(and(eq(userGoals.userId, req.user!.id), eq(userGoals.occupationId, req.params.occupationId)));
    res.json({ ok: true });
  })
);

// GET /api/me/careers/reach - careers the person's skills already point at.
//
// Only careers with a staged path of at least five skills, of which the person
// holds at least one, and which they have not already chosen as a goal (those
// are in /goals). `held` counts held skills only, so it is the same figure as
// the career page's "You have N of M". A skill being learned is not held: it
// stays in `next`, and counts as half a skill for the order alone.
router.get(
  '/careers/reach',
  handle(async (req, res) => {
    const userId = req.user!.id;
    const rows = await db.execute(sql`
      WITH mine AS (
        SELECT skill_id, status FROM user_skills WHERE user_id = ${userId}
      ),
      reach AS (
        SELECT o.id, o.title,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE m.status = 'held')::int AS held,
               COUNT(*) FILTER (WHERE m.status = 'learning')::int AS learning
        FROM occupation_skills os
        JOIN occupations o ON o.id = os.occupation_id
        LEFT JOIN mine m ON m.skill_id = os.skill_id
        WHERE os.occupation_id IN (
                SELECT os2.occupation_id FROM occupation_skills os2
                JOIN mine m2 ON m2.skill_id = os2.skill_id AND m2.status = 'held'
              )
          AND NOT EXISTS (
                SELECT 1 FROM user_goals g WHERE g.user_id = ${userId} AND g.occupation_id = os.occupation_id
              )
        GROUP BY o.id, o.title
        HAVING COUNT(*) >= ${REACH_MIN_PATH} AND COUNT(os.stage) > 0
        ORDER BY (COUNT(*) FILTER (WHERE m.status = 'held') + 0.5 * COUNT(*) FILTER (WHERE m.status = 'learning')) / COUNT(*) DESC,
                 COUNT(*) FILTER (WHERE m.status = 'held') DESC, o.title ASC
        LIMIT ${REACH_LIMIT}
      )
      SELECT r.id, r.title, r.held, r.total, ${nextSkillsSql(sql`r.id`, userId)} AS next
      FROM reach r
      ORDER BY (r.held + 0.5 * r.learning) / r.total DESC, r.held DESC, r.title ASC
    `);
    const careers = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      held: Number(row.held),
      total: Number(row.total),
      next: row.next as NextSkill[],
    }));
    res.json({ careers });
  })
);

// GET /api/me/applications
router.get(
  '/applications',
  handle(async (req, res) => {
    const rows = await db
      .select({
        id: applications.id,
        status: applications.status,
        note: applications.note,
        createdAt: applications.createdAt,
        statusChangedAt: applications.statusChangedAt,
        jobId: jobs.id,
        jobSerial: jobs.serial,
        jobTitle: jobs.title,
        jobStatus: jobs.status,
        companyId: companies.id,
        companyName: companies.name,
        city: factories.city,
        state: factories.state,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .innerJoin(factories, eq(factories.id, jobs.factoryId))
      .where(eq(applications.userId, req.user!.id))
      .orderBy(sql`${applications.createdAt} DESC`);
    res.json({ applications: rows });
  })
);

export default router;
