import { WebAnalyticsClient, type WebAnalyticsConfig } from '../repositories/web-analytics'

/**
 * Where the Statistics page gets its numbers (auto-imported by Nitro):
 *
 * - `vercel`: token and project id are configured (NUXT_ANALYTICS_TOKEN,
 *   NUXT_ANALYTICS_PROJECT_ID, optional NUXT_ANALYTICS_TEAM_ID): real data.
 * - `demo`: not running on Vercel (local dev, Docker, e2e tests) and not
 *   configured. The analytics script only exists on Vercel, so there is no
 *   real data to show: the page gets made-up numbers, clearly flagged.
 * - `unconfigured`: on Vercel but without token or project id. Demo numbers
 *   would be mistaken for real ones in production, so the page explains
 *   what to configure instead.
 *
 * Vercel sets `VERCEL=1` in the environment of every deployment.
 */
export type WebAnalyticsSource = { kind: 'vercel', client: WebAnalyticsClient } | { kind: 'demo' } | { kind: 'unconfigured' }

/** The source for this deployment (a new client per request: it holds no state). */
export function useWebAnalyticsSource(): WebAnalyticsSource {
  // runtimeConfig.analytics, filled from NUXT_ANALYTICS_* at startup.
  const config = useRuntimeConfig().analytics as WebAnalyticsConfig
  if (config.token && config.projectId) return { kind: 'vercel', client: new WebAnalyticsClient(config) }
  return process.env.VERCEL ? { kind: 'unconfigured' } : { kind: 'demo' }
}
