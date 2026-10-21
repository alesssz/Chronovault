<!--
  Root component. UApp provides what Nuxt UI needs app-wide (toasts,
  tooltips, overlays); NuxtPwaManifest injects the PWA manifest link;
  the loading bar shows during page navigation. Each page picks its layout
  (default, auth or public) through definePageMeta.
-->
<template>
  <UApp :toaster="{ position: 'top-center' }">
    <NuxtPwaManifest />
    <NuxtLoadingIndicator color="var(--ui-primary)" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
