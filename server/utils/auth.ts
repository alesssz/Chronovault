import { createError, type H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~~/shared/types/database.types'

/**
 * Authentication helpers for API routes (auto-imported by Nitro in
 * `server/api/**`).
 *
 * The session lives in cookies set by `@nuxtjs/supabase` in the browser.
 * The server never uses the Supabase service key: every client below sends
 * the user's own JWT (or none, for visitors), so Postgres Row Level Security
 * decides what each request may read or write.
 */

/** Supabase client typed with the generated database schema. */
export type DbClient = SupabaseClient<Database>

/** What requireAuth() gives a route. */
export interface AuthContext {
  /** The signed-in user's id (`auth.users.id`, the JWT `sub` claim). */
  userId: string
  /** Supabase client carrying the user's token: every query goes through RLS. */
  db: DbClient
}

/**
 * Returns the user and an authenticated client, or responds with 401.
 * The claims are verified from the session cookie (JWT signature and expiry).
 */
export async function requireAuth(event: H3Event): Promise<AuthContext> {
  const claims = await serverSupabaseUser(event)
  if (!claims?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Sign-in required' })
  }
  const db = await serverSupabaseClient<Database>(event)
  return { userId: claims.sub, db }
}

/**
 * Supabase client for public endpoints (`/api/shared/*`): it carries the
 * visitor's session when there is one, otherwise it acts as the anonymous
 * role. Either way it can only reach shared items through the
 * `get_shared_*` database functions.
 */
export async function visitorClient(event: H3Event): Promise<DbClient> {
  return serverSupabaseClient<Database>(event)
}
