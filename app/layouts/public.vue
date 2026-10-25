<!--
  Layout of the public pages (shared tracks and playlists): no library, no
  account menu and no player bar, since each page has its own player
  (SharePlayer). That player brings the rest of the controls: a mini player
  fixed at the bottom while it is scrolled away (ShareMiniPlayer) and the
  full-screen view, mounted here in its visitors' mode (`shared`: no owner's
  tools). `has-mini-player` keeps room at the bottom of the page while the
  player is in use, so the mini player never covers the end of the page
  (see main.css).
-->
<script setup lang="ts">
// Whether the page's player is in use (room for the mini player).
const player = usePlayerStore()
</script>

<template>
  <div
    class="flex min-h-dvh flex-col"
    :class="{ 'has-mini-player': player.isActive }"
  >
    <header class="border-b border-default">
      <UContainer class="flex h-14 items-center justify-between gap-3">
        <AppLogo />
        <ThemeButton />
      </UContainer>
    </header>

    <UMain class="flex-1">
      <slot />
    </UMain>

    <!-- The full-screen view of the page's player (opened from SharePlayer or the mini player) -->
    <PlayerExpanded shared />
    <!-- The list of keyboard shortcuts (the ? key: the share pages have no account menu) -->
    <KeyboardShortcutsDialog />
  </div>
</template>
