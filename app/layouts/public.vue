<!--
  Layout of the public pages (shared tracks): no library, no account menu
  and no player bar, since the page has its own controls.
-->
<template>
  <div class="flex min-h-dvh flex-col">
    <header class="border-b border-default">
      <UContainer class="flex h-14 items-center justify-between gap-3">
        <AppLogo />
        <ThemeButton />
      </UContainer>
    </header>

    <UMain class="flex-1">
      <slot />
    </UMain>
  </div>
</template>
