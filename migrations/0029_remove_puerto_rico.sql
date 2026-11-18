-- Puerto Rico's plants leave the product: the map and its depth are the 50
-- states and the District of Columbia. Safe to run more than once.
--
-- A plant with a job is kept (a job with applications is closed, never
-- deleted; none exists in Puerto Rico today). A company goes with its plants
-- only when Puerto Rico was all it had and nothing else points at it: no
-- other plant, no job, no member, no request, no curated profile.

CREATE TEMP TABLE pr_plants ON COMMIT DROP AS
  SELECT f.id, f.company_id
  FROM factories f
  WHERE f.state = 'PR'
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.factory_id = f.id);

DELETE FROM external_references r
  USING pr_plants p
  WHERE r.entity_type = 'factories' AND r.entity_id = p.id;

DELETE FROM factories f USING pr_plants p WHERE f.id = p.id;

CREATE TEMP TABLE pr_companies ON COMMIT DROP AS
  SELECT c.id
  FROM companies c
  WHERE c.id IN (SELECT company_id FROM pr_plants WHERE company_id IS NOT NULL)
    AND NOT c.featured
    AND c.domain IS NULL
    AND NOT EXISTS (SELECT 1 FROM factories f WHERE f.company_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM company_requests q WHERE q.company_id = c.id OR q.added_company_id = c.id);

DELETE FROM external_references r
  USING pr_companies p
  WHERE r.entity_type = 'companies' AND r.entity_id = p.id;

DELETE FROM companies c USING pr_companies p WHERE c.id = p.id;
