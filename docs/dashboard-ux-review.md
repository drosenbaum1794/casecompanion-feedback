# Dashboard UX review

Nov 6, 2026. Reviewed live at 1280px light and 390px dark, every tab, every filter, with `?since=` for Just in, and with the API slowed and blocked.

## Verdict

The dashboard is honest: every number has an n and the trust line is candid. It falls short on the step after the number. Product sees "Wrong output: 19 issues" but cannot see which 19, read a quote, or click through. The director's Sev1 list does not show that alerts went out or how long each has waited. The rep's "short queue" is 100 rows sorted by a confidence score the README says is not useful. Filters reset per tab and never reach the URL, so no view can be shared. Most fixes wire up data the page already loads.

## What already works

- Health banner, eval-based trust line, and "No rows reviewed by a human yet". Keep all three.
- n, date range and a "directional" flag on every chart; distinct issues drawn next to mentions.
- Severity rubric on the page; badges carry text, not color alone.
- Text-only rendering; prompt injection flagged inline.
- Accessible tabs, a URL hash per tab, refresh paused in background tabs.
- "Open row" to the sheet keeps one place to edit.

## Recommendations

| # | Recommendation | Persona and job | Problem observed | Effort | New SQL |
|---|---|---|---|---|---|
| 1 | "Top issues" list on Overview: one row per distinct issue with worst severity, mentions, a quote, segments, and its rows | Product: what to fix first, with quotes | Overview has no quotes. "19 issues" cannot be opened. `issue_clusters` exists but is unused and ignores filters | M | Yes, `top_issues` |
| 2 | Sev1 tab: group the 8 rows into 5 issues; show "Alert emailed" time, days open, follow-up as a status pill; firm-size chips | Director: every Sev1 at large firms, has anyone followed up? | All 8 say "None yet". `alerted_at` is loaded but not shown, so "emailed the CSM" is unproven. Firm size must be read row by row | S | No |
| 3 | Just in: Sev1 rows first, plus a pipeline column (Arrived, Tagged, Alert sent); "+N new" on tab labels | Demo audience | Panel sorts by arrival, so a Sev1 can sit 5th of 10. Nothing shows the alert firing, the key demo moment | S | No |
| 4 | Click a theme bar or segment row to open Explore filtered; one shared filter state kept in the URL | Everyone: drill down, share a view | Filters do not carry across tabs (large firm on Overview, Sev1 still shows all 8). The URL stays `#overview`. Bars are not clickable. Explore lacks role, firm, channel and "Complaints" | M | No |
| 5 | Review queue: "Do these first" block (Sev1, Unsure, injection flag, Low confidence), all four proposed tags, reason folded away | Rep: what do I review next? | "Review queue: 100 left", 84 of them High confidence. Only severity and theme shown though the rep confirms four tags. Reason column makes rows tall | M | Change `review_queue` |
| 6 | "Download CSV" and "Copy quote" on Explore and Sev1; a "Wins: time saved" preset link | Director: 3 QBR wins | Praise plus "time" finds 17 good rows, but they can only be copied by hand | S | No |
| 7 | Honest loading and failure states | Everyone: trust | With the API blocked, the live line stayed green with "last checked" times. Loading shows blank cards. A zero-result search shows an empty table. Explore silently stops at 200 rows | S | No |
| 8 | Fix the Overview tiles so sentiment tiles follow the toggle or say they do not | Product, director | With "Complaints" selected the tiles still say Positive 45 under "for the filters above" | S | No |
| 9 | Trend: mark the last week as partial; add a complaints-only option | Product: rising or falling? | Week of Sep 9 has 1 day of data (2 rows) and reads as a collapse. Trend mixes praise with complaints. "1 mentions" | S, M with SQL | Add `p_sentiment` to `theme_trend` |
| 10 | Segments: an "All feedback" baseline row, sorted by Sev1 or Sev2 share, each row links to Overview filtered | Director: which segments are at risk | No baseline to compare 61% against. Three tables have different column widths | S | No |
| 11 | Stack table rows as cards under 600px; bigger trend labels on phones | Director on a phone | At 390px the Sev1 Follow-up and Open row columns are off screen. Trend axis text renders about 6px | M | No |
| 12 | Raise contrast between the two bar colors in dark mode | Everyone | `--bar` and `--bar-2` are nearly identical in dark mode; mentions vs issues is unreadable | S | No |

Also add `active=is.true` to `NOT_ARCHIVED`, so table reads match the SQL functions, which all filter on `active`.

## Top 5: implementation sketches

**1. Top issues.** New function using the same filters and `coalesce(issue_id, fb_id)` key as `theme_summary`, so counts agree:

```sql
create or replace function public.top_issues(p_sentiment text default 'Complaint',
  p_role text default null, p_firm_size text default null, p_product_area text default null,
  p_theme text default null, p_limit int default 10)
returns table (issue_key text, mentions bigint, worst_severity text, themes text[],
  product_areas text[], firm_sizes text[], fb_ids text[], quote text, last_date date)
-- where: active, not Archived, theme not null, same filter clauses as theme_summary
-- group by coalesce(issue_id, fb_id)
-- order by worst severity rank, mentions desc, last_date desc limit p_limit
```

UI: a card above "Themes" titled "Top issues to fix". Each row has a severity badge, a two-line clamped quote, "2 mentions, paralegal and attorney, large and medium firms", and "See 2 rows" (opens Explore by id). Sub line: "n = 55 mentions, 43 distinct issues", which also replaces the per-theme issue sum (44) that double-counts issues spanning two themes.

**2. Sev1 tab.** In `loadSev1`, group `rows` by `issue_id || fb_id`. Render one block per issue: newest quote, "2 reports", worst follow-up status. Add columns "Alert emailed" (`clock(alerted_at)` or "Not sent") and "Open for" (days since `alerted_at`). Firm-size chips with counts (All 8, Large 3, Medium 5) filter in place. Show follow-up as a status pill.

**3. Just in.** In `loadJustIn`, sort `rows` Sev1 first, then by `created_at`. Add a Pipeline column: "Arrived 5:00 PM", then "Tagged 5:03 PM" (`tagged_at`) or "Waiting for tags", then "Alert emailed 5:04 PM" for Sev1. Keep the previous totals in `refreshAll` and append " (+1)" to tab labels for Sev1 and Review queue when they change.

**4. Drill-down and shared filters.** One `state` object `{s, role, firm, area, theme, sev, q}` read from and written to the hash, for example `#explore?theme=Wrong%20output&firm=large`. Update `show()` and `fromHash()` to keep the query string. Theme labels become buttons that call `go('explore', {theme})`. Explore gains role, firm, channel and a "Complaints" sentiment value. Sev1 adds `&firm_size=eq.large` to its REST call. Tabs that cannot apply a filter say so: "Segments shows all feedback."

**5. Review queue.** Extend `review_queue` to return `sentiment` and `product_area` and order by Sev1 first, injection flag, Unsure, then confidence. Split the table: "Do these first (N)" open by default, and "Everything else (M)" in a `<details>`. Show four tags in one cell, put "Why Claude tagged it" in a `<details>`. Add "Counts update after the next sheet sync, about 10 minutes."

## Do not do

- Confirm or edit buttons in the dashboard. The sheet is the one place to edit.
- Theme or issue counts computed in JS from Explore rows. Counts come from SQL.
- A semantic search box. `search_feedback` needs an embedding the browser cannot make.
- A framework rewrite or chart library. Inline SVG covers every chart here.
- Trend lines, forecasts or "rising fast" labels on weekly buckets of about 10 rows.
- Revenue or "account at risk" scores. There are no account IDs.
- Sorting or highlighting by Claude's confidence as if it were quality.
- Removing the trust line or health banner to save space, or adding more tabs.
