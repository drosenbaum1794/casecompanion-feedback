# Part 3: with a week, making this more autonomous and self-serve

Each step builds on something the pipeline already logs, so it can be measured from day one.

## What I'd build

1. **A direct API call instead of the scheduled task,** from a service account, with structured output limited to taxonomy values. The agent already writes only to a staging tab, so nothing downstream changes. It removes the personal-account dependency and the hourly delay.
2. **Learn from corrections, measured by override rate.** Every correction is logged next to Claude's original value. Feed confirmed corrections back as examples, kept apart from the 40-row eval set, and track override rate by field and prompt version. If it doesn't fall, the change doesn't ship.
3. **Rank risk by dollars, not firm size.** Join account ID, ARR, and renewal date from the CRM.
4. **Draft, don't file, product tickets.** When an issue crosses a threshold (any Sev1, or a Sev2 with 3+ mentions), an agent drafts a ticket with quotes, segments, and the near-duplicate group. A person approves it.
5. **Ingest at the source:** support tickets, call notes, and Slack. The sync reads columns by name and fingerprints rows, so a new source is a new writer, not a new pipeline.
6. **A weekly digest** of top issues, new Sev1s and their follow-up, affected segments, and two quotable wins. Numbers come from the dashboard's SQL; Claude writes only the summary.
7. **Sign-in before real data.** Google sign-in with an EvenUp allowlist on the dashboard and MCP, so dashboard edits are tied to a person instead of open to anyone with the link.

## What stays with a human, and why

- **Severity on anything that could reach a court or client.** The eval showed people and the model mostly disagree about where Sev1 starts. That line is a legal and product call, and a missed Sev1 costs far more than an extra review.
- **Taxonomy changes.** Claude can suggest a theme; a person decides, because a change re-tags history and moves every trend.
- **Anything sent to a customer.** The pipeline can tell a CSM who to call and why. It shouldn't contact a law firm itself.
- **Legal and compliance review of Sev1s** involving privilege or deadlines, with a named owner.
