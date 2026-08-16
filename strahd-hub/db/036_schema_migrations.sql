-- db/035_schema_migrations.sql
begin;

create table if not exists public.schema_migrations (
  -- text, not int: matches the filename prefix exactly, and zero-padded text
  -- sorts correctly where '10' < '9' would not.
  version    text primary key,
  applied_at timestamptz not null default now()
);

-- Nothing in the app reads this and nothing should. RLS on with zero policies
-- means authenticated and anon get an empty table through PostgREST; the SQL
-- editor connects as the owner and bypasses it.
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;

commit;

--Must use begin; insert into public.schema_migrations (version) values ('Migration number'); at the top of ever future sql file
 