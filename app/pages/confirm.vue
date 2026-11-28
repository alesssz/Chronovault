<script setup lang="ts">
// Landing page for the email confirmation link and for Google sign-in (the
// auth callback of @nuxtjs/supabase): Supabase creates the session from the
// URL, we wait for the user and redirect to the saved page (or the library).
definePageMeta({ layout: 'auth' })
usePageTitle('Confirm')
useSignedInRedirect()

const route = useRoute()

/**
 * Why no session will come, when Supabase sent the user back with an error:
 * otherwise the spinner would turn for good. It is in the query, and in the
 * fragment for links of the older implicit flow. `signup_disabled` is a
 * Google account no Chronovault account shares its email with, since
 * sign-ups are closed in production.
 */
const failure = computed(() => {
  const fragment = new URLSearchParams(route.hash.slice(1))
  const param = (name: string) => String(route.query[name] ?? fragment.get(name) ?? '')
  if (!param('error') && !param('error_code')) return null
  if (param('error_code') === 'signup_disabled') return 'No Chronovault account uses this email, and new accounts are closed.'
  return param('error_description') || 'The link is invalid or has expired.'
})
</script>

<template>
  <div
    v-if="failure"
    class="flex flex-col items-center gap-3 py-6 text-center"
    data-testid="confirm-failed"
  >
    <UIcon
      name="i-lucide-circle-alert"
      class="size-8 text-error"
    />
    <h1 class="text-xl font-semibold text-highlighted">
      Could not sign you in
    </h1>
    <p class="text-sm text-pretty text-muted">
      {{ failure }}
    </p>
    <UButton
      variant="link"
      label="Back to sign in"
      to="/login"
    />
  </div>
  <div
    v-else
    class="flex flex-col items-center gap-3 py-6 text-center"
  >
    <UIcon
      name="i-lucide-loader-circle"
      class="size-8 animate-spin text-primary"
    />
    <p class="text-sm text-muted">
      Confirming your account…
    </p>
  </div>
</template>
