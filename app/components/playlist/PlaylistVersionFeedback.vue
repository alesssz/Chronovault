<script setup lang="ts">
import type { VersionFeedback } from '~~/shared/types/playlist'
import type { TrackSummary } from '~~/shared/types/track'

/**
 * Feedback on a group of versions (owner's Versions page, in
 * PlaylistEditor): what the friends who got the link think.
 *
 * Top to bottom: whether voting is open (it closes when a version is marked
 * final), the totals (votes, listeners), one row per version with its votes
 * as a bar and its plays, and the notes left with the picks.
 *
 * The bars are one series (votes), one color, all on the same scale (the
 * most voted version fills the row); the numbers are always written next
 * to them, so the bars are never the only way to read the result.
 */
const props = defineProps<{
  feedback: VersionFeedback
  /** The group's versions, in order (titles and statuses). */
  tracks: TrackSummary[]
}>()

/** The version marked final, which closed the voting (null while open). */
const chosen = computed(() => props.tracks.find(t => t.status === 'final') ?? null)

/** Title of a version (a vote or note for a version no longer listed shows nothing). */
function titleOf(trackId: string): string {
  return props.tracks.find(t => t.id === trackId)?.title ?? ''
}

/** Most votes of any version: the scale of the bars (at least 1, so no division by zero). */
const maxVotes = computed(() => Math.max(1, ...props.feedback.versions.map(v => v.votes)))

/** Width of a version's bar: its share of the most voted (a voted version gets at least a sliver). */
function barWidth(votes: number): string {
  return votes ? `${Math.max(4, (votes / maxVotes.value) * 100)}%` : '0%'
}

/** "Oct 24" for the notes. */
const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
</script>

<template>
  <section
    class="space-y-4 rounded-lg border border-default p-4"
    aria-label="Feedback"
    data-testid="version-feedback"
  >
    <!-- Heading and totals -->
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
        Feedback
      </h2>
      <p
        class="text-sm tabular-nums text-muted"
        data-testid="version-feedback-totals"
      >
        {{ pluralize(feedback.votes, 'vote') }} · {{ pluralize(feedback.listeners, 'listener') }}
      </p>
    </div>

    <!-- Voting open, or closed by the chosen version -->
    <p
      class="flex items-center gap-2 text-sm"
      data-testid="version-feedback-status"
    >
      <UIcon
        :name="feedback.open ? 'i-lucide-vote' : 'i-lucide-circle-check'"
        class="size-4 shrink-0"
        :class="feedback.open ? 'text-primary' : 'text-success'"
      />
      <span v-if="feedback.open">Voting is open: it closes when you mark a version as final.</span>
      <span v-else>Voting is closed: you chose “{{ chosen?.title }}”. Mark it as draft again to reopen it.</span>
    </p>

    <!-- Nothing yet: where votes come from -->
    <p
      v-if="!feedback.votes && !feedback.listeners"
      class="text-sm text-muted"
    >
      No feedback yet. Share the group's link: your friends' picks and plays show up here. Your own plays never count.
    </p>

    <template v-else>
      <!--
        One row per version: votes (bar and number) and plays. From `sm` up:
        title | bar | numbers on one line; on phones the bar gets a line of its
        own under title and numbers, or it would have no room left.
      -->
      <ul class="space-y-3 sm:space-y-2">
        <li
          v-for="version in feedback.versions"
          :key="version.trackId"
          class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,14rem)_1fr_auto]"
          data-testid="version-feedback-row"
        >
          <span class="truncate">{{ titleOf(version.trackId) }}</span>
          <!-- The bar: votes on the shared scale -->
          <span class="order-last col-span-2 h-2 overflow-hidden rounded-full bg-elevated sm:order-none sm:col-span-1">
            <span
              class="block h-full rounded-full bg-primary"
              :style="{ width: barWidth(version.votes) }"
            />
          </span>
          <span class="text-right tabular-nums text-muted">
            {{ pluralize(version.votes, 'vote') }} · {{ pluralize(version.plays, 'play') }}
          </span>
        </li>
      </ul>

      <!-- The notes left with the picks, most recent first -->
      <ul
        v-if="feedback.comments.length"
        class="divide-y divide-default border-t border-default"
      >
        <li
          v-for="(note, i) in feedback.comments"
          :key="i"
          class="py-2"
          data-testid="version-feedback-comment"
        >
          <p class="text-xs text-muted">
            <span class="font-medium text-default">{{ note.name || 'Someone' }}</span>
            picked {{ titleOf(note.trackId) }} · {{ dateFormat.format(new Date(note.updatedAt)) }}
          </p>
          <p
            v-if="note.comment"
            class="mt-0.5 whitespace-pre-line text-sm"
          >
            {{ note.comment }}
          </p>
        </li>
      </ul>
    </template>
  </section>
</template>
