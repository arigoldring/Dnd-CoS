
-- 000 wrote this policy as `with check (auth.uid() = id)`, which constrains WHO
-- the row belongs to and nothing about what is IN it. So a first-time user could
-- insert their own profile with role = 'dm' and pass — the id really was theirs.
-- That bypassed the whole invite system: no code spent, no DM check cleared.

drop policy "insert own profile" on public.profiles;

create policy "insert own profile" on public.profiles
  for INSERT to authenticated
  with check (auth.uid() = id and role = 'player');
