import { deleteSubgenre } from '../../services/genres.service'

/**
 * DELETE /api/subgenres/:id — deletes one of the user's own subgenres; its
 * tracks keep their genre, without a subgenre.
 * Auth: signed-in user (401 otherwise); only their own subgenres can go.
 * 204; 400 invalid id; 403 a built-in subgenre; 404 unknown, or another user's.
 */
export default defineEventHandler(async (event) => {
  // The signed-in user's database client (RLS applies); 401 without a session.
  const { db } = await requireAuth(event)
  await deleteSubgenre(db, requireUuidParam(event))
  setResponseStatus(event, 204)
  return null
})
