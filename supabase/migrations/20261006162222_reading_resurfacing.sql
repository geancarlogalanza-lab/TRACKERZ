-- Reading: one kept lesson comes back each morning, in Discord.
--
-- A daily job picks one active lesson (never-shown first, then the one shown
-- longest ago, ties broken at random) and posts it to the owner's Discord
-- webhook. Retired lessons never come back. Both the webhook URL and the
-- owner's email live in Vault, set by hand; until they exist the job does
-- nothing. It only ever sends the owner's lessons, whoever else has an
-- account.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create extension if not exists pg_net with schema extensions;

-- Not exposed through the API: only the scheduler calls into this schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.resurface_lesson()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook text;
  owner_id uuid;
  picked record;
begin
  select decrypted_secret into hook
    from vault.decrypted_secrets
    where name = 'reading_discord_webhook';

  select u.id into owner_id
    from auth.users u
    where lower(u.email) = lower((
      select decrypted_secret from vault.decrypted_secrets where name = 'reading_owner_email'
    ));

  -- Not set up yet: stay quiet rather than fail every morning.
  if hook is null or owner_id is null then
    return;
  end if;

  select l.id, l.text, l.interpretation, c.book_title, c.book_author, c.location
    into picked
    from public.lessons l
    join public.captures c on c.id = l.capture_id
    where l.user_id = owner_id
      and l.retired_at is null
    order by l.last_surfaced_at asc nulls first, random()
    limit 1;

  if not found then
    return;
  end if;

  perform net.http_post(
    url := hook,
    body := jsonb_build_object(
      'embeds', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'description', picked.text,
        'color', 14837549, -- #e2672d, the ember orange
        'fields', case
          when picked.interpretation is null then null
          else jsonb_build_array(jsonb_build_object(
            'name', 'Your take',
            'value', left(picked.interpretation, 1024)
          ))
        end,
        'footer', jsonb_build_object(
          'text', picked.book_title || ' — ' || picked.book_author
            || coalesce(', ' || picked.location, '')
        )
      )))
    )
  );

  update public.lessons
    set last_surfaced_at = now(),
        surfaced_count = surfaced_count + 1
    where id = picked.id;
end
$$;

revoke all on function private.resurface_lesson() from public, anon, authenticated;

-- 00:00 UTC is 8:00 AM in Manila. The database clock runs on UTC.
select cron.schedule('reading-resurface', '0 0 * * *', $$select private.resurface_lesson()$$);
