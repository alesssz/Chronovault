import type { Genre } from '~~/shared/types/track'
import { genresApi } from '~/services/api'

/** Genre list (shared across pages through its cache key) and helpers. */
export function useGenres() {
  const { data, refresh, status } = useAsyncData('genres', () => genresApi.list(), {
    default: () => [] as Genre[],
  })

  const byId = computed(() => new Map(data.value.map(g => [g.id, g])))

  function genreName(id: string | null | undefined): string | null {
    return id ? byId.value.get(id)?.name ?? null : null
  }

  async function createGenre(name: string): Promise<Genre> {
    const genre = await genresApi.create({ name })
    if (!byId.value.has(genre.id)) {
      data.value = [...data.value, genre].sort((a, b) => a.name.localeCompare(b.name, 'en'))
    }
    return genre
  }

  return { genres: data, status, refresh, genreName, createGenre }
}
