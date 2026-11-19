import { eq, sql } from 'drizzle-orm';
import { db, companies, occupations, skills } from '../db/index.js';
import { recordAudit, type Actor } from './audit.js';
import { NOT_FOUND, RecordRefusal, attachedTo, type Attached, type RecordKind } from './records.js';
import { rowsOf } from './rows.js';
import { recordMerged } from './provenance.js';

/**
 * Merging one record into another of its kind: a company, a career or a
 * skill. It follows the row moves of the data cleanup
 * (scripts/build-cleanup-sql.mjs), in one transaction, and writes its line in
 * the audit log.
 */

export interface MergeResult {
  kept: { id: string; name: string; href: string };
  merged: { id: string; name: string };
  /** What now points at the kept record instead. */
  moved: Attached;
}

/**
 * Merge `fromId` into `intoId`: everything that pointed at the first points
 * at the second, the first's name is kept as another name for the second,
 * and the first is deleted. Factories are not merged. Throws RecordRefusal.
 */
export async function mergeRecords(kind: RecordKind, fromId: string, intoId: string, actor: Actor): Promise<MergeResult> {
  if (kind === 'factory') throw new RecordRefusal(400, 'Factories are not merged. Delete the one that is wrong.');
  if (fromId === intoId) throw new RecordRefusal(400, 'Choose a different record to merge into.');
  const table = kind === 'company' ? sql`companies` : kind === 'career' ? sql`occupations` : sql`skills`;
  const nameColumn = kind === 'career' ? sql`title` : sql`name`;

  return db.transaction(async (tx) => {
    // Both rows are held, in one order, so two merges cannot cross.
    const locked = rowsOf<{ id: string; name: string }>(
      await tx.execute(sql`SELECT id, ${nameColumn} AS name FROM ${table} WHERE id IN (${fromId}, ${intoId}) ORDER BY id FOR UPDATE`)
    );
    const from = locked.find((row) => row.id === fromId);
    const into = locked.find((row) => row.id === intoId);
    if (!from) throw new RecordRefusal(404, NOT_FOUND[kind]);
    if (!into) throw new RecordRefusal(404, 'The record to merge into was not found.');
    const moved = await attachedTo(tx, kind, fromId);
    let href = `/${kind === 'career' ? 'occupations' : 'skills'}/${intoId}`;

    if (kind === 'company') {
      const [gone] = await tx.select().from(companies).where(eq(companies.id, fromId)).limit(1);
      await tx.execute(sql`UPDATE factories SET company_id = ${intoId} WHERE company_id = ${fromId}`);
      await tx.execute(sql`UPDATE jobs SET company_id = ${intoId} WHERE company_id = ${fromId}`);
      await tx.execute(sql`UPDATE invites SET company_id = ${intoId} WHERE company_id = ${fromId}`);
      // A person with a row at both keeps the stronger one (access over a request).
      await tx.execute(sql`
        UPDATE company_members y SET status = 'active', decided_at = x.decided_at, decided_by = x.decided_by
        FROM company_members x
        WHERE x.company_id = ${fromId} AND y.company_id = ${intoId} AND y.user_id = x.user_id
          AND x.status = 'active' AND y.status <> 'active'`);
      await tx.execute(sql`
        UPDATE company_members x SET company_id = ${intoId} WHERE company_id = ${fromId}
          AND NOT EXISTS (SELECT 1 FROM company_members y WHERE y.company_id = ${intoId} AND y.user_id = x.user_id)`);
      // Requests for a plant of the company, the companies that are part of it, its people by state and its sources.
      await tx.execute(sql`UPDATE company_requests SET company_id = ${intoId} WHERE company_id = ${fromId}`);
      await tx.execute(sql`UPDATE company_requests SET added_company_id = ${intoId} WHERE added_company_id = ${fromId}`);
      await tx.execute(sql`UPDATE companies SET parent_company_id = ${intoId} WHERE parent_company_id = ${fromId} AND id <> ${intoId}`);
      await tx.execute(sql`
        UPDATE company_state_headcounts x SET company_id = ${intoId} WHERE company_id = ${fromId}
          AND NOT EXISTS (SELECT 1 FROM company_state_headcounts y WHERE y.company_id = ${intoId} AND y.state = x.state)`);
      await tx.execute(sql`
        DELETE FROM external_references x WHERE x.entity_type = 'companies' AND x.entity_id = ${fromId} AND x.source = 'CURATED'
          AND EXISTS (SELECT 1 FROM external_references y WHERE y.entity_type = 'companies' AND y.entity_id = ${intoId} AND y.source = 'CURATED' AND y.url = x.url)`);
      await tx.execute(sql`UPDATE external_references SET entity_id = ${intoId} WHERE entity_type = 'companies' AND entity_id = ${fromId}`);
      // The slug is unique: the row that is going gives it up before the kept row can take it.
      await tx.delete(companies).where(eq(companies.id, fromId));
      // The kept company takes whatever profile it lacks, and remembers the old name.
      const [kept] = rowsOf<{ slug: string | null }>(
        await tx.execute(sql`
          UPDATE companies c SET
            domain = COALESCE(c.domain, ${gone.domain}),
            description = COALESCE(NULLIF(btrim(c.description), ''), ${gone.description}),
            industry = CASE WHEN c.industry IS NULL OR lower(btrim(c.industry)) IN ('', 'manufacturing') THEN COALESCE(${gone.industry}, c.industry) ELSE c.industry END,
            featured = c.featured OR ${gone.featured},
            slug = COALESCE(c.slug, ${gone.slug}),
            parent_company_id = COALESCE(c.parent_company_id, NULLIF(${gone.parentCompanyId}::uuid, c.id)),
            headquarters_state = CASE WHEN c.headquarters_city IS NULL THEN ${gone.headquartersState} ELSE c.headquarters_state END,
            headquarters_country = CASE WHEN c.headquarters_city IS NULL THEN ${gone.headquartersCountry} ELSE c.headquarters_country END,
            headquarters_city = COALESCE(c.headquarters_city, ${gone.headquartersCity}),
            aliases = (
              SELECT array_agg(DISTINCT a) FROM unnest(COALESCE(c.aliases, '{}') || ${sql.param(gone.aliases ?? [], companies.aliases)}::text[] || ARRAY[${gone.name}]::text[]) AS a
              WHERE lower(a) <> lower(c.name)
            ),
            updated_at = now()
          WHERE c.id = ${intoId}
          RETURNING c.slug`)
      );
      href = `/companies/${kept?.slug ?? intoId}`;
    } else if (kind === 'career') {
      const k = intoId;
      const m = fromId;
      await tx.execute(sql`UPDATE occupation_skills x SET occupation_id = ${k} WHERE occupation_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM occupation_skills y WHERE y.occupation_id = ${k} AND y.skill_id = x.skill_id)`);
      await tx.execute(sql`UPDATE user_goals x SET occupation_id = ${k} WHERE occupation_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM user_goals y WHERE y.occupation_id = ${k} AND y.user_id = x.user_id)`);
      await tx.execute(sql`UPDATE industry_occupations x SET occupation_id = ${k} WHERE occupation_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM industry_occupations y WHERE y.occupation_id = ${k} AND y.industry = x.industry)`);
      await tx.execute(sql`UPDATE factory_occupations x SET occupation_id = ${k} WHERE occupation_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM factory_occupations y WHERE y.occupation_id = ${k} AND y.factory_id = x.factory_id)`);
      await tx.execute(sql`UPDATE jobs SET occupation_id = ${k} WHERE occupation_id = ${m}`);
      await tx.execute(sql`UPDATE occupation_aliases SET canonical_occupation_id = ${k} WHERE canonical_occupation_id = ${m}`);
      await tx.execute(sql`INSERT INTO occupation_aliases (alias_text, canonical_occupation_id) VALUES (${from.name}, ${k}) ON CONFLICT (alias_text) DO NOTHING`);
      await tx.execute(sql`UPDATE occupations o SET
          path_status = COALESCE(o.path_status, (SELECT path_status FROM occupations WHERE id = ${m})),
          description = COALESCE(NULLIF(btrim(o.description), ''), (SELECT description FROM occupations WHERE id = ${m}))
        WHERE o.id = ${k}`);
      await tx.delete(occupations).where(eq(occupations.id, m));
    } else {
      const k = intoId;
      const m = fromId;
      await tx.execute(sql`UPDATE occupation_skills x SET skill_id = ${k} WHERE skill_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM occupation_skills y WHERE y.skill_id = ${k} AND y.occupation_id = x.occupation_id)`);
      await tx.execute(sql`UPDATE job_skills x SET skill_id = ${k} WHERE skill_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM job_skills y WHERE y.skill_id = ${k} AND y.job_id = x.job_id)`);
      // A person who marked both keeps the stronger mark (held over learning).
      await tx.execute(sql`UPDATE user_skills y SET status = 'held' FROM user_skills x
        WHERE x.skill_id = ${m} AND y.skill_id = ${k} AND y.user_id = x.user_id AND x.status = 'held'`);
      await tx.execute(sql`UPDATE user_skills x SET skill_id = ${k} WHERE skill_id = ${m}
        AND NOT EXISTS (SELECT 1 FROM user_skills y WHERE y.skill_id = ${k} AND y.user_id = x.user_id)`);
      await tx.execute(sql`UPDATE skills SET parent_skill_id = ${k} WHERE parent_skill_id = ${m} AND id <> ${k}`);
      await tx.execute(sql`UPDATE skills SET parent_skill_id = NULL WHERE id = ${k} AND parent_skill_id = ${m}`);
      await tx.execute(sql`UPDATE skill_aliases SET canonical_skill_id = ${k} WHERE canonical_skill_id = ${m}`);
      await tx.execute(sql`INSERT INTO skill_aliases (alias_text, canonical_skill_id) VALUES (${from.name}, ${k}) ON CONFLICT (alias_text) DO NOTHING`);
      // The kept skill keeps its own group and level. Path rows that moved to it
      // take its level: the database sets occupation_skills.stage on every write
      // (migration 0042).
      await tx.execute(sql`UPDATE skills s SET
          description = COALESCE(NULLIF(btrim(s.description), ''), (SELECT description FROM skills WHERE id = ${m}))
        WHERE s.id = ${k}`);
      await tx.delete(skills).where(eq(skills.id, m));
    }

    // The history: an id that pointed at the record that is gone still leads to this one.
    await recordMerged(tx, { kind, fromId, intoId, fromName: from.name, actorId: actor.id });
    await recordAudit(tx, {
      actor,
      kind,
      recordId: intoId,
      recordName: into.name,
      action: 'merged',
      detail: { merged: { id: fromId, name: from.name }, ...(Object.keys(moved).length > 0 ? { moved } : {}) },
    });
    return { kept: { id: intoId, name: into.name, href }, merged: { id: fromId, name: from.name }, moved };
  });
}
