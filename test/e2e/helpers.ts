/**
 * End-to-end helpers: WAV files generated on the fly, throwaway accounts,
 * uploads (one through the page, or hundreds straight through the API for a
 * large library), and waiting for a save to really reach the server.
 */
import { expect, type Locator, type Page } from '@playwright/test'

/** Shape of a generated WAV (defaults: 3 s, 8 kHz, mono, 16-bit). */
export interface WavOptions {
  seconds?: number
  sampleRate?: number
  channels?: number
  /** 16 or 24 for integer PCM, 32 together with `float` for IEEE float. */
  bitsPerSample?: 16 | 24 | 32
  float?: boolean
}

/** PCM WAV with a sine wave: a valid audio file with no binary fixtures. */
export function makeWav(options: WavOptions = {}): Buffer {
  const { seconds = 3, sampleRate = 8000, channels = 1, bitsPerSample = 16, float = false } = options
  const bytesPerSample = bitsPerSample / 8
  const frames = Math.floor(seconds * sampleRate)
  const data = Buffer.alloc(frames * channels * bytesPerSample)
  for (let i = 0; i < frames; i++) {
    const value = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5
    for (let ch = 0; ch < channels; ch++) {
      // Interleaved layout: every channel gets the same sine sample.
      const offset = (i * channels + ch) * bytesPerSample
      if (float) data.writeFloatLE(value, offset)
      else data.writeIntLE(Math.round(value * (2 ** (bitsPerSample - 1) - 1)), offset, bytesPerSample)
    }
  }

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(float ? 3 : 1, 20) // 1 = PCM, 3 = IEEE float
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28) // bytes per second
  header.writeUInt16LE(channels * bytesPerSample, 32) // block align
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)

  return Buffer.concat([header, data])
}

/** A short unique suffix for titles and emails, so tests never collide. */
export function uniqueId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Signs up a new user (email confirmation is disabled locally). */
export async function signUp(page: Page): Promise<string> {
  // A throwaway account, unique per test.
  const email = `e2e-${uniqueId()}@chronoplayer.test`
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.locator('input[name="password"]').fill('password-e2e-123')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible()
  return email
}

/** Signs in an existing user and waits for the library. */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible()
}

/** Uploads a generated WAV and waits until the track is registered. */
export async function uploadTrack(page: Page, title: string, wav: WavOptions = {}): Promise<void> {
  await page.goto('/tracks/new')
  await page.locator('input[type="file"]').setInputFiles({
    name: `${title}.wav`,
    mimeType: 'audio/wav',
    buffer: makeWav(wav),
  })
  await expect(page.locator('[data-testid="upload-item"][data-status="done"]')).toHaveCount(1, { timeout: 30_000 })
}

/**
 * Waits until Nuxt has hydrated a server-rendered page (the public /t and /p
 * pages). Their buttons are on screen from the first byte, but a click before
 * hydration does nothing; on the dev server hydration takes seconds.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    // The Vue app on the root element; `$nuxt` is the Nuxt app it carries.
    const root = document.querySelector('#__nuxt') as { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } } | null
    return root?.__vue_app__?.$nuxt?.isHydrating === false
  })
}

/** An API request to wait for: HTTP method and a pattern for the URL path. */
export interface ApiRequest {
  method: string
  path: RegExp
}

/**
 * Clicks a control that saves through the API and waits for the server's
 * successful answer.
 *
 * Why not just wait for the success toast: when the same toast (e.g.
 * "Changes saved") is still on screen from an earlier save, the assertion
 * passes at once, before this request has even reached the server, and the
 * next step races the save. The response, instead, belongs to this click.
 */
export async function clickAndWaitForApi(page: Page, control: Locator, request: ApiRequest): Promise<void> {
  // Listen before clicking, so a fast response cannot be missed.
  const response = page.waitForResponse(r =>
    r.request().method() === request.method && request.path.test(new URL(r.url()).pathname))
  await control.click()
  expect((await response).ok()).toBe(true)
}

/**
 * Fills the signed-in user's library with `count` tracks ("Track 001", "Track 002"…, created in
 * that order, so the newest is the last number) straight through the API, as the upload page
 * does but without the page: upload address, PUT of a tiny WAV, then the track. Several at a time:
 * hundreds of tracks take seconds, where uploading them one by one through the page would take
 * minutes. The tracks have no cover, peaks or tags.
 */
export async function seedLibrary(page: Page, count: number): Promise<void> {
  // The file is the same for every track: a valid 0.1-second WAV, base64 so it crosses into the page.
  const wav = makeWav({ seconds: 0.1 }).toString('base64')
  await page.evaluate(async ({ count, wav }) => {
    // Decoded once in the page.
    const bytes = Uint8Array.from(atob(wav), c => c.charCodeAt(0))
    /** One track: upload address, file, then the track itself; any step failing throws. */
    async function attempt(n: number) {
      const id = crypto.randomUUID()
      const post = (url: string, body: unknown) => fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const target = await (await post('/api/tracks/upload-url', {
        trackId: id, extension: 'wav', mimeType: 'audio/wav', sizeBytes: bytes.length,
      })).json() as { uploadUrl: string, audioPath: string }
      const upload = await fetch(target.uploadUrl, { method: 'PUT', headers: { 'content-type': 'audio/wav' }, body: bytes })
      if (!upload.ok) throw new Error(`Track ${n}: upload failed (${upload.status})`)
      const response = await post('/api/tracks', {
        id, title: `Track ${String(n).padStart(3, '0')}`, audioPath: target.audioPath,
        mimeType: 'audio/wav', sizeBytes: bytes.length, durationSeconds: 0.1,
      })
      if (!response.ok) throw new Error(`Track ${n} not created: ${response.status}`)
    }
    /**
     * One track, tried up to three times: hundreds of quick uploads now and then meet a
     * passing storage error, which must not fail a test about something else.
     */
    async function create(n: number) {
      for (let tries = 1; ; tries++) {
        try {
          return await attempt(n)
        }
        catch (err) {
          if (tries === 3) throw err
        }
      }
    }
    // In batches: in order (Track 001 first), a few requests at a time.
    for (let start = 1; start <= count; start += 10) {
      await Promise.all(Array.from({ length: Math.min(10, count - start + 1) }, (_, i) => create(start + i)))
    }
  }, { count, wav })
}
