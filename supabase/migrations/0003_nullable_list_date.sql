-- Lists default to no date so a freshly-created "Untitled list" doesn't fire
-- the shopping-day notification before the user has a chance to fill it in.
-- The notification is fired explicitly when the user sets the date to today.

alter table public.lists alter column date drop not null;
alter table public.lists alter column date drop default;
