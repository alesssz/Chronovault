import { subgenreCreateSchema } from '~~/shared/schemas/track'
import { createSubgenre } from '../../../services/genres.service'

/**
 * POST /api/genres/:id/subgenres — creates a custom subgenre under the genre
 * (or returns the genre's subgenre with the same name, built-in or custom,
 * ignoring case). The genres themselves are a fixed list: none is created.
 * Auth: signed-in user (401 otherwise); the subgenre is the user's own.
 * Body: { name } (subgenreCreateSchema). 200 → Subgenre; 400 invalid name or id;
 * 404 unknown genre; 409 a name incoherent with the genre ("Thrash Metal belongs to Metal").
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  // The genre's id in the address (400 when it is not a UUID).
  const genreId = requireUuidParam(event)
  // The fields of the request body, validated against the schema (400 otherwise).
  const { name } = await readValidated(event, subgenreCreateSchema)
  return createSubgenre(db, userId, genreId, name)
})
