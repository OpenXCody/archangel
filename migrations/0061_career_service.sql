-- A career that belongs to a military service: a Navy rating, an Army MOS, an Air
-- Force specialty. It is a career like any other (a title, a home, a path), with
-- four things more: the service it belongs to, the service's code for it, the
-- system that code is in, and the service's own name for the job.
--
-- A service is a company. `companies.service` says a company is one and which;
-- it is null for every other company. A career is military when it has a
-- service: there is no tag or kind stored. The words shown above the name
-- ("Navy rating") and the tags come from the code system and the service, in
-- shared/military.ts.
--
-- Additive, quick and safe to repeat: five nullable columns, their checks and
-- three small indexes. It loads nothing; the services are loaded by 0062 and
-- the careers by 0063.

-- Which service a company is. One company per service.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS service text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_service_check') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_service_check
      CHECK (service IS NULL OR service IN ('navy', 'army', 'air-force', 'marine-corps'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS companies_service_key ON companies (service) WHERE service IS NOT NULL;

-- A career's service (null for a civilian career), its code ("HT", "15T",
-- "2A3X3"), the system the code is in, and the service's own title for the job,
-- without the service in front ("Hull Maintenance Technician").
-- A service that has careers cannot be deleted from under them.
ALTER TABLE occupations ADD COLUMN IF NOT EXISTS service_company_id uuid REFERENCES companies (id) ON DELETE RESTRICT;
ALTER TABLE occupations ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE occupations ADD COLUMN IF NOT EXISTS code_system text;
ALTER TABLE occupations ADD COLUMN IF NOT EXISTS official_title text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'occupations_code_system_check') THEN
    ALTER TABLE occupations ADD CONSTRAINT occupations_code_system_check
      CHECK (code_system IS NULL OR code_system IN ('navy-rating', 'army-mos', 'afsc'));
  END IF;
  -- A career with a service has a code and a code system; a career without one has neither, nor a service's title.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'occupations_service_code_check') THEN
    ALTER TABLE occupations ADD CONSTRAINT occupations_service_code_check CHECK (
      (service_company_id IS NULL AND code IS NULL AND code_system IS NULL AND official_title IS NULL)
      OR (service_company_id IS NOT NULL AND code IS NOT NULL AND btrim(code) <> '' AND code_system IS NOT NULL)
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS occupations_service_idx ON occupations (service_company_id) WHERE service_company_id IS NOT NULL;
-- A code names one career within its system.
CREATE UNIQUE INDEX IF NOT EXISTS occupations_code_key ON occupations (code_system, code) WHERE code IS NOT NULL;
