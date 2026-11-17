import { and, eq, gt, isNull } from 'drizzle-orm';
import { passwordResets } from '../db/index.js';
import { hashToken } from './auth.js';

/**
 * Password resets: an admin creates a one-time link for a person who cannot
 * sign in; opening it lets them choose a new password. Like an invite, the
 * link carries a random token and only its SHA-256 is stored, so it can be
 * shown once and never recovered. When mail is on the link is also emailed
 * to the person, and "Forgot password?" on the sign-in page makes one without
 * an admin (server/lib/notices.ts); when it is off the admin passes it on.
 */

export const RESET_HOURS = 24;

/** Tokens are 43 characters; anything much longer is not one of ours. */
export const MAX_RESET_TOKEN_LENGTH = 200;

/** Matches the reset this token opens, while it can still be used: not used, not expired. */
export function usableReset(token: string) {
  return and(eq(passwordResets.tokenHash, hashToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date()));
}

/** The page a reset link opens. */
export function resetPath(token: string): string {
  return `/sign-in?reset=${encodeURIComponent(token)}`;
}
