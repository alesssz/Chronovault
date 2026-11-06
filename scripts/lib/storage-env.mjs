/**
 * The audio storage settings of an env file (NUXT_AUDIO_STORAGE_*, as named
 * on Vercel), checked before any request: `pnpm r2:check` and `pnpm
 * flac:seektable --env` share it. .env.r2 is written by hand, from Cloudflare.
 *
 * Why the checks: a value left empty, or a placeholder copied in place of the
 * real one (Vercel shows its "Sensitive" variables as "[SENSITIVE]", and
 * cannot give them back), reached the signing library as an address such as
 * "[SENSITIVE]/…", which failed with a bare "Invalid URL".
 */

/** The variable names, in the order they are listed. */
export const STORAGE_VARIABLES = [
  'NUXT_AUDIO_STORAGE_ENDPOINT',
  'NUXT_AUDIO_STORAGE_REGION',
  'NUXT_AUDIO_STORAGE_BUCKET',
  'NUXT_AUDIO_STORAGE_ACCESS_KEY_ID',
  'NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY',
]

/** A placeholder in place of a real value, such as Vercel's "[SENSITIVE]". */
export function isPlaceholder(value) {
  return /^\[.*\]$/.test(value?.trim() ?? '')
}

/**
 * The storage configuration of these values, or what is wrong with them:
 * each variable left empty or holding a placeholder, and an endpoint that is
 * not an http(s) address. The region defaults to R2's "auto".
 */
export function storageConfig(values) {
  // A usable value, or undefined.
  const read = name => (values[name] && !isPlaceholder(values[name]) ? values[name].trim() : undefined)
  const config = {
    endpoint: read('NUXT_AUDIO_STORAGE_ENDPOINT')?.replace(/\/$/, ''),
    region: read('NUXT_AUDIO_STORAGE_REGION') || 'auto',
    bucket: read('NUXT_AUDIO_STORAGE_BUCKET'),
    accessKeyId: read('NUXT_AUDIO_STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: read('NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY'),
  }
  const problems = STORAGE_VARIABLES
    .filter(name => name !== 'NUXT_AUDIO_STORAGE_REGION' && !read(name))
    .map(name => (isPlaceholder(values[name]) ? `${name} is a placeholder (${values[name].trim()}), not its value` : `${name} is empty`))
  if (config.endpoint && !/^https?:\/\/[^/]+/.test(config.endpoint)) {
    problems.push('NUXT_AUDIO_STORAGE_ENDPOINT is not an http(s) address')
  }
  return { config, problems }
}

/** Where each value comes from on Cloudflare, for the messages. */
export const WHERE_ON_CLOUDFLARE = [
  'NUXT_AUDIO_STORAGE_ENDPOINT: R2 → the bucket → Settings → "S3 API" (https://<account id>.r2.cloudflarestorage.com, without the bucket name)',
  'NUXT_AUDIO_STORAGE_BUCKET: the bucket\'s name (chronovault-audio)',
  'NUXT_AUDIO_STORAGE_ACCESS_KEY_ID and _SECRET_ACCESS_KEY: R2 → Manage API tokens → Create API token, "Object Read & Write" on that bucket (the secret is shown once)',
]
