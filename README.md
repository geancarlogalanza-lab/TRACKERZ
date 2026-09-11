# Tracker

A personal college task tracker and daily streak tracker. Two modes, one tab
switch apart, backed by a Supabase account so the same data is there on a
laptop and a phone.

It is deliberately small. There is no archive of completed work, no points, no
analytics, and no productivity score — completing a task deletes it, and a
streak grows because you said it did.

```
[ Pending ]   [ Streaks ]
```

**Pending** — subjects you create, each with its own colour, holding the tasks
still to do. A task carries a title, an optional description, when you plan to
work on it, and when it is due. Anything overdue or landing today is pulled to
a short list at the top. Completing a task removes it; the subject stays until
you delete it yourself.

**Streaks** — a Today panel and a month calendar. Continue a streak with one tap,
then write whatever you like about the day if you want to. The text is stored
as written and never read by the app: a streak counts consecutive days you
chose to continue it, nothing more. A streak is continued on the day it
happens — a missed day can't be filled in later, and a streak that ends says
"Last streak 8 days · Start again" rather than anything harsher.

Each calendar day carries one mark: a short bar with a segment per streak
that existed that day, each streak always in the same position. A segment is
in the accent colour while its run is alive, muted grey once that run has
ended, and empty on a day the streak was missed — so an ended run reads as a
grey line that stops, and the live run is the only thing in colour. Hover or
tap a streak's name to see just that streak's history on the calendar.

Behind the Streak tracker burns a pixel fireplace — a small WebGL shader
rendered at low resolution and scaled with hard pixel edges. It caps itself
at 30 frames a second, stops when the tab is hidden, and shows a single
still frame when the system prefers reduced motion. Panels over it are
lightly frosted so the glow reads through while text stays legible.

## Stack

- **React + TypeScript + Vite** — static build, no server of its own
- **Supabase** — Postgres, auth, and Row Level Security
- **GitHub Pages** — hosting, deployed by GitHub Actions

## Architecture

UI never talks to Supabase directly. Every query lives in the repository layer,
so screens can change without touching data access and the database can be
swapped without rewriting components.

```
src/
  data/          Supabase access + schema types (the only place queries live)
    database.types.ts    generated from the live schema
    types.ts             domain types derived from it
    pendingRepository.ts subjects, tasks, trimesters
    streakRepository.ts  streaks, daily records
  hooks/         state, optimistic updates, error recovery
  lib/           pure helpers: dates, streak counting, error messages
  components/
    ui/          Button, Modal, Menu, Field, Feedback — shared by both trackers
    pending/     subject cards, task rows, forms, the "needs attention" strip
    streaks/     calendar, day panel, streak cards
```

Two decisions worth knowing:

**Dates are timezone-naive.** `planned_date`/`planned_time` and
`deadline_date`/`deadline_time` are stored as `date` and `time`, not as
timestamps. A deadline of 11:59 PM on Sept 10 is that wall-clock time on every
device, and nothing shifts when you cross a timezone.

**Streak counting reads dates only.** `src/lib/streakMath.ts` takes a set of
dates and returns a run length. It has no access to the note text by
construction — no keyword matching, no similarity, no interpretation. "15
declined pushups × 5 sets" and "did 50 pushups" are the same to it, and so are
records for entirely unrelated activities.

## Running it locally

```bash
npm install
cp .env.example .env   # fill in your Supabase URL and publishable key
npm run dev
```

## Setting up your own Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/migrations/20260906065838_init_tracker_schema.sql` in the SQL
   editor. It creates the five tables and enables RLS on all of them.
3. Copy the project URL and publishable key from **Project Settings → API**
   into `.env`.

New accounts need to confirm their email by default. For a personal instance
you can turn that off under **Authentication → Sign In / Providers → Email**.

To regenerate the schema types after a migration:

```bash
npx supabase gen types typescript --project-id <your-ref> > src/data/database.types.ts
```

## Data model

```
User
 ├── Trimester
 │     └── Subject  (name, colour)
 │           └── Task  (title, description, planned date/time, deadline date/time)
 └── Streak
       └── Streak record  (one per day, free-text note)
```

Every table has a `user_id` and RLS policies of the form
`auth.uid() = user_id`, so one account can only ever reach its own rows.
Deletes cascade: removing a subject removes its tasks, removing a streak
removes its records.

Streak records carry one more rule: a continuation can only be inserted or
deleted for the current day (with a one-day tolerance for timezones), and a
trigger stops a record's date being changed after the fact. The client
enforces "today" exactly; the database makes sure a direct API call can't
back-fill a missed day either.

## Deploying to GitHub Pages

1. Push to `main`.
2. Under **Settings → Pages**, set the source to **GitHub Actions**.
3. Under **Settings → Secrets and variables → Actions**, add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

The workflow in `.github/workflows/deploy.yml` builds and publishes on every
push to `main`. The build uses a relative base path, so it works from a project
subpath without hardcoding the repository name.

The publishable key ends up in the client bundle. That is how Supabase is meant
to be used from a browser — Row Level Security, not the secrecy of that key, is
what keeps each account's data private.

## Credits

The fireplace is ["Pixel Fireplace HD"](https://codepen.io/lexaterra/pen/jENzYPJ)
by lexaterra, MIT licensed, adapted in `src/lib/fireplaceShader.ts`. Its
simplex noise is by Ian McEwan of Ashima Arts
([webgl-noise](https://github.com/ashima/webgl-noise)), also MIT. Both
notices are kept in that file.
