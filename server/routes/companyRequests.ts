import { Router } from 'express';
import { and, desc, eq, gt, or, sql } from 'drizzle-orm';
import { db, users, companies, companyMembers, companyRequests } from '../db/index.js';
import { isService, notAnEmployerHere } from '../lib/military.js';
import { canManageCompany, cleanText, handle } from '../lib/auth.js';
import { HOSTNAME, isUuid } from '../lib/writes.js';
import { accessDecided, companyAddRequested, companyRequestAnswered } from '../lib/notices.js';
import { recordAudit } from '../lib/audit.js';
import { uuidParam } from '../middleware/validateUuid.js';

/**
 * Requests to add what is not in the data: a company (asked for by a person
 * who cannot find theirs), or a plant of a company (asked for by one of its
 * members). They wait for an admin beside the requests to join a company.
 *
 * Two routers: the person's side, mounted under /api/employer (signed in),
 * and the admin's, mounted under /api/admin (a signed-in admin).
 *
 * An admin answers a request for a company by choosing the company once it is
 * in the data (added under Admin Tools, Data): the person becomes an active
 * member of it at once. A request for a plant is marked added once the plant
 * is. Either can be declined. The person is told by email, and reads the
 * answer on their employer page for 30 days.
 */

/** How many requests one person can have waiting. */
const MAX_WAITING = 5;
/** How long an answered request stays on the person's page. */
const ANSWERED_DAYS = 30;

/**
 * A website as it is kept: the bare domain. "https://www.Example.com/about"
 * is "example.com". Null for none; undefined when it is not a web address.
 */
function readWebsite(value: unknown): string | null | undefined {
  const text = cleanText(value ?? '', 300);
  if (text === null) return undefined;
  if (!text) return null;
  const host = text
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^www\./, '');
  return HOSTNAME.test(host) ? host : undefined;
}

const requestFields = {
  id: companyRequests.id,
  companyId: companyRequests.companyId,
  name: companyRequests.name,
  website: companyRequests.website,
  place: companyRequests.place,
  status: companyRequests.status,
  createdAt: companyRequests.createdAt,
  decidedAt: companyRequests.decidedAt,
  addedCompanyId: companyRequests.addedCompanyId,
};

// ---------------------------------------------------------------------------
// The person's side: /api/employer/company-requests
// ---------------------------------------------------------------------------

export const companyRequestsRouter = Router();
companyRequestsRouter.param('id', uuidParam);

// GET / - the person's requests: those waiting, and those answered in the last 30 days.
companyRequestsRouter.get(
  '/',
  handle(async (req, res) => {
    const since = new Date(Date.now() - ANSWERED_DAYS * 24 * 60 * 60 * 1000);
    const rows = await db
      .select(requestFields)
      .from(companyRequests)
      .where(
        and(
          eq(companyRequests.userId, req.user!.id),
          or(eq(companyRequests.status, 'requested'), gt(companyRequests.decidedAt, since))
        )
      )
      .orderBy(desc(companyRequests.createdAt));
    res.json({ requests: rows });
  })
);

// POST / { name, website?, place, companyId? } - ask for a company to be
// added, or (with companyId, by one of its members) for a plant of it.
companyRequestsRouter.post(
  '/',
  handle(async (req, res) => {
    const user = req.user!;
    const companyId: unknown = req.body?.companyId ?? null;
    const place = cleanText(req.body?.place, 160, 2);
    const website = readWebsite(req.body?.website);
    if (!place) return res.status(400).json({ error: 'Say where it is: a city and state, or an address.', field: 'place' });
    if (website === undefined) {
      return res.status(400).json({ error: 'Enter a web address such as example.com, or leave it empty.', field: 'website' });
    }

    let name: string;
    if (companyId !== null) {
      // A plant of a company in the data: asked for by someone who posts its jobs.
      if (!isUuid(companyId)) return res.status(400).json({ error: 'Choose a company.' });
      const [company] = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!company) return res.status(404).json({ error: 'Company not found' });
      if (!(await canManageCompany(user, company.id))) {
        return res.status(403).json({ error: 'Only people who post jobs for a company can ask for its factories to be added.' });
      }
      // A military service has no plants to add.
      if (await isService(db, company.id)) return res.status(400).json({ error: notAnEmployerHere(company.name) });
      name = company.name;
    } else {
      const typed = cleanText(req.body?.name, 120, 2);
      if (!typed) return res.status(400).json({ error: 'Enter the company name.', field: 'name' });
      name = typed.replace(/\s+/g, ' ');
      // The same name in any letter case is a company that can be joined now.
      const [listed] = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(sql`lower(${companies.name}) = lower(${name})`)
        .limit(1);
      // A service is listed, but not to be joined: saying "request access" would send the person nowhere.
      if (listed && (await isService(db, listed.id))) return res.status(400).json({ error: notAnEmployerHere(listed.name), field: 'name' });
      if (listed) {
        return res.status(409).json({ error: `${listed.name} is already listed. Search for it and request access.`, field: 'name', company: listed });
      }
    }

    // The same request made twice is one request.
    const waiting = await db
      .select(requestFields)
      .from(companyRequests)
      .where(and(eq(companyRequests.userId, user.id), eq(companyRequests.status, 'requested')));
    const same = waiting.find(
      (row) =>
        row.companyId === companyId &&
        row.name.toLowerCase() === name.toLowerCase() &&
        (companyId === null || row.place.toLowerCase() === place.toLowerCase())
    );
    if (same) return res.status(200).json({ request: same });
    if (waiting.length >= MAX_WAITING) {
      return res.status(409).json({ error: `You have ${MAX_WAITING} requests waiting. An admin answers each one.` });
    }

    const [created] = await db
      .insert(companyRequests)
      .values({ userId: user.id, companyId, name, website, place })
      .returning(requestFields);
    await companyAddRequested({ requesterId: user.id, name, website, place, plant: companyId !== null });
    res.status(201).json({ request: created });
  })
);

// DELETE /:id - withdraw a request that is still waiting. An answered one is
// the record of the answer and is not the person's to remove.
companyRequestsRouter.delete(
  '/:id',
  handle(async (req, res) => {
    await db
      .delete(companyRequests)
      .where(and(eq(companyRequests.id, req.params.id), eq(companyRequests.userId, req.user!.id), eq(companyRequests.status, 'requested')));
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// The admin's side: /api/admin/company-requests
// ---------------------------------------------------------------------------

export const adminCompanyRequestsRouter = Router();
adminCompanyRequestsRouter.param('id', uuidParam);

// GET / - requests that are waiting, oldest first, with who asked. For a
// plant, `companyName` is the company it belongs to.
adminCompanyRequestsRouter.get(
  '/',
  handle(async (_req, res) => {
    const rows = await db
      .select({
        ...requestFields,
        companyName: companies.name,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
      })
      .from(companyRequests)
      .innerJoin(users, eq(users.id, companyRequests.userId))
      .leftJoin(companies, eq(companies.id, companyRequests.companyId))
      .where(eq(companyRequests.status, 'requested'))
      .orderBy(companyRequests.createdAt);
    res.json({ requests: rows });
  })
);

// PATCH /:id { decision: 'add', companyId? } | { decision: 'decline' }
// - add, for a company: `companyId` is the company now in the data. The
//   person becomes an active member of it and is told as for any approval.
// - add, for a plant: the plant is in the data now; the person is told.
// - decline: the request is refused and the person is told.
// Only a request that is still waiting changes, so two answers send one email.
adminCompanyRequestsRouter.patch(
  '/:id',
  handle(async (req, res) => {
    const admin = req.user!;
    const decision: unknown = req.body?.decision;
    if (decision !== 'add' && decision !== 'decline') {
      return res.status(400).json({ error: "decision must be 'add' or 'decline'." });
    }
    const [request] = await db.select().from(companyRequests).where(eq(companyRequests.id, req.params.id)).limit(1);
    if (!request || request.status !== 'requested') return res.status(404).json({ error: 'Request not found' });
    const plant = request.companyId !== null;
    const decidedAt = new Date();
    const waiting = and(eq(companyRequests.id, request.id), eq(companyRequests.status, 'requested'));

    if (decision === 'decline') {
      const changed = await db
        .update(companyRequests)
        .set({ status: 'declined', decidedAt, decidedBy: admin.id })
        .where(waiting)
        .returning({ id: companyRequests.id });
      if (changed.length === 0) return res.status(404).json({ error: 'Request not found' });
      await recordAudit(db, {
        actor: admin,
        kind: 'access',
        recordId: request.companyId,
        recordName: request.name,
        action: plant ? 'factory request declined' : 'company request declined',
        detail: { place: request.place, askedBy: request.userId },
      });
      await companyRequestAnswered({ userId: request.userId, name: request.name, place: request.place, plant, outcome: 'declined', byUserId: admin.id });
      return res.json({ status: 'declined' });
    }

    if (plant) {
      const changed = await db
        .update(companyRequests)
        .set({ status: 'added', decidedAt, decidedBy: admin.id, addedCompanyId: request.companyId })
        .where(waiting)
        .returning({ id: companyRequests.id });
      if (changed.length === 0) return res.status(404).json({ error: 'Request not found' });
      await recordAudit(db, {
        actor: admin,
        kind: 'access',
        recordId: request.companyId,
        recordName: request.name,
        action: 'factory request marked added',
        detail: { place: request.place, askedBy: request.userId },
      });
      await companyRequestAnswered({ userId: request.userId, name: request.name, place: request.place, plant, outcome: 'added', byUserId: admin.id });
      return res.json({ status: 'added' });
    }

    const companyId: unknown = req.body?.companyId;
    if (!isUuid(companyId)) return res.status(400).json({ error: 'Choose the company that was added.' });
    const [company] = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const outcome = await db.transaction(async (tx) => {
      const changed = await tx
        .update(companyRequests)
        .set({ status: 'added', decidedAt, decidedBy: admin.id, addedCompanyId: company.id })
        .where(waiting)
        .returning({ id: companyRequests.id });
      if (changed.length === 0) return null;
      const match = and(eq(companyMembers.companyId, company.id), eq(companyMembers.userId, request.userId));
      const [before] = await tx.select({ status: companyMembers.status }).from(companyMembers).where(match).limit(1);
      await tx
        .insert(companyMembers)
        .values({ companyId: company.id, userId: request.userId, role: 'member', status: 'active', decidedAt, decidedBy: admin.id })
        .onConflictDoUpdate({
          target: [companyMembers.companyId, companyMembers.userId],
          set: { status: 'active', decidedAt, decidedBy: admin.id },
        });
      await recordAudit(tx, {
        actor: admin,
        kind: 'access',
        recordId: company.id,
        recordName: company.name,
        action: 'company request answered, access given',
        detail: { askedFor: request.name, place: request.place, person: request.userId },
      });
      return { wasActive: before?.status === 'active' };
    });
    if (!outcome) return res.status(404).json({ error: 'Request not found' });
    if (!outcome.wasActive) {
      await accessDecided({ userId: request.userId, companyId: company.id, decision: 'approved', requested: true, decidedAt, byUserId: admin.id });
    }
    res.json({ status: 'added', companyId: company.id, companyName: company.name });
  })
);
