/**
 * How the client talks to the API: one `request`, one error type, one timeout,
 * one retry rule and one query-string builder.
 *
 * The session is an HttpOnly cookie set by the API, so every call is a plain
 * same-origin fetch: no token is read or stored in the client. Errors arrive
 * as `{ error: string }` written for the person using the app;
 * `ApiError.message` carries that text and is safe to show as is.
 */

// Always the same origin: production serves /api beside the page, and in dev
// Vite proxies /api to the Express server (which also makes the dev build
// reachable from a phone on the same network).
export const API_BASE = '/api';

/** How long a request may take before it is given up on. */
export const REQUEST_TIMEOUT_MS = 20_000;
export const UNREACHABLE = 'Could not reach the server. Check your connection and try again.';
export const TOO_SLOW = 'The server took too long to answer. Check your connection and try again.';

/**
 * `fetch` that gives up when no answer has begun after `timeoutMs`, so nothing
 * waits for ever on a connection that has gone. Throws an Error whose message
 * is written for the person: no connection, or no answer in time. (Once the
 * answer has begun, a large one may take as long as it needs to arrive.)
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new Error(controller.signal.aborted ? TOO_SLOW : UNREACHABLE);
  } finally {
    clearTimeout(timer);
  }
}

export class ApiError extends Error {
  /** HTTP status, or 0 when the server could not be reached. */
  status: number;
  /** What the server sent with the refusal, when it sent JSON. */
  payload: unknown;
  constructor(message: string, status: number, payload: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

function messageFor(payload: unknown, status: number): string {
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const { error } = payload as { error: unknown };
    // The session ended elsewhere: say what that means for what was just pressed.
    if (status === 401 && error === 'Sign in required') return 'You are signed out. Sign in to save this.';
    if (typeof error === 'string' && error) return error;
  }
  return `The request could not be completed (${status}).`;
}

export async function request<T>(path: string, { method = 'GET', body, headers }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    // Gives up after a while: a save on a dead connection says so instead of spinning.
    response = await fetchWithTimeout(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new ApiError(error instanceof Error && error.message ? error.message : UNREACHABLE, 0);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(messageFor(payload, response.status), response.status, payload);
  return payload as T;
}

/** The text to show a person for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

function isClientError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/** Retry once on network or server trouble; never on a 4xx, which will not change. */
export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  return !isClientError(error) && failureCount < 1;
}

/** `?a=1&b=2` from the values that are set, or nothing when none is. */
export function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
