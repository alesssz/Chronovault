<script setup lang="ts">
/**
 * Header of the signed-in app: logo, section links (Library, Playlists),
 * "Add" (upload), light/dark switch and the account menu.
 * On phones the logo shows only its icon and the section links only theirs.
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
  const { error } = await supabase.auth.signOut()
  if (error) {
    toast.add({ title: 'Sign-out failed', description: error.message, color: 'error' })
    return
  }
  await navigateTo('/login')
}

// Which section link is active.
const route = useRoute()
/** Section links; `active` also covers sub-pages (a track's edit page belongs to Library). */
const sections = [
  { label: 'Library', to: '/', icon: 'i-lucide-library', active: () => route.path === '/' || route.path.startsWith('/tracks') },
  { label: 'Playlists', to: '/playlists', icon: 'i-lucide-list-music', active: () => route.path.startsWith('/playlists') },
]

/** The Storage dialog (usage and clean-up of orphaned files). */
const storageOpen = ref(false)

/** Account menu: who is signed in, Storage, Sign out. */
const menu = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.email ?? 'Account', type: 'label', icon: 'i-lucide-user' }],
  [{ label: 'Storage', icon: 'i-lucide-hard-drive', onSelect: () => (storageOpen.value = true) }],
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
          <UButton
            v-for="link in sections"
            :key="link.to"
            :to="link.to"
            :icon="link.icon"
            :aria-label="link.label"
            color="neutral"
            variant="ghost"
            active-color="primary"
            active-variant="soft"
            :active="link.active()"
          >
            <span class="hidden sm:inline">{{ link.label }}</span>
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
        <UButton
          to="/tracks/new"
          icon="i-lucide-plus"
          aria-label="Add tracks"
          class="sm:hidden"
        />
        <UColorModeButton />
        <UDropdownMenu
          :items="menu"
          :content="{ align: 'end' }"
        >
          <UButton
            icon="i-lucide-circle-user-round"
            color="neutral"
            variant="ghost"
            aria-label="User menu"
          />
        </UDropdownMenu>
      </div>
    </UContainer>
    <StorageDialog v-model:open="storageOpen" />
  </header>
</template>
