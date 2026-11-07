<!--
  Layout of the public pages (shared tracks and playlists): no library, no
  account menu and no player bar, since each page has its own player
  (SharePlayer). That player brings the rest of the controls: a mini player
  fixed at the bottom while it is scrolled away (ShareMiniPlayer) and the
  full-screen view, mounted here in its visitors' mode (`shared`: no owner's
  tools). `has-mini-player` keeps room at the bottom of the page while the
  mini player is shown, so it never covers the end of the page (see
  main.css). Only then: kept whenever the player was in use, the room made
  the track page, which fits the screen on desktop, scroll by 4rem of nothing.
  The header carries the logo with its tagline: these are the pages other
  people see, so they say whose music it is.
-->
<script setup lang="ts">
// Whether the mini player is on screen (set by SharePlayer): room for it at the bottom.
const miniPlayerShown = useState('share-mini-player', () => false)
</script>

<template>
  <div
    class="flex min-h-dvh flex-col"
    :class="{ 'has-mini-player': miniPlayerShown }"
  >
    <header class="border-b border-default">
      <UContainer class="flex h-14 items-center justify-between gap-3">
        <AppLogo tagline />
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
