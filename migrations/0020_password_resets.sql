-- Password resets: an admin creates a one-time link for a person who cannot
-- sign in. Opening it lets them choose a new password, which ends every
-- session they had. Only the token's SHA-256 is stored, as with sessions and
-- invites, so a link can be shown once and never recovered. Additive and safe
-- to run again.
CREATE TABLE IF NOT EXISTS "password_resets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz
);
-- A new link replaces the person's unused one, so the lookup is by person.
CREATE INDEX IF NOT EXISTS "password_resets_user_idx" ON "password_resets" ("user_id");
