/**
 * End-to-end, track sharing: an unlisted track opens without an account, plays and downloads with
 * its tags (a public one plays but never downloads), never exposes the Suno prompt or mastering
 * status, and answers 404 once private again. Its cover is signed for the
 * share page, but Storage's list endpoint, called with the public key every page ships, names no
 * shared cover and no user's folder (the ids an "unlisted" item is meant to keep to its link).
 */
import { readFile } from 'node:fs/promises'
import { parseBuffer } from 'music-metadata'
import { expect, test } from './fixtures'
import { clickAndWaitForApi, signUp, TINY_PNG, uniqueId, uploadTrack, waitForHydration } from './helpers'

// The edit page saves with PATCH /api/tracks/:id.
const SAVE_TRACK = { method: 'PATCH', path: /^\/api\/tracks\/[0-9a-f-]+$/ }

test.describe('public sharing', () => {
  test('an unlisted track opens without an account; a private one does not', async ({ page, browser, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await signUp(page)
    // A title unique to this test.
    const title = `share-${uniqueId()}`
    await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()

    // The library row of the new track.
    const row = page.getByTestId('track-row').filter({ hasText: title })
    await row.getByRole('button', { name: `Actions for ${title}` }).click()
    // A private track has no public page.
    await expect(page.getByRole('menuitem', { name: 'Copy share link' })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'Edit' }).click()

    // The editor's sharing box.
    const shareBox = page.getByTestId('share-box')
    await expect(shareBox).toContainText('Private: only you can listen')

    // --- Metadata, including the fields that must never be shared ---
    const secretPrompt = `secret-prompt-${uniqueId()}`
    await page.getByTestId('field-description').fill('Written on a rainy night.')
    await page.getByTestId('field-suno-prompt').fill(secretPrompt)
    await page.getByRole('switch', { name: 'Mastering' }).click()
    await page.getByText('Unlisted', { exact: true }).click()
    await clickAndWaitForApi(page, page.getByTestId('save-track'), SAVE_TRACK)
    await expect(page.getByText('Changes saved').first()).toBeVisible()

    // --- The share link ---
    await shareBox.getByTestId('copy-share-link').click()
    await expect(page.getByText('Share link copied').first()).toBeVisible()
    // The copied link.
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText())
    expect(shareUrl).toMatch(new RegExp(`^${baseURL}/t/[0-9a-f-]{36}$`))

    // --- A visitor without an account ---
    const visitorContext = await browser.newContext()
    const visitor = await visitorContext.newPage()
    const response = await visitor.goto(shareUrl)
    expect(response?.status()).toBe(200)

    await expect(visitor.getByTestId('shared-title')).toHaveText(title)
    await expect(visitor.getByTestId('shared-description')).toHaveText('Written on a rainy night.')
    // Server-rendered link preview; unlisted tracks stay out of search engines.
    await expect(visitor.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
    await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')

    // Never shared: the Suno prompt and the mastering status (neither in the page nor in the API).
    const html = await visitor.content()
    expect(html).not.toContain(secretPrompt)
    expect(html.toLowerCase()).not.toContain('mastered')
    // The track's id, from the link.
    const trackId = shareUrl.split('/t/')[1]!
    // The track as the API gives it to a visitor, and its fields.
    const api = await visitor.request.get(`/api/shared/${trackId}`)
    expect(api.ok()).toBe(true)
    // Its fields, to check that nothing private is among them.
    const body = await api.json() as Record<string, unknown>
    expect(body).not.toHaveProperty('sunoPrompt')
    expect(body).not.toHaveProperty('mastered')
    expect(body).not.toHaveProperty('audioPath')
    // Only the file's extension, for the download: the storage key names the owner's account.
    expect(body.fileExtension).toBe('flac')
    expect(JSON.stringify(body)).not.toContain(secretPrompt)

    // The library API stays closed to visitors.
    expect((await visitor.request.get(`/api/tracks/${trackId}`)).status()).toBe(401)

    // The visitor can play the track (once the page is interactive).
    await waitForHydration(visitor)
    // The share page's play button.
    const play = visitor.getByTestId('shared-play')
    await play.click()
    await expect(play).toHaveAttribute('aria-label', 'Pause')

    // …and download it: the stored FLAC with the shared fields written in, never the Suno prompt.
    const downloadEvent = visitor.waitForEvent('download')
    await visitor.getByTestId('shared-download').click()
    // The file saved.
    const download = await downloadEvent
    expect(download.suggestedFilename()).toBe(`${title}.flac`)
    await expect(visitor.getByText(`Downloaded ${title}`).first()).toBeVisible()
    // Its bytes, and the tags music-metadata reads back.
    const file = await readFile((await download.path())!)
    const { common } = await parseBuffer(file, { mimeType: 'audio/flac' })
    expect(common.title).toBe(title)
    expect(common.comment?.[0]?.text).toBe('Written on a rainy night.')
    expect(file.includes(Buffer.from(secretPrompt))).toBe(false)

    // --- Public: still playable, never downloadable ---
    await page.getByText('Public', { exact: true }).click()
    await clickAndWaitForApi(page, page.getByTestId('save-track'), SAVE_TRACK)
    await visitor.goto(shareUrl)
    await waitForHydration(visitor)
    await expect(visitor.getByTestId('shared-play')).toBeVisible()
    await expect(visitor.getByTestId('shared-download')).toHaveCount(0)
    expect((await (await visitor.request.get(`/api/shared/${trackId}`)).json() as { downloadable: boolean }).downloadable).toBe(false)

    // --- Back to private: the link stops working immediately ---
    await page.getByText('Private', { exact: true }).click()
    // Wait for the server, not the toast: the first save's toast may still be
    // on screen, and the visitor must only try once the track is private.
    await clickAndWaitForApi(page, page.getByTestId('save-track'), SAVE_TRACK)

    // The share page once the track is private again.
    const closed = await visitor.goto(shareUrl)
    expect(closed?.status()).toBe(404)
    await expect(visitor.getByTestId('shared-not-found')).toContainText('Track not available')
    expect((await visitor.request.get(`/api/shared/${trackId}/playback`)).status()).toBe(404)

    await visitorContext.close()
  })

  test('nobody can list the shared covers with the public key: neither the users nor their shared items', async ({ page, browser }) => {
    await signUp(page)
    // A track with a cover, shared by link.
    const title = `listed-${uniqueId()}`
    await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()
    await page.getByTestId('track-row').filter({ hasText: title }).getByRole('button', { name: `Actions for ${title}` }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await page.getByTestId('cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: TINY_PNG })
    await clickAndWaitForApi(page, page.getByTestId('crop-confirm'), SAVE_TRACK)
    await page.getByText('Unlisted', { exact: true }).click()
    await clickAndWaitForApi(page, page.getByTestId('save-track'), SAVE_TRACK)
    // The track's id, from the edit page's address (/tracks/:id/edit).
    const id = new URL(page.url()).pathname.split('/')[2]!

    const visitorContext = await browser.newContext()
    try {
      // A visitor on the share page: the cover is there, at a signed URL naming the owner's folder.
      const visitor = await visitorContext.newPage()
      await visitor.goto(`/t/${id}`)
      await waitForHydration(visitor)
      // The cover's signed address, and the owner's id it gives away (the first folder of the path).
      const src = (await visitor.getByRole('img', { name: `Cover of ${title}` }).first().getAttribute('src'))!
      const owner = src.match(/\/sign\/covers\/([0-9a-f-]{36})\//)![1]!
      // What Storage's list endpoint answers the public key, for the owner's folder and for the root.
      const listed = await visitor.evaluate(async (owner) => {
        // The Nuxt app on the root element, whose runtime config the page reads its Supabase settings from.
        const root = document.querySelector('#__nuxt') as unknown as { __vue_app__: { $nuxt: { $config: { public: { supabase: { url: string, key: string } } } } } }
        // The Supabase project the page talks to, and its public key (shipped to every visitor).
        const { url, key } = root.__vue_app__.$nuxt.$config.public.supabase
        /** The names Storage lists under `prefix` in the covers bucket, with the public key alone. */
        const list = async (prefix: string) => {
          // The list call, exactly as any visitor's browser could make it.
          const response = await fetch(`${url}/storage/v1/object/list/covers`, {
            method: 'POST',
            headers: { 'apikey': key, 'authorization': `Bearer ${key}`, 'content-type': 'application/json' },
            body: JSON.stringify({ prefix }),
          })
          return (await response.json() as { name: string }[]).map(o => o.name)
        }
        return { folder: await list(owner), root: await list('') }
      }, owner)
      // Before: the folder named the track (`<id>.webp`), and the root every user with a shared cover.
      expect(listed).toEqual({ folder: [], root: [] })
    }
    finally {
      await visitorContext.close()
    }
  })
})
