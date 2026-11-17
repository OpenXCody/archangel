-- Email and in-app notices. Additive and safe to run again.

-- A person can turn notice emails off (applications and company access).
-- Sign-in emails (invites, password resets) are sent regardless.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_notices" boolean DEFAULT true NOT NULL;
-- When the person last opened the page that shows each kind of news: their
-- applications (/me), their applicants (/employer or a job they manage), and,
-- for an admin, the access requests. The header's dot compares against these.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "applications_seen_at" timestamptz;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "applicants_seen_at" timestamptz;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "access_seen_at" timestamptz;

-- A declined access request is kept (status 'declined') with when and by whom,
-- so the person is told and cannot ask again at once. The same two columns
-- record an approval.
ALTER TABLE "company_members" ADD COLUMN IF NOT EXISTS "decided_at" timestamptz;
ALTER TABLE "company_members" ADD COLUMN IF NOT EXISTS "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;

-- The history of an application: one row when it is made, one for every stage
-- the company moves it to, one when the applicant withdraws. "by_user" is who
-- did it; null when that is not known or the person is gone.
CREATE TABLE IF NOT EXISTS "application_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "at" timestamptz DEFAULT now() NOT NULL,
  "by_user" uuid REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "application_events_application_idx" ON "application_events" ("application_id", "at");

-- Applications made before this table existed get what is known of them: when
-- they were made, and the stage they are at now with when it was reached. The
-- stages in between were not recorded. Only applications with no events are
-- filled, so running this again adds nothing. (The older columns are
-- timestamps without a zone holding UTC.)
WITH "fresh" AS (
  SELECT a."id", a."user_id", a."status", a."created_at", a."status_changed_at"
  FROM "applications" a
  WHERE NOT EXISTS (SELECT 1 FROM "application_events" e WHERE e."application_id" = a."id")
)
INSERT INTO "application_events" ("application_id", "status", "at", "by_user")
SELECT "id", 'applied', "created_at" AT TIME ZONE 'UTC', "user_id" FROM "fresh"
UNION ALL
SELECT "id", "status", GREATEST("status_changed_at", "created_at") AT TIME ZONE 'UTC',
       CASE WHEN "status" = 'withdrawn' THEN "user_id" END
FROM "fresh" WHERE "status" <> 'applied';

-- Keeps notice emails from flooding anyone: one row per thing being limited
-- (a job's applicants for one member, one person's access requests), with
-- when its current window began and how many were sent in it. The person and
-- the job are there only so the row goes when they do.
CREATE TABLE IF NOT EXISTS "notice_log" (
  "key" text PRIMARY KEY NOT NULL,
  "window_start" timestamptz DEFAULT now() NOT NULL,
  "count" integer DEFAULT 1 NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "job_id" uuid REFERENCES "jobs"("id") ON DELETE CASCADE
);
