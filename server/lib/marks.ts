import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, companies, companyMarks } from '../db/index.js';
import { recordAudit, type Actor } from './audit.js';
import { NOT_FOUND, RecordRefusal, refuse } from './records.js';
import { rowsOf } from './rows.js';

/**
 * A company's mark set by hand (migration 0069). The mark a company is shown
 * with is found from its domain; an admin replaces it by uploading an image,
 * which is kept in the database (one row a company, base64 text) and served
 * by `GET /api/companies/:id/mark`. `GET /api/companies/marks` lists the
 * companies that have one, which is how the page knows to ask.
 */

/** The largest image kept, in bytes of the file itself. */
export const MARK_MAX_BYTES = 200 * 1024;

const MIMES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;
type Mime = (typeof MIMES)[number];

/** What the bytes are, read from the bytes themselves and never from the name or the type sent. */
function sniff(bytes: Buffer): Mime | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const head = bytes.subarray(0, 2048).toString('utf8').replace(/^﻿/, '');
  if (/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}

/**
 * An SVG that could do anything but draw is refused. It is only ever shown
 * through an image element, and the API's own policy lets it load nothing,
 * but a file that carries script has no business being a logo.
 */
function svgIsPlain(text: string): boolean {
  return !/<script|<foreignObject|<iframe|<embed|<object|\son[a-z]+\s*=|javascript:|<!ENTITY/i.test(text);
}

export interface MarkRef {
  id: string;
  name: string;
  domain: string | null;
  /** Part of the address the image is served from. */
  version: string;
}

/** Every company with a mark set by hand: few, so one small list. */
export async function listMarks(): Promise<MarkRef[]> {
  return db
    .select({ id: companies.id, name: companies.name, domain: companies.domain, version: companyMarks.version })
    .from(companyMarks)
    .innerJoin(companies, eq(companies.id, companyMarks.companyId))
    .orderBy(companies.name);
}

export async function readMark(companyId: string): Promise<{ mime: string; bytes: Buffer; version: string } | null> {
  const [row] = await db.select().from(companyMarks).where(eq(companyMarks.companyId, companyId)).limit(1);
  return row ? { mime: row.mime, bytes: Buffer.from(row.data, 'base64'), version: row.version } : null;
}

/** Sets a company's mark from an uploaded image, given as base64. */
export async function setMark(companyId: string, body: unknown, actor: Actor): Promise<MarkRef> {
  const image = (body as { image?: unknown } | null)?.image;
  if (typeof image !== 'string' || image.length === 0) refuse('image', 'Choose an image: a PNG, an SVG or a JPEG.');
  const encoded = image.replace(/^data:[^,]*,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) refuse('image', 'That image could not be read.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0) refuse('image', 'That image could not be read.');
  if (bytes.length > MARK_MAX_BYTES) refuse('image', `That image is too large: a mark is at most ${MARK_MAX_BYTES / 1024} KB.`);
  const mime = sniff(bytes);
  if (!mime) refuse('image', 'A mark is a PNG, an SVG or a JPEG.');
  if (mime === 'image/svg+xml' && !svgIsPlain(bytes.toString('utf8'))) refuse('image', 'That SVG carries more than a drawing (a script or a link out). Save it as a plain SVG or a PNG.');
  const version = createHash('sha256').update(bytes).digest('hex').slice(0, 12);

  return db.transaction(async (tx) => {
    const [company] = await tx.select({ id: companies.id, name: companies.name, domain: companies.domain }).from(companies).where(eq(companies.id, companyId)).limit(1).for('update');
    if (!company) throw new RecordRefusal(404, NOT_FOUND.company);
    const had = rowsOf<{ version: string }>(await tx.execute(sql`SELECT version FROM company_marks WHERE company_id = ${companyId}`))[0];
    if (had?.version === version) return { ...company, version };
    await tx
      .insert(companyMarks)
      .values({ companyId, mime, data: bytes.toString('base64'), bytes: bytes.length, version, setBy: actor.id })
      .onConflictDoUpdate({ target: companyMarks.companyId, set: { mime, data: bytes.toString('base64'), bytes: bytes.length, version, setBy: actor.id, setAt: new Date() } });
    await recordAudit(tx, {
      actor,
      kind: 'company',
      recordId: companyId,
      recordName: company.name,
      action: had ? 'mark replaced' : 'mark set by hand',
      detail: { mark: { type: mime.replace('image/', '').replace('+xml', '').toUpperCase(), kb: Math.max(1, Math.round(bytes.length / 1024)) } },
    });
    return { ...company, version };
  });
}

/** Goes back to the mark found from the company's domain. False when there was none set by hand. */
export async function clearMark(companyId: string, actor: Actor): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [company] = await tx.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1).for('update');
    if (!company) throw new RecordRefusal(404, NOT_FOUND.company);
    const gone = await tx.delete(companyMarks).where(eq(companyMarks.companyId, companyId)).returning({ id: companyMarks.companyId });
    if (gone.length === 0) return false;
    await recordAudit(tx, { actor, kind: 'company', recordId: companyId, recordName: company.name, action: 'mark back to automatic' });
    return true;
  });
}
