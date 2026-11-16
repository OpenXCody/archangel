-- Accounts, company memberships, jobs, applications, and a person's own
-- skills and goals. Additive and idempotent: safe to run more than once, and
-- it changes no existing rows. Applied by scripts/migrate.mjs.

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "password_hash" text NOT NULL,
  "is_admin" boolean DEFAULT false NOT NULL,
  "home_zip" varchar(10),
  "about" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");

CREATE TABLE IF NOT EXISTS "sessions" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" ("user_id");

CREATE TABLE IF NOT EXISTS "company_members" (
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'member' NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("company_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "company_members_user_idx" ON "company_members" ("user_id");

CREATE TABLE IF NOT EXISTS "jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "serial" serial NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "factory_id" uuid NOT NULL REFERENCES "factories"("id") ON DELETE CASCADE,
  "occupation_id" uuid NOT NULL REFERENCES "occupations"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "employment_type" text DEFAULT 'full-time' NOT NULL,
  "shift" text,
  "pay_min" integer,
  "pay_max" integer,
  "pay_period" text DEFAULT 'hour' NOT NULL,
  "apply_url" text,
  "status" text DEFAULT 'open' NOT NULL,
  "closed_reason" text,
  "posted_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "jobs_serial_idx" ON "jobs" ("serial");
CREATE INDEX IF NOT EXISTS "jobs_company_idx" ON "jobs" ("company_id");
CREATE INDEX IF NOT EXISTS "jobs_factory_idx" ON "jobs" ("factory_id");
CREATE INDEX IF NOT EXISTS "jobs_occupation_idx" ON "jobs" ("occupation_id");
CREATE INDEX IF NOT EXISTS "jobs_status_idx" ON "jobs" ("status");

CREATE TABLE IF NOT EXISTS "job_skills" (
  "job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "skill_id" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "required" boolean DEFAULT true NOT NULL,
  PRIMARY KEY ("job_id", "skill_id")
);

CREATE TABLE IF NOT EXISTS "applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'applied' NOT NULL,
  "note" text,
  "employer_note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "status_changed_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "applications_job_user_idx" ON "applications" ("job_id", "user_id");
CREATE INDEX IF NOT EXISTS "applications_user_idx" ON "applications" ("user_id");

CREATE TABLE IF NOT EXISTS "user_skills" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "skill_id" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'held' NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "skill_id")
);

CREATE TABLE IF NOT EXISTS "user_goals" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "occupation_id" uuid NOT NULL REFERENCES "occupations"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "occupation_id")
);

-- Stage of a skill within a career: 1 Introduction, 2 Fundamentals, 3 Advanced.
ALTER TABLE "occupation_skills" ADD COLUMN IF NOT EXISTS "stage" smallint;
