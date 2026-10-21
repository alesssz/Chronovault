/**
 * End-to-end helpers: WAV files generated on the fly, throwaway accounts, uploads.
 */
import { expect, type Page } from '@playwright/test'

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

export function uniqueId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Signs up a new user (email confirmation is disabled locally). */
export async function signUp(page: Page): Promise<string> {
  const email = `e2e-${uniqueId()}@chronoplayer.test`
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.locator('input[name="password"]').fill('password-e2e-123')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible()
  return email
}

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
