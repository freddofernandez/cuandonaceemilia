-- Run once against the existing Supabase project before deploying the code change.
-- Messages are optional, public on the leaderboard, and limited to 240 characters.
alter table public.emilia_guesses
  add column if not exists family_message text not null default '';

alter table public.emilia_guesses
  drop constraint if exists emilia_family_message_length;

alter table public.emilia_guesses
  add constraint emilia_family_message_length
  check (char_length(family_message) <= 240);
