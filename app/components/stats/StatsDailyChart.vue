<script setup lang="ts">
/**
 * Column chart of one number per day (Statistics page: page views, plays).
 *
 * One series, one color (the primary hue): no legend, the card title names
 * it. Two measures of different scale (views and plays) get a chart each,
 * never two series on one axis. Columns are capped at 24 px and grow from
 * one baseline with rounded tops; three recessive gridlines give the scale
 * (0, half, a rounded top). Each day's whole column height is its
 * hover/focus target and shows the date, the value and its detail in a
 * tooltip (almost no delay: sweeping across the columns should read them
 * one after another); a screen-reader table carries the same numbers.
 */

/** One day of the chart (the page maps its own day rows to this shape). */
interface ChartDay {
  /** `YYYY-MM-DD` (UTC). */
  date: string
  /** The number the column shows. */
  value: number
  /** Extra text after the value in the tooltip and the table, e.g. "2 visitors". */
  detail?: string
}

// What to draw, and how to word it.
const props = defineProps<{
  /** The days to draw, oldest first (every day of the period, zeros included). */
  daily: ChartDay[]
  /** What the value counts, singular ("view", "play"): "3 views" in the tooltip. */
  noun: string
  /** Caption of the screen-reader table, e.g. "Page views per day". */
  caption: string
  /** Test id of the chart (two charts share the page). */
  testid: string
}>()

/**
 * Top of the scale: the highest day rounded up to a "nice" even number
 * (2, 4, 6, 10 × 10ⁿ), so the half-way gridline is a whole number of views
 * too (never "2.5 views"); at least 2.
 */
const scaleMax = computed(() => {
  const max = Math.max(1, ...props.daily.map(d => d.value))
  // Power of ten of the highest value (e.g. 10 for 17, 100 for 150).
  const magnitude = 10 ** Math.floor(Math.log10(max))
  return [2, 4, 6, 10].map(m => m * magnitude).find(n => n >= max)!
})

/** Gridlines from the top down: top, half, zero. */
const gridlines = computed(() => [scaleMax.value, scaleMax.value / 2, 0])

/** Column height as a percentage of the plot (a day with views gets at least a visible sliver). */
function heightOf(day: ChartDay): string {
  if (!day.value) return '0%'
  return `${Math.max(2, (day.value / scaleMax.value) * 100)}%`
}

/** Short date for the axis and the tooltip, e.g. "Oct 21". */
// UTC: the server's days are UTC days, whatever the viewer's time zone.
const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
/** A `YYYY-MM-DD` day as "Oct 21". */
function shortDate(date: string): string {
  return dateFormat.format(new Date(`${date}T00:00:00Z`))
}

/** Axis labels: first, middle and last day (every label would collide on 30 days). */
const axisDates = computed(() => {
  const days = props.daily
  if (!days.length) return []
  return [days[0]!, days[Math.floor((days.length - 1) / 2)]!, days.at(-1)!].map(d => shortDate(d.date))
})

/** The day's value with its noun, e.g. "3 views". */
function amount(day: ChartDay): string {
  return pluralize(day.value, props.noun)
}

/** Tooltip text of a day: "Oct 21: 3 views, 2 visitors". */
function describe(day: ChartDay): string {
  return [`${shortDate(day.date)}: ${amount(day)}`, day.detail].filter(Boolean).join(', ')
}

/** Gridline labels: compact from 1,000 up (1K, 2.5K). */
const compact = new Intl.NumberFormat('en', { notation: 'compact' })
</script>

<template>
  <div>
    <div class="flex gap-2">
      <!-- Scale labels, aligned with the gridlines -->
      <div
        class="flex h-44 flex-col justify-between text-right text-xs tabular-nums text-dimmed"
        aria-hidden="true"
      >
        <span
          v-for="value in gridlines"
          :key="value"
          class="-my-2 leading-4"
        >{{ compact.format(value) }}</span>
      </div>

      <!-- Plot: gridlines behind, one column per day in front -->
      <div class="relative h-44 flex-1">
        <div
          class="absolute inset-0 flex flex-col justify-between"
          aria-hidden="true"
        >
          <div
            v-for="value in gridlines"
            :key="value"
            class="border-t border-default"
          />
        </div>

        <div
          class="absolute inset-0 flex items-end"
          :data-testid="testid"
          aria-hidden="true"
        >
          <!-- The whole column is the hover target; the bar inside is the mark. -->
          <UTooltip
            v-for="day in daily"
            :key="day.date"
            :text="describe(day)"
            :content="{ side: 'top' }"
            :delay-duration="100"
          >
            <div class="group flex h-full flex-1 items-end justify-center px-px">
              <div
                class="w-full max-w-6 rounded-t bg-primary transition-opacity group-hover:opacity-80"
                :style="{ height: heightOf(day) }"
                data-testid="stats-day-bar"
              />
            </div>
          </UTooltip>
        </div>
      </div>
    </div>

    <!-- Date axis: first, middle, last day -->
    <div
      class="mt-2 flex justify-between pl-8 text-xs text-dimmed"
      aria-hidden="true"
    >
      <span
        v-for="(label, i) in axisDates"
        :key="i"
      >{{ label }}</span>
    </div>

    <!-- The same numbers for screen readers -->
    <table class="sr-only">
      <caption>{{ caption }}</caption>
      <thead>
        <tr>
          <th scope="col">
            Day
          </th>
          <th scope="col">
            Count
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="day in daily"
          :key="day.date"
        >
          <td>{{ shortDate(day.date) }}</td>
          <td>{{ [amount(day), day.detail].filter(Boolean).join(', ') }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
