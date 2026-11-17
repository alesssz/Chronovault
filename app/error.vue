<script setup lang="ts">
/**
 * Error page for fatal errors, e.g. a missing track or playlist
 * (`createError({ fatal: true })`) or an unknown route.
 * A signed-in user keeps the app around it (header, navigation, the player
 * bar while something plays), so a dead link reads as a missing page, not as
 * an app that broke. A visitor gets the sign-in pages' frame, the logo over
 * the message, and a way to sign in.
 */
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const user = useSupabaseUser()
const signedIn = computed(() => Boolean(user.value))
/**
 * The way out. A button, not a link: clearError() both drops the error and
 * navigates, while a link would change the address under the error page.
 */
const way = computed(() => (signedIn.value
  ? { label: 'Back to library', redirect: '/' }
  : { label: 'Sign in', redirect: '/login' }))

/**
 * What the page says. A 404 keeps the page's own title ("Track not found");
 * Nuxt's own for an unknown route ends with the path ("Page not found: /x"),
 * which the address bar already shows. Anything else is a failure the user
 * can only retry, whatever its technical message.
 */
const shown = computed(() => {
  const status = props.error.statusCode
  if (status === 404) {
    return {
      statusCode: status,
      statusMessage: props.error.statusMessage?.replace(/:.*$/, '') || 'Page not found',
      message: 'The link may be wrong, or what it led to was deleted.',
    }
  }
  return { statusCode: status, statusMessage: 'Something went wrong', message: 'Try again in a moment.' }
})
</script>

<template>
  <UApp :toaster="{ position: 'top-center' }">
    <NuxtLayout :name="signedIn ? 'default' : 'auth'">
      <!-- A div: the layouts already have their own <main>, and their own height. -->
      <UError
        :as="{ root: 'div' }"
        :error="shown"
        :redirect="way.redirect"
        :clear="{ label: way.label }"
        :ui="signedIn
          ? { root: 'min-h-0 py-24' }
          : { root: 'min-h-0 py-2', statusMessage: 'text-3xl sm:text-3xl', message: 'text-base', links: 'mt-6' }"
        data-testid="error-page"
      />
    </NuxtLayout>
  </UApp>
</template>
