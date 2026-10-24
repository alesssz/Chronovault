<script setup lang="ts">
import type { VersionVoteState } from '~~/shared/types/playlist'
import type { SharedTrackContent } from '~~/shared/types/track'
import { MAX_VOTE_COMMENT, MAX_VOTER_NAME } from '~~/shared/schemas/feedback'

/**
 * The vote panel of a group's public page (/p/:id), under the list of
 * versions. The pick itself is made with the heart next to each version;
 * this panel says what to do, or what happened:
 *
 * - the group's owner: a note pointing to the Versions page (owners don't vote);
 * - voting closed: which version was chosen;
 * - no pick yet: how to pick;
 * - a pick: which one, and an optional name and comment for the owner.
 *
 * Nothing shows until the vote state has loaded (it is per browser, so
 * after the server-rendered page).
 */
const props = defineProps<{
  /** This browser's vote state (null: not loaded, or not a group). */
  state: VersionVoteState | null
  /** The group's versions, to name the pick and the chosen one. */
  tracks: SharedTrackContent[]
  /** A vote request is running (Save spins). */
  busy: boolean
}>()

const emit = defineEmits<{
  /** Save the name and comment with the current pick. */
  save: [name: string, comment: string]
}>()

/** The version this browser picked, or null. */
const picked = computed(() => props.tracks.find(t => t.id === props.state?.pick?.trackId) ?? null)
/** The version the owner marked final (voting closed), or null. */
const chosen = computed(() => props.tracks.find(t => t.status === 'final') ?? null)

// The note form, filled from the saved pick (and again whenever it changes).
const name = ref('')
const comment = ref('')
watch(() => props.state?.pick, (pick) => {
  name.value = pick?.name ?? ''
  comment.value = pick?.comment ?? ''
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

    <!-- Open, nothing picked yet: how to vote -->
    <p
      v-else-if="!picked"
      class="flex items-center gap-2 text-sm text-muted"
      data-testid="version-vote-hint"
    >
      <UIcon
        name="i-lucide-heart"
        class="size-4 shrink-0"
      />
      Listen to the versions, then tap the heart next to your favourite.
    </p>

    <!-- Open, picked: which one, and an optional note for the owner -->
    <form
      v-else
      class="space-y-3 rounded-xl border border-default p-4"
      data-testid="version-vote-note"
      @submit.prevent="emit('save', name, comment)"
    >
      <p class="flex items-center gap-2 font-medium">
        <UIcon
          name="i-lucide-heart"
          class="size-4 shrink-0 text-primary"
        />
        <span class="min-w-0 truncate">Your pick: {{ picked.title }}</span>
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
      <!-- Who reads it, and Save -->
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs text-muted">
          Only the owner of this group sees your pick and note.
        </p>
        <UButton
          type="submit"
          label="Save"
          size="sm"
          :loading="busy"
          :disabled="!noteChanged"
          data-testid="version-vote-save"
        />
      </div>
    </form>
  </div>
</template>
