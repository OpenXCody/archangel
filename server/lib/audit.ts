import { db, auditLog } from '../db/index.js';

/**
 * The record of what admins change (migration 0025). Every admin write calls
 * `recordAudit`, inside the same transaction as the change where there is
 * one, so a line exists exactly when the change does.
 */

const AUDIT_KINDS = ['company', 'factory', 'career', 'skill', 'person', 'access', 'invite'] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export function isAuditKind(value: unknown): value is AuditKind {
  return typeof value === 'string' && (AUDIT_KINDS as readonly string[]).includes(value);
}

/** The database, or a transaction on it. */
export type Executor = Pick<typeof db, 'insert' | 'select' | 'update' | 'delete' | 'execute'>;

export interface Actor {
  id: string;
  name: string;
}

export interface AuditEntry {
  actor: Actor;
  kind: AuditKind;
  recordId: string | null;
  /** What the record is called, kept as text so the line reads after the record is gone. */
  recordName: string;
  /** What was done, in a word or two: 'edited', 'merged', 'deleted', 'made admin'. */
  action: string;
  /** A short before and after: `{ changes: { field: [before, after] } }`, or what moved or went. */
  detail?: Record<string, unknown> | null;
}

export async function recordAudit(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLog).values({
    actorId: entry.actor.id,
    actorName: entry.actor.name,
    kind: entry.kind,
    recordId: entry.recordId,
    recordName: entry.recordName.slice(0, 300),
    action: entry.action,
    detail: entry.detail ?? null,
  });
}

const SHORT = 160;

/** A value as the log keeps it: long text is cut, so a line stays a line. */
function brief(value: unknown): unknown {
  if (typeof value === 'string') return value.length > SHORT ? `${value.slice(0, SHORT)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map(brief);
  return value ?? null;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * The fields that differ between two versions of a record, each as
 * [before, after]. Null when nothing differs.
 */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: readonly (keyof T & string)[]
): Record<string, [unknown, unknown]> | null {
  const changes: Record<string, [unknown, unknown]> = {};
  for (const field of fields) {
    if (!(field in after) || after[field] === undefined) continue;
    if (!same(before[field], after[field])) changes[field] = [brief(before[field]), brief(after[field])];
  }
  return Object.keys(changes).length > 0 ? changes : null;
}
