# CaseCompanion Feedback Pipeline: Goals

Nov 6, 2026 · Daniel Rosenbaum

## What we're building

A small, self-updating system that turns raw customer feedback about EvenUp's CaseCompanion into something anyone at the company can use. New feedback lands in a Google Sheet. A scheduled Claude task proposes tags for it: theme, severity, product area, sentiment. Code checks those tags and applies them, people correct them in the sheet, and the clean data syncs to Supabase. From there, anyone can ask questions from their own Claude through a read-only MCP connector, browse a dashboard, or get an alert when something serious comes in.

This is a working proof of concept, built solo in three days for a job interview. It needs to work, show good judgment, and be honest about what's demo-only. It does not need to be polished.

The companion doc, **CaseCompanion Feedback Pipeline: Scope and Build Guide** (`docs/scope.md`), has every technical detail. This doc is the *why*. When the two seem to conflict, the scope doc wins on how, and this doc wins on what matters.

## Why we're building it

Dan Rosenbaum is interviewing for **Senior Product Solutions Manager at EvenUp**, legal tech for personal injury law firms. This is the take-home for the virtual onsite. A product team member will review it with him live, and it will come up in three other interviews: data and technical aptitude, UAT and product ops, and client communication.

**The assignment, in EvenUp's words, condensed:**

- **Data:** a mock CSV of customer feedback on CaseCompanion, "a ChatGPT-like tool for understanding Personal Injury case files." Assume about 10 new rows arrive per day.
- **Part 1:** make sense of the data. What would you share with the org? What further research would you recommend? What are the product implications? Core insights, supporting data, and next steps, not a full presentation.
- **Part 2:** build a working tool or automation that makes the feedback usable for others. Their examples: a dashboard to explore and filter, a pipeline that tags new feedback, a bot that answers questions, a workflow that flags or escalates.
- **Part 3 (bonus):** with a week, how would you make feedback analysis more autonomous and self-serve? What tools or agents? What still needs a human in the loop, and why?

**What they said they're looking for:**

1. A working prototype, not a polished product. "We value scrappiness and speed over perfection."
2. Show your process: how you prompt, iterate, and evaluate AI output, with prompts, screenshots, or a short write-up.
3. The "day 2" problem: new data must be handled without manual intervention.

**What the role is about**, from the prompt: making customer feedback discoverable and building lightweight tools that make insights self-serve for Engineering, Product, and Design. The build should look like the first thing Dan would ship in that job.

## Who it's for

Before any code, the design was reviewed by three personas. Each one's needs shaped the scope. If a choice makes life worse for any of them, it's the wrong choice.

| Person | What they need | What would make them stop using it |
| --- | --- | --- |
| **Product, Design, Engineering** | What to fix first, with real quotes and honest counts, without filing a request to an analyst | Numbers they can't trust or trace back to rows |
| **CS director** | Which segments are at risk, Sev1 problems within the hour, QBR-ready pulls, and proof the numbers are right | Undefined severity, no sample sizes, alerts going to nobody, having to remember to check |
| **CS rep** (reviews and corrects tags) | A short queue, clear definitions, one click to confirm, a way to say "unsure," and nothing they can break | Slow review (over about 30 seconds an item), guessing at what tags mean, their edits getting overwritten |

The senior engineer persona didn't use it, but set the bar: no lost human edits, no silent failures, no runaway costs, nothing a technical interviewer could poke a hole in.

## What success looks like

**The one moment that has to work:** a reviewer adds feedback, and within minutes (on demand) it's tagged, synced, answerable from their own Claude, and visible on the dashboard. If it's serious, the right person gets an email. A human can correct it, and the correction sticks.

**By submission, Sunday Nov 8:**

- [ ] All 100 original rows tagged, with Sev1 recall at 100% on a 40-row blind eval set
- [ ] New rows tagged and synced with no manual steps, and a "Simulate new day" button to prove it
- [ ] Human corrections never overwritten, shown by test scenario 3 in the scope doc
- [ ] A read-only MCP connector that answers the 5 starter prompts with correct numbers
- [ ] A dashboard with a health banner, Sev1s, and the review queue
- [ ] A one-page Part 1 memo, a process write-up with the eval table, and a short Part 3
- [ ] Every Blocker test scenario passing

**What should stick with the interviewers:** Dan tested the design against real users before building, used AI as a component with guardrails rather than a magic box, measured its accuracy honestly, and knew exactly where the proof of concept ends.

## Principles for every decision

1. **The agent proposes, code decides.** Claude never writes directly to data people rely on. Its output lands in staging and is validated by code before it's applied.
2. **Never overwrite a human.** A person's edit always wins over anything automated, in every code path.
3. **Numbers come from SQL, not the model.** Claude explains and summarizes. Counts, rankings, and trends come from queries.
4. **One place to edit.** Humans edit only the sheet. Data flows one way into Supabase. Nothing writes back.
5. **Fail loudly.** Every failure leaves a trace on the Health tab and, if it matters, sends an email. Silence must mean things are working.
6. **Correctness before features.** A smaller system that never loses data beats a bigger one that might. When time is short, cut features, never guards.
7. **Honest about limits.** Anything demo-only is labeled in the write-up, with what production would do instead.
8. **Legal stakes set severity.** Attorneys rely on this output in court and with clients. When unsure, rate higher and flag for review.
9. **Scrappy over polished.** Plain HTML over frameworks, Apps Script over infrastructure, the simplest thing that's correct.
10. **Log the process as you go.** Prompt versions, eval scores, and decisions get written down when they happen. The process is half of what's being graded.

## Non-goals

These are deliberate. Each gets one line in the write-up explaining when it would be built.

- **Sign-in** on the dashboard or MCP. Demo is open over mock data; production uses OAuth.
- **A direct Claude API call** for tagging. The scheduled task stands in; production swaps it.
- **Two-way sync** or editing in the dashboard. The dashboard links back to the sheet instead.
- **A custom web chat.** The MCP connector covers questions.
- **Real account or CSM routing.** The data has no account IDs, so routing uses firm size and mock names.
- **Slack app or multiple alert channels.** One email path is enough.
- **Vector index tuning.** At this volume an exact scan is fine.
- **Pixel polish.** Clear and correct beats pretty.

## Context and constraints

**Timeline:** the assignment arrived Thursday evening, Nov 5, with three days to submit. That makes **Sunday, Nov 8** the target. EvenUp said extensions are possible if needed. The scope doc has a day-by-day plan with checkpoints.

**Builder:** Dan, working solo with Claude Code. He's not a professional engineer, but he has shipped several Supabase apps, and he's comfortable with APIs, MCPs, and CLIs. Explain non-obvious choices briefly as you go, since he has to defend every one of them in an interview.

**Accounts and tools:**

| What | Detail |
| --- | --- |
| Google | Personal Gmail account, so consumer Apps Script quotas apply (about 90 minutes of trigger runtime a day) |
| Source data | [Original sheet](https://docs.google.com/spreadsheets/d/1G-TrTtSvCHmtsEHk13tHVuFikz6ZMPcHuhlkqlZl7wg/edit), tab "250910 Product Analyst Data - Final Data," 100 rows, 10 columns. Never edit it. Work on a copy. |
| Supabase | Dan's existing account; a new project for this build |
| Claude | Dan's account runs the scheduled tagging task, which is set up in the Claude app, not from Claude Code |
| Hosting | GitHub Pages for the dashboard; a public repo for the code |

**Docs:**

- `docs/scope.md`, also at [Scope and Build Guide](https://claude.ai/artifact/Tk1LovdXp6oLXtct5tiuxk): architecture, sheet design, taxonomy, prompt, sync engine, Supabase schema, MCP tools, dashboard, security, test plan, build setup, build plan
- `docs/goals.md`, also at [Goals](https://claude.ai/artifact/8cFnwC7yuLqsfgj9kKMMzR): this doc

**Style for anything a reviewer will read** (README, write-up, dashboard text, alert emails):

- Plain, direct language. Short sentences. No corporate filler.
- No em dashes.
- Lead with the result or the number.
- Never overstate. Every claim has to survive a follow-up question in a technical interview, so if a number came from a 40-row eval, say so.

## How a new Claude Code session should start

Both docs are saved as Markdown in the repo's `docs/` folder, so a Claude Code session can read them without access to claude.ai.

**First 15 minutes:**

1. Read `docs/goals.md` (this doc), then `docs/scope.md` in full.
2. Check the tools: `node`, `npm`, `clasp` (Apps Script CLI), and `supabase` CLI. Install what's missing.
3. Ask Dan for anything in the "Only Dan can do these" list below that isn't in `.env` yet.
4. Start the build plan at "Before starting," then Day 1. Don't skip ahead to code before the taxonomy and eval are done.

**Only Dan can do these** (prompt him at the right moment, with exact steps):

- Copy the source sheet and share the new sheet ID and the Feedback tab's gid
- Turn on the Apps Script API in his Google account, then run `clasp login`
- Create the Supabase project and share the project ref, anon key, and service key
- Approve the Google authorization prompts when triggers and the web app are first deployed
- Create the scheduled tagging task in the Claude app, using the prompt from the scope doc
- Turn on GitHub Pages for the repo
- Hand-label the 40 eval rows. They must be labeled blind, by a human, before Claude's tags are seen.

**Working rules for Claude Code:**

- Secrets go in `.env` and Apps Script Script Properties, never in the repo. Add `.env` to `.gitignore` before the first commit.
- Keep `docs/prompt-log.md` and `docs/decisions.md` current. Add an entry whenever a prompt or design choice changes.
- After each build-plan section, run the matching test scenarios and record pass or fail in `docs/test-results.md`.
- If something in the scope doc turns out not to work (a platform limit, a tool that behaves differently), stop and tell Dan with a proposed fix. Don't silently redesign.
- At each daily checkpoint, summarize what works, what doesn't, and whether to continue or fall back.
