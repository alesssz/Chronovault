import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Generates the PWA icons from public/favicon.svg:  pnpm generate:pwa-assets
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#09090b' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#09090b' } },
  },
  images: ['public/favicon.svg'],
})
