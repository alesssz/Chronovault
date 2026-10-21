<!--
  Layout of the sign-in pages (login, confirm): a centered card with the
  logo, no header and no player.
-->
<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
    <AppLogo class="text-2xl" />
    <UPageCard class="w-full max-w-sm">
      <slot />
    </UPageCard>
  </div>
</template>
