<script setup lang="ts">
// Landing page for the email confirmation link: Supabase creates the
// session, we wait for the user and redirect.
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Confirm · ChronoPlayer' })

const user = useSupabaseUser()
const redirect = useSupabaseCookieRedirect()

watch(user, (value) => {
  if (value) void navigateTo(redirect.pluck() || '/', { replace: true })
}, { immediate: true })
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
