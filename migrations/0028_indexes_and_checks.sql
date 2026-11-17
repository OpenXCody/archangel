-- Indexes for three foreign keys that had none, and two value rules the code
-- already keeps, now kept by the database as well. Safe to run more than once.
--
-- The indexes: removing a skill looks through job_skills and user_skills, and
-- removing a career through user_goals; each was a scan of the whole table,
-- because their primary keys lead with the other column.
CREATE INDEX IF NOT EXISTS job_skills_skill_idx ON job_skills (skill_id);
CREATE INDEX IF NOT EXISTS user_skills_skill_idx ON user_skills (skill_id);
CREATE INDEX IF NOT EXISTS user_goals_occupation_idx ON user_goals (occupation_id);

-- The rules: a path's stage is 1, 2 or 3 (or not set), and a job's pay runs
-- from its lower figure to its higher one. NOT VALID: rows already there are
-- not examined (so this cannot fail on them, and takes no time); every row
-- written from now on is.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'occupation_skills_stage_check') THEN
    ALTER TABLE occupation_skills
      ADD CONSTRAINT occupation_skills_stage_check CHECK (stage IS NULL OR stage BETWEEN 1 AND 3) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_pay_range_check') THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_pay_range_check CHECK (
        (pay_min IS NULL OR pay_min >= 0) AND (pay_max IS NULL OR pay_max >= 0)
        AND (pay_min IS NULL OR pay_max IS NULL OR pay_min <= pay_max)
      ) NOT VALID;
  END IF;
END $$;
