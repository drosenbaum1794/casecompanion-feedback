# Part 3: with a week, how to make this more autonomous and self-serve

**Draft, Nov 6, 2026.** Each step builds on something the pipeline already logs, so it can be measured from day one.

## What I'd build

1. **Replace the scheduled task with a direct API call** from a service account, with structured output that only allows taxonomy values. The agent already writes only to a staging tab, so nothing downstream changes. This removes the personal-account dependency and the one-hour delay, and makes model and prompt versions explicit in code.

2. **Learn from corrections, measured by override rate.** Every human correction is already logged with Claude's original value beside it. Feed confirmed corrections back as examples, kept separate from the 40-row eval set so the score can't leak. Track the override rate by field and prompt version. If it doesn't fall, the change doesn't ship.

3. **Rank risk by dollars, not firm size.** Join account ID, ARR, and renewal date from the CRM. Today "large firm" stands in for value, and the memo has to call segment findings directional.

4. **Draft, don't file, product tickets.** When a distinct issue reaches a threshold (any Sev1, or a Sev2 with 3 or more mentions), an agent drafts a ticket with the quotes, affected segments, and the near-duplicate group. A person approves it before it's filed.

5. **Ingest at the source.** Pull from support tickets, call notes, and Slack directly instead of a sheet. The sync already reads columns by header name and fingerprints rows, so a new source is a new writer to the same intake, not a new pipeline.

6. **A weekly digest that writes itself.** Top issues by distinct count, new Sev1s and their follow-up status, the most affected segments, and two quotable wins. Numbers come from the same SQL functions as the dashboard; Claude writes only the two-sentence summary on top.

## What stays with a human, and why

- **Severity on anything that could reach a court or a client.** The eval showed the main disagreement between people and the model is where Sev1 starts. That line is a legal and product judgment, and a missed Sev1 costs far more than an extra review.
- **Taxonomy changes.** Claude suggests new themes through `suggested_theme`. A person decides, because a change re-tags history and moves every trend line.
- **Anything sent to a customer.** The pipeline can tell a CSM who to call and why. It shouldn't contact a law firm on its own.
- **Legal and compliance review of Sev1 issues** involving privilege or deadlines. That's out of scope for this build, and it should have a named owner.
