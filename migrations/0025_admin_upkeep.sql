-- Admin upkeep: a record of what admins change, and who the first admin is.
-- Additive and safe to run again.

-- One row for every change an admin makes: an edit, a merge, a deletion, a
-- role or company-access change, an invite, a password reset link. "kind" is
-- what was changed (company, factory, career, skill, person, access, invite)
-- and "record_id" which one; the name is kept beside it so the line still
-- reads after the record is gone. "detail" holds a short before and after.
-- The actor's name is kept for the same reason; "actor_id" empties when the
-- account is deleted.
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "at" timestamptz DEFAULT now() NOT NULL,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "actor_name" text NOT NULL,
  "kind" text NOT NULL,
  "record_id" uuid,
  "record_name" text NOT NULL,
  "action" text NOT NULL,
  "detail" jsonb
);
CREATE INDEX IF NOT EXISTS "audit_log_at_idx" ON "audit_log" ("at" DESC);
CREATE INDEX IF NOT EXISTS "audit_log_record_idx" ON "audit_log" ("kind", "record_id", "at" DESC);

-- When a person became an admin. The admin who has been one longest is the
-- first admin: another admin can neither take that role away nor delete the
-- account. Admins from before this column take the day their account was made.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_since" timestamptz;
UPDATE "users" SET "admin_since" = "created_at" AT TIME ZONE 'UTC' WHERE "is_admin" AND "admin_since" IS NULL;
