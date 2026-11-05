<script setup lang="ts">
/**
 * Choosing a new password, from the link of the reset email (login.vue →
 * "Forgot password?"). The link carries a one-time token (`token_hash`, see
 * supabase/templates/recovery.html): verifying it signs the user in, in
 * whichever browser opened the email, and the new password is then saved on
 * the account. Supabase's default email links here with a `code` instead,
 * which the Supabase client exchanges by itself before the page runs, but
 * only in the browser that asked for the link.
 * Client-rendered only, like the sign-in form (nuxt.config.ts → routeRules),
 * and open without a session (supabase.redirectOptions.exclude): the session
 * comes from the link. Already signed in, the page sets a new password as well.
 */
import { z } from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
// Browser tab title: "New password · Chronovault".
usePageTitle('New password')

const supabase = useSupabaseClient()
const route = useRoute()
const router = useRouter()
// Saved, or why not.
const toast = useToast()

/** checking: verifying the link; ready: the form; invalid: the link was used, expired, or is missing. */
const status = ref<'checking' | 'ready' | 'invalid'>('checking')
/** The new password is being saved (spinner, form locked). */
const saving = ref(false)

// The same rule as signing up (login.vue, and minimum_password_length in supabase/config.toml).
const schema = z.object({
  password: z.string().min(8, 'At least 8 characters'),
})
/** Validated form values. */
type Schema = z.output<typeof schema>
/** The one field of Nuxt UI's auth form. */
const fields: AuthFormField[] = [
  { name: 'password', type: 'password', label: 'New password', placeholder: '••••••••', required: true },
]

onMounted(async () => {
  status.value = await signInFromLink() ? 'ready' : 'invalid'
})

/** Signs in with the link's token, if any; true once there is a session. */
async function signInFromLink(): Promise<boolean> {
  const tokenHash = route.query.token_hash
  if (typeof tokenHash === 'string' && route.query.type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    // Used up either way: a reload must not try it again.
    await router.replace({ query: {} })
    if (error) return false
  }
  // A `code` link was exchanged at start-up; a link Supabase refused left an error in the URL and no session.
  const { data } = await supabase.auth.getSession()
  return data.session !== null
}

/** Saves the new password, then enters the app. */
async function onSubmit(event: FormSubmitEvent<Schema>) {
  saving.value = true
  try {
    const { error } = await supabase.auth.updateUser({ password: event.data.password })
    if (error) throw error
    toast.add({ title: 'Password changed', icon: 'i-lucide-key-round', color: 'success' })
    await navigateTo('/', { replace: true })
  }
  catch (error) {
    toast.add({ title: 'Could not change the password', description: getErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="status === 'checking'"
    class="flex flex-col items-center gap-3 py-6 text-center"
  >
    <UIcon
      name="i-lucide-loader-circle"
      class="size-8 animate-spin text-primary"
    />
    <p class="text-sm text-muted">
      Checking your link…
    </p>
  </div>

  <div
    v-else-if="status === 'invalid'"
    class="space-y-4 text-center"
  >
    <!-- Used, expired, or opened without a token: only a new email helps -->
    <UIcon
      name="i-lucide-link-2-off"
      class="size-10 text-muted"
    />
    <h1 class="text-lg font-semibold">
      This link no longer works
    </h1>
    <p class="text-sm text-muted">
      A reset link works once, and only for a while.
    </p>
    <UButton
      label="Get a new link"
      to="/login?forgot"
    />
  </div>

  <UAuthForm
    v-else
    :schema="schema"
    :fields="fields"
    :loading="saving"
    title="Choose a new password"
    description="At least 8 characters."
    :submit="{ label: 'Save password', block: true }"
    @submit="onSubmit"
  />
</template>
