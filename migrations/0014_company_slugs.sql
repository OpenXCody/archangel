-- A short name for a company's page: /companies/tesla instead of an id.
-- Given to companies that have a profile (a web domain); derived from the
-- name with trailing legal forms dropped. Where two names would collide,
-- the featured (then alphabetically first) company gets it and the other
-- keeps its id. Additive and safe to run again.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_key ON companies (slug) WHERE slug IS NOT NULL;

UPDATE companies c
SET slug = picked.slug
FROM (
  SELECT id, slug, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY featured DESC, name, id) AS rank
  FROM (
    SELECT
      id, featured, name,
      trim(both '-' from regexp_replace(
        regexp_replace(lower(name), '\m(company|corporation|corp|incorporated|inc|llc|ltd|co)\M\.?', '', 'g'),
        '[^a-z0-9]+', '-', 'g'
      )) AS slug
    FROM companies
    WHERE domain IS NOT NULL AND slug IS NULL
  ) named
  WHERE slug <> ''
) picked
WHERE c.id = picked.id
  AND picked.rank = 1
  AND NOT EXISTS (SELECT 1 FROM companies other WHERE other.slug = picked.slug);
