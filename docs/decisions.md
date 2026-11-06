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

## 2026-11-06: Sheet build and Apps Script, Day 1

**Sheet build done through the Sheets connector**, not a setup script: rename to Feedback, `fb_id` in column A, 28 working and system columns, dropdowns fed from the Taxonomy tab, Low confidence in amber, Sev1 in red, frozen through `feedback_text`, the "never sort" note on A1, warning-only protection on original data, and owner-only protection on system columns (hidden), Routing, Health, Taxonomy, and Eval. Eval is hidden now that labeling is done.

**Added columns beyond the scope doc:**
- `claude_sentiment`, `claude_theme`, `claude_product_area`, `claude_severity` (system, script-only). Claude's original proposal is recorded even when a human already filled a tag, so the override rate can be computed in the sheet, not only in Supabase.
- `injection_suspected` (system). The security table needs it on the row so the queue and the MCP can surface it.

**Checkbox fix.** A checkbox column stores FALSE in every cell, which makes Sheets treat 1,000 rows as filled, so appended rows would land at row 1001. Checkboxes now stop at the last data row, and the script adds one to each new row when it assigns an ID.

**clasp quirk.** `clasp create --type sheets --parentId X` ignores the parent and makes a new spreadsheet. Running it without `--type` binds correctly. The stray empty spreadsheet was moved to Drive trash.

**OAuth scopes declared up front** in `appsscript.json`, including email and outbound requests that Day 2 needs (Sev1 alerts, Supabase push). Dan approves once instead of twice. Full `spreadsheets` scope rather than `currentonly`, because the Day 2 row-opener web app has no active spreadsheet and must open the sheet by ID.

**Code-side guard added to validation:** Positive feedback must have severity None, and theme Other needs a `suggested_theme`. **Deliberately not enforced in code:** "Sev1 only for Wrong output." Rejecting would delay a possible Sev1 alert, so it goes to a human instead.

**Known limit:** menu items run as whoever clicks them. A rep clicking "Sync now" can't write the protected system columns, so the run fails loudly on the Health tab instead of half-applying. For the demo Dan is the only editor, and the 10-minute trigger runs as Dan. Production would run sync from a service account.

**Logic tests:** `node scripts/test-apps-script.mjs` runs 15 tests on the validation and write-planning functions, including "a human-filled cell is never overwritten" and "a suspected injection forces Low confidence."

## 2026-11-06: Day 2 pipeline design choices

**Session network.** A personal cloud environment, `casecompanion-feedback`, allows exactly one extra host: the Supabase project. Its setup script reinstalls `clasp` and the Supabase CLI. The Default environment was left alone, since every repository uses it.

**The ingest secret never passes through chat or the repo.** The sheet menu "Admin: create ingest secret" generates it inside Apps Script, stores it in Script Properties, and shows it once to Dan. He pastes it into the Supabase secrets form. `ingest` rejects any request without it, and Supabase's own JWT check stays on.

**Readers can't see people.** The `anon` role has column-level grants that leave out `reviewed_by` (emails), `notes`, `follow_up_owner`, and the hashes. Writes are refused at the table level. Every function is SECURITY INVOKER with an empty `search_path`. The only function that writes (`assign_issue_ids`) can't be run by `anon`. Supabase's security advisor reports no issues.

**"Zero calls when idle", with one exception.** An idle sync makes no Supabase calls, except a heartbeat `log_run` at most every 25 minutes. Without it, the dashboard's "last synced" banner would go amber during quiet periods even though the pipeline is healthy. The ID-list reconcile and the taxonomy push only run when their content hash changes.

**Push batch of 10, not 25.** Each new row needs an embedding, and an edge function call has a CPU-time limit. `ingest` still accepts up to 25.

**Alerts.** More than 3 alerts in one run (for example the first backfill, with 8 Sev1 rows) go out as one digest email, not 8. The tagger-stopped check measures how long untagged rows have been waiting since they started waiting, so a quiet night followed by "Simulate new day" doesn't trigger a false alarm.

**Corrected means different from Claude.** The edit handler marks a row Corrected only when a tag now differs from Claude's original. Re-selecting Claude's own value isn't a correction, so the override rate isn't inflated. Pasted values outside the taxonomy turn the cell red and set `sync_error`, which keeps the row out of Supabase until it's fixed.

**Trends anchor to the data, not today.** The data ends in September 2024, so `theme_trend` defaults to the latest feedback date, and the MCP and dashboard say which date range they cover.

**Row-opener web app is anonymous.** It shows only the row number and a button; the sheet itself still requires access. It runs as Dan, because it has to read the sheet to find the row.

## 2026-11-06: MCP server

**Built as Supabase recommends:** the official MCP TypeScript SDK with its web-standard streamable HTTP transport, inside an edge function, deployed without JWT verification so a Claude connector can reach it. It is stateless, with a fresh server per request and JSON responses. It reads with the anon key only, so the same column grants and RLS that protect the dashboard apply.

**Seventh tool, `list_feedback`, beyond the scope doc's six.** Starter prompt 2 ("show me every Sev1 this month... and whether anyone followed up") and the demo question "what changed today?" need actual rows matching exact filters. `search_feedback` ranks by similarity, which is the wrong tool for "every Sev1," and `get_theme_summary` only counts. The new tool returns at most 50 rows, newest first, with the total that matched.

**Guardrails in the tool descriptions:** use `get_theme_summary` or `get_trend` for counts, never count search results; always report mentions and distinct issues, the sample size, and the date range; call anything under 10 rows directional. Customer text comes back only as `customer_text_untrusted`, with a note in every result. Inputs are validated with zod: enums for segments, an ID pattern, date formats, and a limit cap. A malformed `fb_id` is rejected before it reaches the database.

## 2026-11-06: Dashboard

**One static file, no charting library.** The ranked theme bars are plain HTML and the weekly trend is a small hand-drawn SVG, so there is no dependency to load or break. Colors come from the reference palette's tokens, light and dark. Severity always shows as a labeled badge (never color alone), using the reserved status colors. Customer text is only ever inserted as text, never as HTML, so a hostile feedback row can't inject markup. Every view states its n and flags anything under 10 rows as directional.

**Segment numbers come from SQL** (`segment_summary`), not from counting in the browser. Its "heavy user" cut is the 75th percentile of monthly queries (512 or more). The memo's first draft used a slightly different percentile method (523 or more); the memo now cites the SQL figures.

**Published with a GitHub Actions workflow,** because GitHub Pages can only serve a repo's root or `docs/` folder directly, not `dashboard/`.

## 2026-11-06: Fixes found by testing

Test scenarios found four real gaps. Each is fixed, unit-tested where the logic is pure, and recorded in `docs/test-results.md`.

1. **Failure emails hid each other** (test 11). The hourly throttle was global, so a second, different failure was suppressed. The throttle now applies only to repeats of the same error.
2. **An undone typo left a row stuck** (test 6). Undo doesn't fire onEdit, so `sync_error` stayed set on a now-valid row, and it silently stopped syncing. Every sync now re-checks flagged rows.
3. **Corrected outlived the correction** (test 5). A row edited back to Claude's values stayed Corrected and inflated the override rate (67% shown, 50% true). The edit handler now returns such rows to Pending, and `health()` measures actual value differences.
4. **Duplicate Sev1 alert** (test 5). Deviates from the scope doc: the edit handler no longer clears `alerted_at` when severity is set to Sev1, because during a paste it can't tell "raised" from "put back". A newly raised Sev1 still alerts, since it never alerted before. Known limit: a row that already sent a "possible Sev1" alert and is then confirmed as Sev1 by a human does not send a second email; the CSM already has it.

## 2026-11-06: Live dashboard for the demo

The dashboard refreshes itself every 30 seconds, and immediately when its tab comes back into view. It pauses while the tab is in the background, so an unwatched page makes no calls. A **Just in** panel above the tabs lists rows that reached Supabase after the page opened, with "Waiting for tags" until the tagger's suggestions are applied. New rows also get a "New" badge in the Sev1, queue, and Explore tables. Counts in the panel use the database's exact count (`Prefer: count=exact`), not the number of rows fetched. `?since=<ISO time>` shows what arrived after a chosen moment, which helps when rehearsing or presenting from a page opened earlier.
