-- A job from an employer's careers site is named by its career.
--
-- A job is one opening for a career at one factory, so it is named in the
-- product's own words, the way a factory with no name of its own is
-- "<Company> <City>": "Welder", "Mechanical Engineer", "Systems Engineer".
-- Never by the employer's posting title ("John Deere Des Moines Works -
-- Production Welder", "ENGINEER MECHANICAL 3", "Sentinel - Sr. Staff Systems
-- Engineer - 20504"), which names the company, the site, a shift, a programme,
-- a grade or a requisition number: things the job's row already says, or that
-- mean nothing to a reader.
--
-- The name carries no level. A level in a posting's title is the employer's
-- own ("III", "Senior", "Staff", "E4"), and the product has no levels of its
-- own to say it in yet. What the posting states stays a fact of the job, as it
-- was (jobs.level_word and jobs.level_rank, shown on the job's page under
-- Level); it is not part of the job's name.
--
-- The rule is written once, here: job_title(career). It is held by the
-- database, as a path's stage is held to its skill's level (0042): a trigger
-- on jobs gives every job that has a source that name, whatever wrote the row,
-- and a trigger on occupations renames a career's jobs when the career's
-- title changes. A job a company's member posted here by hand (source null)
-- keeps the title its company typed.
--
-- The employer's own title is kept in jobs.posted_as: the posting as it was
-- collected, for the day the postings are consolidated into standards, and for
-- the Jobs search today (a word the employer wrote still finds the job). It
-- follows the posting: a run writes the posting's title there, and it is what
-- a run compares a posting with. Only a write that names it changes it: it is
-- never replaced by the job's name, never taken from a title written over the
-- job, and never emptied. No API answer gives it and no screen prints it.
--
-- Additive, quick and safe to run again: one nullable column with its check,
-- three small functions, two triggers, two of 0054's functions restated, and
-- the jobs already stored brought in line once. What it renamed is one line in
-- load_log (load 'job-names'); a second run renames nothing and writes no line.

-- The posting's title as the employer wrote it. Null on a job posted here by hand.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS posted_as text;

-- ---------------------------------------------------------------------------
-- The rule
-- ---------------------------------------------------------------------------

-- A job's name: its career's title, as it is. One function, so the day the
-- product has levels of its own, or another word to add, the rule changes in
-- one place and the triggers below carry it to every job.
CREATE OR REPLACE FUNCTION job_title(p_career text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT NULLIF(btrim(p_career), '')
$f$;

-- ---------------------------------------------------------------------------
-- Held by the database
-- ---------------------------------------------------------------------------

-- A job that has a source takes its name, whatever title the write gave it,
-- and the employer's title is kept in posted_as:
--   a new job from a source          the title it is given is the employer's, and is kept (unless posted_as is given too)
--   a write that sets posted_as      posted_as is as written (what a run does: posting_job_write)
--   a write that would empty it      posted_as stays as it was (null, or nothing but spaces)
--   any other write                  posted_as stays; the name follows the job's career as it is now
-- Only a write that names posted_as changes it. A title written over such a job
-- is not taken for the employer's (a tidy-up of names, a statement written by
-- hand): it is set aside for the job's name, and what was collected stays.
-- Its level is not read: a level that changes does not rename a job.
CREATE OR REPLACE FUNCTION job_takes_its_name() RETURNS trigger AS $fn$
DECLARE
  v_name text;
BEGIN
  IF NEW.source IS NULL THEN RETURN NEW; END IF;
  v_name := job_title((SELECT o.title FROM occupations o WHERE o.id = NEW.occupation_id));
  IF TG_OP = 'INSERT' OR OLD.source IS NULL OR OLD.posted_as IS NULL THEN
    IF btrim(coalesce(NEW.posted_as, '')) = '' THEN NEW.posted_as := NEW.title; END IF;
  ELSIF btrim(coalesce(NEW.posted_as, '')) = '' THEN
    NEW.posted_as := OLD.posted_as;
  END IF;
  NEW.title := coalesce(v_name, NEW.title);
  RETURN NEW;
END $fn$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS jobs_title_is_career ON jobs;
CREATE TRIGGER jobs_title_is_career BEFORE INSERT OR UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION job_takes_its_name();

-- A career that is renamed renames its jobs from careers sites.
CREATE OR REPLACE FUNCTION career_title_renames_jobs() RETURNS trigger AS $fn$
BEGIN
  UPDATE jobs SET title = job_title(NEW.title)
    WHERE occupation_id = NEW.id AND source IS NOT NULL AND title IS DISTINCT FROM job_title(NEW.title);
  RETURN NULL;
END $fn$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS occupations_title_renames_jobs ON occupations;
CREATE TRIGGER occupations_title_renames_jobs AFTER UPDATE OF title ON occupations
  FOR EACH ROW WHEN (OLD.title IS DISTINCT FROM NEW.title) EXECUTE FUNCTION career_title_renames_jobs();

-- ---------------------------------------------------------------------------
-- What a run compares and writes
-- ---------------------------------------------------------------------------

-- posting_apply (0054) writes a job only where posting_job_snapshot differs
-- from posting_job_wanted, whose `title` is the posting's own. A job's title is
-- its name now, so the two would differ on nearly every job at every run. The
-- snapshot's `title` is therefore the employer's (posted_as), and the write
-- puts the posting's title there and leaves the name to the trigger: a posting
-- whose title changes changes posted_as and nothing else. Nothing more of
-- either function changes, and a snapshot journalled before this migration
-- (its `title` the employer's, as jobs.title then was) still compares equal,
-- so an earlier run can still be undone.

CREATE OR REPLACE FUNCTION posting_job_snapshot(p_job uuid) RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT jsonb_build_object(
    'company_id', j.company_id, 'factory_id', j.factory_id, 'occupation_id', j.occupation_id, 'title', coalesce(j.posted_as, j.title),
    'employment_type', j.employment_type, 'shift', j.shift, 'pay_min', j.pay_min, 'pay_max', j.pay_max, 'pay_period', j.pay_period,
    'apply_url', j.apply_url, 'posted_at', j.posted_at, 'undated', coalesce(j.undated, false),
    'level_word', j.level_word, 'level_rank', j.level_rank,
    'requirements', j.requirements, 'status', j.status, 'closed_reason', j.closed_reason,
    'skills', coalesce((SELECT jsonb_agg(s.skill_id ORDER BY s.skill_id) FROM job_skills s WHERE s.job_id = j.id), '[]'::jsonb),
    'makes', coalesce((SELECT jsonb_agg(m.make_id ORDER BY m.make_id) FROM job_makes m WHERE m.job_id = j.id), '[]'::jsonb))
  FROM jobs j WHERE j.id = p_job
$f$;

-- Writes a snapshot's values onto a job (its skills and makes included). The
-- snapshot's title is the employer's: it is kept as posted_as, and the job's
-- name follows from its career (jobs_title_is_career). A snapshot may be one
-- an earlier run journalled (intake_undo_run writes it back), and may name a
-- career the catalogue has removed since (0084): the job then keeps the career
-- it has, and the rest of the snapshot is written, so the run can still be
-- undone.
CREATE OR REPLACE FUNCTION posting_job_write(p_job uuid, p_want jsonb) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE jobs SET
    company_id = (p_want->>'company_id')::uuid, factory_id = (p_want->>'factory_id')::uuid,
    occupation_id = coalesce((SELECT o.id FROM occupations o WHERE o.id = (p_want->>'occupation_id')::uuid), occupation_id),
    posted_as = p_want->>'title', employment_type = p_want->>'employment_type', shift = p_want->>'shift',
    pay_min = (p_want->>'pay_min')::integer, pay_max = (p_want->>'pay_max')::integer, pay_period = p_want->>'pay_period',
    apply_url = p_want->>'apply_url', posted_at = coalesce((p_want->>'posted_at')::timestamp, posted_at),
    undated = NULLIF(coalesce((p_want->>'undated')::boolean, false), false),
    level_word = p_want->>'level_word', level_rank = (p_want->>'level_rank')::smallint,
    requirements = NULLIF(p_want->'requirements', 'null'::jsonb),
    status = p_want->>'status', closed_reason = p_want->>'closed_reason', updated_at = now()
  WHERE id = p_job;
  DELETE FROM job_makes WHERE job_id = p_job AND NOT (p_want->'makes' ? make_id::text);
  DELETE FROM job_skills WHERE job_id = p_job AND NOT (p_want->'skills' ? skill_id::text);
  INSERT INTO job_skills (job_id, skill_id, required)
    SELECT p_job, s.id, true FROM skills s WHERE p_want->'skills' ? s.id::text
    ON CONFLICT (job_id, skill_id) DO NOTHING;
  INSERT INTO job_makes (job_id, skill_id, make_id)
    SELECT p_job, m.skill_id, m.id FROM skill_makes m WHERE p_want->'makes' ? m.id::text
    ON CONFLICT (job_id, make_id) DO NOTHING;
END $f$;

-- ---------------------------------------------------------------------------
-- The jobs already stored
-- ---------------------------------------------------------------------------

-- Every job from a careers site that has no posted_as yet: the title it carries
-- is the employer's, as it was collected, and is kept there; the trigger
-- writes its name. Then any such job whose title is not its name (a row
-- written while the trigger was off) is given it. One line says how many were
-- renamed. After it, a job that has a source always has its posted title.
DO $$
DECLARE
  n_kept integer;
  n_renamed integer;
  n_put_right integer;
BEGIN
  WITH moved AS (
    UPDATE jobs j SET posted_as = j.title
    WHERE j.source IS NOT NULL AND j.posted_as IS NULL
    RETURNING j.title IS DISTINCT FROM j.posted_as AS renamed
  )
  SELECT count(*), count(*) FILTER (WHERE renamed) INTO n_kept, n_renamed FROM moved;

  UPDATE jobs j SET title = job_title(o.title)
    FROM occupations o
    WHERE o.id = j.occupation_id AND j.source IS NOT NULL AND j.title IS DISTINCT FROM job_title(o.title);
  GET DIAGNOSTICS n_put_right = ROW_COUNT;

  IF n_kept > 0 OR n_put_right > 0 THEN
    INSERT INTO load_log (load, kind, action, look, detail, evidence)
      VALUES ('job-names', 'job', 'renamed', false,
              format('%s of %s jobs from careers sites renamed for their career; the other %s were posted under that very name. The title each was posted under is kept in posted_as.',
                     n_renamed + n_put_right, n_kept + n_put_right, n_kept - n_renamed),
              jsonb_build_object('jobs', n_kept + n_put_right, 'renamed', n_renamed + n_put_right));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_posted_as_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_posted_as_check CHECK (source IS NULL OR (posted_as IS NOT NULL AND btrim(posted_as) <> ''));
  END IF;
END $$;
