<script setup lang="ts">
/**
 * One breakdown of the Statistics page (referrers, countries or devices):
 * a ranked list where each row has its label, a thin horizontal bar
 * proportional to its page views, and the number at the bar's end.
 * Labels and numbers use text colors; only the bar carries the hue.
 */
import type { AnalyticsBreakdownRow } from '~~/shared/types/analytics'

const props = defineProps<{
  title: string
  rows: AnalyticsBreakdownRow[]
  /** Display label of a row's key (e.g. country code → name). */
  label: (key: string | null) => string
  /** Optional icon of a row (e.g. device type). */
  icon?: (key: string | null) => string | undefined
}>()

/** The largest value sets the full bar width. */
const max = computed(() => Math.max(1, ...props.rows.map(r => r.pageviews)))
</script>

<template>
  <UCard :ui="{ body: 'sm:p-5' }">
    <h2 class="mb-3 text-sm font-medium text-muted">
      {{ title }}
    </h2>

    <p
      v-if="!rows.length"
      class="text-sm text-dimmed"
    >
      No visits yet.
    </p>

    <ul
      v-else
      class="space-y-2.5"
    >
      <li
        v-for="row in rows"
        :key="row.key ?? '∅'"
      >
        <div class="mb-1 flex items-center justify-between gap-3 text-sm">
          <span class="flex min-w-0 items-center gap-1.5">
            <UIcon
              v-if="icon?.(row.key)"
              :name="icon(row.key)!"
              class="size-4 shrink-0 text-muted"
            />
            <span class="truncate">{{ label(row.key) }}</span>
          </span>
          <span class="tabular-nums text-muted">{{ row.pageviews }}</span>
        </div>
        <!-- Bar: share of the top value -->
        <div
          class="h-1.5 rounded-full bg-primary"
          :style="{ width: `${Math.max(2, (row.pageviews / max) * 100)}%` }"
          aria-hidden="true"
        />
      </li>
    </ul>
  </UCard>
</template>
