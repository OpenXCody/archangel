import { and, eq, sql } from 'drizzle-orm';
import { db, users, companies, companyMembers, jobs, factories, applications, applicationEvents, passwordResets } from '../db/index.js';
import { hashToken, newToken } from './auth.js';
import { emailEnabled, sendEmail, sendEmails, type EmailMessage } from './email.js';
import {
  accessApprovedEmail,
  accessDeclinedEmail,
  accessRequestedEmail,
  inviteEmail,
  newApplicantEmail,
  resetEmail,
  stageChangedEmail,
} from './emailTemplates.js';
import { INVITE_DAYS, invitePath, type InviteRole } from './invites.js';
import { RESET_HOURS, resetPath } from './passwordResets.js';

/**
 * What the app tells people, and when.
 *
 * Two kinds of email:
 * - Sign-in emails (an invite, a password reset) are sent whenever mail is on.
 * - Notices (company access, applications) are sent when mail is on and the
 *   person has not turned them off (`users.email_notices`).
 *
 * And what needs no email: an application's history (`application_events`)
 * and what a person has not seen yet (`news`).
 *
 * Every function here is called after the write it reports has succeeded, and
 * none of them throws: a notice that fails must never fail the action.
 */

function failed(what: string, err: unknown): void {
  // The name only: a database error's message can quote the row.
  console.error(`notices: ${what} failed (${err instanceof Error ? err.name : 'error'})`);
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** How long a declined request stands before the person can ask the same company again. */
export const DECLINED_WAIT_DAYS = 7;

/** One email about new applicants per job per member in this long. */
const APPLICANT_NOTICE_MINUTES = 60;
/** How many access-request emails one person's requests can cause in an hour. */
const ACCESS_NOTICES_PER_HOUR = 3;
/** One self-service reset email per account in this long. */
const FORGOT_COOLDOWN_SECONDS = 60;

/** When a request declined at `decidedAt` can be made again. */
export function askAgainAt(decidedAt: Date): Date {
  return new Date(decidedAt.getTime() + DECLINED_WAIT_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Count one notice against a limit of `max` per `minutes`. Returns null when
 * the limit is reached (send nothing); otherwise when the window before this
 * one began (null the first time). One statement, so two requests at the same
 * moment cannot both pass a limit of one. `owner` is whose limit it is: the
 * row is removed with that person or job.
 */
async function claimNotice(
  key: string,
  owner: { userId: string; jobId?: string },
  minutes: number,
  max = 1
): Promise<{ previous: Date | null } | null> {
  const rows = (await db.execute(sql`
    WITH old AS (SELECT window_start FROM notice_log WHERE key = ${key})
    INSERT INTO notice_log AS n (key, window_start, count, user_id, job_id)
    VALUES (${key}, now(), 1, ${owner.userId}, ${owner.jobId ?? null})
    ON CONFLICT (key) DO UPDATE SET
      window_start = CASE WHEN n.window_start <= now() - make_interval(mins => ${minutes}) THEN now() ELSE n.window_start END,
      count = CASE WHEN n.window_start <= now() - make_interval(mins => ${minutes}) THEN 1 ELSE n.count + 1 END
    WHERE n.window_start <= now() - make_interval(mins => ${minutes}) OR n.count < ${max}
    RETURNING (SELECT window_start FROM old) AS previous
  `)) as unknown as { previous: Date | string | null }[];
  if (rows.length === 0) return null;
  const { previous } = rows[0];
  return { previous: previous ? new Date(previous) : null };
}

// ---------------------------------------------------------------------------
// Sign-in emails
// ---------------------------------------------------------------------------

/** Email an invite link to the invited address. True when it went. */
export async function sendInvite(input: { email: string; role: InviteRole; companyName: string | null; token: string; days?: number }): Promise<boolean> {
  if (!emailEnabled()) return false;
  const result = await sendEmail(
    inviteEmail({ to: input.email, role: input.role, companyName: input.companyName, path: invitePath(input.token), days: input.days ?? INVITE_DAYS })
  );
  return result.sent;
}

/** Email a reset link an admin made to the person it is for. True when it went. */
export async function sendAdminResetLink(input: { email: string; token: string }): Promise<boolean> {
  if (!emailEnabled()) return false;
  const result = await sendEmail(resetEmail({ to: input.email, path: resetPath(input.token), hours: RESET_HOURS, byAdmin: true }));
  return result.sent;
}

/**
 * "Forgot password": when the address has an account, make a reset link as an
 * admin would (24 hours, replacing the unused one) and email it. Says nothing
 * about whether there was an account. Never rejects.
 */
export async function sendForgotLink(email: string): Promise<void> {
  try {
    if (!emailEnabled()) return;
    const token = newToken();
    const expiresAt = new Date(Date.now() + RESET_HOURS * 60 * 60 * 1000);
    const made = await db.transaction(async (tx) => {
      const [person] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1).for('update');
      if (!person) return false;
      // Asked again a moment later (a double press, or someone hammering the
      // form with another person's address): the first email stands.
      const [recent] = await tx
        .select({ id: passwordResets.id })
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.userId, person.id),
            sql`${passwordResets.usedAt} IS NULL`,
            sql`${passwordResets.createdBy} IS NULL`,
            sql`${passwordResets.createdAt} > now() - make_interval(secs => ${FORGOT_COOLDOWN_SECONDS})`
          )
        )
        .limit(1);
      if (recent) return false;
      await tx.delete(passwordResets).where(and(eq(passwordResets.userId, person.id), sql`${passwordResets.usedAt} IS NULL`));
      await tx.insert(passwordResets).values({ userId: person.id, tokenHash: hashToken(token), createdBy: null, expiresAt });
      return true;
    });
    if (made) await sendEmail(resetEmail({ to: email, path: resetPath(token), hours: RESET_HOURS, byAdmin: false }));
  } catch (err) {
    failed('forgot password', err);
  }
}

// ---------------------------------------------------------------------------
// Company access
// ---------------------------------------------------------------------------

/** Whether an email address is at a company's domain (or a subdomain of it). Null when either is unknown. */
export function emailAtDomain(email: string, domain: string | null): boolean | null {
  const host = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  const company = domain?.trim().toLowerCase().replace(/^www\./, '');
  if (!host || !company) return null;
  return host === company || host.endsWith(`.${company}`);
}

/** A new request to join a company: tell the admins. */
export async function accessRequested(input: { requesterId: string; companyId: string }): Promise<void> {
  try {
    if (!emailEnabled()) return;
    const [requester] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, input.requesterId)).limit(1);
    const [company] = await db.select({ name: companies.name, domain: companies.domain }).from(companies).where(eq(companies.id, input.companyId)).limit(1);
    if (!requester || !company) return;
    const admins = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.isAdmin, true), eq(users.emailNotices, true)));
    if (admins.length === 0) return;
    // Asking, cancelling and asking again must not become a stream of email.
    if (!(await claimNotice(`access:${input.requesterId}`, { userId: input.requesterId }, 60, ACCESS_NOTICES_PER_HOUR))) return;
    await sendEmails(
      admins.map((admin) =>
        accessRequestedEmail({
          to: admin.email,
          requesterName: requester.name,
          requesterEmail: requester.email,
          companyName: company.name,
          domainMatches: emailAtDomain(requester.email, company.domain),
        })
      )
    );
  } catch (err) {
    failed('access request notice', err);
  }
}

/**
 * An admin approved or declined a request, or added the person directly: tell
 * the person. `requested` is false when there was no request to answer.
 */
export async function accessDecided(input: {
  userId: string;
  companyId: string;
  decision: 'approved' | 'declined';
  requested: boolean;
  decidedAt: Date;
  /** The admin who decided: nobody is emailed about what they did themselves. */
  byUserId: string;
}): Promise<void> {
  try {
    if (!emailEnabled() || input.userId === input.byUserId) return;
    const [person] = await db.select({ email: users.email, emailNotices: users.emailNotices }).from(users).where(eq(users.id, input.userId)).limit(1);
    const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, input.companyId)).limit(1);
    if (!person?.emailNotices || !company) return;
    await sendEmail(
      input.decision === 'approved'
        ? accessApprovedEmail({ to: person.email, companyName: company.name, requested: input.requested })
        : accessDeclinedEmail({ to: person.email, companyName: company.name, askAgainOn: longDate(askAgainAt(input.decidedAt)) })
    );
  } catch (err) {
    failed('access decision notice', err);
  }
}

/** "24 November 2026": unambiguous wherever it is read. */
function longDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

async function recordEvent(applicationId: string, status: string, byUserId: string): Promise<void> {
  try {
    await db.insert(applicationEvents).values({ applicationId, status, byUser: byUserId });
  } catch (err) {
    failed('application event', err);
  }
}

interface ApplicantFigure {
  held_required: number;
  total_required: number;
}

/**
 * A person applied (or took a withdrawn application up again): record it, and
 * tell the company's active members. At most one email per job per member per
 * hour; the next one says how many others applied in between.
 */
export async function applicationReceived(input: { applicationId: string; jobId: string; applicantId: string }): Promise<void> {
  await recordEvent(input.applicationId, 'applied', input.applicantId);
  try {
    if (!emailEnabled()) return;
    const [job] = await db
      .select({ title: jobs.title, companyId: jobs.companyId, companyName: companies.name, city: factories.city, state: factories.state })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .innerJoin(factories, eq(factories.id, jobs.factoryId))
      .where(eq(jobs.id, input.jobId))
      .limit(1);
    const [applicant] = await db.select({ name: users.name }).from(users).where(eq(users.id, input.applicantId)).limit(1);
    if (!job || !applicant) return;
    const members = await db
      .select({ id: users.id, email: users.email })
      .from(companyMembers)
      .innerJoin(users, eq(users.id, companyMembers.userId))
      .where(and(eq(companyMembers.companyId, job.companyId), eq(companyMembers.status, 'active'), eq(users.emailNotices, true)));
    const recipients = members.filter((member) => member.id !== input.applicantId);
    if (recipients.length === 0) return;

    const [figure] = (await db.execute(sql`
      SELECT COUNT(*) FILTER (WHERE us.user_id IS NOT NULL)::int AS held_required, COUNT(*)::int AS total_required
        FROM job_skills js
        LEFT JOIN user_skills us ON us.skill_id = js.skill_id AND us.user_id = ${input.applicantId} AND us.status = 'held'
       WHERE js.job_id = ${input.jobId} AND js.required
    `)) as unknown as ApplicantFigure[];

    const messages: EmailMessage[] = [];
    for (const member of recipients) {
      const claim = await claimNotice(`applicant:${input.jobId}:${member.id}`, { userId: member.id, jobId: input.jobId }, APPLICANT_NOTICE_MINUTES);
      if (!claim) continue;
      let others = 0;
      if (claim.previous) {
        // Everyone else who applied after the last email this member got about the job.
        const [row] = (await db.execute(sql`
          SELECT COUNT(DISTINCT e.application_id)::int AS others
            FROM application_events e
            JOIN applications a ON a.id = e.application_id
           WHERE a.job_id = ${input.jobId} AND e.status = 'applied' AND e.at > ${claim.previous.toISOString()}::timestamptz
             AND a.status <> 'withdrawn' AND a.id <> ${input.applicationId} AND a.user_id <> ${member.id}
        `)) as unknown as { others: number }[];
        others = row?.others ?? 0;
      }
      messages.push(
        newApplicantEmail({
          to: member.email,
          jobId: input.jobId,
          jobTitle: job.title,
          companyName: job.companyName,
          place: [job.city, job.state].filter(Boolean).join(', ') || null,
          applicantName: applicant.name,
          heldRequired: figure?.held_required ?? 0,
          totalRequired: figure?.total_required ?? 0,
          others,
        })
      );
    }
    await sendEmails(messages);
  } catch (err) {
    failed('new applicant notice', err);
  }
}

/**
 * An application's status changed: record it. When the company changed it,
 * tell the applicant. A withdrawal is the applicant's own act: nobody is emailed.
 */
export async function applicationStatusChanged(input: { applicationId: string; status: string; byUserId: string }): Promise<void> {
  await recordEvent(input.applicationId, input.status, input.byUserId);
  try {
    if (!emailEnabled() || input.status === 'withdrawn') return;
    const [row] = await db
      .select({
        applicantId: applications.userId,
        email: users.email,
        emailNotices: users.emailNotices,
        jobTitle: jobs.title,
        companyName: companies.name,
      })
      .from(applications)
      .innerJoin(users, eq(users.id, applications.userId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(eq(applications.id, input.applicationId))
      .limit(1);
    if (!row || !row.emailNotices || row.applicantId === input.byUserId) return;
    await sendEmail(stageChangedEmail({ to: row.email, jobTitle: row.jobTitle, companyName: row.companyName, status: input.status }));
  } catch (err) {
    failed('stage change notice', err);
  }
}

// ---------------------------------------------------------------------------
// News: what a person has not seen yet
// ---------------------------------------------------------------------------

export interface News {
  /** One of their applications was moved by the company since they last opened /me. */
  applications: boolean;
  /** Someone applied to a job they manage since they last looked at their applicants. */
  applicants: boolean;
  /** For an admin: a request to join a company came in since they last opened the requests. */
  access: boolean;
}

/** Three EXISTS checks in one round trip. */
export async function newsFor(userId: string): Promise<News> {
  const [row] = (await db.execute(sql`
    SELECT
      EXISTS (
        SELECT 1 FROM application_events e
          JOIN applications a ON a.id = e.application_id
         WHERE a.user_id = u.id AND e.by_user IS DISTINCT FROM a.user_id
           AND (u.applications_seen_at IS NULL OR e.at > u.applications_seen_at)
      ) AS applications,
      EXISTS (
        SELECT 1 FROM company_members m
          JOIN jobs j ON j.company_id = m.company_id
          JOIN applications a ON a.job_id = j.id
          JOIN application_events e ON e.application_id = a.id
         WHERE m.user_id = u.id AND m.status = 'active'
           AND a.user_id <> u.id AND a.status <> 'withdrawn' AND e.status = 'applied'
           AND (u.applicants_seen_at IS NULL OR e.at > u.applicants_seen_at)
      ) AS applicants,
      (u.is_admin AND EXISTS (
        SELECT 1 FROM company_members m
         WHERE m.status = 'requested'
           AND (u.access_seen_at IS NULL OR m.created_at AT TIME ZONE 'UTC' > u.access_seen_at)
      )) AS access
    FROM users u WHERE u.id = ${userId}
  `)) as unknown as News[];
  return { applications: Boolean(row?.applications), applicants: Boolean(row?.applicants), access: Boolean(row?.access) };
}
