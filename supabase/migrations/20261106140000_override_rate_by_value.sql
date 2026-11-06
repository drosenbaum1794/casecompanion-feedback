-- any_field now counts reviewed rows where at least one tag differs from
-- Claude's original, rather than rows whose status says Corrected. A status
-- can lag the values (for example a correction that was undone), and the
-- dashboard's trust line should measure what humans actually changed.
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
        'any_field', round(avg((
          sentiment is distinct from claude_sentiment or theme is distinct from claude_theme
          or product_area is distinct from claude_product_area or severity is distinct from claude_severity)::int)::numeric, 3))
      from public.feedback
      where active and status in ('Confirmed', 'Corrected') and claude_theme is not null),
    'injection_suspected', (select count(*) from public.feedback where active and injection_suspected)
  );
$$;
