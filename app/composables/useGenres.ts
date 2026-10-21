import type { Genre } from '~~/shared/types/track'
import { genresApi } from '~/services/api'

/**
 * Genre list (shared across pages through its cache key) and helpers.
 * Loaded once and reused by the library filters, the player meta line and
 * the edit page; a genre created on the fly is added to the cache in place.
 */
export function useGenres() {
  const { data, refresh, status } = useAsyncData('genres', () => genresApi.list(), {
    default: () => [] as Genre[],
  })

  const byId = computed(() => new Map(data.value.map(g => [g.id, g])))

  /** Display name of a genre id (null for none or an unknown id). */
  function genreName(id: string | null | undefined): string | null {
    return id ? byId.value.get(id)?.name ?? null : null
  }

  /** Creates (or finds) a custom genre and keeps the cached list sorted. */
  async function createGenre(name: string): Promise<Genre> {
    const genre = await genresApi.create({ name })
    if (!byId.value.has(genre.id)) {
      data.value = [...data.value, genre].sort((a, b) => a.name.localeCompare(b.name, 'en'))
    }
    return genre
  }

  return { genres: data, status, refresh, genreName, createGenre }
}
