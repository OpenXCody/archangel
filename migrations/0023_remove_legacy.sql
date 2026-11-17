-- Removes what the product no longer has. Safe to run more than once: every
-- statement is IF EXISTS, and the one rebuild (step 8) checks before it acts.
--
-- The product is Companies -> Factories -> Jobs -> Careers -> Skills. Gone are
-- Elements (refs), Schools, Programs and People, with the support tables
-- nothing read: the state, industry and skill-category lookups (states live in
-- shared/states.ts; a company's industry and a skill's category are text
-- columns on their own rows), related skills and entity links. Gone too is
-- the spreadsheet import's bookkeeping.
--
-- Kept on purpose: occupation_aliases and skill_aliases.

-- 1. Columns that point at the lookups.
ALTER TABLE factories DROP COLUMN IF EXISTS state_id;
ALTER TABLE skills DROP COLUMN IF EXISTS category_id;

-- 2. People.
DROP TABLE IF EXISTS person_skill_refs CASCADE;
DROP TABLE IF EXISTS persons CASCADE;

-- 3. Programs and schools.
DROP TABLE IF EXISTS program_aliases CASCADE;
DROP TABLE IF EXISTS program_skills CASCADE;
DROP TABLE IF EXISTS programs CASCADE;
DROP TABLE IF EXISTS schools CASCADE;

-- 4. Elements.
DROP TABLE IF EXISTS skill_refs CASCADE;
DROP TABLE IF EXISTS ref_aliases CASCADE;
DROP TABLE IF EXISTS refs CASCADE;

-- 5. Lookups and links nothing reads.
DROP TABLE IF EXISTS company_industries CASCADE;
DROP TABLE IF EXISTS industries CASCADE;
DROP TABLE IF EXISTS skill_categories CASCADE;
DROP TABLE IF EXISTS skill_relations CASCADE;
DROP TABLE IF EXISTS entity_links CASCADE;
DROP TABLE IF EXISTS states CASCADE;

-- 6. Types only those tables used.
DROP TYPE IF EXISTS ref_type;
DROP TYPE IF EXISTS proficiency_level;

-- 7. The spreadsheet import. Data is loaded by script and by generated
--    migrations; the wizard's upload, batch and error tables go with it.
DROP TABLE IF EXISTS error_queue CASCADE;
DROP TABLE IF EXISTS import_batches CASCADE;
DROP TABLE IF EXISTS import_uploads CASCADE;
DROP TYPE IF EXISTS error_status;
DROP TYPE IF EXISTS error_type;
DROP TYPE IF EXISTS import_status;

-- 8. entity_type named the removed kinds too. Only external_references still
--    uses it: rebuild it with the four kinds that exist. Rows for a removed
--    kind pointed at records that are gone. Skipped once already narrowed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'entity_type' AND e.enumlabel = 'refs'
  ) THEN
    DELETE FROM external_references
      WHERE entity_type::text NOT IN ('companies', 'factories', 'occupations', 'skills');
    ALTER TYPE entity_type RENAME TO entity_type_old;
    CREATE TYPE entity_type AS ENUM ('companies', 'factories', 'occupations', 'skills');
    ALTER TABLE external_references
      ALTER COLUMN entity_type TYPE entity_type USING entity_type::text::entity_type;
    DROP TYPE entity_type_old;
  END IF;
END $$;
