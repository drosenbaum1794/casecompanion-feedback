-- Core schema for the CaseCompanion feedback pipeline.
-- Supabase is the read side: the sheet is the only place people edit.
-- One writer (the ingest edge function, service role). Everyone else reads.

-- ---------------------------------------------------------------- tables
create table public.feedback (
  fb_id text primary key check (fb_id ~ '^fb_[a-z0-9]{8}$'),
  user_id text,
  channel text,
  feedback_date date,
  feedback_text text not null,
  user_role text,
  firm_size text,
  months_subscribed int,
  monthly_queries int,
  avg_session_min numeric,
  case_types text[] not null default '{}',
  sentiment text,
  theme text,
  product_area text,
  severity text,
  confidence text,
  claude_reason text,
  status text,
  reviewed_by text,
  reviewed_at timestamptz,
  notes text,
  suggested_theme text,
  follow_up boolean not null default false,
  follow_up_owner text,
  follow_up_status text,
  ticket_link text,
  injection_suspected boolean not null default false,
  -- Claude's original proposal, recorded by the sheet's apply step.
  claude_sentiment text,
  claude_theme text,
  claude_product_area text,
  claude_severity text,
  prompt_version text,
  taxonomy_version text,
  model text,
  tagged_at timestamptz,
  alerted_at timestamptz,
  active boolean not null default true,
  row_hash text,
  text_hash text,
  embedding extensions.vector(384),
  issue_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.change_log (
  id bigint generated always as identity primary key,
  fb_id text not null references public.feedback (fb_id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_by text not null check (changed_by in ('claude', 'human', 'system')),
  changed_at timestamptz not null default now()
);
create index change_log_fb_id_idx on public.change_log (fb_id, changed_at);

create table public.sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz,
  trigger text,
  result text check (result in ('OK', 'ERROR')),
  ids_assigned int not null default 0,
  applied int not null default 0,
  partly_applied int not null default 0,
  rejected int not null default 0,
  rows_pushed int not null default 0,
  deactivated int not null default 0,
  errors text,
  received_at timestamptz not null default now()
);
create index sync_runs_started_idx on public.sync_runs (started_at desc);

create table public.taxonomy (
  field text not null,
  value text not null,
  definition text,
  example_1 text,
  example_2 text,
  version text not null,
  primary key (field, value)
);

-- ---------------------------------------------------------------- triggers
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger feedback_touch before update on public.feedback
  for each row execute function public.touch_updated_at();

-- Change log is filled here, not by app code, so no write path can skip it.
-- changed_by: 'claude' when a tag goes from empty to Claude's own proposal,
-- 'system' for activation changes, otherwise 'human'.
create or replace function public.log_feedback_changes()
returns trigger language plpgsql set search_path = '' as $$
declare
  f text;
  o text;
  n text;
  who text;
  watched text[] := array['sentiment', 'theme', 'product_area', 'severity', 'confidence', 'status',
                          'suggested_theme', 'follow_up', 'follow_up_status', 'ticket_link', 'active'];
  on_insert text[] := array['sentiment', 'theme', 'product_area', 'severity', 'confidence', 'status'];
  tags text[] := array['sentiment', 'theme', 'product_area', 'severity'];
begin
  foreach f in array watched loop
    if tg_op = 'INSERT' and not f = any (on_insert) then
      continue;
    end if;
    o := case when tg_op = 'INSERT' then null else to_jsonb(old) ->> f end;
    n := to_jsonb(new) ->> f;
    if o is not distinct from n or (tg_op = 'INSERT' and n is null) then
      continue;
    end if;
    who := case
      when f = 'active' then 'system'
      when f = any (tags) then
        case when o is null and n is not distinct from (to_jsonb(new) ->> ('claude_' || f)) then 'claude' else 'human' end
      when f = 'confidence' then case when o is null then 'claude' else 'human' end
      when f = 'status' then case when o is null and n = 'Pending' then 'claude' else 'human' end
      else 'human'
    end;
    insert into public.change_log (fb_id, field, old_value, new_value, changed_by)
    values (new.fb_id, f, o, n, who);
  end loop;
  return new;
end $$;

create trigger feedback_change_log after insert or update on public.feedback
  for each row execute function public.log_feedback_changes();

-- ---------------------------------------------------------------- security
alter table public.feedback enable row level security;
alter table public.change_log enable row level security;
alter table public.sync_runs enable row level security;
alter table public.taxonomy enable row level security;

revoke all on public.feedback, public.change_log, public.sync_runs, public.taxonomy from anon, authenticated;

-- Readers never see reviewer emails, internal notes, owner names, or hashes.
grant select (
  fb_id, user_id, channel, feedback_date, feedback_text, user_role, firm_size, months_subscribed,
  monthly_queries, avg_session_min, case_types, sentiment, theme, product_area, severity, confidence,
  claude_reason, status, reviewed_at, suggested_theme, follow_up, follow_up_status, ticket_link,
  injection_suspected, claude_sentiment, claude_theme, claude_product_area, claude_severity,
  prompt_version, taxonomy_version, model, tagged_at, alerted_at, active, embedding, issue_id,
  created_at, updated_at
) on public.feedback to anon, authenticated;
grant select on public.change_log, public.sync_runs, public.taxonomy to anon, authenticated;

create policy "read active feedback" on public.feedback for select to anon, authenticated using (active);
create policy "read change log" on public.change_log for select to anon, authenticated using (true);
create policy "read sync runs" on public.sync_runs for select to anon, authenticated using (true);
create policy "read taxonomy" on public.taxonomy for select to anon, authenticated using (true);
-- No insert, update, or delete policies: only the service role (ingest) writes.

revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.log_feedback_changes() from public, anon, authenticated;
