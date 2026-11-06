# CaseCompanion feedback pipeline

A small, self-updating system that turns raw CaseCompanion customer feedback into something anyone at EvenUp can use. New feedback lands in a Google Sheet, Claude proposes tags for it every hour, code checks those tags before they land, people correct them in the sheet, and the clean data syncs to Supabase. From there anyone can ask questions from their own Claude, browse a dashboard, or get an email when something serious comes in.

Built in three days as a take-home for EvenUp. It is a working proof of concept over mock data, not a product.

## Try it

| What | Where |
| --- | --- |
| Dashboard | https://drosenbaum1794.github.io/casecompanion-feedback/ |
| Ask from your own Claude | Add `https://rienopvbkpukefaeynhb.supabase.co/functions/v1/feedback-mcp` as a custom connector, then try the prompts below |
| Part 1 insights memo | [docs/part1-insights.md](docs/part1-insights.md) |
| How the tagging was evaluated | [docs/prompt-log.md](docs/prompt-log.md) |
| Design decisions | [docs/decisions.md](docs/decisions.md) |
| Test results | [docs/test-results.md](docs/test-results.md) |

**Starter prompts for the connector:**

1. What are the top 3 themes by distinct issues, and are they rising or falling?
2. Show me every Sev1, which segments they came from, and whether anyone followed up.
3. What do large-firm attorneys complain about that small firms don't?
4. Find feedback about medical record accuracy and summarize it with quotes.
5. Pull 3 strong wins about time saved for a QBR.

## How it works

```mermaid
flowchart LR
  intake[New feedback] -->|append| sheet[Google Sheet: the only place people edit]
  reps[CS reps confirm or correct in My Queue] -->|edit| sheet
  task[Claude scheduled task, hourly: proposes tags only] -->|writes to Claude Suggestions tab| sheet
  sheet <-->|every 10 min| script[Apps Script: lock, validate, never overwrite a human, fingerprint]
  script -->|changed rows only, one way| supa[Supabase: feedback, embeddings, change log, sync runs]
  script -->|Sev1 only| alert[Alert email to the routed CSM, once per row]
  supa -->|read-only| mcp[MCP server]
  supa -->|read-only| dash[Dashboard]
```

**The rules the build follows:**

- **The agent proposes, code decides.** Claude only appends to a staging tab. Apps Script validates every value against the Taxonomy tab before anything reaches the Feedback tab.
- **Never overwrite a human.** The apply step re-reads each cell just before writing and fills only empty cells. A human edit always wins.
- **Numbers come from SQL, not the model.** Claude tags and explains. Counts, rankings, and trends come from database functions shared by the MCP server and the dashboard.
- **One place to edit.** People edit only the sheet. Data flows one way into Supabase.
- **Fail loudly.** Every sync is logged to the sheet's Health tab and to Supabase. Failures, a stalled tagger, and a tripped delete guard send email.

**What happens to a new row:** the next sync gives it an ID. The hourly tagging task proposes tags. The next sync validates and applies them, sends an alert if it's Sev1, and pushes the row to Supabase with an embedding. It shows up on the dashboard and in the MCP within about an hour, or within a minute or two using "Sync now" and "Run now."

## Accuracy, honestly

On a 40-row eval set, hand-labeled blind and then adjudicated against the written taxonomy, the production tagger (Haiku, prompt v2) caught **7 of 7 Sev1s** with 1 false alarm, and matched all four tags on **26 of 40** rows. Against the original blind labels, before adjudication, it matched 11 of 38. The gap is mostly label disagreement, which the prompt log explains. Self-reported confidence turned out not to be a useful signal. The eval set was deliberately weighted toward hard cases. Full method and every version: [docs/prompt-log.md](docs/prompt-log.md).

## What is demo-only

| Demo | Production would use |
| --- | --- |
| Tagging runs as a scheduled task on a personal Claude account | A direct API call from a service account with schema-enforced output. Only that one step changes, because the agent already writes only to a staging tab. |
| No sign-in on the dashboard or MCP, over mock data | OAuth through Supabase Auth with an EvenUp-only allowlist |
| Alerts route by firm size to mock CSMs (all to one inbox) | Real account and CSM data from the CRM |
| One alert channel (email) | Slack plus email |
| Sync runs as the sheet owner | A service account, so any editor can trigger it |

## Repo layout

| Path | What |
| --- | --- |
| `apps-script/` | The sheet's code: sync, apply, alerts, edit handler, row-opener web app. Pushed with `clasp`. |
| `supabase/migrations/` | Tables, change-log trigger, read functions, security |
| `supabase/functions/ingest/` | The only writer to the database |
| `supabase/functions/feedback-mcp/` | Read-only MCP server |
| `dashboard/index.html` | The dashboard, one static file |
| `prompts/` | Every version of the tagging prompt |
| `scripts/` | Eval scoring, logic tests for the sheet code, memo numbers |
| `docs/` | Goals, scope, decisions, prompt log, test results, memo |

Run the sheet-logic tests with `node scripts/test-apps-script.mjs`. Score a prompt run with `node scripts/eval-score.mjs v2` (needs the gitignored `data/` folder).
