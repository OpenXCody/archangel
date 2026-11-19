import type { EmploymentType, PayPeriod } from './jobs';
import { readStored, removeStored, writeStored } from './storage';

/**
 * What a person has typed into the job form, kept in this browser so that a
 * refresh, Back, a stray click on the header or a session that ended does not
 * lose it. One draft per person and per form: a new job for a company, a copy
 * of a job, or an edit of one. It is removed when the job is posted or saved,
 * or when the person starts over, and is ignored once it is a month old.
 *
 * Storage can be unavailable (private browsing, a full disk): every call then
 * does nothing, and the form works as it would without drafts.
 */

const PREFIX = 'archangel.jobDraft.';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** The job form's fields, as the form holds them. */
export interface JobDraftFields {
  factoryId: string;
  career: { id: string; title: string } | null;
  skills: { id: string; name: string; required: boolean }[];
  /** The career whose default skills the tags started from. */
  seededFor: string | null;
  title: string;
  titleEdited: boolean;
  payMin: string;
  payMax: string;
  payPeriod: PayPeriod;
  employmentType: EmploymentType;
  shift: string;
  description: string;
  applyIn: 'app' | 'link';
  applyUrl: string;
}

export interface JobDraft extends JobDraftFields {
  /** When it was last written, in milliseconds. */
  savedAt: number;
}

/** `form` is "post:<company id>", "copy:<job id>" or "edit:<job id>". */
export function draftKey(userId: string, form: string): string {
  return `${PREFIX}${userId}.${form}`;
}

function isDraft(value: unknown): value is JobDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  const text = (key: string) => typeof draft[key] === 'string';
  const career = draft.career as { id?: unknown; title?: unknown } | null;
  return (
    typeof draft.savedAt === 'number' &&
    ['factoryId', 'title', 'payMin', 'payMax', 'shift', 'description', 'applyUrl'].every(text) &&
    (draft.payPeriod === 'hour' || draft.payPeriod === 'year') &&
    (draft.applyIn === 'app' || draft.applyIn === 'link') &&
    ['full-time', 'part-time', 'contract', 'apprenticeship'].includes(draft.employmentType as string) &&
    typeof draft.titleEdited === 'boolean' &&
    (draft.seededFor === null || typeof draft.seededFor === 'string') &&
    (career === null || (typeof career === 'object' && typeof career.id === 'string' && typeof career.title === 'string')) &&
    Array.isArray(draft.skills) &&
    draft.skills.every(
      (skill: unknown) =>
        Boolean(skill) &&
        typeof (skill as { id?: unknown }).id === 'string' &&
        typeof (skill as { name?: unknown }).name === 'string' &&
        typeof (skill as { required?: unknown }).required === 'boolean'
    )
  );
}

/** The draft kept under `key`, or null when there is none that can be used. */
export function readDraft(key: string): JobDraft | null {
  const stored = readStored(key);
  if (!stored) return null;
  try {
    const draft: unknown = JSON.parse(stored);
    if (!isDraft(draft) || Date.now() - draft.savedAt > MAX_AGE_MS) {
      removeStored(key);
      return null;
    }
    return draft;
  } catch {
    // Not something this form wrote.
    return null;
  }
}

export function writeDraft(key: string, fields: JobDraftFields): void {
  // When it cannot be kept the form carries on without a draft.
  writeStored(key, JSON.stringify({ ...fields, savedAt: Date.now() }));
}

export function clearDraft(key: string): void {
  removeStored(key);
}

/** Of these companies, the one whose new-job draft was written last. Null when none has one. */
export function latestDraftCompany(userId: string, companyIds: string[]): string | null {
  let latest: { id: string; savedAt: number } | null = null;
  for (const id of companyIds) {
    const draft = readDraft(draftKey(userId, `post:${id}`));
    if (draft && (!latest || draft.savedAt > latest.savedAt)) latest = { id, savedAt: draft.savedAt };
  }
  return latest?.id ?? null;
}

/** "today at 2:14 PM", "yesterday at 9:02 AM", "on Nov 3". */
export function draftWhen(savedAt: number): string {
  const saved = new Date(savedAt);
  const time = saved.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(saved)) / (24 * 60 * 60 * 1000));
  if (days <= 0) return `today at ${time}`;
  if (days === 1) return `yesterday at ${time}`;
  return `on ${saved.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}
