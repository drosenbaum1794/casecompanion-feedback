# Decisions

Design choices and why, logged as they happen. Newest at the bottom.

## 2026-11-06: Setup

**Supabase project.** Created a new project, `casecompanion-feedback` (ref `rienopvbkpukefaeynhb`, us-east-2), separate from Dan's existing project, so demo data and keys stay isolated. Created through the Supabase connector at $0.

**Public key.** The build uses the legacy `anon` JWT key, as the scope doc assumes. It works as the bearer token for the `ingest` edge function. The newer `sb_publishable_` key exists too and could replace it later.

**Scheduled task: findings from a throwaway test.**
- The shortest interval allowed is 1 hour. A 10-minute schedule was refused with "the minimum interval is 1 hour." This confirms the scope doc's hourly default.
- A scheduled task created from a Claude Code session cannot attach connectors on this account ("the connectors parameter is not available for this organization"). A test run on Haiku started, found no Google Sheets tools, and stopped without reading or writing anything.
- That run finished on its own with no approval prompt. It cost about $0.01 on Haiku and took about 12 seconds.
- **Decision:** the tagging task is created in the Claude app's scheduled tasks screen, with the Google Sheets connector turned on there, as the goals doc already planned. The connectivity test (read one cell, append one row to the Scratch tab) gets repeated there before Day 1 tagging.
- **Result (Claude app, Haiku, Google Sheets connector on):** passed. The task read D2 and appended exactly one row to Scratch at 13:41 UTC (`Discovery motion templates need updating`, `test ok`). It ran without asking for approval. Scratch tab deleted afterwards. The riskiest assumption in the plan holds: a scheduled task can read the sheet and append to a staging tab unattended.

## 2026-11-06: Day 1 sequencing and eval set

**Eval rows chosen before taxonomy examples.** The tagging task reads the Taxonomy tab, so its examples act as few-shot examples. Nearly every example in the scope doc's draft taxonomy and severity rubric was a row that belongs in the eval set (the Sev1s, the mislabeled bug reports, the near-duplicate pairs). Using them would leak into the eval score. So the 40 eval rows were picked first, and taxonomy examples come only from rows outside the eval set and outside their near-duplicate twins. Themes with no eligible row (Performance, Training and docs, and one Integration request slot) use hand-written examples marked illustrative.

**Eval set composition (40 rows).** Stratified, not random: 8 likely Sev1 candidates, the 4 bug reports that are praise, both copies of 8 near-duplicate pairs, 6 severity edge cases, and 13 rows for theme and sentiment coverage. Every channel, role, and firm size appears. It is deliberately weighted toward hard cases: 9 of 40 rows are pure praise, against 45 of 100 in the full data, and attorneys are 14 of 40 against 53 of 100. Accuracy on this set will be lower than on a random sample, and the write-up says so. Selection notes are in `data/eval-selection-notes.md` (gitignored), which Dan should not open until he has labeled the rows.

**Part 1 draft moved after labeling.** The scope doc lists the Part 1 draft first on Day 1. But a draft would describe which issues look like Sev1s, and reading it would bias Dan's blind labels. Claude drafts Part 1 after Dan finishes labeling.

**Taxonomy proposal is a review, not an independent proposal.** Claude had already read the draft taxonomy before reading the data, so `docs/taxonomy-v1-proposal.md` is the draft tested against all 100 rows, with changes where the data didn't fit.

## 2026-11-06: Taxonomy v1 locked

**Approved as proposed** (`docs/taxonomy-v1.md`). Added Feature request; added Legal research and Billing and practice management; renamed Case valuation and damages; sharper Sev1 vs Sev2 line; tie-break rules; examples drawn only from non-eval rows.

**`question_type` dropped.** None of the 100 rows is a question asked of CaseCompanion, so the field would be "Not applicable" on every row. This changes the scope doc in several places, which the build follows from here on: the Feedback tab has no `question_type` column, the Claude Suggestions tab and tagging prompt drop it, and the Supabase schema and MCP filters leave it out. The scope doc itself is left as written; this entry is the record of the change.

**Taxonomy and Eval tabs built in the working sheet.** The Taxonomy tab holds 30 values with definitions, examples, and `version = v1`. The Eval tab holds the 40 eval rows with context and four dropdown label columns (sentiment, theme, product area, severity) fed from the Taxonomy tab, plus free-text notes. Both tabs are protected so only Dan can edit them. Eval stays visible while Dan labels, and gets hidden afterwards.

**Leak guard for the final eval check.** Dan's labels will sit in the same spreadsheet the tagging task reads. The tagging prompt must name the only tabs it may open (Taxonomy, Feedback, Claude Suggestions) and explicitly forbid the Eval tab, and the final scored run should confirm in version history that the task never read it.

## 2026-11-06: Eval labels need an adjudication pass

The first scoring run (`docs/prompt-log.md`, v1) showed the blind labels disagree with the locked taxonomy text and with themselves on near-duplicate pairs (theme 4/8 pairs consistent, product area 4/8). With noisy labels, the eval can't tell a good prompt from a bad one. Standard fix: one adjudication pass where the labeler re-checks only flagged rows.

**Guard against biasing the labels toward Claude:** the flags are computed only from the taxonomy's wording and the labeler's own duplicate-pair labels. Claude's tags are never shown during adjudication. Dan may keep any original label he still believes; if he keeps one that contradicts the taxonomy wording, the taxonomy wording changes instead (v2).

**Both numbers get reported:** v1 against the original blind labels and against the adjudicated labels. Blind labels stay in `data/eval-labels-blind.csv`.

**Product finding for the rep workflow:** the Eval tab's dropdowns showed value names without definitions, which sit on a separate tab. That likely contributed to the product-area misses, and reps confirming tags would hit the same problem. The My Queue tab should show the definition next to each tag, or the dropdown should carry help text.
