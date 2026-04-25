-- Groceries app: web-push subscriptions + scheduled "shopping day" reminder.
-- Paste into Supabase SQL Editor after 0001_init.sql is applied.

-- =========================================================================
-- Subscriptions: one row per (user, browser/device).
-- The unique key is the endpoint, which the Push service rotates if the
-- user clears site data, so we upsert on it.
-- =========================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- A member can manage only their own subscriptions.
create policy "push_subscriptions own select" on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy "push_subscriptions own insert" on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy "push_subscriptions own update" on public.push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_subscriptions own delete" on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- =========================================================================
-- Track which lists already had a 9am reminder fired today, so the cron
-- and the on-insert trigger don't double-fire.
-- =========================================================================

create table public.shopping_day_notifications (
  list_id uuid not null references public.lists(id) on delete cascade,
  notified_on date not null,
  created_at timestamptz not null default now(),
  primary key (list_id, notified_on)
);

-- =========================================================================
-- Schedule a 9am-Europe/Warsaw daily check via pg_cron.
-- The cron job calls the `send-shopping-reminders` edge function, which
-- reads `lists.date = current_date` and pushes to all subscriptions.
--
-- Requires:
--   1. `pg_cron` and `pg_net` extensions enabled in Supabase
--      (Database → Extensions).
--   2. A Vault secret named `edge_function_url` containing the full URL
--      `https://<project-ref>.functions.supabase.co/send-shopping-reminders`.
--   3. A Vault secret named `service_role_key` with the project service-role JWT.
--      (Both are read at job-execution time, not stored in the schedule itself.)
-- =========================================================================

-- 9am Warsaw == 07:00 UTC in summer (CEST), 08:00 UTC in winter (CET).
-- Run hourly between 07:00 and 08:00 UTC; the edge function is idempotent
-- via shopping_day_notifications, so the duplicate firing is harmless.
select cron.schedule(
  'shopping-day-reminder',
  '0 7,8 * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := jsonb_build_object('source', 'cron')
    ) as request_id;
  $cron$
);

-- =========================================================================
-- Realtime: nothing to publish here — push_subscriptions are private and
-- shopping_day_notifications is internal.
-- =========================================================================
