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
 * comes from the link. A session the link did not just open (signed in with the
 * password) is offered the email instead (app/lib/reset-session.ts).
 */
import { z } from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { isFreshLinkSession } from '~/lib/reset-session'

definePageMeta({ layout: 'auth' })
usePageTitle('New password')

const supabase = useSupabaseClient()
const route = useRoute()
const router = useRouter()
const toast = useToast()

/**
 * checking: verifying the link; ready: the form; invalid: the link was used, expired, or is
 * missing; signed-in: a session no link just opened, offered a reset email; sent: that email left.
 */
const status = ref<'checking' | 'ready' | 'invalid' | 'signed-in' | 'sent'>('checking')
/** The new password is being saved (spinner, form locked). */
const saving = ref(false)
/** The signed-in account's address, where its reset email goes. */
const email = ref('')
/** The reset email is being sent (spinner on its button). */
const sending = ref(false)

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
  status.value = await signInFromLink()
})

/** Signs in with the link's token, if any; then whether the session may choose a password. */
async function signInFromLink(): Promise<'ready' | 'invalid' | 'signed-in'> {
  const tokenHash = route.query.token_hash
  if (typeof tokenHash === 'string' && route.query.type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    // Used up either way: a reload must not try it again.
    await router.replace({ query: {} })
    if (error) return 'invalid'
  }
  // A `code` link was exchanged at start-up; a link Supabase refused left an error in the URL and no session.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) return 'invalid'
  if (isFreshLinkSession(claims.amr)) return 'ready'
  email.value = claims.email ?? ''
  return 'signed-in'
}

/** Emails the signed-in account a reset link, as "Forgot password?" does (login.vue). */
async function sendLink() {
  sending.value = true
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
    status.value = 'sent'
  }
  catch (error) {
    toast.add({ title: 'Could not send the link', description: getErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    sending.value = false
  }
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
    class="space-y-6 text-center"
  >
    <!--
      Used, expired, or opened without a token: only a new email helps. Its icon, title and text in
      the classes of UAuthForm's header, like the form it stands in for.
    -->
    <div class="flex flex-col">
      <UIcon
        name="i-lucide-link-2-off"
        class="mx-auto mb-2 size-8 text-muted"
      />
      <h1 class="text-xl font-semibold text-pretty text-highlighted">
        This link no longer works
      </h1>
      <p class="mt-1 text-base text-pretty text-muted">
        A reset link works once, and only for a while.
      </p>
    </div>
    <UButton
      label="Get a new link"
      to="/login?forgot"
    />
  </div>

  <div
    v-else-if="status === 'signed-in' || status === 'sent'"
    class="space-y-6 text-center"
  >
    <!--
      Signed in, but not through a reset link: the new password comes through the account's
      email, so a borrowed or stolen session cannot set one. Laid out like the message above.
    -->
    <div class="flex flex-col">
      <UIcon
        :name="status === 'sent' ? 'i-lucide-mail-check' : 'i-lucide-mail'"
        class="mx-auto mb-2 size-8 text-muted"
      />
      <h1 class="text-xl font-semibold text-pretty text-highlighted">
        {{ status === 'sent' ? 'Check your email' : 'A new password takes an emailed link' }}
      </h1>
      <p class="mt-1 text-base text-pretty text-muted">
        <template v-if="status === 'sent'">
          The link to choose a new password is on its way to {{ email }}.
        </template>
        <template v-else>
          To keep your account safe, the password changes only from the link of a reset email, sent to {{ email }}.
        </template>
      </p>
    </div>
    <UButton
      v-if="status === 'signed-in'"
      label="Email me a link"
      :loading="sending"
      @click="sendLink"
    />
    <UButton
      v-else
      label="Back to the library"
      to="/"
      color="neutral"
      variant="subtle"
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
