-- One row per distinct issue (near-duplicates grouped by issue_id), for the
-- dashboard's "Top issues to fix" list. Same filters and the same issue key as
-- theme_summary, so the counts agree. Ordered by worst severity, then mentions,
-- then most recent. The quote is the most severe, most recent mention.
create or replace function public.top_issues(
  p_from date default null,
  p_to date default null,
  p_sentiment text default 'Complaint',
  p_severity text default null,
  p_role text default null,
  p_firm_size text default null,
  p_channel text default null,
  p_product_area text default null,
  p_theme text default null,
  p_limit int default 8
)
returns table (
  issue_key text, mentions bigint, worst_severity text, themes text[], product_areas text[],
  roles text[], firm_sizes text[], fb_ids text[], quote text, last_date date,
  total_issues bigint, sample_size bigint
)
language sql stable set search_path = '' as $$
  with f as (
    select fb.fb_id, coalesce(fb.issue_id, fb.fb_id) as k, fb.theme, fb.product_area, fb.user_role,
           fb.firm_size, fb.feedback_text, fb.feedback_date,
           case fb.severity when 'Sev1' then 1 when 'Sev2' then 2 when 'Sev3' then 3 else 4 end as sev_rank
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
      and (p_theme is null or fb.theme = p_theme)
  ),
  g as (
    select k,
           count(*) as mentions,
           min(sev_rank) as best_rank,
           array_agg(distinct theme) as themes,
           array_agg(distinct product_area) filter (where product_area is not null) as product_areas,
           array_agg(distinct user_role) filter (where user_role is not null) as roles,
           array_agg(distinct firm_size) filter (where firm_size is not null) as firm_sizes,
           array_agg(fb_id order by feedback_date desc, fb_id) as fb_ids,
           (array_agg(feedback_text order by sev_rank, feedback_date desc))[1] as quote,
           max(feedback_date) as last_date
    from f
    group by k
  )
  select g.k, g.mentions,
         case g.best_rank when 1 then 'Sev1' when 2 then 'Sev2' when 3 then 'Sev3' else 'None' end,
         g.themes, g.product_areas, g.roles, g.firm_sizes, g.fb_ids, g.quote, g.last_date,
         (select count(*) from g), (select count(*) from f)
  from g
  order by g.best_rank, g.mentions desc, g.last_date desc, g.k
  limit greatest(least(p_limit, 50), 1);
$$;
grant execute on function public.top_issues(date, date, text, text, text, text, text, text, text, int) to anon, authenticated;
