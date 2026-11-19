import '../loadEnv.js';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { rowsOf } from '../lib/rows.js';
import { FICTIONAL_COMPANIES } from './seed-data/companies.js';
import { SAMPLE_VERSIONS } from './seed-data/companyCareers.js';

/**
 * Sample versions of careers, for a database on this machine: the made-up
 * companies of the sample each say how a career or two is done there, so the
 * version page, the company page and the employer's editor have something to
 * show. `scripts/create-db.mjs --sample` runs it last, once the migrations
 * have laid the catalogue over the sample data; on its own:
 *
 *   DATABASE_URL=postgresql://...@localhost/... npx tsx server/scripts/seed-versions.ts
 *
 * It refuses any database that is not on localhost and any company that is
 * not one of the sample's made-up ones, and it is safe to run again: each
 * sample version is written as its list says, and no other version is touched.
 * A career, skill or make the database does not have is skipped and said.
 */

function refuseUnlessLocal(): void {
  let host = '';
  try {
    host = new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    // An unparsable URL is not a local database.
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return;
  console.error(`seed-versions writes sample versions for made-up companies. It refuses "${host || 'an unset DATABASE_URL'}": only a database on localhost.`);
  process.exit(1);
}

async function idOf(statement: ReturnType<typeof sql>): Promise<string | null> {
  const [row] = rowsOf<{ id: string }>(await db.execute(statement));
  return row ? String(row.id) : null;
}

async function seedVersions(): Promise<void> {
  refuseUnlessLocal();
  const madeUp = new Set(FICTIONAL_COMPANIES.map((company) => company.name));
  let written = 0;
  const skipped: string[] = [];

  for (const sample of SAMPLE_VERSIONS) {
    const what = `${sample.company} · ${sample.career}`;
    if (!madeUp.has(sample.company)) throw new Error(`${sample.company} is not one of the sample's made-up companies: no version is written for it.`);
    const companyId = await idOf(sql`SELECT id FROM companies WHERE name = ${sample.company}`);
    const occupationId = await idOf(sql`SELECT id FROM occupations WHERE title = ${sample.career}`);
    if (!companyId || !occupationId) {
      skipped.push(`${what}: ${companyId ? 'the career' : 'the company'} is not in this database`);
      continue;
    }

    await db.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO company_careers (company_id, occupation_id, origin) VALUES (${companyId}, ${occupationId}, 'member') ON CONFLICT DO NOTHING`);
      const [version] = rowsOf<{ id: string }>(await tx.execute(sql`SELECT id FROM company_careers WHERE company_id = ${companyId} AND occupation_id = ${occupationId}`));
      await tx.execute(sql`DELETE FROM company_career_makes WHERE company_career_id = ${version.id}`);
      await tx.execute(sql`DELETE FROM company_career_skills WHERE company_career_id = ${version.id}`);

      const skillId = async (name: string): Promise<string | null> => {
        const [row] = rowsOf<{ id: string }>(await tx.execute(sql`SELECT id FROM skills WHERE name = ${name}`));
        if (!row) skipped.push(`${what}: no skill named ${name}`);
        return row ? String(row.id) : null;
      };
      const onStandard = async (id: string): Promise<boolean> =>
        rowsOf(await tx.execute(sql`SELECT 1 FROM occupation_skills WHERE occupation_id = ${occupationId} AND skill_id = ${id}`)).length > 0;

      for (const name of sample.leavesOut) {
        const id = await skillId(name);
        if (!id) continue;
        if (!(await onStandard(id))) skipped.push(`${what}: ${name} is not on the standard path, so it is not left out`);
        else await tx.execute(sql`INSERT INTO company_career_skills (company_career_id, skill_id, change) VALUES (${version.id}, ${id}, 'left_out')`);
      }
      for (const name of sample.adds) {
        const id = await skillId(name);
        if (!id) continue;
        if (await onStandard(id)) skipped.push(`${what}: ${name} is on the standard path already, so it is not added`);
        else await tx.execute(sql`INSERT INTO company_career_skills (company_career_id, skill_id, change) VALUES (${version.id}, ${id}, 'added')`);
      }
      for (const [skill, makes] of Object.entries(sample.runs)) {
        const id = await skillId(skill);
        if (!id) continue;
        // Only for a skill that is on the version's path as it now stands.
        const [onPath] = rowsOf<{ on: boolean }>(
          await tx.execute(sql`
            SELECT (CASE WHEN EXISTS (SELECT 1 FROM occupation_skills WHERE occupation_id = ${occupationId} AND skill_id = ${id})
              THEN NOT EXISTS (SELECT 1 FROM company_career_skills WHERE company_career_id = ${version.id} AND skill_id = ${id} AND change = 'left_out')
              ELSE EXISTS (SELECT 1 FROM company_career_skills WHERE company_career_id = ${version.id} AND skill_id = ${id} AND change = 'added') END) AS on`)
        );
        if (!onPath?.on) {
          skipped.push(`${what}: ${skill} is not on this version's path, so no make is said for it`);
          continue;
        }
        for (const make of makes) {
          const made = rowsOf(
            await tx.execute(sql`
              INSERT INTO company_career_makes (company_career_id, skill_id, make_id)
              SELECT ${version.id}, m.skill_id, m.id FROM skill_makes m WHERE m.skill_id = ${id} AND lower(m.name) = lower(${make})
              ON CONFLICT DO NOTHING RETURNING make_id`)
          );
          if (made.length === 0) skipped.push(`${what}: ${skill} has no make named ${make}`);
        }
      }
    });
    written += 1;
  }

  for (const line of skipped) console.log(`seed-versions: skipped. ${line}`);
  console.log(`seed-versions: ${written} sample ${written === 1 ? 'version' : 'versions'} for the sample's made-up companies.`);
}

seedVersions().then(
  () => process.exit(0),
  (error) => {
    console.error('seed-versions: FAILED', error);
    process.exit(1);
  }
);
