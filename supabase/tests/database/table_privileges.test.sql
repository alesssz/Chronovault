-- =============================================================================
-- Table privileges (pgTAP): what each API role may do with every table, view
-- and sequence of `public`, the schema the Data API exposes, and what a new
-- one grants by itself (nothing, …_default_privileges.sql). A table added
-- without RLS, or a privilege granted by mistake, fails these lists; the
-- functions have theirs in function_privileges.test.sql.
-- Run with:  make db-test   (or: pnpm test:db)
-- Everything runs in a transaction that is rolled back: the DB stays clean.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- -----------------------------------------------------------------------------
-- Every table: RLS on
-- -----------------------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table of the API schema has row level security on'
);

-- -----------------------------------------------------------------------------
-- Exactly what each role may do, table by table (views and foreign tables included)
-- -----------------------------------------------------------------------------
select is(
  array(
    select c.relname || ':' || p.privilege
    from pg_class c
    cross join unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as p(privilege)
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('anon', c.oid, p.privilege)
    order by 1
  ),
  array['genres:select', 'subgenres:select'],
  'anonymous visitors read the genres and subgenres (RLS: the built-in ones), and nothing else'
);

select is(
  array(
    select c.relname || ':' || p.privilege
    from pg_class c
    cross join unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as p(privilege)
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('authenticated', c.oid, p.privilege)
    order by 1
  ),
  array[
    'feedback_seen:insert', 'feedback_seen:select', 'feedback_seen:update',
    'genres:select',
    'playlist_tracks:delete', 'playlist_tracks:insert', 'playlist_tracks:select',
    'playlists:delete', 'playlists:insert', 'playlists:select', 'playlists:update',
    'plays:select',
    'subgenres:delete', 'subgenres:insert', 'subgenres:select',
    'tracks:delete', 'tracks:insert', 'tracks:select', 'tracks:update',
    'version_votes:select'
  ],
  'signed-in users get these privileges (RLS: on their own rows), and nothing else'
);

select is(
  array(
    select table_name || '.' || column_name || ':' || grantee || ':' || lower(privilege_type)
    from information_schema.role_column_grants g
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
      and not has_table_privilege(grantee, format('%I.%I', table_schema, table_name), privilege_type)
    order by 1
  ),
  array['subgenres.name:authenticated:update'],
  'one privilege on a column alone: a user renames their own subgenre, and changes nothing else of it'
);

select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
       and (has_sequence_privilege('anon', c.oid, 'usage, select, update')
            or has_sequence_privilege('authenticated', c.oid, 'usage, select, update')) $$,
  'no API role reads or advances a sequence (rows get their ids from the defaults and functions)'
);

-- -----------------------------------------------------------------------------
-- A new object grants nothing by itself (created as the migrations do, by postgres)
-- -----------------------------------------------------------------------------
create table public.privileges_probe (id bigint generated always as identity primary key);
create function public.privileges_probe_fn() returns int language sql as 'select 1';

select ok(
  not has_table_privilege('anon', 'public.privileges_probe', 'select, insert, update, delete, truncate, references, trigger')
    and not has_table_privilege('authenticated', 'public.privileges_probe', 'select, insert, update, delete, truncate, references, trigger')
    and not has_sequence_privilege('anon', pg_get_serial_sequence('public.privileges_probe', 'id'), 'usage, select, update')
    and not has_sequence_privilege('authenticated', pg_get_serial_sequence('public.privileges_probe', 'id'), 'usage, select, update'),
  'a new table and its sequence give the API roles nothing until a migration grants it'
);

select ok(
  not has_function_privilege('anon', 'public.privileges_probe_fn()', 'execute')
    and not has_function_privilege('authenticated', 'public.privileges_probe_fn()', 'execute'),
  'a new function is callable by nobody, PUBLIC included, until a migration grants it'
);

select * from finish();
rollback;
