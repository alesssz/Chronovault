/**
 * Uploads a file with a single PUT to a presigned URL (Cloudflare R2 or any
 * S3-compatible storage). The file never goes through the Nuxt/Vercel server.
 *
 * XMLHttpRequest instead of fetch: it is the only browser API that reports
 * upload progress. Network failures are retried a couple of times.
 */

export interface DirectUploadOptions {
  /** Presigned PUT URL from POST /api/tracks/upload-url. */
  url: string
  file: Blob
  /** Must be the type the file is stored with: R2 serves it back as Content-Type. */
  contentType: string
  /** Called with 0..1 while sending; reset to 0 before a retry. */
  onProgress?: (fraction: number) => void
  /** Attempts on network errors or 5xx responses (default 3). */
  attempts?: number
}

/** Upload failure; `status` is the HTTP status, or null for network errors and timeouts. */
export class UploadError extends Error {
  override name = 'UploadError'
  constructor(message: string, readonly status: number | null) {
    super(message)
  }
}

/**
 * Uploads with retries: network errors and 5xx responses are retried with a
 * growing delay (1 s, 2 s…); 4xx responses (e.g. an expired URL, 403) fail
 * immediately since retrying the same URL cannot succeed.
 */
export async function directUpload(options: DirectUploadOptions): Promise<void> {
  const attempts = options.attempts ?? 3
  for (let attempt = 1; ; attempt++) {
    try {
      await putOnce(options)
      return
    }
    catch (error) {
      const retryable = error instanceof UploadError && (error.status === null || error.status >= 500)
      if (!retryable || attempt >= attempts) throw error
      options.onProgress?.(0)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
}

/** One PUT attempt, reporting progress. */
function putOnce({ url, file, contentType, onProgress }: DirectUploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    request.setRequestHeader('Content-Type', contentType)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total)
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1)
        resolve()
      }
      else {
        reject(new UploadError(`Upload failed (HTTP ${request.status})`, request.status))
      }
    }
    request.onerror = () => reject(new UploadError('Upload failed: network error', null))
    request.ontimeout = () => reject(new UploadError('Upload failed: timed out', null))
    request.send(file)
  })
}
