/**
 * End-to-end, a NUL character (U+0000) in any text the API takes is a client error (400), never
 * a server error: Postgres cannot store it in a text or jsonb column, and before the schemas
 * refused it, it reached the database and came back as a 500 (logged as an internal error).
 * An anonymous visitor could do that at will through a vote's comment: that vote is checked next
 * to the same vote with a plain comment, accepted, so the 400 can only come from the NUL.
 */
import { expect, test } from './fixtures'
import { seedLibrary, signUp } from './helpers'

/** A text with a NUL character in the middle. */
const WITH_NUL = 'before\u0000after'

test.describe('text with a NUL character', () => {
  test('is refused with 400 everywhere text comes in, signed in or not', async ({ page, browser }) => {
    await signUp(page)
    await seedLibrary(page, 2)

    // Every place the owner sends text, each answered with its status.
    const owner = await page.evaluate(async (nul) => {
      // The two seeded tracks.
      const [first, second] = await (await fetch('/api/tracks')).json() as { id: string }[]
      /** Sends `body` as JSON with `method` to `url` and answers the status. */
      const send = (method: string, url: string, body: unknown) => fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.status)
      // A shared group of the two, for the visitor below: it must exist, or the vote's 400 below
      // could come from an address with no group in it (`undefined`) instead of the NUL.
      const created = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Versions', purpose: 'versions', visibility: 'unlisted', trackIds: [first!.id, second!.id] }),
      })
      if (created.status !== 201) throw new Error(`Group not created: ${created.status}`)
      // The new group, whose id the visitor votes through.
      const group = await created.json() as { id: string }
      return {
        group: group.id,
        firstTrack: first!.id,
        title: await send('PATCH', `/api/tracks/${first!.id}`, { title: nul }),
        lyrics: await send('PATCH', `/api/tracks/${first!.id}`, { lyrics: nul }),
        synced: await send('PATCH', `/api/tracks/${first!.id}`, { lyricsSynced: [{ time: 1, text: nul }] }),
        playlist: await send('POST', '/api/playlists', { title: nul }),
        subgenre: await send('POST', `/api/genres/${(await (await fetch('/api/genres')).json())[0].id}/subgenres`, { name: nul }),
      }
    }, WITH_NUL)
    expect({ ...owner, group: undefined, firstTrack: undefined }).toEqual({
      group: undefined, firstTrack: undefined, title: 400, lyrics: 400, synced: 400, playlist: 400, subgenre: 400,
    })

    // An anonymous visitor's vote, with a NUL in the comment.
    const visitorContext = await browser.newContext()
    try {
      // The visitor's API client (no session): the vote with a NUL in its comment…
      const vote = await visitorContext.request.put(`/api/shared/playlists/${owner.group}/vote`, {
        data: { voterId: crypto.randomUUID(), trackId: owner.firstTrack, comment: WITH_NUL },
      })
      expect(vote.status()).toBe(400)
      // …and the same vote with a plain comment, accepted: the 400 came from the NUL alone.
      const control = await visitorContext.request.put(`/api/shared/playlists/${owner.group}/vote`, {
        data: { voterId: crypto.randomUUID(), trackId: owner.firstTrack, comment: 'before after' },
      })
      expect(control.status()).toBe(200)
    }
    finally {
      await visitorContext.close()
    }
  })
})
