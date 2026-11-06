-- review_queue: "Do these first" ordering and the columns the queue shows.
-- Priority, in order: Sev1, possible prompt injection, marked Unsure, Low
-- confidence. Everything else after, worst severity first, oldest first.
-- The return type changes, so the function is dropped and recreated.
drop function if exists public.review_queue();
create function public.review_queue()
returns table (
  fb_id text, priority text, confidence text, severity text, sentiment text, theme text,
  product_area text, status text, user_role text, firm_size text, feedback_date date,
  feedback_text text, claude_reason text, injection_suspected boolean,
  tagged_at timestamptz, created_at timestamptz, days_waiting int
)
language sql stable set search_path = '' as $$
  select fb.fb_id,
         case when fb.severity = 'Sev1' then 'Sev1'
              when fb.injection_suspected then 'Possible prompt injection'
              when fb.status = 'Unsure' then 'Marked Unsure'
              when fb.confidence = 'Low' then 'Low confidence'
         end,
         fb.confidence, fb.severity, fb.sentiment, fb.theme, fb.product_area, fb.status,
         fb.user_role, fb.firm_size, fb.feedback_date, fb.feedback_text, fb.claude_reason,
         fb.injection_suspected, fb.tagged_at, fb.created_at,
         coalesce(extract(day from now() - fb.tagged_at)::int, 0)
  from public.feedback fb
  where fb.active and fb.status in ('Pending', 'Unsure')
  order by case when fb.severity = 'Sev1' then 1
                when fb.injection_suspected then 2
                when fb.status = 'Unsure' then 3
                when fb.confidence = 'Low' then 4
                else 5 end,
           case fb.severity when 'Sev1' then 1 when 'Sev2' then 2 when 'Sev3' then 3 else 4 end,
           fb.tagged_at nulls last, fb.fb_id;
$$;
grant execute on function public.review_queue() to anon, authenticated;

-- theme_trend: optional sentiment filter ('Complaint' = Negative or Mixed),
-- and the anchor date, so the dashboard can mark the last week as partial.
-- Named-argument callers (the MCP server) keep working: the new parameter is last.
drop function if exists public.theme_trend(text, text, int, date);
create function public.theme_trend(
  p_theme text default null,
  p_product_area text default null,
  p_weeks int default 8,
  p_as_of date default null,
  p_sentiment text default null
)
returns table (week_start date, mentions bigint, distinct_issues bigint, as_of date)
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
         count(distinct coalesce(fb.issue_id, fb.fb_id)),
         (select d from anchor)
  from weeks w
  left join public.feedback fb
    on date_trunc('week', fb.feedback_date)::date = w.wk
   and fb.active
   and coalesce(fb.status, '') <> 'Archived'
   and (p_theme is null or fb.theme = p_theme)
   and (p_product_area is null or fb.product_area = p_product_area)
   and (p_sentiment is null
        or fb.sentiment = p_sentiment
        or (p_sentiment = 'Complaint' and fb.sentiment in ('Negative', 'Mixed')))
  group by w.wk
  order by w.wk;
$$;
grant execute on function public.theme_trend(text, text, int, date, text) to anon, authenticated;
