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
  },

  routeRules: {
    // App pages are personal and use browser APIs (Web Audio, File):
    // they are rendered on the client only. SSR stays available for future
    // public pages (e.g. sharing a track with a social preview).
    '/': { ssr: false },
    '/tracks/**': { ssr: false },
    // The sign-in form must never be server-rendered: submitted before
    // hydration it would trigger a native GET submit (password in the URL).
    '/login': { ssr: false },
    '/confirm': { ssr: false },
    // API responses are never cached.
    '/api/**': { headers: { 'cache-control': 'no-store' } },
  },

  compatibilityDate: '2026-10-01',

  vite: {
    // The FLAC worker loads libFLAC with a dynamic import: ES module workers are required.
    worker: { format: 'es' },
    optimizeDeps: { include: ['libflacjs/dist/libflac.wasm.js'] },
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
      // Static assets only: audio and covers come from signed URLs and must not be cached.
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
      exclude: [],
      saveRedirectToCookie: true,
    },
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
})
