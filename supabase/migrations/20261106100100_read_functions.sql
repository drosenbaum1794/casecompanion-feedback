-- Read functions shared by the MCP server and the dashboard, so the logic
-- exists once. All are SECURITY INVOKER (the default) with an empty
-- search_path, so row-level security and column grants apply to the caller.
-- "Distinct issues" counts rows that share an issue_id once.

-- Groups near-duplicate feedback by embedding similarity (connected components).
-- Praise and complaints never join the same issue. Run by ingest (service role).
create or replace function public.assign_issue_ids(p_threshold double precision default 0.88)
returns int language plpgsql set search_path = '' as $$
declare
  changed int;
begin
  with recursive edges as (
    select a.fb_id as a, b.fb_id as b
    from public.feedback a
    join public.feedback b
      on a.fb_id < b.fb_id
     and (coalesce(a.sentiment, '') = 'Positive') = (coalesce(b.sentiment, '') = 'Positive')
     and 1 - (a.embedding operator(extensions.<=>) b.embedding) >= p_threshold
    where a.active and b.active and a.embedding is not null and b.embedding is not null
  ),
  undirected as (
    select a, b from edges union all select b, a from edges
  ),
  reach (src, dst) as (
    select fb_id, fb_id from public.feedback where active
    union
    select r.src, u.b from reach r join undirected u on u.a = r.dst
  ),
  components as (
    select src as fb_id, min(dst) as issue_id from reach group by src
  )
  update public.feedback f
     set issue_id = c.issue_id
    from components c
   where f.fb_id = c.fb_id and f.issue_id is distinct from c.issue_id;
  get diagnostics changed = row_count;
  update public.feedback set issue_id = null where not active and issue_id is not null;
  return changed;
end $$;
revoke execute on function public.assign_issue_ids(double precision) from public, anon, authenticated;

-- Counts by theme with mentions and distinct issues side by side.
-- p_sentiment accepts 'Complaint' for Negative or Mixed.
create or replace function public.theme_summary(
  p_from date default null,
  p_to date default null,
  p_sentiment text default null,
  p_severity text default null,
  p_role text default null,
  p_firm_size text default null,
  p_channel text default null,
  p_product_area text default null
)
returns table (
  theme text, mentions bigint, distinct_issues bigint,
  sev1 bigint, sev2 bigint, sev3 bigint, sev_none bigint,
  sample_size bigint, date_from date, date_to date
)
language sql stable set search_path = '' as $$
  with f as (
    select fb.fb_id, fb.issue_id, fb.theme, fb.severity, fb.feedback_date
    from public.feedback fb
    where fb.active
      and coalesce(fb.status, '') <> 'Archived'
      and fb.theme is not null
      and (p_from is null or fb.feedback_date >= p_from)
      and (p_to is null or fb.feedback_date <= p_to)
      and (p_sentiment is null
           or fb.sentiment = p_sentiment
           or (p_sentiment = 'Complaint' and fb.sentiment in ('Negative', 'Mixed')))
      and (p_severity is null or fb.severity = p_severity)
      and (p_role is null or fb.user_role = p_role)
      and (p_firm_size is null or fb.firm_size = p_firm_size)
      and (p_channel is null or fb.channel = p_channel)
      and (p_product_area is null or fb.product_area = p_product_area)
  ),
  totals as (
    select count(*) as n, min(feedback_date) as d0, max(feedback_date) as d1 from f
  )
  select f.theme,
         count(*),
         count(distinct coalesce(f.issue_id, f.fb_id)),
         count(*) filter (where f.severity = 'Sev1'),
         count(*) filter (where f.severity = 'Sev2'),
         count(*) filter (where f.severity = 'Sev3'),
         count(*) filter (where f.severity = 'None'),
         t.n, t.d0, t.d1
  from f cross join totals t
  group by f.theme, t.n, t.d0, t.d1
  order by 3 desc, 2 desc, 1;
$$;

-- Weekly counts for one theme or product area. Anchored to the latest
-- feedback date by default, since the data may not run to today.
create or replace function public.theme_trend(
  p_theme text default null,
  p_product_area text default null,
  p_weeks int default 8,
  p_as_of date default null
)
returns table (week_start date, mentions bigint, distinct_issues bigint)
language sql stable set search_path = '' as $$
  with anchor as (
    select coalesce(p_as_of, (select max(feedback_date) from public.feedback where active)) as d
  ),
  weeks as (
    select generate_series(
             date_trunc('week', a.d - (greatest(least(p_weeks, 52), 1) - 1) * 7)::date,
             date_trunc('week', a.d)::date,
             interval '1 week')::date as wk
    from anchor a
  )
  select w.wk,
         count(fb.fb_id),
         count(distinct coalesce(fb.issue_id, fb.fb_id))
  from weeks w
  left join public.feedback fb
    on date_trunc('week', fb.feedback_date)::date = w.wk
   and fb.active
   and coalesce(fb.status, '') <> 'Archived'
   and (p_theme is null or fb.theme = p_theme)
   and (p_product_area is null or fb.product_area = p_product_area)
  group by w.wk
  order by w.wk;
$$;

-- Closest matching rows to a query embedding (gte-small, 384 dims).
create or replace function public.search_feedback(
  p_query_embedding extensions.vector(384),
  p_k int default 10,
  p_sentiment text default null,
  p_severity text default null,
  p_role text default null,
  p_firm_size text default null,
  p_product_area text default null
)
returns table (
  fb_id text, feedback_text text, sentiment text, theme text, product_area text, severity text,
  status text, user_role text, firm_size text, feedback_date date, issue_id text,
  injection_suspected boolean, similarity double precision
)
language sql stable set search_path = '' as $$
  select fb.fb_id, fb.feedback_text, fb.sentiment, fb.theme, fb.product_area, fb.severity,
         fb.status, fb.user_role, fb.firm_size, fb.feedback_date, fb.issue_id,
         fb.injection_suspected,
         1 - (fb.embedding operator(extensions.<=>) p_query_embedding)
  from public.feedback fb
  where fb.active
    and fb.embedding is not null
    and coalesce(fb.status, '') <> 'Archived'
    and (p_sentiment is null
         or fb.sentiment = p_sentiment
         or (p_sentiment = 'Complaint' and fb.sentiment in ('Negative', 'Mixed')))
    and (p_severity is null or fb.severity = p_severity)
    and (p_role is null or fb.user_role = p_role)
    and (p_firm_size is null or fb.firm_size = p_firm_size)
    and (p_product_area is null or fb.product_area = p_product_area)
  order by fb.embedding operator(extensions.<=>) p_query_embedding
  limit greatest(least(p_k, 20), 1);
$$;

-- Near-duplicate groups with their members.
create or replace function public.issue_clusters(p_min_size int default 2)
returns table (
  issue_id text, mentions bigint, themes text[], severities text[],
  fb_ids text[], sample_text text
)
language sql stable set search_path = '' as $$
  select fb.issue_id,
         count(*),
         array_agg(distinct fb.theme),
         array_agg(distinct fb.severity),
         array_agg(fb.fb_id order by fb.feedback_date),
         (array_agg(fb.feedback_text order by fb.feedback_date))[1]
  from public.feedback fb
  where fb.active and fb.issue_id is not null and coalesce(fb.status, '') <> 'Archived'
  group by fb.issue_id
  having count(*) >= p_min_size
  order by 2 desc, 1;
$$;

-- One row in full, plus its review history.
create or replace function public.feedback_detail(p_fb_id text)
returns table (
  fb_id text, feedback_date date, channel text, feedback_text text, user_role text, firm_size text,
  months_subscribed int, monthly_queries int, case_types text[],
  sentiment text, theme text, product_area text, severity text, confidence text, claude_reason text,
  status text, reviewed_at timestamptz, suggested_theme text, follow_up boolean,
  follow_up_status text, ticket_link text, injection_suspected boolean,
  claude_sentiment text, claude_theme text, claude_product_area text, claude_severity text,
  prompt_version text, taxonomy_version text, tagged_at timestamptz, alerted_at timestamptz,
  issue_id text, history jsonb
)
language sql stable set search_path = '' as $$
  select fb.fb_id, fb.feedback_date, fb.channel, fb.feedback_text, fb.user_role, fb.firm_size,
         fb.months_subscribed, fb.monthly_queries, fb.case_types,
         fb.sentiment, fb.theme, fb.product_area, fb.severity, fb.confidence, fb.claude_reason,
         fb.status, fb.reviewed_at, fb.suggested_theme, fb.follow_up,
         fb.follow_up_status, fb.ticket_link, fb.injection_suspected,
         fb.claude_sentiment, fb.claude_theme, fb.claude_product_area, fb.claude_severity,
         fb.prompt_version, fb.taxonomy_version, fb.tagged_at, fb.alerted_at, fb.issue_id,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'field', c.field, 'old', c.old_value, 'new', c.new_value,
                    'by', c.changed_by, 'at', c.changed_at) order by c.changed_at, c.id)
           from public.change_log c where c.fb_id = fb.fb_id
         ), '[]'::jsonb)
  from public.feedback fb
  where fb.fb_id = p_fb_id;
$$;

-- Pending and Unsure rows, Low confidence first, then oldest first.
create or replace function public.review_queue()
returns table (
  fb_id text, confidence text, severity text, theme text, status text,
  feedback_text text, claude_reason text, injection_suspected boolean,
  tagged_at timestamptz, days_waiting int
)
language sql stable set search_path = '' as $$
  select fb.fb_id, fb.confidence, fb.severity, fb.theme, fb.status,
         fb.feedback_text, fb.claude_reason, fb.injection_suspected,
         fb.tagged_at, coalesce(extract(day from now() - fb.tagged_at)::int, 0)
  from public.feedback fb
  where fb.active and fb.status in ('Pending', 'Unsure')
  order by case fb.confidence when 'Low' then 0 when 'Medium' then 1 when 'High' then 2 else 3 end,
           fb.tagged_at nulls last, fb.fb_id;
$$;

-- Pipeline health and review health in one call.
-- Override rate per field = reviewed rows where a human changed Claude's value,
-- over all reviewed rows (status Confirmed or Corrected).
create or replace function public.health()
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'now', now(),
    'last_run', (select to_jsonb(r) - 'id' from public.sync_runs r order by started_at desc limit 1),
    'last_success_at', (select max(finished_at) from public.sync_runs where result = 'OK'),
    'errors_24h', (select count(*) from public.sync_runs where result = 'ERROR' and started_at > now() - interval '24 hours'),
    'rows_active', (select count(*) from public.feedback where active),
    'date_range', (select jsonb_build_object('from', min(feedback_date), 'to', max(feedback_date)) from public.feedback where active),
    'queue_size', (select count(*) from public.feedback where active and status in ('Pending', 'Unsure')),
    'unsure_count', (select count(*) from public.feedback where active and status = 'Unsure'),
    'reviewed_count', (select count(*) from public.feedback where active and status in ('Confirmed', 'Corrected')),
    'override_rate', (
      select jsonb_build_object(
        'sentiment', round(avg((sentiment is distinct from claude_sentiment)::int)::numeric, 3),
        'theme', round(avg((theme is distinct from claude_theme)::int)::numeric, 3),
        'product_area', round(avg((product_area is distinct from claude_product_area)::int)::numeric, 3),
        'severity', round(avg((severity is distinct from claude_severity)::int)::numeric, 3),
        'any_field', round(avg((status = 'Corrected')::int)::numeric, 3))
      from public.feedback
      where active and status in ('Confirmed', 'Corrected') and claude_theme is not null),
    'injection_suspected', (select count(*) from public.feedback where active and injection_suspected)
  );
$$;

grant execute on function
  public.theme_summary(date, date, text, text, text, text, text, text),
  public.theme_trend(text, text, int, date),
  public.search_feedback(extensions.vector, int, text, text, text, text, text),
  public.issue_clusters(int),
  public.feedback_detail(text),
  public.review_queue(),
  public.health()
to anon, authenticated;
