<script setup lang="ts">
import type { VersionVoteState } from '~~/shared/types/playlist'
import type { SharedTrackContent } from '~~/shared/types/track'
import { MAX_VOTE_COMMENT, MAX_VOTER_NAME } from '~~/shared/schemas/feedback'

/**
 * The vote panel of a group's public page (/p/:id), under the list of
 * versions. The pick itself is made with the heart next to each version, and
 * how to vote is said under the page's title (`showVoteHint` there: here,
 * under the list, it was at the bottom edge of a desktop screen); this panel
 * says what happened:
 *
 * - the group's owner: a note pointing to the Versions page (owners don't vote);
 * - voting closed: which version was chosen;
 * - no pick yet: nothing;
 * - a pick: which one, marked saved (it is stored as soon as the heart is
 *   chosen), and an optional name and comment for the owner, with their own
 *   "Save note". A bare "Your pick" above a disabled "Save" read as a pick
 *   still to be sent (UI-30).
 *
 * Nothing shows until the vote state has loaded (it is per browser, so
 * after the server-rendered page).
 */
const props = defineProps<{
  /** This browser's vote state (null: not loaded, or not a group). */
  state: VersionVoteState | null
  /** The group's versions, to name the pick and the chosen one. */
  tracks: SharedTrackContent[]
  /** A vote request is running (the pick reads "Saving…", Save note spins). */
  busy: boolean
}>()

// What the panel asks the page to do: save the note typed for the current pick.
const emit = defineEmits<{
  /** Save the name and comment with the current pick. */
  save: [name: string, comment: string]
}>()

/** The version this browser picked, or null. */
const picked = computed(() => props.tracks.find(t => t.id === props.state?.pick?.trackId) ?? null)
/** The version the owner marked final (voting closed), or null. */
const chosen = computed(() => props.tracks.find(t => t.status === 'final') ?? null)

// The note form, filled from the saved pick (and again whenever it changes).
/** The voter's name, as typed. */
const name = ref('')
/** The voter's comment, as typed. */
const comment = ref('')
// The fields follow the pick saved on the server (a reload shows what was sent), except
// a field typed and not saved yet: picking another version sends the pick with the note
// saved before, and its answer used to wipe what was being typed. A field still showing the
// previous saved value takes the new one; one that differs is the visitor's, and stays.
watch(() => props.state?.pick, (pick, previous) => {
  if (name.value.trim() === (previous?.name ?? '')) name.value = pick?.name ?? ''
  if (comment.value.trim() === (previous?.comment ?? '')) comment.value = pick?.comment ?? ''
}, { immediate: true })

/** The note differs from the saved one (Save enabled). */
const noteChanged = computed(() =>
  name.value.trim() !== (props.state?.pick?.name ?? '') || comment.value.trim() !== (props.state?.pick?.comment ?? ''))
</script>

<template>
  <div
    v-if="state"
    data-testid="version-vote"
  >
    <!-- The owner: friends vote, the results are on the Versions page -->
    <UAlert
      v-if="state.isOwner"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="This is your group"
      description="Your friends pick their favourite version here. Their votes and comments are on the group's Versions page."
      data-testid="version-vote-owner"
    />

    <!-- Voting closed: a version was marked final -->
    <UAlert
      v-else-if="!state.open"
      color="neutral"
      variant="subtle"
      icon="i-lucide-circle-check"
      title="Voting is closed"
      :description="chosen ? `The chosen version is “${chosen.title}”. Thanks for listening!` : 'The final version has been chosen. Thanks for listening!'"
      data-testid="version-vote-closed"
    />

    <!-- Open, picked: which one, saved, and an optional note for the owner (no pick: nothing) -->
    <form
      v-else-if="picked"
      class="space-y-3 rounded-xl border border-default p-4"
      data-testid="version-vote-note"
      @submit.prevent="emit('save', name, comment)"
    >
      <p class="flex items-center gap-2 font-medium">
        <UIcon
          name="i-lucide-heart"
          class="size-4 shrink-0 text-primary"
        />
        <span class="min-w-0 flex-1 truncate">Your pick: {{ picked.title }}</span>
        <!--
          The pick is stored when the heart is chosen (`state.pick` is the server's answer, never
          a guess), so it reads "Saved", or "Saving…" while a request runs: a new pick, or the
          note, which is sent with it. `role="status"` has screen readers announce the change.
        -->
        <span
          role="status"
          class="flex shrink-0 items-center gap-1 text-xs font-normal"
          :class="busy ? 'text-muted' : 'text-success'"
          data-testid="version-vote-saved"
        >
          <UIcon
            :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-check'"
            class="size-3.5"
            :class="{ 'animate-spin': busy }"
          />
          {{ busy ? 'Saving…' : 'Saved' }}
        </span>
      </p>
      <UInput
        v-model="name"
        :maxlength="MAX_VOTER_NAME"
        placeholder="Your name (optional)"
        aria-label="Your name"
        class="w-full"
        data-testid="version-vote-name"
      />
      <UTextarea
        v-model="comment"
        :maxlength="MAX_VOTE_COMMENT"
        :rows="2"
        autoresize
        :maxrows="6"
        placeholder="Why this one? (optional)"
        aria-label="Your comment"
        class="w-full"
        data-testid="version-vote-comment"
      />
      <!-- Who reads it, and Save note: named for what it saves, the pick being saved already -->
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs text-muted">
          Only the owner of this group sees your pick and note.
        </p>
        <UButton
          type="submit"
          label="Save note"
          size="sm"
          :loading="busy"
          :disabled="!noteChanged"
          data-testid="version-vote-save"
        />
      </div>
    </form>
  </div>
</template>
