#!/usr/bin/env node
/**
 * Generates the brand images in public/ from shared/brand.ts (the mark) and
 * brand/chronovault.jpg (the artwork):
 *
 * | File                               | What                                                  | Mark  |
 * |------------------------------------|-------------------------------------------------------|-------|
 * | favicon.svg                        | browser tab icon (modern browsers)                    | small |
 * | favicon.ico                        | 16, 32 and 48 px, for browsers without SVG favicons   | small |
 * | pwa-64x64.png, -192x192, -512x512  | installed app icons (PWA manifest)                    | full  |
 * | maskable-icon-512x512.png          | Android adaptive icon: the system crops it to a shape | full  |
 * | apple-touch-icon-180x180.png       | iPhone and iPad home screen (iOS rounds the corners)  | full  |
 * | cover-fallback.webp                | cover of tracks and playlists without one             | –     |
 * | cover-fallback.jpg                 | the same, for link previews                           | –     |
 *
 * Every icon is the mark on a night-blue tile: a rounded square with
 * transparent corners where the system shows the icon as it is (tab, PWA
 * icons), a full square where the system cuts its own shape (maskable, Apple).
 * The `small` mark (a single wave) stays sharp at 16 px, where the three
 * strings of the `full` one would blur together.
 *
 * The files are committed: run this only after changing the mark, the
 * colours or the artwork.
 *
 * Usage:  pnpm generate:brand
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
// Node strips the types of this TypeScript file on import (Node 22.18+).
import { BRAND_COLORS, FALLBACK_COVER, MARK_CORE, MARK_CORE_STOPS, MARK_STROKES } from '../shared/brand.ts'

/** The project's public/ folder: every file goes there. */
const PUBLIC = resolve(process.cwd(), 'public')
/** The Chronovault artwork, source of the fallback cover. */
const ARTWORK = resolve(process.cwd(), 'brand/chronovault.jpg')

/** Corner radius of the rounded tile, on the 100×100 grid: 22%, like the platform icons. */
const TILE_RADIUS = 22

/**
 * The SVG of one icon: the night tile, the glow inside the portal and the mark.
 * - `variant`: `full` or `small` (see shared/brand.ts);
 * - `rounded`: rounded corners (transparent outside), or a full square;
 * - `scale`: how much of the tile the mark fills (1 = edge to edge). Below 1,
 *   the mark shrinks around the centre, inside the area a system crop keeps.
 */
function iconSvg({ variant, rounded, scale }) {
  // The strokes, each painted with the brand colour of its role.
  const paint = { ring: BRAND_COLORS.gold, wave: BRAND_COLORS.spectral, halo: BRAND_COLORS.night }
  const strokes = MARK_STROKES[variant]
    .map(s => `<path d="${s.d}" stroke="${paint[s.paint]}" stroke-width="${s.width}"/>`)
    .join('')
  // The glow's colour stops, centre to edge.
  const stops = MARK_CORE_STOPS
    .map(s => `<stop offset="${s.offset}" stop-color="${s.color}" stop-opacity="${s.opacity}"/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`
    + `<defs>`
    + `<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BRAND_COLORS.tileTop}"/><stop offset="1" stop-color="${BRAND_COLORS.tileBottom}"/></linearGradient>`
    + `<radialGradient id="core">${stops}</radialGradient>`
    + `</defs>`
    + `<rect width="100" height="100" rx="${rounded ? TILE_RADIUS : 0}" fill="url(#tile)"/>`
    // Scaled around the centre (50, 50).
    + `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">`
    + `<circle cx="${MARK_CORE.cx}" cy="${MARK_CORE.cy}" r="${MARK_CORE.r}" fill="url(#core)"/>`
    + `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${strokes}</g>`
    + `</g>`
    + `</svg>\n`
}

/** A PNG of an icon SVG, `size` pixels square. */
function png(svg, size) {
  // A high density first, so the vector is drawn sharp, then resized down.
  return sharp(Buffer.from(svg), { density: 72 * Math.max(1, size / 100) * 2 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/**
 * An .ico file holding PNG images (allowed since Windows Vista, read by every
 * browser): a 6-byte header, a 16-byte entry per image, then the images.
 */
function ico(images) {
  // Header: reserved (0), type (1 = icon), number of images.
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  // The images start after the header and all the entries.
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    // Width and height (0 would mean 256), no palette, reserved.
    entry.writeUInt8(size, 0)
    entry.writeUInt8(size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    // One colour plane, 32 bits per pixel.
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    // Size of the image and where it starts.
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map(image => image.data)])
}

/** Writes a file into public/ and says so. */
function write(name, data) {
  writeFileSync(resolve(PUBLIC, name), data)
  console.log(`✔ public/${name}`)
}

// --- Browser tab: the small mark, on the rounded tile ---
const favicon = iconSvg({ variant: 'small', rounded: true, scale: 1 })
write('favicon.svg', favicon)
write('favicon.ico', ico(await Promise.all([16, 32, 48].map(async size => ({ size, data: await png(favicon, size) })))))

// --- Installed app: the full mark ---
// As it is (the system shows the rounded tile with its transparent corners).
const appIcon = iconSvg({ variant: 'full', rounded: true, scale: 1 })
for (const size of [64, 192, 512]) write(`pwa-${size}x${size}.png`, await png(appIcon, size))
// Android crops the maskable icon to a circle, a squircle…: only the central
// circle of 80% is sure to stay, so the mark (42 units from the centre at most)
// shrinks to 0.78 of the tile: 33 units, inside the 40 of that circle.
write('maskable-icon-512x512.png', await png(iconSvg({ variant: 'full', rounded: false, scale: 0.78 }), 512))
// iOS rounds the corners itself and needs an opaque square; a little margin
// keeps the ticks away from its rounded corners.
write('apple-touch-icon-180x180.png', await png(iconSvg({ variant: 'full', rounded: false, scale: 0.88 }), 180))

// --- The fallback cover: the artwork, cut to its central square ---
const artwork = sharp(readFileSync(ARTWORK))
const { width, height } = await artwork.metadata()
// The largest square in the middle of the picture.
const side = Math.min(width, height)
const square = artwork.extract({ left: Math.floor((width - side) / 2), top: Math.floor((height - side) / 2), width: side, height: side })
  .resize(FALLBACK_COVER.size, FALLBACK_COVER.size)
// WebP for the app (like the uploaded covers), JPEG for link previews.
write(FALLBACK_COVER.app.slice(1), await square.clone().webp({ quality: 80 }).toBuffer())
write(FALLBACK_COVER.preview.slice(1), await square.clone().jpeg({ quality: 82, mozjpeg: true }).toBuffer())
