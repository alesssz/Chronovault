-- =============================================================================
-- Seed for LOCAL development only (run by `supabase db reset`).
-- Creates a demo user:  demo@chronoplayer.local / chronoplayer
--
-- A reset wipes the local database (every account and track): it only runs
-- with an explicit `pnpm db:reset` / `make db-reset`. New migrations are
-- applied with `pnpm db:migrate`, which keeps the data.
-- The user is inserted straight into Supabase's auth schema (password hashed
-- with bcrypt, email already confirmed) plus its email identity.
-- =============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated',
  'demo@chronoplayer.local',
  extensions.crypt('chronoplayer', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}', '{}',
  now(), now(), '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '{"sub": "11111111-1111-4111-8111-111111111111", "email": "demo@chronoplayer.local"}',
  'email', now(), now(), now()
);
