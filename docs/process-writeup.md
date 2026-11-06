# Process write-up

Daniel Rosenbaum · Nov 8, 2026. How this was scoped, prompted, evaluated, and tested. Details live in the linked logs; this page is the summary.

## 1. How I scoped it

Before any code, I reviewed the design as three people: the engineer who maintains it, the CS director who decides from it, and the CS rep who feeds it. For each, I asked what would make them stop using it. Each answer became a requirement:

| Who | What would make them stop | What it changed in the build |
| --- | --- | --- |
| Engineer | Lost human edits, silent failures, runaway costs | The tagger writes only to a staging tab, and code fills only empty cells, so a person's edit always wins. Every sync logs to a Health tab, and failures email. Rows are fingerprinted so only changed rows sync. |
| CS director | Undefined severity, no sample sizes, alerts going to nobody | A written severity rubric shown on the dashboard. Every count shows n, and anything under 10 rows says "directional". Sev1 alerts route by segment, plus an alert if the tagger itself stalls. |
| CS rep | Slow review, guessing at tags, edits overwritten | One-click Confirm, an Unsure option, the tag definitions next to the dropdown, and a queue that puts Sev1s and flagged rows first. |

## 2. How I prompted

The tagging prompt is versioned in `prompts/`, and every version was committed before it was scored.

| Version | Change | Why | Result |
| --- | --- | --- | --- |
| v1 | Baseline from the scope doc, minus `question_type` (no row in the data is a question asked of CaseCompanion), plus a tab allowlist that forbids the Eval tab and a rule that Mixed rows take the complaint's tags | Starting point | Sev1 recall 7/7 but 2 false Sev1s |
| v2 | One added rule: Sev1 is only for Wrong output | v1 tagged a bug (exhibit numbering resets) as Sev1, which the rubric rules out | False Sev1s 2 → 1, recall still 7/7. Shipped. |

I stopped at v2 on purpose. The remaining misses were Mixed rows tagged Negative. In the offline runs they looked like run-to-run noise, so I didn't chase them with v3. Production later showed the pattern is consistent: short praise before "but" gets read as Negative. That's logged as a candidate v3 fix. It doesn't affect severity or alerts.

## 3. How I evaluated

**Method.** I picked 40 rows before writing any taxonomy examples: all likely Sev1s, the 4 bug reports that are praise, both copies of 8 near-duplicate pairs, severity edge cases, and coverage of every theme. Taxonomy examples were then drawn only from rows outside that set and their near-duplicate twins, because the tagger reads the Taxonomy tab, so using eval rows as examples would have leaked into the score. Dan labeled the 40 blind. Each prompt version ran in a separate agent that could read only the prompt, the taxonomy, and the 40 rows; the label files were moved out of reach during runs.

**The labels needed adjudication, and I said so.** The blind labels disagreed with the written taxonomy and with themselves: near-duplicate pairs got the same theme only 4 of 8 times. I flagged conflicts using only the taxonomy's wording and the labeler's own pair labels, never Claude's tags. Then I adjusted only flagged fields and the 6 rows covered by Dan's Sev1 policy decision, 36 field changes in all, each logged with its rule (`docs/eval-adjudication.md`). Both scores are reported.

**Results, production tagger (Haiku, v2), 40 rows:**

| Labels | Sentiment | Theme | Product area | Severity | All 4 | Sev1 recall | Sev1 precision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Adjudicated | 37/40 | 34/40 | 36/40 | 34/40 | 26/40 | 7/7 | 7/8 |
| Blind | 35/40 | 27/40 | 20/40 | 23/38 | 11/38 | 1/1 | 1/8 |

**Calibration:** self-reported confidence isn't a reliable signal here (High and Medium about equally accurate). The review queue still sorts Low first, but nothing important depends on confidence alone.

**One failure and the fix:** v1 called an exhibit-numbering bug Sev1 because the user wrote "dangerous for trial presentation." The rubric reserves Sev1 for wrong output, so v2 states that rule in the prompt. Code deliberately doesn't enforce it: rejecting a suggested Sev1 would delay a possible alert, so it goes to a human instead.

**The policy question the eval surfaced:** the labeler's instinct was "Sev1 only after harm"; the rubric says "rights at risk, or harm." That's a product decision, not a prompt bug. Dan chose risk-based. That one choice moves Sev1 from 1 to 7 rows in the eval set.

## 4. What I chose not to build, and when I would

| Not built | Why not, for a 3-day proof of concept | When I would |
| --- | --- | --- |
| Direct API call for tagging | A scheduled task on my own Claude account needed no keys or hosting, and the agent writes only to a staging tab, so swapping it later changes one step | Before anyone else depends on it |
| Sign-in on dashboard and MCP | Mock data, and the read-only key can't see reviewer emails or write anything | Before real customer data: OAuth with an EvenUp allowlist |
| Real account and CSM routing | The data has no account IDs | When the CRM join exists (Part 3, item 3) |
| Slack app, multiple alert channels | One email path proves the alert logic | When alerts go to a team instead of one person |
| A separate write path from the dashboard | Built late, but only through the sheet: the dashboard sends a decision to the sheet's script, which refuses it if the row changed since the page loaded, then syncs that row. Supabase still has one writer. | Already built; it needs sign-in before real data (Part 3) |

## 5. After it worked: making it usable

Once the pipeline ran end to end, I had a separate agent review the dashboard as a reporting-dashboard designer, against concrete jobs for each audience (`docs/dashboard-ux-review.md`). Its top picks were built: a "Top issues to fix" list grouped by distinct issue, the Sev1 tab as proof of follow-up, filters shared across tabs and kept in the link, a "Do these first" review order, and CSV export. Using it myself then drove the last changes: confirming and fixing tags from the dashboard (written to the sheet, not around it), and cutting the save time by pushing only the edited row.

## 6. Test results

Full table: `docs/test-results.md`. Every Blocker that has been run passes. Two scenarios are open: test 20 (confirm in the sheet's version history that the tagging task only touched its staging tab) and test 19 (a 3-hour tagger stall), which I didn't run. Running the plan found four real bugs, all fixed and unit-tested where the logic is pure:

1. A second, different failure email was suppressed by the first one's hourly throttle (test 11).
2. Undoing a pasted typo left the row silently blocked from syncing (test 6).
3. A correction put back to Claude's value stayed "Corrected" and inflated the override rate from 50% to 67% (test 5).
4. Putting an already-alerted row back to Sev1 during a paste re-sent its alert (test 5). This one meant deviating from the scope doc's rule, which is logged.

Testing also tuned one parameter: near-duplicate grouping at the scope doc's 0.88 similarity chained 18 unrelated complaints into one "issue". 0.91 keeps 11 of 12 known groups and caps groups at 4 rows (test 15).
