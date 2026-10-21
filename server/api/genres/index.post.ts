import { genreCreateSchema } from '~~/shared/schemas/track'
import { createGenre } from '../../services/genres.service'

/**
 * POST /api/genres — creates a custom genre (or returns the existing one
 * with the same name, built-in or custom, ignoring case).
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: { name } (genreCreateSchema). 200 → Genre; 400 invalid name.
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const { name } = await readValidated(event, genreCreateSchema)
  return createGenre(db, userId, name)
})
