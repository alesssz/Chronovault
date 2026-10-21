/**
 * GET /api/health — health check for monitoring and deployments.
 * Auth: none. Also used by Playwright and Docker to wait for the server.
 * 200 → { status: "ok", time: ISO timestamp }
 */
export default defineEventHandler(() => ({ status: 'ok', time: new Date().toISOString() }))
