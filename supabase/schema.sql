-- Ejecutar una sola vez en el SQL Editor del proyecto Supabase.
create extension if not exists pgcrypto;

create table if not exists public.emilia_guesses (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  email text not null,
  birth_datetime timestamp without time zone not null,
  weight_grams integer not null check (weight_grams between 1500 and 6000),
  wants_bet boolean not null default false,
  receipt_path text,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  constraint emilia_email_unique unique (email),
  constraint emilia_birth_minute_unique unique (birth_datetime),
  constraint emilia_weight_unique unique (weight_grams)
);

create unique index if not exists emilia_nickname_unique on public.emilia_guesses (lower(nickname));
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

alter table public.emilia_guesses enable row level security;
revoke all on table public.emilia_guesses from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('emilia-transferencias', 'emilia-transferencias', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
