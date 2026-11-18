import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

/**
 * Where a company's or a plant's facts came from, for the foot of its page.
 * Curated records keep one row per source address in external_references
 * (source 'CURATED'); a plant that came from the EPA's facility registry keeps
 * its registry id there (source 'EPA_ECHO'), which opens its EPA report.
 */
export interface RecordSource {
  /** What to call it: the site's name ("samsung.com"), or the registry's. */
  label: string;
  url: string;
}

/** "https://www.example.com/page" as "example.com"; null when it is not a web address. */
function host(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export async function sourcesOf(entityType: 'companies' | 'factories', id: string): Promise<RecordSource[]> {
  const rows = Array.from(
    (await db.execute(sql`
      SELECT source, external_id, url
      FROM external_references
      WHERE entity_type = ${entityType}::entity_type AND entity_id = ${id} AND source IN ('CURATED', 'EPA_ECHO')
      ORDER BY (source = 'CURATED') DESC, created_at ASC, url ASC
      LIMIT 40
    `)) as Iterable<{ source: string; external_id: string; url: string | null }>
  );
  const sources: RecordSource[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    let source: RecordSource | null = null;
    if (row.source === 'CURATED' && row.url) {
      const label = host(row.url);
      if (label) source = { label, url: row.url };
    } else if (row.source === 'EPA_ECHO' && /^\d{12}$/.test(row.external_id)) {
      source = { label: 'EPA facility registry', url: `https://echo.epa.gov/detailed-facility-report?fid=${row.external_id}` };
    }
    if (source && !seen.has(source.url)) {
      seen.add(source.url);
      sources.push(source);
    }
  }
  return sources;
}
