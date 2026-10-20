<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const player = usePlayerStore()
const toast = useToast()

async function logout() {
  player.close()
  const { error } = await supabase.auth.signOut()
  if (error) {
    toast.add({ title: 'Sign-out failed', description: error.message, color: 'error' })
    return
  }
  await navigateTo('/login')
}

const menu = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.email ?? 'Account', type: 'label', icon: 'i-lucide-user' }],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: logout }],
])
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-default bg-default/80 backdrop-blur">
    <UContainer class="flex h-14 items-center justify-between gap-3">
      <NuxtLink
        to="/"
        aria-label="Library"
      >
        <AppLogo />
      </NuxtLink>

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
  </header>
</template>
