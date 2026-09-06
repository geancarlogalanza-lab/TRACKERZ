-- Personal college & streak tracker schema
-- Every table is owned by a user and isolated via RLS.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Academic context: lightweight trimester grouping for subjects
-- ---------------------------------------------------------------
create table public.trimesters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  label       text not null check (char_length(trim(label)) between 1 and 80),
  created_at  timestamptz not null default now()
);

create index trimesters_user_idx on public.trimesters (user_id, created_at);

-- ---------------------------------------------------------------
-- Subjects: persist until explicitly deleted
-- ---------------------------------------------------------------
create table public.subjects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  trimester_id uuid not null references public.trimesters (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 80),
  color        text not null default '#4f7cff'
                 check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at   timestamptz not null default now()
);

create index subjects_user_idx on public.subjects (user_id, trimester_id, created_at);

-- ---------------------------------------------------------------
-- Tasks: pending only. Completing a task deletes the row.
-- Dates/times are stored timezone-naive: "Sept 10, 6:00 PM" means
-- exactly that on every device, with no UTC shifting.
-- ---------------------------------------------------------------
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  subject_id    uuid not null references public.subjects (id) on delete cascade,
  title         text not null check (char_length(trim(title)) between 1 and 200),
  description   text,
  planned_date  date,
  planned_time  time,
  deadline_date date,
  deadline_time time,
  created_at    timestamptz not null default now()
);

create index tasks_user_idx on public.tasks (user_id, subject_id);
create index tasks_deadline_idx on public.tasks (user_id, deadline_date);

-- ---------------------------------------------------------------
-- Streaks: continuation is explicit, never inferred from note text.
-- ---------------------------------------------------------------
create table public.streaks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create index streaks_user_idx on public.streaks (user_id, created_at);

-- One record per streak per calendar day. The note is free text and
-- is never parsed, matched, or interpreted by the application.
create table public.streak_records (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  streak_id  uuid not null references public.streaks (id) on delete cascade,
  entry_date date not null,
  note       text not null default '',
  created_at timestamptz not null default now(),
  unique (streak_id, entry_date)
);

create index streak_records_user_date_idx on public.streak_records (user_id, entry_date);

-- ---------------------------------------------------------------
-- Row Level Security: a user reaches only their own rows.
-- ---------------------------------------------------------------
alter table public.trimesters     enable row level security;
alter table public.subjects       enable row level security;
alter table public.tasks          enable row level security;
alter table public.streaks        enable row level security;
alter table public.streak_records enable row level security;

create policy "own trimesters" on public.trimesters
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own subjects" on public.subjects
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own tasks" on public.tasks
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own streaks" on public.streaks
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own streak records" on public.streak_records
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
