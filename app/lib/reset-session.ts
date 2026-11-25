/**
 * Whether a session may choose a new password on /reset-password: only one opened by a reset
 * email's link, a moment ago. Any other session (signed in with the password, or opened by a
 * link long since) is sent an email instead: someone who got hold of a signed-in browser must
 * not turn it into a password of their own, usable from anywhere.
 *
 * The session's token says how it was opened (the JWT's `amr` claim): `otp` for the link of
 * Chronovault's email (`token_hash`, verified by the page), `recovery` for the `code` of
 * Supabase's default one; `password` after signing in. It keeps the first sign-in's method and
 * time across token refreshes, hence the age limit.
 */

/** One entry of the `amr` claim: how and when (Unix seconds) the session was opened. */
export interface AmrEntry {
  method: string
  timestamp: number
}

/** The methods of a session opened by a reset link (see above). */
const LINK_METHODS = new Set(['otp', 'recovery'])

/** How long after its link a session may still choose a password (seconds): the page asks at once. */
export const LINK_SESSION_MAX_AGE = 10 * 60

/**
 * True when `amr` says the session was opened by a reset link less than LINK_SESSION_MAX_AGE ago.
 * A bare method name (the standard's form, RFC 8176) has no time to check, so it never counts.
 */
export function isFreshLinkSession(amr: readonly (AmrEntry | string)[] | undefined, now = Date.now() / 1000): boolean {
  return (amr ?? []).some(entry => typeof entry !== 'string'
    && LINK_METHODS.has(entry.method) && now - entry.timestamp < LINK_SESSION_MAX_AGE)
}
