import { subgenreRenameSchema } from '~~/shared/schemas/track'
import { renameSubgenre } from '../../services/genres.service'

/**
 * PATCH /api/subgenres/:id — renames one of the user's own subgenres (a typo
 * fixed); it stays in its genre, and its tracks show the new name.
 * Auth: signed-in user (401 otherwise); only their own subgenres can change.
 * Body: { name } (subgenreRenameSchema). 200 → Subgenre; 400 invalid name or
 * id; 403 a built-in subgenre; 404 unknown, or another user's; 409 a name its
 * genre already has, or one incoherent with it ("Thrash Metal belongs to Metal").
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const id = requireUuidParam(event)
  const { name } = await readValidated(event, subgenreRenameSchema)
  return renameSubgenre(db, userId, id, name)
})
