// Imported first by anything that starts on its own (the dev server, the seed
// script), so the settings are in place before the database module reads them.
// .env.local first (what .env.example is copied to), then .env. A value
// already in the environment is never overwritten.
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });
