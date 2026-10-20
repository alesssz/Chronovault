/** GET /api/health — health check for monitoring and deployments. */
export default defineEventHandler(() => ({ status: 'ok', time: new Date().toISOString() }))
