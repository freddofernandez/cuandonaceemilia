-- Run once against the existing Supabase project before deploying the code change.
-- Existing timestamptz values were written as Argentina instants; convert them to
-- their Argentina wall-clock representation before dropping timezone semantics.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'emilia_guesses'
      and column_name = 'birth_datetime'
      and data_type = 'timestamp with time zone'
  ) then
    alter table public.emilia_guesses
      alter column birth_datetime type timestamp without time zone
      using birth_datetime at time zone 'America/Argentina/Cordoba';
  end if;
end
$$;
