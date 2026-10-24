import { createError } from 'h3'

/**
 * Error helpers for the backend (auto-imported by Nitro).
 * Responses never contain technical details (SQL messages, stack traces):
 * those are logged on the server only.
 */

/** Shape shared by Postgres, PostgREST and Storage errors. */
interface DbError {
  code?: string
  message: string
}

/**
 * Turns a Postgres/PostgREST/Storage error into a consistent HTTP error.
 * Known codes map to a 4xx with a generic message; anything else becomes a
 * 500 and is logged with `context` (e.g. `tracks.insert`) to find its origin.
 */
export function toHttpError(error: DbError, context: string) {
  // Error codes we expect, with the status and generic message they map to.
  const byCode: Record<string, { statusCode: number, message: string }> = {
    // unique_violation, e.g. a genre name that already exists
    '23505': { statusCode: 409, message: 'Item already exists' },
    // foreign_key_violation, e.g. an unknown genre_id
    '23503': { statusCode: 400, message: 'Invalid reference' },
    // check_violation: lengths, year range, paths outside the owner's folder
    '23514': { statusCode: 400, message: 'Invalid data' },
    // invalid_text_representation, e.g. a malformed uuid
    '22P02': { statusCode: 400, message: 'Invalid data' },
    // insufficient_privilege: an RLS policy refused the row
    '42501': { statusCode: 403, message: 'Operation not allowed' },
    // no_data_found, raised by our own functions (set_playlist_tracks, record_play, votes)
    'P0002': { statusCode: 404, message: 'Item not found' },
    // object_not_in_prerequisite_state, raised by the vote functions once a version is final
    '55000': { statusCode: 409, message: 'Voting is closed' },
    // PostgREST: `.single()` found no row
    'PGRST116': { statusCode: 404, message: 'Item not found' },
  }
  const mapped = error.code ? byCode[error.code] : undefined
  if (!mapped) console.error(`[${context}]`, error)
  return createError({
    statusCode: mapped?.statusCode ?? 500,
    message: mapped?.message ?? 'Internal error',
  })
}

/**
 * 404 response. Also used for items that exist but belong to someone else
 * or are private: the API never reveals whether an id exists.
 */
export function notFound(message = 'Track not found') {
  return createError({ statusCode: 404, statusMessage: 'Not Found', message })
}

/** 404 for playlists (owner routes and public pages alike). */
export function playlistNotFound() {
  return notFound('Playlist not found')
}

/** 400 for a request the services refuse (forged paths, limits); the message is shown to the user. */
export function badRequest(message: string) {
  return createError({ statusCode: 400, message })
}
