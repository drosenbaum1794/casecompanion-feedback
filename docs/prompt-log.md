# Prompt log

Every version of the tagging prompt: what changed, why, and its eval scores on the 40-row blind set. Prompt files live in `prompts/`.

Scores are against the **adjudicated** labels (`docs/eval-adjudication.md`), with the score against Dan's original blind labels in brackets. All runs use Haiku 5.5, run by a subagent that could read only the prompt, the taxonomy, and the 40 rows.

| Version | Date | Change | Why | Sentiment | Theme | Product area | Severity | All 4 fields | Sev1 recall | Sev1 precision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1 | 2026-11-06 | Baseline: the scope doc's prompt, minus `question_type`, plus a tab allowlist that forbids the Eval tab and a Mixed rule. Committed before any labels were read. | Starting point | 40/40 [38/40] | 34/40 [28/40] | 37/40 [21/40] | 33/40 [22/38] | 28/40 [12/38] | 7/7 [1/1] | 7/9 [1/9] |
| v2 | 2026-11-06 | One added rule: Sev1 is only for Wrong output, so a bug is at most Sev2. | v1 tagged the exhibit-numbering bug (U15233) Sev1, which the Sev1 definition rules out. | 36/40 [34/40] | 34/40 [27/40] | 37/40 [21/40] | 34/40 [23/38] | 27/40 [12/38] | 7/7 [1/1] | 7/8 [1/8] |

### v1 notes (2026-11-06, scored against the blind labels)

**The scores mostly measure label disagreement, not prompt errors.** On the 8 near-duplicate pairs, where both copies should get identical tags, v1 was consistent on theme, product area, and severity 8 of 8 times. The blind labels were consistent on theme 4 of 8, product area 4 of 8, and severity 6 of 8. Many label-vs-run disagreements are rows where the label differs from the Taxonomy tab's own wording (for example OCR, which the taxonomy lists under Medical records, labeled Drafting and documents). Two labels had a blank severity.

**Sev1 is a policy question, not a prompt bug.** The blind labels have one Sev1 (a motion actually filed in the wrong format). v1 tagged 9. Six of the extra 8 are the categories the locked Sev1 definition names: wrong deadlines (the Jones Act pair), privileged material marked discoverable (2 rows), and wrong medical terms the user calls dangerous for client communications (2 rows). The labeler's instinct was "Sev1 only once harm has happened." The taxonomy says "at risk, or already happened." Which one is right decides how many alerts fire, so Dan decides before any prompt change.

**Real v1 errors, whichever policy wins:**
- U15233 (exhibit numbering resets): tagged Sev1, but it's a Bug, and the Sev1 definition requires wrong output. v1 stretched "dangerous" into Sev1. Low confidence, so the tie-break rule fired, but the definition rules it out.
- U14474 (templates cite superseded federal procedures): tagged Sev1 at Low confidence. Defensible under the tie-break rule but arguable.

**Calibration (small n):** all-four-field agreement was 37% at High (30 rows), 20% at Medium (5), and 0% at Low (3). The direction is right, but there are too few Medium and Low rows to say much.

**Next:** Dan reviews the 20 rows flagged in the Eval tab's `review_flag` column, which point only to conflicts with the taxonomy text or with his own duplicate-pair labels and never show Claude's tags, and decides the Sev1 policy. The original blind labels are kept in `data/eval-labels-blind.csv`. Both the blind and adjudicated scores get reported.

### v2 notes (2026-11-06)

**The fix worked.** U15233 moved from Sev1 to Sev2, and Sev1 precision went from 7/9 to 7/8, with recall still 7/7. Severity agreement went from 33/40 to 34/40.

**Sentiment dropped from 40/40 to 36/40, and that is run-to-run variance, not the change.** v2 didn't touch any sentiment rule. The 4 misses are all Mixed rows tagged Negative ("comprehensive but missing...", "works great on typed reports but..."). The same model on almost the same prompt gave different answers on 4 of 40 rows. **Differences of 1 to 4 rows between versions are within noise on this set,** so the write-up won't claim small gains.

**Sev1 remaining:** U14474 (templates cite superseded federal procedures, "causing confusion in federal court filings") is tagged Sev1 at Low confidence. The labels say Coverage gap and Sev3. Under the "torn, pick higher" rule this is the intended behavior: a false alarm on a court-filing risk, sent for human review.

**Severity remaining:** the other 5 severity misses are all labeled Sev3 and tagged Sev2 (OCR accuracy, lost billing entries, a wrong discovery-progress dashboard, a wrong wrongful-death calculation). The taxonomy's Sev2 covers wrong output the user caught and lost data, so the run follows the written rubric. These labels weren't flagged for review, so they stand as labeled. It's a known gap between the labeler's instinct and the rubric, not a prompt fix.

**Calibration is weak.** All-four-field agreement was 69% at High (29 rows), 67% at Medium (9), and 50% at Low (2). Low is slightly worse, but High and Medium are about the same. Self-reported confidence isn't a reliable signal on its own here. The review queue still sorts Low first, and the alert logic doesn't depend on confidence except for the "possible Sev1" rule.

**Decision: ship v2.** It meets the checkpoint (Sev1 recall 7/7 on the adjudicated labels). A v3 aimed at Mixed sentiment would be chasing noise, since v1 got all 4 of those rows right with the same rule. The production number comes from the real scheduled task scored in the sheet, per the scope doc.

### Production backfill (2026-11-06): the number to report

The real scheduled task (Claude app, Haiku 5.5, prompt v2, Google Sheets connector) tagged all 100 rows in two runs. Apps Script applied 100 of 100 suggestions: 0 rejected, 0 partly applied. Scored on the 40 eval rows, from the Feedback tab:

| Run | Sentiment | Theme | Product area | Severity | All 4 fields | Sev1 recall | Sev1 precision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Production v2, adjudicated labels | 37/40 | 34/40 | 36/40 | 34/40 | 26/40 | **7/7** | 7/8 |
| Production v2, blind labels | 35/40 | 27/40 | 20/40 | 23/38 | 11/38 | 1/1 | 1/8 |

Production matches the offline v2 run within 1 row on every field, so the subagent eval was a fair stand-in for the real task.

**Spot check of 10 non-eval rows** (U14507, U14606, U12801, U14672, U13781, U13022, U13979, U14969, U12412, U14177): theme, product area, and severity were right on all 10. **Sentiment was wrong on 3 of 10** (U14606, U13979, U14969). All three open with praise ("creates well-structured...", "creates compelling narratives...") and then make a request, so the taxonomy says Mixed, but they were tagged Negative.

**Correction to the v2 notes:** I called the Mixed-sentiment misses run-to-run noise. Production shows a consistent pattern instead: when the praise is a short clause before "but", Haiku calls it Negative. It doesn't affect severity, alerts, or theme. It does undercount Mixed in the sentiment split, so Part 1 reports Negative and Mixed together as "complaints." Candidate v3 fix: one explicit rule with the "X is good but Y" pattern. It applies to new rows only, and existing rows get corrected in review.

**Runtime:** the 100-row apply took 259 s against the 270 s budget, because it writes cell by cell with a re-check on each human cell. At about 10 rows a day a run takes a few seconds. A bigger backfill would stop at the budget and continue on the next sync, which is the designed behavior.
