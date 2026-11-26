-- =============================================================================
-- Chronovault — a new table, sequence or function grants nothing by itself
--
-- Supabase's default privileges give anon and authenticated every privilege
-- on each table and sequence the migrations create in `public`, and
-- `execute` on each function. Everything in `public` is reachable through
-- the Data API with the public key, so a table added without its own RLS
-- and grants (as 20261020000000_grants.sql sets them for each table) would
-- be readable and writable by any visitor until someone noticed; a function
-- would be callable. Every object so far has explicit grants and the tests
-- list them (table_privileges and function_privileges), but the default
-- was still the open door.
--
-- From here on, the migrations' role (postgres) grants nothing by default:
-- each new object gets exactly the grants its migration writes. Postgres
-- also gives every new function `execute` to PUBLIC, whatever the schema;
-- that default is global, so it is revoked for all of postgres's functions,
-- not per schema (a schema's defaults can only add to the global ones).
-- The private schema's helpers already grant their callers explicitly.
--
-- Existing objects keep their privileges, with one exception: plays_id_seq
-- (…_plays_and_votes.sql) got the default's usage, select and update for
-- both roles. Only record_play writes plays, as its owner (security
-- definer), so nobody else needs the sequence; nextval() and setval() are
-- not exposed by the API, but nothing should rest on that.
-- =============================================================================

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

alter default privileges for role postgres
  revoke execute on functions from public;

revoke all on sequence public.plays_id_seq from anon, authenticated;
