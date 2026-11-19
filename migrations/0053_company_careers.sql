-- A company's version of a career: how a career is done at one company, kept as
-- changes against the standard and never as a copy of it.
--
-- Additive and safe to repeat: three new tables, no rows. Nothing here says what
-- any company does. A version is written by a member of the company or by an
-- admin, through the API (server/lib/versions.ts).
--
-- A version is read as: the career's own skills (occupation_skills), without the
-- ones the company leaves out, with the ones it adds. So it follows the standard:
-- a skill that joins the standard is in every version at once, and a change that
-- no longer applies (a skill left out that the standard has since dropped, a skill
-- added that the standard has since taken up) is simply not read. It stays stored
-- and applies again if the standard changes back; the next save of the version
-- drops it. Nothing is kept in step by a trigger, so a standard path can be
-- rewritten row by row, or deleted and written again, without touching a version.

-- One version per company and career. A version with no changes is a version:
-- it says the company hires for the career.
-- `origin` is where the version came from: 'member' (one of the company's own
-- people), 'admin' (an admin acting for it), or 'source' (a later round: read
-- from a source through the intake pipeline, with its own evidence).
CREATE TABLE IF NOT EXISTS company_careers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  occupation_id uuid NOT NULL REFERENCES occupations (id) ON DELETE CASCADE,
  origin text NOT NULL DEFAULT 'member',
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_careers_origin_check CHECK (origin IN ('member', 'admin', 'source')),
  CONSTRAINT company_careers_company_career_key UNIQUE (company_id, occupation_id)
);
CREATE INDEX IF NOT EXISTS company_careers_occupation_idx ON company_careers (occupation_id);

-- A version's changes to the skills: one row per skill it adds ('added') or
-- leaves out of the standard ('left_out'). One row per skill, so a skill cannot
-- be both.
CREATE TABLE IF NOT EXISTS company_career_skills (
  company_career_id uuid NOT NULL REFERENCES company_careers (id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  change text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_career_id, skill_id),
  CONSTRAINT company_career_skills_change_check CHECK (change IN ('added', 'left_out'))
);
CREATE INDEX IF NOT EXISTS company_career_skills_skill_idx ON company_career_skills (skill_id);

-- The makes the company runs, for a skill on the version's path. The foreign key
-- names the skill with the make, as a person's own marks do (user_skill_makes), so
-- a row can only be for one of that skill's makes; it follows a make that moves to
-- another skill in a merge, and goes when the make does.
CREATE TABLE IF NOT EXISTS company_career_makes (
  company_career_id uuid NOT NULL REFERENCES company_careers (id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,
  make_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_career_id, make_id),
  CONSTRAINT company_career_makes_make_fkey FOREIGN KEY (skill_id, make_id)
    REFERENCES skill_makes (skill_id, id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS company_career_makes_make_idx ON company_career_makes (skill_id, make_id);
