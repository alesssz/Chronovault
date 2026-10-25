<!--
  Layout of the sign-in pages (login, confirm): a centered card under the
  logo (larger here, with the tagline), no header and no player.
-->
<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
    <AppLogo
      class="text-2xl"
      tagline
    />
    <UPageCard class="w-full max-w-sm">
      <slot />
    </UPageCard>
  </div>
</template>
