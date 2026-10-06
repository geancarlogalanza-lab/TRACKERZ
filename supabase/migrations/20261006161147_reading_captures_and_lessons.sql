-- Reading: the Book Retention System's own data.
--
-- Nothing here references the College tables, and nothing there references
-- these: the two areas share only the signed-in user. Every row carries its
-- owner, and RLS limits each account to its own rows, as everywhere else.

-- ---------------------------------------------------------------
-- Captures: one sitting's raw notes on a book, and what Claude
-- proposed from them. Only the validated, structured proposal is
-- kept (ai_result); the raw request and response are not stored.
-- ---------------------------------------------------------------
create table public.captures (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_title        text not null check (char_length(trim(book_title)) between 1 and 200),
  book_author       text not null check (char_length(trim(book_author)) between 1 and 200),
  raw_notes         text not null check (char_length(trim(raw_notes)) between 1 and 20000),
  source_passage    text check (source_passage is null or char_length(source_passage) <= 20000),
  location          text check (location is null or char_length(location) <= 80),
  status            text not null default 'queued'
                      check (status in ('queued', 'processing', 'needs_review', 'reviewed', 'failed')),
  -- When the status last changed, so a run that died mid-way can be retried.
  status_changed_at timestamptz not null default now(),
  ai_result         jsonb,
  ai_model          text,
  prompt_version    text,
  error             text,
  created_at        timestamptz not null default now(),
  -- Lets a lesson name its capture and its owner in one foreign key.
  unique (id, user_id)
);

create index captures_user_status_idx on public.captures (user_id, status, created_at desc);

create function public.captures_track_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end
$$;

create trigger captures_track_status
  before update on public.captures
  for each row execute function public.captures_track_status();

-- ---------------------------------------------------------------
-- Lessons: proposals the reader kept — as written, edited, in their
-- own original words, or kept despite a flag. Retired lessons stay
-- in the library but are never resurfaced.
-- ---------------------------------------------------------------
create table public.lessons (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  capture_id       uuid not null,
  -- Which of the capture's proposals this came from; makes saving a review idempotent.
  proposal_index   integer check (proposal_index >= 0),
  text             text not null check (char_length(trim(text)) between 1 and 2000),
  -- Whose idea it is: the author's, the reader's own realisation, or both.
  origin           text not null check (origin in ('author', 'mine', 'mixed')),
  -- The reader's or the author's words the lesson rests on.
  basis            text,
  -- The reader's own interpretation, kept in their words.
  interpretation   text,
  -- Unsupported leaps and contradictions, kept when a lesson is kept anyway.
  flags            jsonb not null default '[]'::jsonb,
  decision         text not null check (decision in ('kept', 'edited', 'original', 'kept_anyway')),
  retired_at       timestamptz,
  last_surfaced_at timestamptz,
  surfaced_count   integer not null default 0,
  created_at       timestamptz not null default now(),
  -- The capture must belong to the same person as the lesson.
  foreign key (capture_id, user_id) references public.captures (id, user_id) on delete cascade,
  unique (capture_id, proposal_index)
);

create index lessons_user_idx on public.lessons (user_id, created_at desc);
create index lessons_capture_idx on public.lessons (capture_id, user_id);
create index lessons_resurface_idx on public.lessons (user_id, last_surfaced_at nulls first)
  where retired_at is null;

-- ---------------------------------------------------------------
-- Row Level Security: a user reaches only their own rows.
-- ---------------------------------------------------------------
alter table public.captures enable row level security;
alter table public.lessons  enable row level security;

create policy "own captures" on public.captures
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own lessons" on public.lessons
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
