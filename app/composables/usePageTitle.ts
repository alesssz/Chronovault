import { APP_NAME } from '~~/shared/brand'

/**
 * The browser tab title of a page: what the page shows, then the app's name
 * ("Library · Chronovault", "Night drive · Chronovault"). The name comes from
 * shared/brand.ts, so no page spells it.
 *
 * `title` can be a getter or a ref, for titles that follow the data (a track
 * or a playlist being renamed).
 */
export function usePageTitle(title: MaybeRefOrGetter<string>): void {
  useSeoMeta({ title: () => `${toValue(title)} · ${APP_NAME}` })
}
