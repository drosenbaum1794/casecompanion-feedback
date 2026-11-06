-- Tuned on the 12 known near-duplicate groups (test scenario 15).
-- 0.88 chained unrelated rows into one 18-row "issue". 0.91 keeps 11 of 12
-- known groups together (the two calendar double-booking rows, via different
-- systems, split) and the largest group is 4 rows.
create or replace function public.assign_issue_ids(p_threshold double precision default 0.91)
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
select public.assign_issue_ids(0.91);
