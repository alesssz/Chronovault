<script setup lang="ts">
// Landing page for the email confirmation link (and the auth callback of
// @nuxtjs/supabase): Supabase creates the session from the URL, we wait
// for the user and redirect to the saved page (or the library).
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Confirm · ChronoPlayer' })

// Session ready (created from the link): go where the user wanted, or the library.
useSignedInRedirect()
</script>

<template>
  <div class="flex flex-col items-center gap-3 py-6 text-center">
    <UIcon
      name="i-lucide-loader-circle"
      class="size-8 animate-spin text-primary"
    />
    <p class="text-sm text-muted">
      Confirming your account…
    </p>
  </div>
</template>
