-- Local-dev-only shim so the Supabase migration applies against a bare local
-- Postgres install. A real Supabase project already provides the `auth`
-- schema (via GoTrue) — do NOT run this file against a hosted Supabase
-- project; only 0001_init_schema.sql (and seed.sql) get applied there.

create extension if not exists "pgcrypto";

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  raw_user_meta_data jsonb,
  created_at timestamptz not null default now()
);

-- Real Supabase's auth.uid() reads the JWT claim of the current request.
-- Locally, simulate it via a settable session variable:
--   set app.current_user_id = '<uuid>';
create or replace function auth.uid()
returns uuid as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$ language sql stable;
