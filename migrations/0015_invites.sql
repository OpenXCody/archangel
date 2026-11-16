-- Invites: an admin creates a one-time link for an email address. Signing up
-- through the link creates the account with the invited role: a plain user,
-- an employer (an active membership in company_id) or an admin.
-- Only the token's SHA-256 is stored, as with sessions. Additive and safe to
-- run again.
CREATE TABLE IF NOT EXISTS "invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('user', 'employer', 'admin')),
  "company_id" uuid REFERENCES "companies"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "accepted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);
-- One pending invite per email address.
CREATE UNIQUE INDEX IF NOT EXISTS "invites_pending_email_idx" ON "invites" ("email") WHERE "accepted_at" IS NULL;
