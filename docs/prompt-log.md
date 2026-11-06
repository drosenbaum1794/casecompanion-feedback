# Prompt log

Every version of the tagging prompt: what changed, why, and its eval scores on the 40-row blind set. Prompt files live in `prompts/`.

| Version | Date | Change | Why | Theme | Product area | Sentiment | Sev1 recall | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1 | 2026-11-06 | Baseline: the scope doc's prompt, minus `question_type`, plus a tab allowlist that forbids the Eval tab and a rule that Mixed rows take the complaint's theme and severity. Written and committed before the labels were read. | Starting point | 28/40 (70%) | 21/40 (53%) | 38/40 (95%) | 1/1 (100%), precision 1/9 | Haiku 5.5, run by a subagent with no access to labels. Scored against Dan's **blind** labels, before adjudication. Severity 22/38 (58%); all four fields 12/38 (32%). See notes below. |

### v1 notes (2026-11-06)

**The scores mostly measure label disagreement, not prompt errors.** On the 8 near-duplicate pairs, where both copies should get identical tags, v1 was consistent on theme, product area, and severity 8 of 8 times. The blind labels were consistent on theme 4 of 8, product area 4 of 8, and severity 6 of 8. Many label-vs-run disagreements are rows where the label differs from the Taxonomy tab's own wording (for example OCR, which the taxonomy lists under Medical records, labeled Drafting and documents). Two labels had a blank severity.

**Sev1 is a policy question, not a prompt bug.** The blind labels have one Sev1 (a motion actually filed in the wrong format). v1 tagged 9. Six of the extra 8 are the categories the locked Sev1 definition names: wrong deadlines (the Jones Act pair), privileged material marked discoverable (2 rows), and wrong medical terms the user calls dangerous for client communications (2 rows). The labeler's instinct was "Sev1 only once harm has happened." The taxonomy says "at risk, or already happened." Which one is right decides how many alerts fire, so Dan decides before any prompt change.

**Real v1 errors, whichever policy wins:**
- U15233 (exhibit numbering resets): tagged Sev1, but it's a Bug, and the Sev1 definition requires wrong output. v1 stretched "dangerous" into Sev1. Low confidence, so the tie-break rule fired, but the definition rules it out.
- U14474 (templates cite superseded federal procedures): tagged Sev1 at Low confidence. Defensible under the tie-break rule but arguable.

**Calibration (small n):** all-four-field agreement was 37% at High (30 rows), 20% at Medium (5), and 0% at Low (3). The direction is right, but there are too few Medium and Low rows to say much.

**Next:** Dan reviews the 20 rows flagged in the Eval tab's `review_flag` column, which point only to conflicts with the taxonomy text or with his own duplicate-pair labels and never show Claude's tags, and decides the Sev1 policy. The original blind labels are kept in `data/eval-labels-blind.csv`. Both the blind and adjudicated scores get reported.
