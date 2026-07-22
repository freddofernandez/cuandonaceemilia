-- Run once against an existing Supabase project before deploying the code change.
-- Replace the old one-prediction-per-IP constraint with a race-safe limit of five.
alter table public.emilia_guesses
  drop constraint if exists emilia_ip_unique;

create index if not exists emilia_ip_hash_idx on public.emilia_guesses (ip_hash);

create or replace function public.enforce_emilia_ip_submission_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.ip_hash, 0));
  if (select count(*) from public.emilia_guesses where ip_hash = new.ip_hash) >= 5 then
    raise exception using errcode = 'P0001', message = 'ip_submission_limit_reached';
  end if;
  return new;
end;
$$;

drop trigger if exists emilia_ip_submission_limit on public.emilia_guesses;
create trigger emilia_ip_submission_limit
before insert on public.emilia_guesses
for each row execute function public.enforce_emilia_ip_submission_limit();
