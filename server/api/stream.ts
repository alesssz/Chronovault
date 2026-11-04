import { createError, getQuery, sendRedirect, setResponseHeaders } from 'h3'
import { badRequest, notFound } from '../utils/errors'

/**
 * GET | HEAD /api/stream?k=<key>&e=<expiry>&s=<signature> — the app's own
 * address of an audio file, the one the player (and so a cast device) uses.
 * Handed out by the playback routes (see playbackSource), valid 6 hours.
 *
 * Why it exists: a cast device fetches the audio itself, with no session, so
 * it needs an address that carries its own permission and answers any check
 * a player makes. A presigned storage URL only answers the method it was
 * signed for (a HEAD gets 403). It was made when Chrome on Android closed its
 * device picker at once ("The prompt was dismissed"), on the guess that a
 * HEAD check caused it; that refusal remains, Chrome sends no HEAD (see
 * pages/cast-test.vue and docs/07-data-flows.md, 7.5). Here:
 * - HEAD answers by itself: 200 with the file's type and size, read from the
 *   storage with a HEAD signed by the server; no body;
 * - GET redirects (302) to a presigned GET of the file, valid until this
 *   address expires: the audio, range requests included, still comes straight
 *   from the storage, never through the app's server.
 *
 * Auth: none. A cast device has no session, so the address itself carries
 * the permission: the storage key and the expiry, signed by the server
 * (AudioStorage.verifyStream). An address missing one of its parts answers
 * 400; a wrong signature or a past expiry 403, without telling whether the
 * file exists. Any origin may read the answers (a cast device's player runs
 * on another origin); they hold nothing the address does not.
 */
export default defineEventHandler(async (event) => {
  // Only reading: anything else is refused before looking at the address.
  if (event.method !== 'GET' && event.method !== 'HEAD') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }
  // The address's parts: the storage key, its expiry (unix seconds) and the signature.
  const { k, e, s } = getQuery(event)
  if (typeof k !== 'string' || typeof e !== 'string' || typeof s !== 'string') {
    throw badRequest('Invalid audio address')
  }
  // The audio storage client (R2, or the local S3 endpoint).
  const audio = useAudioStorage()
  if (!(await audio.verifyStream(k, e, s))) {
    throw createError({ statusCode: 403, message: 'Invalid or expired audio address' })
  }

  // Readable from a cast device's player; never cached (it redirects to a URL that expires).
  setResponseHeaders(event, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' })

  if (event.method === 'HEAD') {
    // The file's size and type, from a HEAD signed by the server.
    const object = await audio.head(k)
    if (!object) throw notFound('Audio file not found')
    // Headers only: written directly, so nothing recomputes Content-Length from an empty body.
    event.node.res.writeHead(200, {
      'Content-Type': object.contentType ?? 'application/octet-stream',
      'Content-Length': String(object.size),
      'Accept-Ranges': 'bytes',
    })
    event.node.res.end()
    return
  }

  // The presigned GET lives as long as this address still does (at least a minute).
  const remaining = Math.max(60, Number(e) - Math.floor(Date.now() / 1000))
  return sendRedirect(event, await audio.presign('GET', k, remaining), 302)
})
