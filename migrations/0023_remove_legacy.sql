-- Removes what the product no longer has. Safe to run more than once: every
-- statement is IF EXISTS.
--
-- The product is Companies -> Factories -> Jobs -> Careers -> Skills. Gone are
-- Elements (refs), Schools, Programs and People, with the support tables
-- nothing read: the state, industry and skill-category lookups (states live in
-- shared/states.ts; a company's industry and a skill's category are text
-- columns on their own rows), related skills and entity links.
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
