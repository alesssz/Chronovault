import type { ShareKind } from './useShareLink'

/**
 * Building blocks of the public share pages (/t/:id and /p/:id), which are
 * server-rendered so link previews (chat apps, social networks) can read
 * their title, description and image.
 */

/**
 * Loads the shared item during SSR. A private, missing or malformed link
 * gives `notFound` (the page says "not available"), and the server answers
 * 404 instead of 200 so crawlers drop it; other failures answer 500.
 */
export async function useSharedItem<T>(key: string, load: () => Promise<T>) {
  // Taken before the `await`: the request event needs the component context.
  const event = import.meta.server ? useRequestEvent() : undefined
  const { data, error } = await useAsyncData(key, load)

  /** The item is private, missing or the id is malformed: "not available". */
  const notFound = computed(() => !data.value && [400, 404].includes(error.value?.statusCode ?? 0))
  if (event && !data.value) setResponseStatus(event, notFound.value ? 404 : 500)

  return { data, notFound }
}

/** What the link preview of a share page shows. */
export interface ShareMetaOptions {
  kind: ShareKind
  id: string
  /** Site origin (also known during SSR): previews need absolute URLs. */
  origin: string
  /** The item's title; null when it is not available. */
  title: () => string | null
  /** Preview text (already cut to a reasonable length). */
  description: () => string
  /** There is an image for the preview (a cover). */
  hasImage: () => boolean
  /** Public items may be indexed; unlisted ones are for whoever has the link. */
  isPublic: () => boolean
}

/** Public page path and cover redirect of each kind (see server/api/shared). */
const SHARE_ROUTES: Record<ShareKind, { page: string, cover: string, ogType: 'music.song' | 'music.playlist', noun: string }> = {
  track: { page: '/t/', cover: '/api/shared/', ogType: 'music.song', noun: 'Track' },
  playlist: { page: '/p/', cover: '/api/shared/playlists/', ogType: 'music.playlist', noun: 'Playlist' },
}

/** Title, description, Open Graph tags and robots rule of a share page. */
export function useShareMeta(options: ShareMetaOptions): void {
  const route = SHARE_ROUTES[options.kind]
  // "Track not available" / "Playlist not available".
  const unavailable = `${route.noun} not available`
  useSeoMeta({
    title: () => `${options.title() ?? unavailable} · ChronoPlayer`,
    description: options.description,
    ogTitle: () => options.title() ?? unavailable,
    ogDescription: options.description,
    ogType: route.ogType,
    ogSiteName: 'ChronoPlayer',
    ogUrl: `${options.origin}${route.page}${options.id}`,
    // A stable address that redirects to a fresh signed URL: previews are cached for long.
    ogImage: () => (options.hasImage() ? `${options.origin}${route.cover}${options.id}/cover` : undefined),
    twitterCard: 'summary',
    // Unlisted items are for whoever has the link: keep them out of search engines.
    robots: () => (options.isPublic() ? 'index, follow' : 'noindex, nofollow'),
  })
}
