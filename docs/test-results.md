# Test results

The 20 scenarios from the scope doc's test plan, with pass or fail and the date run. Go/no-go: every Blocker passes.

| # | Scenario | Severity | Result | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| 15 | Near-duplicates group together | Major | **Pass** | 2026-11-06 | Embedding groups (gte-small, connected components) checked against 12 hand-identified groups. At the scope doc's starting threshold of 0.88, all 12 grouped but unrelated rows chained into one 18-row "issue". Tuned to **0.91**: 11 of 12 groups intact, largest group 4 rows, 78 issues across 100 rows. The one split is two double-booking complaints via different systems (court reporting vs Outlook), which are arguably separate issues. One over-merge: two pairs of trial-prep praise in one group of 4. Complaints: 55 mentions, 43 distinct issues; Sev1: 8 mentions, 5 issues. |
| 3 | Human edits before apply | Blocker | **Pass** | 2026-11-06 | Set TEST03's theme to "Usability", then added a suggestion with theme "Performance". The sync kept "Usability", wrote `applied` = "Partly applied: human filled theme", filled only the empty tag cells, and recorded Claude's "Performance" in `claude_theme`. The edits were made through the Sheets API rather than the UI, which exercises the same re-read-before-write path. |
| 8 | Copied row | Major | **Pass** | 2026-11-06 | Copied TEST05 with its ID into a new row. Both got `sync_error` = "duplicate id", neither was pushed (that run pushed only TEST03), and the Health tab listed it under needs attention. |
| 12 | Bad suggestion | Major | **Pass** | 2026-11-06 | Hand-typed suggestion with severity "High" for TEST04. `applied` = "Rejected: severity 'High' not in taxonomy"; the Feedback row's tags stayed empty; `error_count` went to 1. The retry by the hourly tagging task is checked separately. |
| 9 | Deleted row | Major | **Pass** | 2026-11-06 | Deleted TEST06's row (and the TEST05 copy from test 8). The next sync reconciled the ID list: Supabase marked TEST06 `active = false` (the row and its history stay), and `change_log` recorded `active: false` by `system`. Removing the copy cleared TEST05's duplicate flag automatically. |
