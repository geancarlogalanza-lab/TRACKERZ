-- A streak is continued on the day it happens, never back-filled. The
-- client enforces "today" exactly in local time; these guards back it up
-- at the API boundary with a one-day tolerance for timezones, so a
-- missed day can't be repaired with a direct request either.

drop policy "own streak records" on public.streak_records;

create policy "read own streak records" on public.streak_records
  for select to authenticated
  using (auth.uid() = user_id);

create policy "continue own streak today" on public.streak_records
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and entry_date between (current_date - 1) and (current_date + 1)
  );

-- Notes may be edited on any day; they never affect counting.
create policy "edit own streak note" on public.streak_records
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "undo own streak today" on public.streak_records
  for delete to authenticated
  using (
    auth.uid() = user_id
    and entry_date between (current_date - 1) and (current_date + 1)
  );

-- A record's day is fixed once written. Without this, an update could move
-- an old record into a gap and manufacture a continuation.
create or replace function public.streak_records_lock_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.entry_date <> old.entry_date or new.streak_id <> old.streak_id then
    raise exception 'A streak record cannot be moved to another day';
  end if;
  return new;
end
$$;

create trigger streak_records_lock_date
  before update on public.streak_records
  for each row execute function public.streak_records_lock_date();
