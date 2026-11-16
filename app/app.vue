<template>
  <UApp :toaster="{ position: 'top-center' }">
    <NuxtPwaManifest />
    <NuxtLoadingIndicator color="var(--ui-primary)" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
