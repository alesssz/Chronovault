<script setup lang="ts">
/**
 * Header of the signed-in app: logo, section links (Library, Playlists,
 * Versions: the groups of versions shared for feedback), "Add" (upload),
 * light/dark switch and the account menu (Statistics, Storage, Keyboard
 * shortcuts, Sign out).
 * On phones the logo shows only its icon and the section links only theirs.
 *
 * A dot on "Versions" says that friends voted or commented on a group since
 * the owner's last visit to it (useUnseenFeedback). It is checked again
 * whenever the app comes back to the screen, since votes arrive while the
 * owner is elsewhere.
 */
import type { DropdownMenuItem } from '@nuxt/ui'

// Sign-out runs in the browser.
const supabase = useSupabaseClient()
// The account email shown in the menu.
const user = useSupabaseUser()
// Closed on sign-out.
const player = usePlayerStore()
// Sign-out failures.
const toast = useToast()

/** Stops playback (no audio for a signed-out user), signs out and goes to the sign-in page. */
async function logout() {
  player.close()
  // Supabase's answer: an error leaves the user signed in.
  const { error } = await supabase.auth.signOut()
  if (error) {
    toast.add({ title: 'Sign-out failed', description: error.message, color: 'error' })
    return
  }
  await navigateTo('/login')
}

// New votes and comments on the groups of versions (the dot on "Versions").
const { unseen, refresh: refreshUnseen } = useUnseenFeedback()
// Back on screen (another app, another tab, the phone unlocked): friends may have voted meanwhile.
const visibility = useDocumentVisibility()
watch(visibility, (state) => {
  if (state === 'visible') void refreshUnseen()
})

// Which section link is active.
const route = useRoute()
/**
 * Section links; `active` also covers sub-pages (a track's edit page belongs
 * to Library); `dot` marks a section with something new in it.
 */
const sections = [
  { label: 'Library', to: '/', icon: 'i-lucide-library', active: () => route.path === '/' || route.path.startsWith('/tracks'), dot: () => false },
  { label: 'Playlists', to: '/playlists', icon: 'i-lucide-list-music', active: () => route.path.startsWith('/playlists'), dot: () => false },
  { label: 'Versions', to: '/versions', icon: 'i-lucide-layers', active: () => route.path.startsWith('/versions'), dot: () => unseen.value.total > 0 },
]

/** The Storage dialog (usage and clean-up of orphaned files). */
const storageOpen = ref(false)
/** The list of keyboard shortcuts (also opened by the ? key). */
const shortcutsOpen = useShortcutsHelp()

/** Account menu: who is signed in, Statistics, Storage, Keyboard shortcuts, Sign out. */
const menu = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.email ?? 'Account', type: 'label', icon: 'i-lucide-user' }],
  [
    // Visits to the share links (pages/stats.vue).
    { label: 'Statistics', icon: 'i-lucide-chart-column', to: '/stats' },
    { label: 'Storage', icon: 'i-lucide-hard-drive', onSelect: () => (storageOpen.value = true) },
    { label: 'Keyboard shortcuts', icon: 'i-lucide-keyboard', onSelect: () => (shortcutsOpen.value = true) },
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: logout }],
])
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-default bg-default/80 backdrop-blur">
    <UContainer class="flex h-14 items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-1 sm:gap-4">
        <NuxtLink
          to="/"
          aria-label="ChronoPlayer home"
        >
          <AppLogo compact />
        </NuxtLink>

        <nav
          class="flex items-center gap-1"
          aria-label="Sections"
        >
          <!-- One link per section; the name shows from `sm`, the icon alone on phones -->
          <UButton
            v-for="link in sections"
            :key="link.to"
            :to="link.to"
            :icon="link.icon"
            :aria-label="link.dot() ? `${link.label}, new feedback` : link.label"
            color="neutral"
            variant="ghost"
            active-color="primary"
            active-variant="soft"
            :active="link.active()"
            class="relative"
          >
            <span class="hidden sm:inline">{{ link.label }}</span>
            <!-- Something new in the section: a dot on the top right corner (on the icon, on phones) -->
            <span
              v-if="link.dot()"
              class="absolute top-1 right-1 size-2 rounded-full bg-primary ring-2 ring-default"
              :data-testid="`section-dot-${link.label.toLowerCase()}`"
            />
          </UButton>
        </nav>
      </div>

      <div class="flex items-center gap-1">
        <UButton
          to="/tracks/new"
          icon="i-lucide-plus"
          label="Add"
          class="hidden sm:inline-flex"
        />
        <IconButton
          to="/tracks/new"
          icon="i-lucide-plus"
          label="Add tracks"
          class="sm:hidden"
        />
        <ThemeButton />
        <UDropdownMenu
          :items="menu"
          :content="{ align: 'end' }"
        >
          <IconButton
            icon="i-lucide-circle-user-round"
            color="neutral"
            variant="ghost"
            label="User menu"
          />
        </UDropdownMenu>
      </div>
    </UContainer>
    <StorageDialog v-model:open="storageOpen" />
  </header>
</template>
