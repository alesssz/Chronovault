import { genreCreateSchema } from '~~/shared/schemas/track'
import { createGenre } from '../../services/genres.service'

/** POST /api/genres — creates a custom genre (or returns the existing one). */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const { name } = await readValidated(event, genreCreateSchema)
  return createGenre(db, userId, name)
})
