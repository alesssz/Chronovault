// The PWA module is not needed in tests (Vitest) and its virtual modules don't resolve there.
const isTest = process.env.VITEST === 'true'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxtjs/supabase',
    ...(isTest ? [] : ['@vite-pwa/nuxt']),
  ],

  // Development only: /sw.js answers with a service worker that unregisters
  // itself, so one left on localhost by a production build stops running
  // (see server/dev/stale-service-worker.ts).
  $development: {
    nitro: {
      handlers: [{ route: '/sw.js', handler: '~~/server/dev/stale-service-worker.ts' }],
    },
  },

  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'ChronoPlayer',
      meta: [
        { name: 'description', content: 'Your personal music library.' },
        { name: 'theme-color', content: '#09090b' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },

  runtimeConfig: {
    // Server-only. Audio files live on an S3-compatible storage: Cloudflare R2 in
    // production, the local Supabase S3 endpoint in development.
    // Set through NUXT_AUDIO_STORAGE_ENDPOINT, _REGION, _BUCKET, _ACCESS_KEY_ID, _SECRET_ACCESS_KEY.
    audioStorage: {
      endpoint: '',
      region: 'auto',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
    },
    // Storage clean-up: files without a track are deleted only once they are
    // this old, so an upload still in progress is never touched.
    // NUXT_STORAGE_CLEANUP_MIN_AGE_HOURS (the e2e tests set it to 0).
    storageCleanup: {
      minAgeHours: 24,
    },
    // Server-only. Reading Vercel Web Analytics for the Statistics page:
    // NUXT_ANALYTICS_TOKEN (a Vercel access token: never sent to the browser),
    // NUXT_ANALYTICS_PROJECT_ID, and NUXT_ANALYTICS_TEAM_ID for team projects.
    // Without them the page shows demo data outside Vercel (see server/utils/web-analytics.ts).
    analytics: {
      token: '',
      projectId: '',
      teamId: '',
    },
    public: {
      // Load the Vercel Web Analytics script. Only on Vercel deployments
      // (Vercel sets VERCEL=1 at build time): elsewhere the script does not
      // exist and would only fail. NUXT_PUBLIC_WEB_ANALYTICS overrides it.
      webAnalytics: process.env.VERCEL === '1',
    },
  },

  // A single copy of Pinia in the server bundle: otherwise the Pinia plugin and
  // the stores get different copies, and server-rendered pages (/t, /p) fail
  // with "no active Pinia".
  build: {
    transpile: ['pinia'],
  },

  routeRules: {
    // App pages are personal and use browser APIs (Web Audio, File):
    // they are rendered on the client only. The public share pages (/t/:id
    // for tracks, /p/:id for playlists) are server-rendered, so link previews
    // show the title and the cover.
    '/': { ssr: false },
    '/tracks/**': { ssr: false },
    '/playlists': { ssr: false },
    '/playlists/**': { ssr: false },
    '/stats': { ssr: false },
    // The sign-in form must never be server-rendered: submitted before
    // hydration it would trigger a native GET submit (password in the URL).
    '/login': { ssr: false },
    '/confirm': { ssr: false },
    // API responses are never cached, with one exception: the cover images
    // of /api/covers/** replace this header with a one-year private cache
    // (server/utils/covers.ts; their URLs are versioned).
    '/api/**': { headers: { 'cache-control': 'no-store' } },
  },

  compatibilityDate: '2026-10-01',

  vite: {
    // The FLAC worker loads libFLAC with a dynamic import: ES module workers are required.
    worker: { format: 'es' },
    // Pre-bundled at dev startup: otherwise Vite discovers them on the first
    // visit to the page that imports them, and reloads it.
    optimizeDeps: {
      include: [
        '@vercel/analytics/nuxt/runtime',
        '@vueuse/integrations/useSortable',
        'browser-id3-writer',
        'hash-wasm',
        'libflacjs/dist/libflac.wasm.js',
        'music-metadata',
        'wavesurfer.js',
        'wavesurfer.js/dist/plugins/regions.esm.js',
        'zod',
      ],
    },
  },

  typescript: {
    strict: true,
    appTsConfig: {
      // A misnamed component (e.g. a forgotten folder prefix) becomes a
      // typecheck error instead of silently rendering an empty HTML element.
      vueCompilerOptions: { checkUnknownComponents: true },
    },
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'ChronoPlayer',
      short_name: 'ChronoPlayer',
      description: 'Your personal music library.',
      lang: 'en',
      theme_color: '#09090b',
      background_color: '#09090b',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // Static assets only: audio (signed URLs) is never cached here, covers
      // use the browser's HTTP cache (/api/covers), and the Vercel Analytics
      // script and its requests (/_vercel/insights) are left untouched.
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      navigateFallback: null,
    },
    devOptions: {
      enabled: false,
    },
  },

  supabase: {
    types: '~~/shared/types/database.types.ts',
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      // Public share pages: no sign-in needed.
      exclude: ['/t/*', '/p/*'],
      saveRedirectToCookie: true,
    },
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
})
