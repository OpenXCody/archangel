import type { Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db, jobs } from '../db/index.js';
import { US_STATES } from '../../shared/states.js';

/**
 * Checks shared by the routes that create and change records (companies,
 * factories, careers, skills). They keep an empty name, a latitude of
 * "thirty" or a duplicate from reaching the database, and turn the database's
 * own refusals into an answer a person can act on instead of a 500.
 */

/** A required text value: trimmed, not empty, at most `max` characters. */
export function requiredText(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
}

/**
 * For an update: undefined means "leave it alone" and passes through; anything
 * else must be usable text. Returns false when the value was given and is not.
 */
export function optionalName(value: unknown, max = 200): string | undefined | false {
  if (value === undefined) return undefined;
  return requiredText(value, max) ?? false;
}

/**
 * Optional text (a city, an address, a description): undefined when left out,
 * null when given empty, the trimmed text otherwise. False when it is not text
 * or runs past `max`.
 */
export function optionalText(value: unknown, max = 200): string | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length > max) return false;
  return text === '' ? null : text;
}

const STATE_CODES: ReadonlySet<string> = new Set(US_STATES.map((state) => state.code));

/** A state as its two-letter code (shared/states.ts), or null when it is not one. */
export function stateCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return STATE_CODES.has(code) ? code : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for text in the form of a record id. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** A latitude or longitude as the text the table stores, or null when it is not one. */
export function coordinate(value: unknown, kind: 'latitude' | 'longitude'): string | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  const limit = kind === 'latitude' ? 90 : 180;
  if (!Number.isFinite(number) || Math.abs(number) > limit) return null;
  return String(number);
}

/** A count of people or openings: a whole number from 0 up, or null when not given. */
export function count(value: unknown): number | null | false {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 10_000_000 ? number : false;
}

function pgCode(error: unknown): string | undefined {
  const own = (error as { code?: unknown } | null)?.code;
  if (typeof own === 'string') return own;
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof cause === 'string' ? cause : undefined;
}

/**
 * Answers a write that would repeat a record that is already there: 409, with
 * the record it would repeat so the person can be sent to it.
 */
export function answerDuplicate(
  res: Response,
  what: string,
  existing: { id: string; name: string; slug?: string | null },
  message = `A ${what} with that name already exists.`
): void {
  res.status(409).json({ error: message, existing });
}

/** Answers a failed write: 409 for a duplicate, 400 for a bad reference or value, else 500. */
export function answerWriteError(res: Response, error: unknown, what: string): void {
  const code = pgCode(error);
  if (code === '23505') {
    res.status(409).json({ error: `A ${what} with that name already exists.` });
  } else if (code === '23503') {
    res.status(400).json({ error: `That ${what} refers to something that does not exist.` });
  } else if (code === '23502' || code === '22P02' || code === '22001' || code === '22003') {
    res.status(400).json({ error: `That ${what} is missing a value or has one in the wrong form.` });
  } else {
    console.error(`Error writing ${what}:`, error);
    res.status(500).json({ error: `Failed to save the ${what}` });
  }
}

/**
 * Deleting a company, a factory or a career would take its jobs with it, and
 * every application to them (the foreign keys cascade). So a record with jobs
 * is not deleted: the jobs are dealt with first, on purpose. Answers 409 and
 * returns true when there are any.
 */
export async function refuseDeleteWithJobs(res: Response, what: 'company' | 'factory' | 'career', id: string): Promise<boolean> {
  const column = what === 'company' ? jobs.companyId : what === 'factory' ? jobs.factoryId : jobs.occupationId;
  const [{ count: held }] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(jobs).where(eq(column, id));
  if (held === 0) return false;
  res.status(409).json({
    error: `This ${what} has ${held === 1 ? 'a job' : `${held} jobs`}. Deleting it would delete ${held === 1 ? 'that job and its' : 'those jobs and their'} applications. Delete ${held === 1 ? 'the job' : 'the jobs'} first.`,
    jobs: held,
  });
  return true;
}
