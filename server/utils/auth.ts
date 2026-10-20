import { createError, type H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~~/shared/types/database.types'

export type DbClient = SupabaseClient<Database>

export interface AuthContext {
  userId: string
  /** Supabase client carrying the user's token: every query goes through RLS. */
  db: DbClient
}

/** Returns the user and an authenticated client, or responds with 401. */
export async function requireAuth(event: H3Event): Promise<AuthContext> {
  const claims = await serverSupabaseUser(event)
  if (!claims?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Sign-in required' })
  }
  const db = await serverSupabaseClient<Database>(event)
  return { userId: claims.sub, db }
}

/**
 * Supabase client for public endpoints: it carries the visitor's session
 * when there is one, otherwise it acts as the anonymous role.
 */
export async function visitorClient(event: H3Event): Promise<DbClient> {
  return serverSupabaseClient<Database>(event)
}
