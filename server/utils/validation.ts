import { createError, getRouterParam, readBody, type H3Event } from 'h3'
import { z } from 'zod'

/**
 * Request validation helpers for API routes (auto-imported by Nitro).
 * Bodies are validated with the Zod schemas in `shared/schemas`, the same
 * ones the client forms use.
 */

const uuidSchema = z.uuid()

/**
 * Reads a route parameter that must be a UUID, otherwise responds with 400.
 * Checking it here avoids a round trip to Postgres for obviously invalid ids.
 */
export function requireUuidParam(event: H3Event, name = 'id'): string {
  const parsed = uuidSchema.safeParse(getRouterParam(event, name))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: `Invalid "${name}" parameter` })
  }
  return parsed.data
}

/**
 * Reads the JSON body and validates it with a Zod schema; on failure responds
 * with 400 and per-field details in `data.issues` (`{ field: [messages] }`).
 * Returns the parsed output (trimmed strings, empty texts turned into null…).
 */
export async function readValidated<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.output<T>> {
  // Anything at all until the schema has checked it.
  let body: unknown
  try {
    body = await readBody(event)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid JSON' })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Invalid data',
      data: { issues: z.flattenError(parsed.error).fieldErrors },
    })
  }
  return parsed.data
}
