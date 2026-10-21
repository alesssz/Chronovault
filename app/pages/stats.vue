<script setup lang="ts">
/**
 * Statistics page (client-rendered, account menu → Statistics): visits to
 * the user's share pages over the last 7 or 30 days.
 *
 * Top to bottom: period switch; a banner saying where the numbers come
 * from (demo data outside Vercel is flagged loudly); totals; views per day;
 * the shared tracks and playlists with their visits; where visitors come
 * from (referrer), their country and device.
 *
 * Data: GET /api/analytics (server/services/analytics.service.ts).
 */
import { ANALYTICS_PERIODS, type AnalyticsPeriod } from '~~/shared/types/analytics'
import { analyticsApi } from '~/services/api'

useSeoMeta({ title: 'Statistics · ChronoPlayer' })

/** Selected period; changing it reloads the report. */
const days = ref<AnalyticsPeriod>(30)
const { data: report, status, error } = useAsyncData('analytics', () => analyticsApi.report(days.value), {
  watch: [days],
})

/** Number of pages (tracks and playlists) with at least one view in the period. */
const visitedPages = computed(() => report.value?.items.filter(i => i.pageviews > 0).length ?? 0)

/** Totals shown as tiles. */
const tiles = computed(() => [
  { label: 'Views', value: report.value?.totals.pageviews ?? 0, testid: 'stats-views' },
  { label: 'Visitors', value: report.value?.totals.visitors ?? 0, testid: 'stats-visitors' },
  { label: 'Pages visited', value: visitedPages.value, testid: 'stats-pages' },
])

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
          Visits to your share links<span v-if="periodLabel"> · {{ periodLabel }}</span>
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
      title="Statistics are not configured"
      description="Enable Web Analytics on the Vercel project, then set NUXT_ANALYTICS_TOKEN and NUXT_ANALYTICS_PROJECT_ID (and NUXT_ANALYTICS_TEAM_ID for a team project) in its environment variables and redeploy. See the README, section 13.6."
      class="mb-6"
      data-testid="stats-unconfigured"
    />
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Statistics could not be loaded"
      :description="getErrorMessage(error)"
      class="mb-6"
    />

    <!-- First load -->
    <div
      v-if="!report && status === 'pending'"
      class="flex justify-center py-16"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin text-muted"
      />
    </div>

    <div
      v-else-if="report && report.source !== 'unconfigured'"
      class="space-y-6"
      :class="{ 'opacity-60 transition-opacity': status === 'pending' }"
    >
      <!-- Totals -->
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

      <!-- Views per day -->
      <UCard :ui="{ body: 'sm:p-5' }">
        <h2 class="mb-4 text-sm font-medium text-muted">
          Views per day
        </h2>
        <StatsDailyChart :daily="report.daily" />
      </UCard>

      <!-- Shared tracks and playlists -->
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <h2 class="px-4 pt-4 text-sm font-medium text-muted sm:px-5 sm:pt-5">
          Shared pages
        </h2>
        <UEmpty
          v-if="!report.items.length"
          icon="i-lucide-link"
          title="Nothing shared yet"
          description="Make a track or a playlist Unlisted or Public and send its link: its visits will show up here."
          class="py-10"
        />
        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="item in report.items"
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
            <div class="text-right text-sm tabular-nums">
              <p>{{ number.format(item.pageviews) }} <span class="text-muted">views</span></p>
              <p class="text-xs text-muted">
                {{ number.format(item.visitors) }} visitors
              </p>
            </div>
          </li>
        </ul>
      </UCard>

      <!-- Where visitors come from, their country and device -->
      <div class="grid gap-4 md:grid-cols-3">
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
        Counted: openings of your /t/ and /p/ pages by visitors who are not signed in, from Vercel Web Analytics (no cookies, nobody identified). Plays are not counted. Data can take a few minutes to appear.
      </p>
    </div>
  </UContainer>
</template>
