create function public.create_campaign(campaign_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_id uuid;
begin
  -- gate: only a global DM may create a campaign
  if not public.is_dm() then
    raise exception '...';
  end if;

  insert into campaigns (name) values (campaign_name)
  returning id into new_id;

  insert into campaign_members (campaign_id, user_id, role)
  values (new_id, auth.uid(), 'dm');

  return new_id;
end;
$$;

revoke execute on function public.create_campaign(text) from public, anon;
grant  execute on function public.create_campaign(text) to authenticated;