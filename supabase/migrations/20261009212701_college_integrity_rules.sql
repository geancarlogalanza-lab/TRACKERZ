-- Rules the College forms already keep, enforced where a direct request
-- can't skip them. Every existing row was checked against them first and
-- already satisfies them, so nothing is rewritten or removed.

-- A time on its own means nothing: it belongs to a date.
alter table public.tasks
  add constraint tasks_planned_time_needs_date check (planned_time is null or planned_date is not null),
  add constraint tasks_deadline_time_needs_date check (deadline_time is null or deadline_date is not null),
  add constraint tasks_description_length check (description is null or char_length(description) <= 5000);

alter table public.streak_records
  add constraint streak_records_note_length check (char_length(note) <= 500);

-- Everything belongs to its parent's owner. RLS checks a row's own user_id,
-- but a plain foreign key would accept another account's trimester,
-- subject or streak id. Composite keys tie each row to a parent with the
-- same owner, as the Reading tables already do.
alter table public.trimesters add constraint trimesters_id_user_id_key unique (id, user_id);
alter table public.subjects add constraint subjects_id_user_id_key unique (id, user_id);
alter table public.streaks add constraint streaks_id_user_id_key unique (id, user_id);

alter table public.subjects add constraint subjects_trimester_owner_fkey
  foreign key (trimester_id, user_id) references public.trimesters (id, user_id) on delete cascade;
alter table public.tasks add constraint tasks_subject_owner_fkey
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade;
alter table public.streak_records add constraint streak_records_streak_owner_fkey
  foreign key (streak_id, user_id) references public.streaks (id, user_id) on delete cascade;

-- Covering indexes for those keys, which also cover the original
-- single-column ones, so a cascade never scans a whole table.
create index subjects_trimester_owner_idx on public.subjects (trimester_id, user_id);
create index tasks_subject_owner_idx on public.tasks (subject_id, user_id);
create index streak_records_streak_owner_idx on public.streak_records (streak_id, user_id);
