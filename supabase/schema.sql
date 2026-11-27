-- A Little More Us: server database (Supabase Postgres).
-- Paste this whole file into Supabase → SQL Editor → New query, and Run.
-- It is safe to run again: it only creates what is missing and replaces functions.
--
-- Security model: the browser never reads these tables. Row Level Security is
-- on with no policies, so the public (anon) key and signed-in users get nothing.
-- Only the server (service role key, kept in Vercel) calls the app_* functions,
-- and the server enforces every rule: membership, consent, locks, admin.
--
-- Each record is stored whole in `data` (the same shape the app uses), with a
-- `version` for safe concurrent saves, and indexed columns derived from it.

create table if not exists app_users (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  identifier text generated always as (data->>'identifier') stored,
  auth_id text generated always as (data->>'auth_id') stored
);
create unique index if not exists app_users_identifier_idx on app_users (identifier);
create unique index if not exists app_users_auth_id_idx on app_users (auth_id);
alter table app_users enable row level security;
create table if not exists app_couples (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  member_a text generated always as (data->'member_user_ids'->>0) stored,
  member_b text generated always as (data->'member_user_ids'->>1) stored
);
create index if not exists app_couples_member_a_idx on app_couples (member_a);
create index if not exists app_couples_member_b_idx on app_couples (member_b);
alter table app_couples enable row level security;
create table if not exists app_invitations (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  inviter_id text generated always as (data->>'inviter_id') stored
);
create index if not exists app_invitations_inviter_id_idx on app_invitations (inviter_id);
alter table app_invitations enable row level security;
create table if not exists app_interactions (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  couple_id text generated always as (data->>'couple_id') stored
);
create index if not exists app_interactions_couple_id_idx on app_interactions (couple_id);
alter table app_interactions enable row level security;
create table if not exists app_responses (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  interaction_id text generated always as (data->>'interaction_id') stored
);
create index if not exists app_responses_interaction_id_idx on app_responses (interaction_id);
alter table app_responses enable row level security;
create table if not exists app_stories (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  couple_id text generated always as (data->>'couple_id') stored
);
create index if not exists app_stories_couple_id_idx on app_stories (couple_id);
alter table app_stories enable row level security;
create table if not exists app_reactions (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  story_id text generated always as (data->>'story_id') stored
);
create index if not exists app_reactions_story_id_idx on app_reactions (story_id);
alter table app_reactions enable row level security;
create table if not exists app_reports (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  story_id text generated always as (data->>'story_id') stored
);
create index if not exists app_reports_story_id_idx on app_reports (story_id);
alter table app_reports enable row level security;
create table if not exists app_question_history (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  user_id text generated always as (data->>'user_id') stored
);
create index if not exists app_question_history_user_id_idx on app_question_history (user_id);
alter table app_question_history enable row level security;
create table if not exists app_entitlements (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  purchaser_id text generated always as (data->>'purchaser_id') stored
);
create index if not exists app_entitlements_purchaser_id_idx on app_entitlements (purchaser_id);
alter table app_entitlements enable row level security;
create table if not exists app_notifications (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  user_id text generated always as (data->>'user_id') stored
);
create index if not exists app_notifications_user_id_idx on app_notifications (user_id);
alter table app_notifications enable row level security;
create table if not exists app_idempotency (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  user_id text generated always as (data->>'user_id') stored
);
create index if not exists app_idempotency_user_id_idx on app_idempotency (user_id);
alter table app_idempotency enable row level security;
create table if not exists app_skip_counts (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  user_id text generated always as (split_part(id, '|', 1)) stored
);
create index if not exists app_skip_counts_user_id_idx on app_skip_counts (user_id);
alter table app_skip_counts enable row level security;
create table if not exists app_export_log (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table app_export_log enable row level security;
create table if not exists app_settings (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
create table if not exists app_events (
  id text primary key,
  kind text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists app_events_created_idx on app_events (created_at desc);
alter table app_events enable row level security;

-- Everything one request may need: the caller, their couples (any state), the
-- partner, and, when an invite link is open, the inviter and the inviter's couples.
create or replace function app_load_scope(p_auth_id text, p_token text)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_me text;
  v_inviter text;
  v_couples text[];
  v_people text[];
  v_inters text[];
  v_stories text[];
begin
  if p_auth_id is not null then
    select id into v_me from app_users where auth_id = p_auth_id;
  end if;
  if p_token is not null then
    select data->>'inviter_id' into v_inviter from app_invitations where id = p_token;
  end if;
  v_couples := array(select id from app_couples
    where member_a in (v_me, v_inviter) or member_b in (v_me, v_inviter));
  v_people := array(select distinct x from (
      select v_me as x union all select v_inviter
      union all select member_a from app_couples where id = any(v_couples)
      union all select member_b from app_couples where id = any(v_couples)) p
    where x is not null);
  v_inters := array(select id from app_interactions where couple_id = any(v_couples));
  v_stories := array(select id from app_stories where couple_id = any(v_couples));
  return jsonb_build_object(
    'me', v_me,
    'users', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_users where id = any(v_people)),
    'couples', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_couples where id = any(v_couples)),
    'invitations', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_invitations where inviter_id = any(v_people) or id = p_token),
    'interactions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_interactions where id = any(v_inters)),
    'responses', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_responses where interaction_id = any(v_inters)),
    'stories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_stories where id = any(v_stories)),
    'reactions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_reactions where story_id = any(v_stories)),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_reports where story_id = any(v_stories)),
    'question_history', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_question_history where user_id = any(v_people)),
    'entitlements', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_entitlements where purchaser_id = any(v_people)),
    'notifications', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_notifications where user_id = any(v_people)),
    'idempotency', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_idempotency where v_me is not null and user_id = v_me),
    'skip_counts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_skip_counts where user_id = any(v_people)),
    'export_log', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_export_log where id = any(v_people)),
    'settings', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_settings where true)
  );
end $$;

-- Admin screens and the daily clean-up job see everything.
create or replace function app_load_all()
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'me', null,
    'users', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_users where true), 'couples', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_couples where true), 'invitations', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_invitations where true), 'interactions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_interactions where true), 'responses', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_responses where true), 'stories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_stories where true), 'reactions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_reactions where true), 'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_reports where true), 'question_history', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_question_history where true), 'entitlements', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_entitlements where true), 'notifications', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_notifications where true), 'idempotency', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_idempotency where true), 'skip_counts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_skip_counts where true), 'export_log', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_export_log where true), 'settings', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'version', version)), '[]'::jsonb) from app_settings where true),
    'analytics', (select coalesce(jsonb_agg(data order by created_at), '[]'::jsonb) from
      (select data, created_at from app_events where kind = 'analytics' order by created_at desc limit 500) e)
  );
$$;

create or replace function app_account_exists(p_identifier text)
returns boolean language sql stable set search_path = public as $$
  select exists(select 1 from app_users where identifier = p_identifier);
$$;

-- Re-link an existing profile to a new sign-in (e.g. the auth user was recreated).
create or replace function app_link_auth(p_identifier text, p_auth_id text)
returns boolean language plpgsql set search_path = public as $$
declare n integer;
begin
  update app_users set data = jsonb_set(data, '{auth_id}', to_jsonb(p_auth_id)), version = version + 1, updated_at = now()
    where identifier = p_identifier;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Saves one request's changes all at once. Each update and delete names the
-- version it read; if someone else saved that record since, nothing is saved
-- and the server retries the whole request (SQLSTATE 40001).
create or replace function app_commit(p_ops jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  op jsonb;
  t text;
  tbl text;
  n integer;
  v_auth text;
  erased jsonb := '[]'::jsonb;
begin
  for op in select value from jsonb_array_elements(p_ops) loop
    t := op->>'t';
    if t = 'events' then
      insert into app_events (id, kind, data) values (op->>'id', op->>'kind', op->'data') on conflict (id) do nothing;
      continue;
    end if;
    if t not in ('users', 'couples', 'invitations', 'interactions', 'responses', 'stories', 'reactions', 'reports', 'question_history', 'entitlements', 'notifications', 'idempotency', 'skip_counts', 'export_log', 'settings') then
      raise exception 'unknown table %', t;
    end if;
    tbl := 'app_' || t;
    if op->'v' is null or jsonb_typeof(op->'v') = 'null' then
      begin
        execute format('insert into %I (id, data) values ($1, $2)', tbl) using op->>'id', op->'data';
      exception when unique_violation then
        raise exception 'conflict on % %', t, op->>'id' using errcode = '40001';
      end;
    elsif op->'data' is null or jsonb_typeof(op->'data') = 'null' then
      if t = 'users' then
        select auth_id into v_auth from app_users where id = op->>'id';
      end if;
      execute format('delete from %I where id = $1 and version = $2', tbl) using op->>'id', (op->>'v')::int;
      get diagnostics n = row_count;
      if n = 0 then raise exception 'conflict on % %', t, op->>'id' using errcode = '40001'; end if;
      if t = 'users' and v_auth is not null then
        erased := erased || to_jsonb(v_auth);
        -- Analytics keep no trace of an erased person.
        update app_events set data = replace(data::text, op->>'id', 'erased')::jsonb where data::text like '%' || (op->>'id') || '%';
      end if;
    else
      execute format('update %I set data = $2, version = version + 1, updated_at = now() where id = $1 and version = $3', tbl)
        using op->>'id', op->'data', (op->>'v')::int;
      get diagnostics n = row_count;
      if n = 0 then raise exception 'conflict on % %', t, op->>'id' using errcode = '40001'; end if;
    end if;
  end loop;
  return jsonb_build_object('erased_auth_ids', erased);
end $$;

-- Only the server's service role may call these.
do $$
declare f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['app_load_scope(text,text)', 'app_load_all()', 'app_account_exists(text)', 'app_link_auth(text,text)', 'app_commit(jsonb)'] loop
      execute format('revoke all on function %s from public, anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
    end loop;
  end if;
end $$;
