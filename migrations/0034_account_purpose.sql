-- What an account is for: 'work' (find work) or 'hire'. It decides which tools
-- the interface draws for the person, never what the server allows: roles stay
-- relationships (a company membership, users.is_admin).
--
-- NULL means the person has not said. Their purpose is then read from what
-- they have: someone with a company membership, a request to join a company
-- or a request to have one added is hiring; anyone else is finding work
-- (server/lib/purpose.ts). So no existing account is rewritten here, and an
-- account follows its relationships until its owner chooses in settings.
--
-- Additive, instant (a nullable column with no default) and safe to run more
-- than once.
ALTER TABLE users ADD COLUMN IF NOT EXISTS purpose text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_purpose_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_purpose_check CHECK (purpose IS NULL OR purpose IN ('work', 'hire'));
  END IF;
END $$;
