import { TRACK_VISIBILITIES, type TrackVisibility } from '~~/shared/types/track'

/**
 * How each visibility is presented, for tracks and playlists alike:
 * label, explanation (edit forms) and icon (lists, cards).
 * Auto-imported (Nuxt scans app/utils).
 */
export const VISIBILITY_INFO: Record<TrackVisibility, { label: string, description: string, icon: string }> = {
  private: { label: 'Private', description: 'Only you can listen to it.', icon: 'i-lucide-lock' },
  unlisted: { label: 'Unlisted', description: 'Anyone with the link can listen.', icon: 'i-lucide-link' },
  public: { label: 'Public', description: 'Anyone with the link can listen; search engines may list it.', icon: 'i-lucide-globe' },
}

/** Options of the visibility radio cards (track editor, playlist page), in the order of TRACK_VISIBILITIES. */
export const VISIBILITY_ITEMS = TRACK_VISIBILITIES.map(value => ({
  value,
  label: VISIBILITY_INFO[value].label,
  description: VISIBILITY_INFO[value].description,
}))
