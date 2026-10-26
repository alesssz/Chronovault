import { setResponseHeader } from 'h3'

/**
 * Sends the Content Security Policy with every HTML page Nuxt renders (the
 * app's shell and the server-rendered share pages alike), with a nonce drawn
 * for that response and written into the page's own inline scripts. The
 * policy itself is built in server/utils/content-security-policy.ts; the
 * headers that never change are routeRules in nuxt.config.ts.
 *
 * Production builds only (`pnpm docker`, the e2e build, Vercel): the dev
 * server's hot reload injects scripts of its own that the policy would block.
 */
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.dev) return

  // Registered after the modules' plugins, so their tags (the colour mode script) are already in the page.
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    // This response's nonce.
    const nonce = createNonce()
    // Nuxt's tags around the app; `html.body` (the app's markup) is left alone.
    html.head = addNonce(html.head, nonce)
    html.bodyPrepend = addNonce(html.bodyPrepend, nonce)
    html.bodyAppend = addNonce(html.bodyAppend, nonce)

    // Supabase and the audio storage, the only other origins the page talks to.
    const config = useRuntimeConfig(event)
    setResponseHeader(event, 'content-security-policy', contentSecurityPolicy(nonce, {
      supabaseUrl: config.public.supabase.url,
      audioEndpoint: config.audioStorage.endpoint,
    }))
  })
})
