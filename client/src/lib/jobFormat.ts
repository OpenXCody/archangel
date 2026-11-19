import type { ApplicationStatus, EmploymentType, PayPeriod } from './jobs';

/** Display helpers for jobs and applications. Money is integer cents throughout. */

function dollars(cents: number, withCents: boolean): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  });
}

/** "$24–$29 an hour", "$52,000–$60,000 a year", or a note when pay is missing. */
export function formatPay(payMin: number | null, payMax: number | null, payPeriod: PayPeriod): string {
  const low = payMin ?? payMax;
  const high = payMax ?? payMin;
  if (low === null || high === null) return 'Pay not listed';
  const withCents = low % 100 !== 0 || high % 100 !== 0;
  const range = low === high ? dollars(low, withCents) : `${dollars(low, withCents)}–${dollars(high, withCents)}`;
  return `${range} ${payPeriod === 'year' ? 'a year' : 'an hour'}`;
}

/**
 * Read a dollar amount a person typed ("24", "24.50", "$52,000") as integer
 * cents. Null when it is not a plain positive amount.
 */
export function parseDollars(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contract: 'Contract',
  apprenticeship: 'Apprenticeship',
};

export function employmentLabel(type: string): string {
  return EMPLOYMENT_LABELS[type as EmploymentType] ?? type;
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  reviewing: 'Reviewing',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

export function applicationStatusLabel(status: string): string {
  return STATUS_LABELS[status as ApplicationStatus] ?? status;
}

/** "Austin, TX", or whichever part exists. */
export function formatPlace(city: string | null, state: string | null): string | null {
  return [city, state].filter(Boolean).join(', ') || null;
}

/** "Nov 16, 2026" */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "today", "yesterday", "5 days ago", then the date once it is a month old. */
export function formatAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `on ${formatDate(iso)}`;
}

/** Whether a job that is still marked open has run past its 60 days. */
export function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}
