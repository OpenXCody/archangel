#!/usr/bin/env node
// Builds the migration that takes rows off an employer when they are not its
// plants: data/employers/not-theirs.json.
//
//   node scripts/build-not-theirs-sql.mjs --check
//   node scripts/build-not-theirs-sql.mjs --out migrations/0066_rows_not_theirs.sql [file.json]
//
// Each row of the file is a stored plant row, by its id, with the company it is
// filed under today (`from`) and its name as stored, and one of:
//   to         the company it is: the firm the research names, or the firm the
//              row's own name names (a dealer, a namesake, a business sold long
//              ago). Found by exact name, else by exactly one other name, in any
//              letter case; created bare when there is none.
//   mergeInto  the id of the row that is the same plant: the row is folded into
//              it by the database's plant merge (plant_merge, migration 0051).
// The migration decides in SQL on the database it meets and writes each
// decision to load_log (load `not-theirs`): a row is moved or merged only while
// it still carries the file's name and is filed under `from`; a row that is not
// there, or no longer as the file says, is left alone and said once, with look.
// Nothing is deleted. Run twice, the second run changes nothing.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FILE = path.join(HERE, '..', 'data', 'employers', 'not-theirs.json');
export const MIGRATION = path.join(HERE, '..', 'migrations', '0066_rows_not_theirs.sql');
export const LOAD = 'not-theirs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** What is wrong with the file, one line each: nothing when it can be built. */
export function checkRows(file) {
  const problems = [];
  const rows = Array.isArray(file?.rows) ? file.rows : null;
  if (!rows) return ['the file has no rows'];
  const seen = new Set();
  rows.forEach((row, i) => {
    const where = `row ${i + 1} (${row?.name ?? row?.id ?? '?'})`;
    if (!UUID.test(String(row?.id ?? ''))) problems.push(`${where}: id is not an id`);
    if (seen.has(row?.id)) problems.push(`${where}: the same row is in the file twice`);
    seen.add(row?.id);
    if (!text(row?.from)) problems.push(`${where}: says no company it is filed under ("from")`);
    if (!text(row?.name)) problems.push(`${where}: says no name`);
    if (!text(row?.why)) problems.push(`${where}: says no why`);
    const to = text(row?.to);
    const into = row?.mergeInto;
    if (Boolean(to) === Boolean(into)) problems.push(`${where}: needs one of "to" and "mergeInto"`);
    if (to && to.toLowerCase() === String(row.from ?? '').toLowerCase()) problems.push(`${where}: "to" is the company it is already under`);
    if (into && (!UUID.test(String(into)) || into === row.id)) problems.push(`${where}: mergeInto is not another row's id`);
    if (into && !text(row?.intoName)) problems.push(`${where}: says no name for the row it is merged into ("intoName")`);
    for (const source of Array.isArray(row?.sources) ? row.sources : []) {
      if (!/^https?:\/\/\S+$/.test(String(source))) problems.push(`${where}: source "${source}" is not an address`);
    }
  });
  const merged = new Set(rows.filter((row) => row?.mergeInto).map((row) => row.id));
  for (const row of rows) if (row?.mergeInto && merged.has(row.mergeInto)) problems.push(`${row.name}: is merged into a row that is itself merged away`);
  return problems;
}

/** What the migration carries for each row: only what the SQL reads. */
export function rowsForSql(file) {
  return file.rows.map((row) => ({
    id: row.id,
    from: text(row.from),
    name: text(row.name),
    ...(row.mergeInto ? { mergeInto: row.mergeInto, intoName: text(row.intoName) } : { to: text(row.to) }),
    why: text(row.why).slice(0, 300),
  }));
}

const SQL = String.raw`
-- One line in load_log. A line marked once is written only when the same line is not there yet, so a run that finds
-- nothing to do writes nothing.
CREATE OR REPLACE FUNCTION pg_temp.nt_log(p_action text, p_look boolean, p_company text, p_plant text, p_detail text, p_id uuid, p_once boolean)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO load_log (load, kind, action, look, company, plant, detail, entity_id)
  SELECT 'not-theirs', 'plant', p_action, p_look, p_company, p_plant, p_detail, p_id
  WHERE NOT p_once OR NOT EXISTS (
    SELECT 1 FROM load_log l WHERE l.load = 'not-theirs' AND l.action = p_action AND l.entity_id IS NOT DISTINCT FROM p_id
      AND l.detail IS NOT DISTINCT FROM p_detail)
$f$;

-- A company by its exact name, else by exactly one other name, in any letter case.
CREATE OR REPLACE FUNCTION pg_temp.nt_company(p_name text) RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT coalesce(
    (SELECT id FROM companies WHERE lower(name) = lower(p_name) ORDER BY featured DESC, created_at, id LIMIT 1),
    (SELECT min(id::text)::uuid FROM companies c WHERE EXISTS (SELECT 1 FROM unnest(c.aliases) a WHERE lower(a) = lower(p_name)) HAVING count(*) = 1))
$f$;

CREATE OR REPLACE FUNCTION pg_temp.nt_apply(data jsonb) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  r jsonb;
  v_id uuid;
  v_keep uuid;
  f record;
  k record;
  v_to uuid;
  v_merge jsonb;
BEGIN
  PERFORM set_config('client_min_messages', 'warning', true);
  -- Moves first: a row merged into another may be merged into one that moves.
  FOR r IN SELECT x FROM jsonb_array_elements(data->'rows') x ORDER BY (x ? 'mergeInto'), x->>'id' LOOP
    v_id := record_now('factory', (r->>'id')::uuid);
    SELECT x.id, x.name, x.company_id, x.curated, c.name AS company,
           lower(c.name) = lower(r->>'from') OR EXISTS (SELECT 1 FROM unnest(c.aliases) a WHERE lower(a) = lower(r->>'from')) AS under_from
      INTO f FROM factories x LEFT JOIN companies c ON c.id = x.company_id WHERE x.id = v_id;
    IF f.id IS NULL THEN
      PERFORM pg_temp.nt_log('not found', true, r->>'from', r->>'name', 'no such row here: nothing done', (r->>'id')::uuid, true);
      CONTINUE;
    END IF;

    IF r ? 'mergeInto' THEN
      v_keep := record_now('factory', (r->>'mergeInto')::uuid);
      CONTINUE WHEN v_keep = v_id;  -- merged already
      SELECT x.id, x.name, x.curated INTO k FROM factories x WHERE x.id = v_keep;
      IF k.id IS NULL THEN
        PERFORM pg_temp.nt_log('left', true, f.company, f.name, format('the row to merge it into ("%s") is not here: left as it is', r->>'intoName'), v_id, true);
      ELSIF lower(f.name) <> lower(r->>'name') OR NOT coalesce(f.under_from, false) THEN
        PERFORM pg_temp.nt_log('left', true, f.company, f.name, format('no longer the row the file names ("%s" under "%s"): left as it is', r->>'name', r->>'from'), v_id, true);
      ELSIF EXISTS (SELECT 1 FROM plants_apart pa WHERE (pa.a_id, pa.b_id) IN ((least(v_id, v_keep), greatest(v_id, v_keep)))) THEN
        PERFORM pg_temp.nt_log('left', true, f.company, f.name, format('an admin said it and "%s" are two plants: left as it is', k.name), v_id, true);
      ELSIF f.curated AND NOT k.curated THEN
        PERFORM pg_temp.nt_log('left', true, f.company, f.name, format('written from sources, and "%s" is not: left as it is', k.name), v_id, true);
      ELSE
        v_merge := plant_merge(v_keep, v_id, 'loader', NULL, 'not-theirs', 'one plant written twice: ' || (r->>'why'), true);
      END IF;
      CONTINUE;
    END IF;

    v_to := pg_temp.nt_company(r->>'to');
    CONTINUE WHEN v_to IS NOT NULL AND f.company_id = v_to;  -- moved already
    IF lower(f.name) <> lower(r->>'name') OR NOT coalesce(f.under_from, false) THEN
      PERFORM pg_temp.nt_log('left', true, f.company, f.name, format('no longer the row the file names ("%s" under "%s"): left as it is', r->>'name', r->>'from'), v_id, true);
      CONTINUE;
    END IF;
    IF v_to IS NULL THEN
      INSERT INTO companies (name) VALUES (r->>'to') RETURNING id INTO v_to;
      PERFORM pg_temp.nt_log('company created', false, r->>'to', NULL, 'with no profile, for a row that is its', v_to, false);
    END IF;
    UPDATE factories SET company_id = v_to, updated_at = now() WHERE id = v_id;
    PERFORM pg_temp.nt_log('moved', false, r->>'to', f.name, format('from "%s": %s', f.company, r->>'why'), v_id, false);
  END LOOP;
END $f$;
`;

const quote = (body, tag) => {
  if (body.includes(`$${tag}$`)) throw new Error(`the text contains $${tag}$ and cannot be quoted with it`);
  return `$${tag}$${body}$${tag}$`;
};

/** The migration's SQL for a file. */
export function buildSql(file, source = 'data/employers/not-theirs.json') {
  return [
    `-- Rows filed under an employer that are not its plants, from ${source},`,
    '-- generated by scripts/build-not-theirs-sql.mjs. Edit the JSON and regenerate; do not edit this file by hand.',
    '-- Each row is moved to the company it is, or merged into the row that is the same plant; nothing is deleted.',
    "-- What it decided is in load_log (load 'not-theirs'; the lines with look = true are the ones to read).",
    '-- Safe to run again: a row already moved or merged is left as it is, and nothing is written.',
    SQL.trimEnd(),
    '',
    `SELECT pg_temp.nt_apply(${quote(JSON.stringify({ rows: rowsForSql(file) }), 'nt_data')}::jsonb);`,
    '',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let out = null;
  let check = false;
  let input = FILE;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--check') check = true;
    else if (args[i].startsWith('--')) throw new Error(`unknown option ${args[i]}`);
    else input = args[i];
  }
  const file = JSON.parse(await readFile(input, 'utf8'));
  const problems = checkRows(file);
  const moved = file.rows?.filter((row) => row.to).length ?? 0;
  const merged = file.rows?.filter((row) => row.mergeInto).length ?? 0;
  console.error(`${path.basename(input)}: ${file.rows?.length ?? 0} rows, ${moved} to move and ${merged} to merge into the row that is the same plant.`);
  for (const line of problems) console.error(`  problem: ${line}`);
  if (problems.length) process.exit(1);
  if (check) return;
  const sql = buildSql(file, path.relative(path.join(HERE, '..'), input));
  if (out) await writeFile(out, sql);
  else process.stdout.write(sql);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
