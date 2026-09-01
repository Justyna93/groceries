-- Protect the owner's membership row.
--
-- Every RLS policy in this schema goes through `public.is_member()`, which
-- reads `public.members`. Deleting a row there doesn't just drop someone from
-- the roster — it revokes their access to every table with no way back in,
-- and the roster UI puts a one-tap remove button next to each member.
--
-- The app hides that button for protected members, but the client is not the
-- place to enforce this: anyone holding the anon key can issue the DELETE.
-- These triggers are the actual guard.
--
-- Paste into Supabase SQL Editor after 0003_nullable_list_date.sql.

create or replace function public.protected_member_emails() returns text[]
language sql immutable
as $$ select array['justyna.michalik93@gmail.com'] $$;

-- ---------------------------------------------------------------------------
-- Block DELETE on a protected member.
-- ---------------------------------------------------------------------------
create or replace function public.protect_member_delete() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(old.email) = any (public.protected_member_emails()) then
    raise exception 'Member % is protected and cannot be removed', old.email
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists members_protect_delete on public.members;
create trigger members_protect_delete
  before delete on public.members
  for each row execute function public.protect_member_delete();

-- ---------------------------------------------------------------------------
-- Block the way around it: renaming the row's email, or unlinking the auth
-- account, would leave it deletable / non-functional.
-- ---------------------------------------------------------------------------
create or replace function public.protect_member_update() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(old.email) = any (public.protected_member_emails()) then
    if lower(new.email) is distinct from lower(old.email) then
      raise exception 'Member % is protected: its email cannot be changed', old.email
        using errcode = 'check_violation';
    end if;
    if old.profile_id is not null and new.profile_id is distinct from old.profile_id then
      raise exception 'Member % is protected: its account link cannot be changed', old.email
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists members_protect_update on public.members;
create trigger members_protect_update
  before update on public.members
  for each row execute function public.protect_member_update();
