// What a run did, as text a person reads: the counts, how long each stage
// took, where the source and our plants disagree, and the lines worth a look.

const n = (value) => Number(value ?? 0).toLocaleString('en-US');

/** How many lines of one kind a report prints before it says how many more there are. */
const LINES_PER_ACTION = 40;

export async function report(db, runId, { everything = false, rehearsal = false } = {}) {
  const [run] = await db`SELECT r.*, s.name AS source_name, s.ref_source, s.scope, s.unmatched, s.fill, s.kind FROM intake_runs r JOIN intake_sources s ON s.slug = r.source WHERE r.id = ${runId}`;
  if (!run) throw new Error(`There is no run ${runId}.`);
  // A run of an employer's postings counts other things: its own report (postings/jobs.mjs).
  if (run.kind === 'job') return (await import('../postings/jobs.mjs')).report(db, runId, { everything, rehearsal });
  const c = run.counts ?? {};
  const t = run.timings ?? {};
  const out = [];
  out.push(`${run.source} (${run.source_name}), run ${run.id}${rehearsal ? ', a rehearsal: nothing was kept' : `, ${run.state}`}`);
  out.push(`  file: ${run.input}, ${n(run.input_bytes)} bytes, sha256 ${run.input_sha256}${c.asOf ? `, for ${c.asOf}` : ''}`);
  if (c.read !== undefined) {
    out.push(`  read: ${n(c.read)} rows${c.noId ? `, ${n(c.noId)} with no id` : ''}${c.repeated ? `, ${n(c.repeated)} repeating an id` : ''}`);
    if (run.scope === 'known') {
      out.push(`  our ids: ${n(c.ourIds)} held, ${n(c.ourIds - c.missing)} in the file, ${n(c.missing)} no longer in the file`);
    }
    out.push(`  staged: ${n(c.staged)} records (${n(c.new)} new, ${n(c.changed)} changed, ${n(c.same)} the same, ${n(c.back)} back, ${n(c.gone)} gone since the last run)`);
  }
  if (c.byId !== undefined) {
    out.push(`  resolved: ${n(c.byId)} by id, ${n(c.byRule)} by rule, ${n(c.queued)} queued for review, ${n(c.held)} held${run.unmatched === 'add' ? `, ${n(c.toAdd)} to add` : ''}`);
  }
  if (c.applied !== undefined) {
    const filled = Object.entries(c.filled ?? {}).map(([fact, count]) => `${fact} ${n(count)}`).join(', ');
    out.push(`  applied: records written ${n(c.applied)}; plants changed ${n(c.plantsChanged)}${filled ? ` (${filled})` : ''}; ids written ${n(c.idsWritten)}; plants added ${n(c.added)}`);
  }
  if (c.undone) {
    out.push(`  undone: ${n(c.undone.restored)} facts restored, ${n(c.undone.ids)} ids taken back, ${n(c.undone.plants)} plants removed, ${n(c.undone.kept)} left because they changed since`);
  }

  // Where the source and our plants stand, over every record of the source that is one of our plants.
  const [s] = await db`
    SELECT count(*)::int AS matched,
      count(*) FILTER (WHERE f.primary_naics IS NULL)::int AS no_industry,
      count(*) FILTER (WHERE NULLIF(btrim(f.address), '') IS NULL)::int AS no_address,
      count(*) FILTER (WHERE NULLIF(btrim(f.zip_code), '') IS NULL)::int AS no_zip,
      count(*) FILTER (WHERE NULLIF(btrim(f.city), '') IS NULL)::int AS no_city,
      count(*) FILTER (WHERE r.facts ? 'naics' AND f.primary_naics IS NOT NULL AND left(f.primary_naics, 3) <> left(r.facts->>'naics', 3))::int AS industry_differs,
      count(*) FILTER (WHERE r.facts ? 'address' AND NULLIF(btrim(f.address), '') IS NOT NULL
        AND upper(regexp_replace(f.address, '[^A-Za-z0-9]+', '', 'g')) <> upper(regexp_replace(r.facts->>'address', '[^A-Za-z0-9]+', '', 'g')))::int AS address_differs,
      count(*) FILTER (WHERE r.facts ? 'zip' AND NULLIF(btrim(f.zip_code), '') IS NOT NULL AND left(f.zip_code, 5) <> left(r.facts->>'zip', 5))::int AS zip_differs,
      count(*) FILTER (WHERE d.metres > 250)::int AS moved_250,
      count(*) FILTER (WHERE d.metres > 1000)::int AS moved_1000,
      count(*) FILTER (WHERE r.facts->>'active' = 'false')::int AS inactive
    FROM intake_staged r JOIN factories f ON f.id = r.entity_id
    LEFT JOIN LATERAL (
      SELECT round(sqrt(power(((r.facts->>'latitude')::float8 - f.latitude::float8) * 111320, 2)
                      + power(((r.facts->>'longitude')::float8 - f.longitude::float8) * 111320 * cos(radians(f.latitude::float8)), 2))) AS metres
      WHERE r.facts->>'latitude' ~ '^-?[0-9]+([.][0-9]+)?$' AND r.facts->>'longitude' ~ '^-?[0-9]+([.][0-9]+)?$'
        AND f.latitude ~ '^-?[0-9]+([.][0-9]+)?$' AND f.longitude ~ '^-?[0-9]+([.][0-9]+)?$'
    ) d ON true
    WHERE r.source = ${run.source} AND r.gone_run_id IS NULL`;
  if (s.matched > 0) {
    out.push(`  our plants with a record at this source (${n(s.matched)}), as they stand now:`);
    out.push(`    still empty: industry ${n(s.no_industry)}, address ${n(s.no_address)}, ZIP ${n(s.no_zip)}, city ${n(s.no_city)}`);
    out.push(`    ours kept where the source says otherwise: another industry ${n(s.industry_differs)}, another address ${n(s.address_differs)}, another ZIP ${n(s.zip_differs)}; ` +
      `placed more than 250 m away ${n(s.moved_250)} (more than 1 km ${n(s.moved_1000)})`);
    if (s.inactive > 0) out.push(`    the source does not mark ${n(s.inactive)} of them as active`);
  }

  const unfilled = await db`
    SELECT regexp_replace(regexp_replace(detail, '^industry: ', ''), '[[:space:]]*[:(].*$', '') AS why, count(*)::int AS plants
    FROM load_log WHERE run_id = ${runId} AND action = 'not filled' GROUP BY 1 ORDER BY 2 DESC`;
  if (unfilled.length > 0) {
    out.push(`  no industry written for ${n(unfilled.reduce((sum, row) => sum + row.plants, 0))} plants that have none: ${unfilled.map((row) => `${row.why} ${n(row.plants)}`).join('; ')}`);
  }
  const outside = Object.entries(c.outside ?? {});
  if (outside.length > 0) {
    out.push(`  in the file and not among our plants (counted, not staged): ${outside.map(([label, count]) => `${label} ${n(count)}`).join('; ')}`);
  }
  const waiting = await db`SELECT count(*)::int AS waiting FROM intake_review WHERE source = ${run.source} AND status = 'waiting'`;
  if (waiting[0].waiting > 0) out.push(`  waiting for review in Admin Tools: ${n(waiting[0].waiting)}`);
  const stages = ['read', 'write', 'resolve', 'apply', 'undo'].filter((stage) => t[stage] !== undefined);
  if (stages.length > 0) out.push(`  seconds: ${stages.map((stage) => `${stage} ${t[stage]}`).join(', ')}`);

  // The lines to read.
  const actions = await db`
    SELECT action, count(*)::int AS lines FROM load_log WHERE run_id = ${runId} AND (look OR ${everything}) GROUP BY action ORDER BY min(id)`;
  for (const { action, lines } of actions) {
    const rows = await db`
      SELECT kind, action, look, company, plant, detail FROM load_log
      WHERE run_id = ${runId} AND action = ${action} AND (look OR ${everything}) ORDER BY id LIMIT ${everything ? 100000 : LINES_PER_ACTION}`;
    out.push('');
    out.push(`${action}: ${n(lines)} ${lines === 1 ? 'line' : 'lines'}${rows.length < lines ? `, the first ${rows.length} here (--all lists every line)` : ''}`);
    for (const row of rows) {
      out.push(`  ${[row.kind, [row.company, row.plant].filter(Boolean).join(' / '), row.detail].filter(Boolean).join(' | ')}`);
    }
  }
  return out.join('\n');
}
