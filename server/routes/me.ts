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
import { cleanText, clearAttempts, endSession, handle, requireUser, tooManyAttempts, verifyPassword } from '../lib/auth.js';
import { uuidParam } from '../middleware/validateUuid.js';
import { newsFor } from '../lib/notices.js';
import { hasCompanyTie, isPurpose, purposeFrom, type Purpose } from '../lib/purpose.js';
import { rowsOf } from '../lib/rows.js';
import { pageLimit } from '../lib/paging.js';

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

// PATCH /api/me { name?, homeZip?, about?, emailNotices?, purpose? }
// `purpose` is what the account is for, 'work' or 'hire': which tools the
// interface draws. It changes nothing the person is allowed to do.
router.patch(
  '/',
  handle(async (req, res) => {
    const user = req.user!;
    const patch: { name?: string; homeZip?: string | null; about?: string | null; emailNotices?: boolean; purpose?: Purpose; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (req.body?.purpose !== undefined) {
      if (!isPurpose(req.body.purpose)) return res.status(400).json({ error: 'purpose must be work or hire.' });
      patch.purpose = req.body.purpose;
    }
    if (req.body?.emailNotices !== undefined) {
      if (typeof req.body.emailNotices !== 'boolean') return res.status(400).json({ error: 'emailNotices must be true or false.' });
      patch.emailNotices = req.body.emailNotices;
    }
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
      emailNotices: users.emailNotices,
      purpose: users.purpose,
    });
    // Never said: read from what the person has, as /api/auth/me does.
    const purpose = purposeFrom(updated.purpose, isPurpose(updated.purpose) ? false : await hasCompanyTie(user.id));
    res.json({ user: { ...updated, purpose } });
  })
);

// DELETE /api/me { password } - a person deletes their own account, confirmed
// by their password. Their skills, goals, applications and company
// memberships go with it; jobs they posted stay with the company. The last
// admin cannot: someone must be left who can make admins.
router.delete(
  '/',
  handle(async (req, res) => {
    const user = req.user!;
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) return res.status(400).json({ error: 'Enter your password.' });
    // A guess at the password counts like a guess at sign-in.
    if (tooManyAttempts(req, user.email)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!row || !(await verifyPassword(password, row.passwordHash))) {
      return res.status(400).json({ error: 'That is not your password.' });
    }
    const outcome = await db.transaction(async (tx) => {
      // Locked, so two admins deleting themselves at once cannot leave none.
      const admins = await tx.select({ id: users.id }).from(users).where(eq(users.isAdmin, true)).for('update');
      if (admins.length === 1 && admins[0].id === user.id) return 'last-admin' as const;
      await tx.delete(users).where(eq(users.id, user.id));
      return 'ok' as const;
    });
    if (outcome === 'last-admin') {
      return res.status(409).json({ error: 'You are the only admin. Make someone else an admin first.' });
    }
    clearAttempts(req, user.email);
    // The session went with the account; this clears its cookie.
    await endSession(req, res);
    res.json({ ok: true });
  })
);

// GET /api/me/news - whether there is something the person has not seen:
// { applications, applicants, access }. Booleans only; the header shows one dot.
router.get(
  '/news',
  handle(async (req, res) => {
    res.json(await newsFor(req.user!.id));
  })
);

// POST /api/me/seen { applications?, applicants?, access? } - the person has
// opened the page that shows that news. Answers with what is left unseen.
router.post(
  '/seen',
  handle(async (req, res) => {
    const now = new Date();
    const seen: { applicationsSeenAt?: Date; applicantsSeenAt?: Date; accessSeenAt?: Date } = {};
    if (req.body?.applications === true) seen.applicationsSeenAt = now;
    if (req.body?.applicants === true) seen.applicantsSeenAt = now;
    if (req.body?.access === true) seen.accessSeenAt = now;
    if (Object.keys(seen).length === 0) return res.status(400).json({ error: 'Say what was seen: applications, applicants or access.' });
    await db.update(users).set(seen).where(eq(users.id, req.user!.id));
    res.json(await newsFor(req.user!.id));
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

/** How many suggested skills are sent unless asked otherwise, and at most. */
const SUGGESTED_SKILLS = 12;
const SUGGESTED_SKILLS_MAX = 30;

// GET /api/me/skills/suggested?limit= - skills the person is likely to have
// or want, none of them on their list yet: first the skills of the careers
// they chose as goals (earliest stage first), then those of the careers within
// reach (the ones most of those careers share first). Each names one career it
// is for (`career`) and how many (`careers`). Empty for a person with no goal
// and no held skill: there is nothing to go on.
router.get(
  '/skills/suggested',
  handle(async (req, res) => {
    const userId = req.user!.id;
    const limit = pageLimit(req.query.limit, SUGGESTED_SKILLS, SUGGESTED_SKILLS_MAX);
    const rows = await db.execute(sql`
      WITH mine AS (
        SELECT skill_id, status FROM user_skills WHERE user_id = ${userId}
      ),
      goal AS (
        SELECT os.skill_id, MIN(os.stage) AS stage, COUNT(*)::int AS careers, MIN(o.title) AS career
        FROM user_goals g
        JOIN occupation_skills os ON os.occupation_id = g.occupation_id
        JOIN occupations o ON o.id = g.occupation_id
        WHERE g.user_id = ${userId}
          AND NOT EXISTS (SELECT 1 FROM mine m WHERE m.skill_id = os.skill_id)
        GROUP BY os.skill_id
      ),
      reach_careers AS (
        SELECT os.occupation_id, o.title,
               (COUNT(*) FILTER (WHERE m.status = 'held') + 0.5 * COUNT(*) FILTER (WHERE m.status = 'learning'))::float8 / COUNT(*) AS share
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
        GROUP BY os.occupation_id, o.title
        HAVING COUNT(*) >= ${REACH_MIN_PATH} AND COUNT(os.stage) > 0
        ORDER BY share DESC, o.title ASC
        LIMIT ${REACH_LIMIT}
      ),
      reach AS (
        SELECT os.skill_id, MIN(os.stage) AS stage, COUNT(*)::int AS careers,
               (array_agg(rc.title ORDER BY rc.share DESC, rc.title ASC))[1] AS career
        FROM reach_careers rc
        JOIN occupation_skills os ON os.occupation_id = rc.occupation_id
        WHERE NOT EXISTS (SELECT 1 FROM mine m WHERE m.skill_id = os.skill_id)
          AND NOT EXISTS (SELECT 1 FROM goal g WHERE g.skill_id = os.skill_id)
        GROUP BY os.skill_id
      )
      SELECT s.id, s.name, x.stage, x.career, x.careers
      FROM (
        SELECT skill_id, stage, career, careers, 0 AS src FROM goal
        UNION ALL
        SELECT skill_id, stage, career, careers, 1 AS src FROM reach
      ) x
      JOIN skills s ON s.id = x.skill_id
      ORDER BY x.src,
               CASE WHEN x.src = 0 THEN COALESCE(x.stage, 9) ELSE -x.careers END,
               CASE WHEN x.src = 0 THEN -x.careers ELSE COALESCE(x.stage, 9) END,
               s.name ASC
      LIMIT ${limit}
    `);
    const suggested = rowsOf(rows).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      stage: row.stage === null ? null : Number(row.stage),
      career: String(row.career),
      careers: Number(row.careers),
    }));
    res.json({ skills: suggested });
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
    const careers = rowsOf(rows).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      held: Number(row.held),
      total: Number(row.total),
      next: row.next as NextSkill[],
    }));
    res.json({ careers });
  })
);

/** One step in an application's history. */
interface ApplicationEvent {
  status: string;
  at: string;
}

// GET /api/me/applications - each with its history (`events`, oldest first)
// and `changed`: the company moved it since the person last opened their page.
// Changed ones come first, then the newest.
router.get(
  '/applications',
  handle(async (req, res) => {
    const userId = req.user!.id;
    const changed = sql<boolean>`EXISTS (
      SELECT 1 FROM application_events e, users u
      WHERE e.application_id = ${applications.id} AND u.id = ${userId}
        AND e.by_user IS DISTINCT FROM ${applications.userId}
        AND (u.applications_seen_at IS NULL OR e.at > u.applications_seen_at)
    )`;
    const rows = await db
      .select({
        id: applications.id,
        status: applications.status,
        note: applications.note,
        createdAt: applications.createdAt,
        statusChangedAt: applications.statusChangedAt,
        changed,
        events: sql<ApplicationEvent[]>`COALESCE((
          SELECT json_agg(json_build_object('status', e.status, 'at', e.at) ORDER BY e.at, e.id)
          FROM application_events e WHERE e.application_id = ${applications.id}
        ), '[]'::json)`,
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
      .where(eq(applications.userId, userId))
      .orderBy(sql`${changed} DESC`, sql`${applications.createdAt} DESC`);
    res.json({ applications: rows });
  })
);

export default router;
