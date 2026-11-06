-- Complaint and Sev1/Sev2 share by segment, for the dashboard's Segments view.
-- Heavy users = top quartile of monthly_queries among active rows.
create or replace function public.segment_summary()
returns table (dimension text, segment text, rows_n bigint, complaints bigint, sev1_or_sev2 bigint, sev1 bigint)
language sql stable set search_path = '' as $$
  with f as (
    select fb.user_role, fb.firm_size, fb.monthly_queries, fb.sentiment, fb.severity
    from public.feedback fb
    where fb.active and coalesce(fb.status, '') <> 'Archived' and fb.theme is not null
  ),
  q as (select percentile_disc(0.75) within group (order by monthly_queries) as p75 from f),
  labeled as (
    select 'role' as dimension, user_role as segment, sentiment, severity from f
    union all
    select 'firm_size', firm_size, sentiment, severity from f
    union all
    select 'usage',
           case when f.monthly_queries >= q.p75 then 'heavy (top quarter, ' || q.p75 || '+ queries/mo)' else 'everyone else' end,
           sentiment, severity
    from f cross join q
  )
  select dimension, segment, count(*),
         count(*) filter (where sentiment in ('Negative', 'Mixed')),
         count(*) filter (where severity in ('Sev1', 'Sev2')),
         count(*) filter (where severity = 'Sev1')
  from labeled
  where segment is not null
  group by dimension, segment
  order by dimension, segment;
$$;
grant execute on function public.segment_summary() to anon, authenticated;
