import { createError } from 'h3'

interface DbError {
  code?: string
  message: string
}

/**
 * Turns a Postgres/PostgREST/Storage error into a consistent HTTP error.
 * Technical details go to the server log, never into the response.
 */
export function toHttpError(error: DbError, context: string) {
  const byCode: Record<string, { statusCode: number, message: string }> = {
    '23505': { statusCode: 409, message: 'Item already exists' },
    '23503': { statusCode: 400, message: 'Invalid reference' },
    '23514': { statusCode: 400, message: 'Invalid data' },
    '22P02': { statusCode: 400, message: 'Invalid data' },
    '42501': { statusCode: 403, message: 'Operation not allowed' },
    'PGRST116': { statusCode: 404, message: 'Item not found' },
  }
  const mapped = error.code ? byCode[error.code] : undefined
  if (!mapped) console.error(`[${context}]`, error)
  return createError({
    statusCode: mapped?.statusCode ?? 500,
    message: mapped?.message ?? 'Internal error',
  })
}

export function notFound(message = 'Track not found') {
  return createError({ statusCode: 404, statusMessage: 'Not Found', message })
}
