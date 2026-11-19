import { and, eq, gt, isNull } from 'drizzle-orm';
import { invites } from '../db/index.js';
import { hashToken } from './auth.js';

/**
 * Invites: an admin creates a one-time link for an email address; signing up
 * through it creates the account with the invited role. The link carries a
 * random token; only its SHA-256 is stored, so a link can be shown once and
 * never recovered.
 */

export const INVITE_DAYS = 14;
/** An admin invite grants the most, so its link is open for the shortest time. */
const ADMIN_INVITE_DAYS = 3;

const INVITE_ROLES = ['user', 'employer', 'admin'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export function isInviteRole(value: unknown): value is InviteRole {
  return typeof value === 'string' && (INVITE_ROLES as readonly string[]).includes(value);
}

/** How many days an invite for this role can be used. */
export function inviteDays(role: InviteRole): number {
  return role === 'admin' ? ADMIN_INVITE_DAYS : INVITE_DAYS;
}

/** Tokens are 43 characters; anything much longer is not one of ours. */
export const MAX_INVITE_TOKEN_LENGTH = 200;

/** Matches the invite this token opens, while it can still be used: not accepted, not expired. */
export function usableInvite(token: string) {
  return and(eq(invites.tokenHash, hashToken(token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date()));
}

/** The page an invite link opens. */
export function invitePath(token: string): string {
  return `/sign-in?invite=${encodeURIComponent(token)}`;
}
