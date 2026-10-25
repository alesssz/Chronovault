<script setup lang="ts">
/**
 * Statistics page (client-rendered, account menu → Statistics): what
 * happened to the user's share links over the last 7 or 30 days.
 *
 * Two sources, side by side:
 * - **views**: openings of the share pages, from Vercel Web Analytics, with
 *   where visitors came from, their country and device (GET /api/analytics,
 *   server/services/analytics.service.ts). Only Vercel has them: locally
 *   the numbers are demo data, flagged loudly;
 * - **plays**: what visitors really listened to, counted by the app itself
 *   (GET /api/analytics/plays, server/services/plays.service.ts): real
 *   everywhere. The user's own plays are shown apart, never in the totals.
 *
 * Top to bottom: period switch; a banner saying where the views come from;
 * totals; views and plays per day (one chart each: different scales);
 * the shared tracks and playlists with their views and plays; referrers,
 * countries and devices.
 */
import { ANALYTICS_PERIODS, type AnalyticsItem, type AnalyticsPeriod, type PlaysItem } from '~~/shared/types/analytics'
import { analyticsApi } from '~/services/api'

// Browser tab title: "Statistics · Chronovault".
usePageTitle('Statistics')

/** Selected period; changing it reloads both reports. */
const days = ref<AnalyticsPeriod>(30)
const { data: report, status, error } = useAsyncData('analytics', () => analyticsApi.report(days.value), {
  watch: [days],
})
const { data: plays, status: playsStatus, error: playsError } = useAsyncData('plays', () => analyticsApi.plays(days.value), {
  watch: [days],
})

/** Vercel's numbers can be shown (real or demo; not when unconfigured). */
const hasViews = computed(() => !!report.value && report.value.source !== 'unconfigured')
/** Either report is loading (the page dims while a new period loads). */
const loading = computed(() => status.value === 'pending' || playsStatus.value === 'pending')

/** Number of pages (tracks and playlists) with at least one view in the period. */
const visitedPages = computed(() => report.value?.items.filter(i => i.pageviews > 0).length ?? 0)

/** Totals shown as tiles: views (when Vercel's numbers exist), then plays. */
const tiles = computed(() => [
  ...(hasViews.value
    ? [
        { label: 'Views', value: report.value!.totals.pageviews, testid: 'stats-views' },
        { label: 'Visitors', value: report.value!.totals.visitors, testid: 'stats-visitors' },
        { label: 'Pages visited', value: visitedPages.value, testid: 'stats-pages' },
      ]
    : []),
  { label: 'Plays', value: plays.value?.totals.plays ?? 0, testid: 'stats-plays' },
  { label: 'Listeners', value: plays.value?.totals.listeners ?? 0, testid: 'stats-listeners' },
  { label: 'Your own plays', value: plays.value?.ownPlays ?? 0, testid: 'stats-own-plays' },
])

/** Views per day, for the chart (visitors in the tooltip). */
const viewsDaily = computed(() => (report.value?.daily ?? []).map(day => ({
  date: day.date, value: day.pageviews, detail: pluralize(day.visitors, 'visitor'),
})))
/** Visitors' plays per day, for the chart. */
const playsDaily = computed(() => (plays.value?.daily ?? []).map(day => ({ date: day.date, value: day.plays })))

/**
 * A share page with its views (null when Vercel has no numbers for it) and
 * its visitors' plays.
 */
type PageRow = Omit<AnalyticsItem, 'pageviews' | 'visitors'>
  & { pageviews: number | null, visitors: number | null, plays: number, completed: number }

/**
 * The shared pages of both reports, joined on their path: Vercel's list
 * (every shared page, visited or not) plus any page visitors played
 * without Vercel knowing it (unconfigured, ad blockers). Most viewed first,
 * then most played.
 */
const pages = computed<PageRow[]>(() => {
  // One row per page path, filled by both reports.
  const byPath = new Map<string, PageRow>()
  for (const item of hasViews.value ? report.value!.items : []) byPath.set(item.path, { ...item, plays: 0, completed: 0 })
  for (const item of plays.value?.items ?? []) {
    const row = byPath.get(item.path)
    if (row) Object.assign(row, { plays: item.plays, completed: item.completed })
    else byPath.set(item.path, { ...pageOf(item), pageviews: null, visitors: null, plays: item.plays, completed: item.completed })
  }
  return [...byPath.values()].sort((a, b) =>
    (b.pageviews ?? 0) - (a.pageviews ?? 0) || b.plays - a.plays || a.title.localeCompare(b.title))
})

/** The identity fields of a plays item (what PageRow shares with AnalyticsItem). */
function pageOf({ kind, id, title, visibility, coverUrl, path }: PlaysItem) {
  return { kind, id, title, visibility, coverUrl, path }
}

/** "Oct 1 – Oct 30" for the period subtitle (UTC days, as the server counts them). */
// UTC, like the server's days.
const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const periodLabel = computed(() => {
  if (!report.value) return ''
  // `YYYY-MM-DD` → "Oct 21".
  const day = (date: string) => dateFormat.format(new Date(`${date}T00:00:00Z`))
  return `${day(report.value.since)} – ${day(report.value.until)} (UTC)`
})

/** Thousands separators for the tiles. */
const number = new Intl.NumberFormat('en')

/** Referrer label: the hostname, "Direct or unknown" when there is none. */
function referrerLabel(key: string | null): string {
  return key ?? 'Direct or unknown'
}

/** Country names in English, from ISO codes ("IT" → "Italy"). */
// Built into the browser: no country list to maintain.
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
function countryLabel(key: string | null): string {
  if (!key) return 'Unknown'
  if (key === 'Others') return key
  try {
    return regionNames.of(key) ?? key
  }
  catch {
    // Not a valid region code: show it as it is.
    return key
  }
}

/** Device type label: "mobile" → "Mobile". */
function deviceLabel(key: string | null): string {
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Unknown'
}

/** Icon of a device type. */
function deviceIcon(key: string | null): string | undefined {
  return ({ mobile: 'i-lucide-smartphone', desktop: 'i-lucide-monitor', tablet: 'i-lucide-tablet' } as Record<string, string>)[key ?? '']
}

/** Visibility badge of an item that is no longer shared (its past visits still count). */
function isPrivateNow(visibility: string): boolean {
  return visibility === 'private'
}
</script>

<template>
  <UContainer class="py-6 sm:py-8">
    <!-- Title, period and period switch -->
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Statistics
        </h1>
        <p class="mt-1 text-sm text-muted">
          Visits and plays of your share links<span v-if="periodLabel"> · {{ periodLabel }}</span>
        </p>
      </div>
      <UFieldGroup>
        <UButton
          v-for="period in ANALYTICS_PERIODS"
          :key="period"
          :label="`${period} days`"
          color="neutral"
          :variant="days === period ? 'solid' : 'outline'"
          :aria-pressed="days === period"
          :data-testid="`stats-period-${period}`"
          @click="days = period"
        />
      </UFieldGroup>
    </div>

    <!-- Where the numbers come from -->
    <UAlert
      v-if="report?.source === 'demo'"
      color="warning"
      variant="subtle"
      icon="i-lucide-flask-conical"
      title="Demo data: these numbers are made up"
      description="Vercel Web Analytics only runs on the Vercel deployment. Here (local or Docker) the page shows invented visits for your real tracks and playlists, so you can see how it works."
      class="mb-6"
      data-testid="stats-demo-banner"
    />
    <UAlert
      v-else-if="report?.source === 'unconfigured'"
      color="info"
      variant="subtle"
      icon="i-lucide-settings"
      title="Page views are not configured"
      description="Enable Web Analytics on the Vercel project, then set NUXT_ANALYTICS_TOKEN and NUXT_ANALYTICS_PROJECT_ID (and NUXT_ANALYTICS_TEAM_ID for a team project) in its environment variables and redeploy. See the README, section 13.6."
      class="mb-6"
      data-testid="stats-unconfigured"
    />
    <UAlert
      v-if="error || playsError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Statistics could not be loaded"
      :description="getErrorMessage(error || playsError)"
      class="mb-6"
    />

    <!-- First load -->
    <div
      v-if="!report && !plays && loading"
      class="flex justify-center py-16"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin text-muted"
      />
    </div>

    <div
      v-else-if="report || plays"
      class="space-y-6"
      :class="{ 'opacity-60 transition-opacity': loading }"
    >
      <!-- Totals: views (Vercel), then plays (the app's own count) -->
      <div class="grid grid-cols-3 gap-3 sm:gap-4">
        <UCard
          v-for="tile in tiles"
          :key="tile.label"
          :ui="{ root: 'flex', body: 'flex flex-1 flex-col justify-between p-3 sm:p-5' }"
        >
          <!-- Label on top, number at the bottom: numbers line up even when a label wraps (phones). -->
          <p class="text-xs text-muted sm:text-sm">
            {{ tile.label }}
          </p>
          <p
            class="mt-1 text-2xl font-semibold sm:text-3xl"
            :data-testid="tile.testid"
          >
            {{ number.format(tile.value) }}
          </p>
        </UCard>
      </div>

      <!-- Views and plays per day: one chart each (different scales, never one shared axis) -->
      <div class="grid gap-4 lg:grid-cols-2">
        <UCard
          v-if="hasViews"
          :ui="{ body: 'sm:p-5' }"
        >
          <h2 class="mb-4 text-sm font-medium text-muted">
            Views per day
          </h2>
          <StatsDailyChart
            :daily="viewsDaily"
            noun="view"
            caption="Page views per day"
            testid="stats-views-chart"
          />
        </UCard>
        <UCard
          v-if="plays"
          :ui="{ body: 'sm:p-5' }"
        >
          <h2 class="mb-4 text-sm font-medium text-muted">
            Plays per day
          </h2>
          <StatsDailyChart
            :daily="playsDaily"
            noun="play"
            caption="Visitors' plays per day"
            testid="stats-plays-chart"
          />
        </UCard>
      </div>

      <!-- Shared tracks and playlists -->
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <h2 class="px-4 pt-4 text-sm font-medium text-muted sm:px-5 sm:pt-5">
          Shared pages
        </h2>
        <UEmpty
          v-if="!pages.length"
          icon="i-lucide-link"
          title="Nothing shared yet"
          description="Make a track or a playlist Unlisted or Public and send its link: its visits and plays will show up here."
          class="py-10"
        />
        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="item in pages"
            :key="item.path"
            class="flex items-center gap-3 px-4 py-2.5 sm:px-5"
            data-testid="stats-item"
          >
            <TrackCover
              :url="item.coverUrl"
              :title="item.title"
              class="size-10"
            />
            <div class="min-w-0 flex-1">
              <NuxtLink
                :to="item.path"
                target="_blank"
                class="block truncate font-medium hover:underline"
              >{{ item.title }}</NuxtLink>
              <p class="flex items-center gap-1.5 text-xs text-muted">
                <UIcon
                  :name="item.kind === 'track' ? 'i-lucide-music' : 'i-lucide-list-music'"
                  class="size-3.5"
                />
                {{ item.kind === 'track' ? 'Track' : 'Playlist' }}
                <UBadge
                  v-if="isPrivateNow(item.visibility)"
                  label="Private now"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                />
              </p>
            </div>
            <!-- Views and visitors (when Vercel has them) -->
            <div
              v-if="item.pageviews !== null"
              class="text-right text-sm tabular-nums"
            >
              <p>{{ number.format(item.pageviews) }} <span class="text-muted">views</span></p>
              <p class="text-xs text-muted">
                {{ number.format(item.visitors ?? 0) }} visitors
              </p>
            </div>
            <!-- Visitors' plays, and how many to the end -->
            <div
              class="w-20 text-right text-sm tabular-nums"
              data-testid="stats-item-plays"
            >
              <p>{{ number.format(item.plays) }} <span class="text-muted">{{ item.plays === 1 ? 'play' : 'plays' }}</span></p>
              <p class="text-xs text-muted">
                {{ number.format(item.completed) }} to the end
              </p>
            </div>
          </li>
        </ul>
      </UCard>

      <!-- Where visitors come from, their country and device (Vercel only; `report &&` narrows the type) -->
      <div
        v-if="report && hasViews"
        class="grid gap-4 md:grid-cols-3"
      >
        <StatsBreakdown
          title="Referrers"
          :rows="report.referrers"
          :label="referrerLabel"
        />
        <StatsBreakdown
          title="Countries"
          :rows="report.countries"
          :label="countryLabel"
        />
        <StatsBreakdown
          title="Devices"
          :rows="report.devices"
          :label="deviceLabel"
          :icon="deviceIcon"
        />
      </div>

      <!-- What is (not) counted -->
      <p class="text-xs text-dimmed">
        Views: openings of your /t/ and /p/ pages by visitors who are not signed in, from Vercel Web Analytics (no cookies, nobody identified); data can take a few minutes to appear. Plays: counted by Chronovault when a visitor listens for 30 seconds (or half a shorter track), once a day per listener; "to the end" means 90% of the track. A listener is a browser, identified only by a random id. Your own plays are counted apart.
      </p>
    </div>
  </UContainer>
</template>
