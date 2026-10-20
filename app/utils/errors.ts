/**
 * Human-readable message from any error: API errors (`data.message`),
 * standard JS errors or unknown values.
 */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error && typeof error === 'object') {
    const data = (error as { data?: { message?: unknown } }).data
    if (data && typeof data.message === 'string' && data.message) return data.message
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  if (typeof error === 'string' && error) return error
  return fallback
}
