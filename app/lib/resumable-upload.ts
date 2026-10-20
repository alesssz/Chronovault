import { Upload } from 'tus-js-client'

/**
 * Resumable upload (TUS protocol) straight into Supabase Storage.
 * The file never goes through the Nuxt/Vercel server (~4.5 MB request limit)
 * and, if the connection drops, the upload resumes where it stopped.
 *
 * Supabase requires chunks of exactly 6 MB.
 */

const CHUNK_SIZE = 6 * 1024 * 1024

export interface ResumableUploadOptions {
  supabaseUrl: string
  apiKey: string
  /** Called for every request: a long upload can outlive the token. */
  getAccessToken: () => Promise<string>
  bucket: string
  path: string
  file: Blob
  contentType: string
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export function resumableUpload(options: ResumableUploadOptions): Promise<void> {
  const { supabaseUrl, apiKey, getAccessToken, bucket, path, file, contentType, onProgress, signal } = options

  return new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${supabaseUrl.replace(/\/$/, '')}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        'apikey': apiKey,
        'x-upsert': 'false',
      },
      onBeforeRequest: async (request) => {
        request.setHeader('authorization', `Bearer ${await getAccessToken()}`)
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK_SIZE,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType,
        cacheControl: '3600',
      },
      onProgress: (sent, total) => onProgress?.(total > 0 ? sent / total : 0),
      onSuccess: () => resolve(),
      onError: error => reject(error),
    })

    signal?.addEventListener('abort', () => {
      void upload.abort(true)
      reject(new DOMException('Upload cancelled', 'AbortError'))
    }, { once: true })

    // Resume an interrupted upload of the same file, if there is one.
    upload.findPreviousUploads().then((previous) => {
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0])
      upload.start()
    }).catch(reject)
  })
}
