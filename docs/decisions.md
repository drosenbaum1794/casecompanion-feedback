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
