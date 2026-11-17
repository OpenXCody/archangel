-- Requests to add a company, or a plant of a company, that is not in the data.
-- Additive and safe to run again.

-- A person who cannot find their company on the employer page asks for it to
-- be added: its name, its website and where it is. An admin adds the company
-- and its plant, then answers the request, which gives the person access.
-- A member of a company asks the same way for a plant that is missing
-- ("company_id" is then that company). Statuses: requested, added, declined.
CREATE TABLE IF NOT EXISTS "company_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Set when the request is for a plant of a company already in the data.
  "company_id" uuid REFERENCES "companies"("id") ON DELETE CASCADE,
  -- The company's name as the person wrote it.
  "name" text NOT NULL,
  -- Its web domain, when given: "example.com".
  "website" text,
  -- Where it is, as the person wrote it: a city and state, or an address.
  "place" text NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "decided_at" timestamptz,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  -- The company the person was given access to when the request was met.
  "added_company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "company_requests_user_idx" ON "company_requests" ("user_id");
CREATE INDEX IF NOT EXISTS "company_requests_status_idx" ON "company_requests" ("status");
