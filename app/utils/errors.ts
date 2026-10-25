/**
 * Human-readable message from any error: API errors (`data.message`),
 * standard JS errors or unknown values. Used for toasts and inline errors.
 * Auto-imported (Nuxt scans app/utils).
 */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error && typeof error === 'object') {
    // $fetch errors carry the server response in `data` (our API: { message }).
    const data = (error as { data?: { message?: unknown } }).data
    if (data && typeof data.message === 'string' && data.message) return data.message
    // Any Error (network, browser API…).
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  if (typeof error === 'string' && error) return error
  return fallback
}

/**
 * HTTP status of a failed API call ($fetch errors carry it as `statusCode`
 * and `status`), or undefined for anything else (network, browser errors).
 * Lets a caller react to one status, e.g. 409 "voting is closed".
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  // Both spellings: ofetch errors carry `statusCode`, fetch-like ones `status`.
  const { statusCode, status } = error as { statusCode?: unknown, status?: unknown }
  if (typeof statusCode === 'number') return statusCode
  return typeof status === 'number' ? status : undefined
}
