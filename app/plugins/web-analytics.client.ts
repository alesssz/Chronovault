import { injectAnalytics } from '@vercel/analytics/nuxt/runtime'
import { isSharePagePath } from '~/lib/web-analytics'

/**
 * Vercel Web Analytics: counts visits to the public share pages, which the
 * Statistics page then reads back (GET /api/analytics).
 *
 * - Only on Vercel deployments (`public.webAnalytics`, see nuxt.config.ts):
 *   the script is served by Vercel at /_vercel/insights and exists nowhere else.
 * - Only share pages are counted (/t/<id>, /p/<id>): the private app pages
 *   say nothing useful and would use up the plan's monthly event allowance.
 * - A signed-in visitor is not counted, so the owner opening their own link
 *   does not inflate the numbers.
 *
 * The script sets no cookies and identifies no one (Vercel counts unique
 * visitors with a daily-rotating hash).
 */
export default defineNuxtPlugin(() => {
  if (!useRuntimeConfig().public.webAnalytics) return
  // Signed-in user, if any (known once the session is restored).
  const user = useSupabaseUser()

  // Loads Vercel's counting script, filtered by beforeSend below.
  injectAnalytics({
    // The deployed site is production by definition: no debug script, no console logs.
    mode: 'production',
    // Called before every event is sent; null drops it.
    beforeSend: event => (isSharePagePath(new URL(event.url).pathname) && !user.value ? event : null),
  })
})
