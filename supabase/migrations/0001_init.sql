-- Groceries app: initial schema, RLS, storage, and invite-only signup trigger.
-- Paste this into Supabase → SQL Editor → New query → Run.

-- =========================================================================
-- Tables
-- =========================================================================

create table public.members (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  initials text not null,
  profile_id uuid unique references auth.users(id) on delete set null,
  pending boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New list',
  date date not null default current_date,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  text text not null default '',
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index items_list_id_idx on public.items(list_id);
create index photos_list_id_idx on public.photos(list_id);
create index members_profile_id_idx on public.members(profile_id);

-- =========================================================================
-- Helper: is the calling user an accepted (non-pending) member?
-- =========================================================================

create or replace function public.is_member() returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.members
    where profile_id = auth.uid() and pending = false
  );
$$;

-- =========================================================================
-- Row Level Security
-- Any accepted member can read/write everything household-wide.
-- =========================================================================

alter table public.members enable row level security;
alter table public.lists   enable row level security;
alter table public.items   enable row level security;
alter table public.photos  enable row level security;

create policy "members select" on public.members
  for select using (public.is_member());
create policy "members insert" on public.members
  for insert with check (public.is_member());
create policy "members update" on public.members
  for update using (public.is_member() or profile_id = auth.uid())
          with check (public.is_member() or profile_id = auth.uid());
create policy "members delete" on public.members
  for delete using (public.is_member());

create policy "lists all"  on public.lists  for all using (public.is_member()) with check (public.is_member());
create policy "items all"  on public.items  for all using (public.is_member()) with check (public.is_member());
create policy "photos all" on public.photos for all using (public.is_member()) with check (public.is_member());

-- =========================================================================
-- Invite-only signup trigger.
-- - If email already exists as a pending member → accept the invite.
-- - Else, if there are no members yet → create an owner (first user).
-- - Else → reject (not invited).
-- =========================================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
declare
  matched_id uuid;
  total int;
  derived_name text;
  derived_initials text;
begin
  select id into matched_id from public.members where email = new.email;

  if matched_id is not null then
    update public.members
      set profile_id = new.id, pending = false
      where id = matched_id;
    return new;
  end if;

  select count(*) into total from public.members;
  if total = 0 then
    derived_name := initcap(split_part(new.email, '@', 1));
    derived_initials := upper(substring(new.email, 1, 2));
    insert into public.members (email, name, initials, profile_id, pending)
    values (new.email, derived_name, derived_initials, new.id, false);
    return new;
  end if;

  raise exception 'Signup not permitted: % is not invited', new.email;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- Storage bucket for list photos
-- =========================================================================

insert into storage.buckets (id, name, public)
values ('list-photos', 'list-photos', false)
on conflict (id) do nothing;

create policy "list-photos select" on storage.objects
  for select using (bucket_id = 'list-photos' and public.is_member());
create policy "list-photos insert" on storage.objects
  for insert with check (bucket_id = 'list-photos' and public.is_member());
create policy "list-photos delete" on storage.objects
  for delete using (bucket_id = 'list-photos' and public.is_member());

-- =========================================================================
-- Realtime: broadcast changes on these tables to subscribed clients
-- =========================================================================

alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.lists;
alter publication supabase_realtime add table public.items;
alter publication supabase_realtime add table public.photos;
