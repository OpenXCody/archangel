-- A company's mark set by hand. The mark a company is shown with is found
-- from its website's domain (client/public/logos/, see scripts/fetch-logos.mjs);
-- when that is the wrong one, or there is none, an admin uploads an image on
-- the company's record in Admin Tools and it is kept here, one row a company.
-- The API serves it (GET /api/companies/:id/mark) and CompanyLogo prefers it.
--
-- The image is kept in the row as base64 text: a mark is at most 200 KB, there
-- are few of them, and the one function on Vercel has no disk to write to.
-- `version` is the first twelve hex digits of the image's SHA-256, carried in
-- the address it is served from, so a mark can be cached for good and a
-- replaced one is a new address.
--
-- Additive and safe to repeat: one table, no rows.

CREATE TABLE IF NOT EXISTS company_marks (
  company_id uuid PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
  mime text NOT NULL,
  data text NOT NULL,
  bytes integer NOT NULL,
  version text NOT NULL,
  set_by uuid REFERENCES users (id) ON DELETE SET NULL,
  set_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_marks_mime_check') THEN
    ALTER TABLE company_marks ADD CONSTRAINT company_marks_mime_check
      CHECK (mime IN ('image/png', 'image/jpeg', 'image/svg+xml'));
  END IF;
END $$;
