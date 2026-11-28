<script setup lang="ts">
/**
 * Sign in / sign up with email and password (Supabase Auth, in the browser),
 * or with Google where it is set up, and "Forgot password?": an email with a
 * link to choose a new one (reset-password.vue). `/login?forgot` opens on
 * that form.
 * Client-rendered only (see nuxt.config.ts → routeRules): a form submitted
 * before hydration would send the password in the URL.
 * After sign-in, the user goes back to the page they were trying to open.
 */
import { z } from 'zod'
import type { AuthFormField, ButtonProps, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
usePageTitle('Sign in')

const supabase = useSupabaseClient()
useSignedInRedirect()
const toast = useToast()

/** Which form is shown: sign in, create an account, or ask for a reset link. */
const mode = ref<'login' | 'register' | 'forgot'>(useRoute().query.forgot === undefined ? 'login' : 'forgot')
/** The request is running (spinner, form locked). */
const loading = ref(false)
/** An email was sent (sign-up confirmation, or reset link to that address): "check your inbox" instead of the form. */
const emailSent = ref<{ kind: 'confirm' } | { kind: 'reset', to: string } | null>(null)
/** The reset address in two pieces, the name and "@domain": a narrow line breaks between them (see the template). */
const sentTo = computed(() => {
  if (emailSent.value?.kind !== 'reset') return null
  const at = emailSent.value.to.lastIndexOf('@')
  return { name: emailSent.value.to.slice(0, at), domain: emailSent.value.to.slice(at) }
})

const email = z.email('Invalid email')
const schema = z.object({
  email,
  password: z.string().min(8, 'At least 8 characters'),
})
/** Validated form values. */
type Schema = z.output<typeof schema>
// "Forgot password?" asks for the email only.
const forgotSchema = z.object({ email })
/** Validated values of the reset form. */
type ForgotSchema = z.output<typeof forgotSchema>

/** Fields of Nuxt UI's auth form. */
const emailField: AuthFormField = { name: 'email', type: 'email', label: 'Email', placeholder: 'name@example.com', required: true }
const fields: AuthFormField[] = [
  emailField,
  { name: 'password', type: 'password', label: 'Password', placeholder: '••••••••', required: true },
]

/**
 * "Continue with Google", above the form, only where the provider is set up
 * (runtimeConfig.public.googleSignIn): elsewhere Supabase would answer that
 * the provider is not enabled.
 */
const providers = computed<ButtonProps[]>(() => useRuntimeConfig().public.googleSignIn
  ? [{ label: 'Continue with Google', icon: 'i-logos-google-icon', color: 'neutral', variant: 'subtle', block: true, loading: loading.value, onClick: signInWithGoogle }]
  : [])

/**
 * Leaves for Google's consent screen; Supabase brings the user back to
 * /confirm, which enters the app. The page asked for before sign-in is in a
 * cookie (useSignedInRedirect), so it survives the round trip.
 */
async function signInWithGoogle() {
  loading.value = true
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/confirm` },
  })
  // On success the browser is already leaving the page: keep the button busy.
  if (!error) return
  loading.value = false
  toast.add({ title: 'Sign-in failed', description: getErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
}

/** Signs in (useSignedInRedirect then enters the app) or signs up. */
async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    if (mode.value === 'login') {
      const { error } = await supabase.auth.signInWithPassword(event.data)
      if (error) throw error
      return
    }

    const { data, error } = await supabase.auth.signUp({
      ...event.data,
      options: { emailRedirectTo: `${window.location.origin}/confirm` },
    })
    if (error) throw error
    // With email confirmation enabled, the session only arrives after clicking the link.
    if (!data.session) emailSent.value = { kind: 'confirm' }
  }
  catch (error) {
    toast.add({
      title: mode.value === 'login' ? 'Sign-in failed' : 'Sign-up failed',
      description: getErrorMessage(error),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    })
  }
  finally {
    loading.value = false
  }
}

/**
 * Sends the reset email. Its link leads to /reset-password, which must be in
 * Supabase's allowed redirect URLs (supabase/config.toml, and the project's
 * settings in production): otherwise it leads to the site URL. Supabase
 * answers the same whether the address has an account or not.
 */
async function sendResetLink(event: FormSubmitEvent<ForgotSchema>) {
  loading.value = true
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(event.data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
    emailSent.value = { kind: 'reset', to: event.data.email }
  }
  catch (error) {
    toast.add({ title: 'Could not send the link', description: getErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    loading.value = false
  }
}

/** Shows another form (sign in, sign up, forgot password). */
function setMode(value: typeof mode.value) {
  mode.value = value
  emailSent.value = null
}
</script>

<template>
  <div
    v-if="emailSent"
    class="space-y-6 text-center"
    data-testid="email-sent"
  >
    <!--
      An email is on its way: sign-up confirmation (production) or reset link. Its icon, title and
      text in the classes of UAuthForm's header, so the message reads as the next step of the form
      it replaces rather than as a smaller note. The address is two inline blocks, the name and
      "@domain": each moves to the next line whole, so a narrow line breaks at the @, never at a
      hyphen, where it read as two addresses. A block is split (anywhere) only when longer than a
      line. The comma is inside the second, or a line could start with it.
    -->
    <div class="flex flex-col">
      <UIcon
        name="i-lucide-mail-check"
        class="mx-auto mb-2 size-8 text-primary"
      />
      <h1 class="text-xl font-semibold text-pretty text-highlighted">
        Check your email
      </h1>
      <p class="mt-1 text-base text-pretty text-muted">
        <template v-if="emailSent.kind === 'confirm'">
          We sent you a link to confirm your account.
        </template>
        <template v-else-if="sentTo">
          If an account exists for <span
            class="text-default"
            data-testid="email-sent-address"
          ><span class="inline-block max-w-full break-all">{{ sentTo.name }}</span><wbr><span class="inline-block max-w-full break-all">{{ sentTo.domain }}<span class="text-muted">,</span></span></span>
          we sent it a link to choose a new password.
        </template>
      </p>
    </div>
    <UButton
      variant="link"
      label="Back to sign in"
      @click="setMode('login')"
    />
  </div>

  <UAuthForm
    v-else-if="mode === 'forgot'"
    :schema="forgotSchema"
    :fields="[emailField]"
    :loading="loading"
    title="Reset your password"
    description="We'll email you a link to choose a new one."
    :submit="{ label: 'Send link', block: true }"
    @submit="sendResetLink"
  >
    <template #footer>
      <p class="text-center text-sm text-muted">
        Remembered it?
        <UButton
          variant="link"
          class="p-0"
          label="Sign in"
          @click="setMode('login')"
        />
      </p>
    </template>
  </UAuthForm>

  <UAuthForm
    v-else
    :key="mode"
    :schema="schema"
    :fields="fields"
    :providers="providers"
    :loading="loading"
    :title="mode === 'login' ? 'Welcome back' : 'Create an account'"
    :description="mode === 'login' ? 'Sign in to your music library.' : 'Your music library, everywhere.'"
    :submit="{ label: mode === 'login' ? 'Sign in' : 'Sign up', block: true }"
    @submit="onSubmit"
  >
    <!-- Signing in: a way out for a forgotten password, next to its label -->
    <template
      v-if="mode === 'login'"
      #password-hint
    >
      <UButton
        variant="link"
        class="p-0"
        label="Forgot password?"
        @click="setMode('forgot')"
      />
    </template>
    <!-- Switch between signing in and signing up -->
    <template #footer>
      <p class="text-center text-sm text-muted">
        {{ mode === 'login' ? 'No account yet?' : 'Already have an account?' }}
        <UButton
          variant="link"
          class="p-0"
          :label="mode === 'login' ? 'Sign up' : 'Sign in'"
          @click="setMode(mode === 'login' ? 'register' : 'login')"
        />
      </p>
    </template>
  </UAuthForm>
</template>
