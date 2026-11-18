-- Construction is not manufacturing here. Ready-mix concrete yards, concrete
-- block, pipe and precast plants and asphalt paving plants leave the product:
-- they mix or cast material for a building site, and they were a tenth of the
-- map. Cement kilns, lime, gypsum, glass, brick and roofing plants stay.
-- Safe to run more than once.
--
-- A plant is one of these by its industry code (NAICS 3273, concrete products;
-- 324121, asphalt paving mixtures) or by a name that says so outright. A plant
-- with a job is kept (none exists today). A company goes with its plants when
-- they were all it had and nothing else points at it.

CREATE TEMP TABLE gone_plants ON COMMIT DROP AS
  SELECT f.id, f.company_id
  FROM factories f
  WHERE (
      f.primary_naics LIKE '3273%'
      OR f.primary_naics IN ('324121', '32412')
      OR f.name ~* '(ready[ -]?mix|redi[ -]?mix|readymix|redy[ -]?mix|asphalt (mixing )?plant|concrete (batch )?plant|batch plant)'
    )
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.factory_id = f.id);

DELETE FROM external_references r
  USING gone_plants p
  WHERE r.entity_type = 'factories' AND r.entity_id = p.id;

DELETE FROM factories f USING gone_plants p WHERE f.id = p.id;

CREATE TEMP TABLE gone_companies ON COMMIT DROP AS
  SELECT c.id
  FROM companies c
  WHERE c.id IN (SELECT company_id FROM gone_plants WHERE company_id IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM factories f WHERE f.company_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM company_requests q WHERE q.company_id = c.id OR q.added_company_id = c.id);

DELETE FROM external_references r
  USING gone_companies p
  WHERE r.entity_type = 'companies' AND r.entity_id = p.id;

DELETE FROM companies c USING gone_companies p WHERE c.id = p.id;
