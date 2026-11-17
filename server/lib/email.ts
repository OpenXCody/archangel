import { appendFile } from 'node:fs/promises';

/**
 * Sending email.
 *
 * Mail is on when a provider is configured (`RESEND_API_KEY` and `EMAIL_FROM`),
 * and off otherwise: every caller then carries on as it did before there was
 * email. The provider is Resend's HTTP API, called with `fetch`.
 *
 * On a developer's machine `EMAIL_OUTBOX=<file>` captures instead of sending:
 * each email is appended to that file as one line of JSON, and mail counts as
 * on. It is ignored in production.
 *
 * Nothing here throws into a caller, waits longer than a few seconds for the
 * provider, or logs an address, a link or a token.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Which email this is ("reset", "invite", ...). Used in logs only. */
  kind?: string;
}

export type EmailResult = { sent: true; via: 'resend' | 'outbox' } | { sent: false; reason: 'off' | 'failed' };

const RESEND_URL = 'https://api.resend.com/emails';
/** Resend takes up to 100 emails in one batch request. */
const BATCH_URL = 'https://api.resend.com/emails/batch';
const BATCH_SIZE = 100;
const SEND_TIMEOUT_MS = 4000;
const DEFAULT_APP_URL = 'https://www.o-10.com';
const CAPTURE_FROM = 'Archangel <no-reply@localhost>';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

/** The capture file, when this process should write emails instead of sending them. */
function outboxPath(): string | null {
  const path = process.env.EMAIL_OUTBOX;
  return path && !isProduction() ? path : null;
}

/** True when an email handed to `sendEmail` will go somewhere. */
export function emailEnabled(): boolean {
  return Boolean(outboxPath()) || Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * An address on this site, for a link in an email. Built from `APP_URL`,
 * never from a request: a request's Host header is whatever the sender says.
 */
export function appUrl(path = ''): string {
  const base = (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/+$/, '');
  return `${base}${path}`;
}

const OFF: EmailResult = { sent: false, reason: 'off' };
const FAILED: EmailResult = { sent: false, reason: 'failed' };

function logFailure(kinds: string, why: string): void {
  // The kind and the cause only: no address, subject, link or provider message.
  console.error(`email: ${kinds} not sent (${why})`);
}

function kindsOf(messages: EmailMessage[]): string {
  return [...new Set(messages.map((message) => message.kind ?? 'email'))].join(', ');
}

async function post(url: string, key: string, body: unknown, kinds: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) logFailure(kinds, `the provider answered ${response.status}`);
    return response.ok;
  } catch (err) {
    logFailure(kinds, err instanceof Error && err.name === 'TimeoutError' ? 'the provider did not answer in time' : 'the provider could not be reached');
    return false;
  }
}

/**
 * Send several emails, each to its one recipient. More than one goes to the
 * provider as a single batch request, so a notice to a whole company or to
 * every admin is one call, not one per person. One result per message, in order.
 */
export async function sendEmails(messages: EmailMessage[]): Promise<EmailResult[]> {
  if (messages.length === 0) return [];
  const kinds = kindsOf(messages);
  try {
    const outbox = outboxPath();
    if (outbox) {
      const from = process.env.EMAIL_FROM || CAPTURE_FROM;
      const at = new Date().toISOString();
      const lines = messages.map(({ to, subject, text, html, kind }) => JSON.stringify({ at, kind, from, to, subject, text, html }));
      await appendFile(outbox, `${lines.join('\n')}\n`);
      return messages.map(() => ({ sent: true, via: 'outbox' }));
    }

    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) return messages.map(() => OFF);

    const payload = messages.map(({ to, subject, text, html }) => ({ from, to, subject, text, html }));
    if (payload.length === 1) {
      const ok = await post(RESEND_URL, key, payload[0], kinds);
      return [ok ? { sent: true, via: 'resend' } : FAILED];
    }
    const results: EmailResult[] = [];
    for (let start = 0; start < payload.length; start += BATCH_SIZE) {
      const chunk = payload.slice(start, start + BATCH_SIZE);
      const ok = await post(BATCH_URL, key, chunk, kinds);
      for (let i = 0; i < chunk.length; i += 1) results.push(ok ? { sent: true, via: 'resend' } : FAILED);
    }
    return results;
  } catch {
    logFailure(kinds, outboxPath() ? 'the outbox file could not be written' : 'an unexpected error');
    return messages.map(() => FAILED);
  }
}

/** Send one email. Does nothing, and says so, when mail is off. Never throws. */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const [result] = await sendEmails([message]);
  return result;
}

interface RequestContext {
  waitUntil?: (work: Promise<unknown>) => void;
}

/**
 * Let work carry on after the response has gone. A long-lived server simply
 * keeps running. On Vercel a function is frozen once it has answered unless
 * the platform is told what to wait for, which is what its request context's
 * `waitUntil` is for (the same hook `@vercel/functions` uses).
 *
 * Returns false when the work cannot be left to finish on its own, so the
 * caller must await it before answering. `work` must not reject.
 */
export function finishLater(work: Promise<unknown>): boolean {
  if (!process.env.VERCEL) return true;
  try {
    const store = (globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] as
      | { get?: () => RequestContext | undefined }
      | undefined;
    const context = store?.get?.();
    if (typeof context?.waitUntil !== 'function') return false;
    context.waitUntil(work);
    return true;
  } catch {
    return false;
  }
}
