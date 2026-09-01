-- Self-heal invites for emails that already had a Supabase auth account.
--
-- `handle_new_user` only runs on the *first ever* insert into auth.users for
-- an email. If someone is removed and re-invited later (or was invited under
-- an email that had already signed in once before, e.g. during testing),
-- their next login reuses the existing auth.users row — no insert happens,
-- so the trigger never fires and their `members` row stays pending forever
-- even though they're genuinely authenticated. `is_member()` then blocks
-- them from every table with no way back in.
--
-- This RPC lets a logged-in client self-heal that link. It only ever touches
-- the caller's own row (matched by their own verified auth email, read
-- server-side — never client-supplied), so it can't be used to claim anyone
-- else's membership.
--
-- Paste into Supabase SQL Editor after 0004_protect_owner_member.sql.

create or replace function public.claim_pending_membership() returns void
language plpgsql security definer
set search_path = public, auth
as $$
declare
  my_email text;
begin
  select email into my_email from auth.users where id = auth.uid();
  if my_email is null then
    return;
  end if;

  update public.members
    set profile_id = auth.uid(), pending = false
    where email = my_email
      and (profile_id is distinct from auth.uid() or pending = true);
end;
$$;

grant execute on function public.claim_pending_membership() to authenticated;
