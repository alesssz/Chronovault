import type { Genre, Subgenre } from '~~/shared/types/track'
import { genresApi } from '~/services/api'

/** A track's genre fields (library rows, the player's track, the metadata export). */
interface GenreFields {
  /** The track's genre, or none. */
  genreId?: string | null
  /** The track's subgenre, or none (a queue saved by an older version has neither). */
  subgenreId?: string | null
}

/**
 * Genre list (shared across pages through its cache key) and helpers.
 * Loaded once and reused by the library filters, the player meta line, the
 * edit page and the metadata import; a subgenre created on the fly is added
 * to the cache in place.
 *
 * Outside the editor a track shows the most specific name (trackGenreLabel):
 * its subgenre when set, else its genre; the path (`Metal › Thrash Metal`)
 * where there is room for it, as a tooltip.
 */
export function useGenres() {
  // The genres with their subgenres (built-in and the user's own), cached app-wide under one key.
  const { data, refresh, status } = useAsyncData('genres', () => genresApi.list(), {
    default: () => [] as Genre[],
  })

  /** Genres by id, for fast name lookups. */
  const byId = computed(() => new Map(data.value.map(g => [g.id, g])))
  /** Subgenres by id, every genre's (over 400 built-in: rows look them up by id). */
  const subgenreById = computed(() => new Map(data.value.flatMap(g => g.subgenres).map(s => [s.id, s])))

  /** Display name of a genre id (null for none or an unknown id). */
  function genreName(id: string | null | undefined): string | null {
    return id ? byId.value.get(id)?.name ?? null : null
  }

  /** Display name of a subgenre id (null for none or an unknown id). */
  function subgenreName(id: string | null | undefined): string | null {
    return id ? subgenreById.value.get(id)?.name ?? null : null
  }

  /** The most specific name of a track's genre: its subgenre, else its genre (null for none). */
  function trackGenreLabel(track: GenreFields): string | null {
    return subgenreName(track.subgenreId) ?? genreName(track.genreId)
  }

  /** A track's genre and subgenre, `Metal › Thrash Metal` (the genre alone without one; null for none). */
  function trackGenrePath(track: GenreFields): string | null {
    // The two names that are set, the genre first.
    const parts = [genreName(track.genreId), subgenreName(track.subgenreId)].filter(Boolean)
    return parts.length ? parts.join(' › ') : null
  }

  /** Creates (or finds) a custom subgenre under the genre and keeps the cached list sorted. */
  async function createSubgenre(genreId: string, name: string): Promise<Subgenre> {
    // The subgenre as the server returns it (the existing one, for a name the genre has).
    const subgenre = await genresApi.createSubgenre(genreId, { name })
    if (!subgenreById.value.has(subgenre.id)) {
      data.value = data.value.map(genre => genre.id !== genreId
        ? genre
        : { ...genre, subgenres: [...genre.subgenres, subgenre].sort((a, b) => a.name.localeCompare(b.name, 'en')) })
    }
    return subgenre
  }

  return { genres: data, status, refresh, genreName, subgenreName, trackGenreLabel, trackGenrePath, createSubgenre }
}
