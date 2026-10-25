<script setup lang="ts">
/**
 * Sign in / sign up with email and password (Supabase Auth, in the browser).
 * Client-rendered only (see nuxt.config.ts → routeRules): a form submitted
 * before hydration would send the password in the URL.
 * After sign-in, the user goes back to the page they were trying to open.
 */
import { z } from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
// Browser tab title: "Sign in · Chronovault".
usePageTitle('Sign in')

// Supabase Auth runs in the browser: sign-in and sign-up set the session cookies.
const supabase = useSupabaseClient()
// As soon as a session exists, enter the app (also when landing here already signed in).
useSignedInRedirect()
// Sign-in/sign-up failures.
const toast = useToast()

/** Which form is shown: sign in or create an account. */
const mode = ref<'login' | 'register'>('login')
/** The request is running (spinner, form locked). */
const loading = ref(false)
/** Sign-up done with email confirmation on: show "check your inbox" instead of the form. */
const confirmationSent = ref(false)

const schema = z.object({
  email: z.email('Invalid email'),
  password: z.string().min(8, 'At least 8 characters'),
})
/** Validated form values. */
type Schema = z.output<typeof schema>

/** Fields of Nuxt UI's auth form. */
const fields: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'Email', placeholder: 'name@example.com', required: true },
  { name: 'password', type: 'password', label: 'Password', placeholder: '••••••••', required: true },
]

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
    if (!data.session) confirmationSent.value = true
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

/** Switches between sign-in and sign-up. */
function toggleMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  confirmationSent.value = false
}
</script>

<template>
  <div
    v-if="confirmationSent"
    class="space-y-4 text-center"
  >
    <UIcon
      name="i-lucide-mail-check"
      class="size-10 text-primary"
    />
    <h1 class="text-lg font-semibold">
      Check your email
    </h1>
    <p class="text-sm text-muted">
      We sent you a link to confirm your account.
    </p>
    <UButton
      variant="link"
      label="Back to sign in"
      @click="toggleMode"
    />
  </div>

  <UAuthForm
    v-else
    :key="mode"
    :schema="schema"
    :fields="fields"
    :loading="loading"
    :title="mode === 'login' ? 'Welcome back' : 'Create an account'"
    :description="mode === 'login' ? 'Sign in to your music library.' : 'Your music library, everywhere.'"
    :submit="{ label: mode === 'login' ? 'Sign in' : 'Sign up', block: true }"
    @submit="onSubmit"
  >
    <template #footer>
      <p class="text-center text-sm text-muted">
        {{ mode === 'login' ? 'No account yet?' : 'Already have an account?' }}
        <UButton
          variant="link"
          class="p-0"
          :label="mode === 'login' ? 'Sign up' : 'Sign in'"
          @click="toggleMode"
        />
      </p>
    </template>
  </UAuthForm>
</template>
