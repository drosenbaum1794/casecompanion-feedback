# CaseCompanion feedback: what 100 rows say

**Draft, Nov 6, 2026.** Source: 100 feedback rows, Jul 8 to Sep 9, 2024, tagged by the pipeline (prompt v2) and spot-checked by hand. "Complaints" means Negative plus Mixed (55 rows); praise is the other 45. Small sample, two months, no account IDs: treat segment differences as directional. Counts come from `scripts/part1_stats.py`; distinct-issue counts come from the Supabase read functions.

## Core insights

**1. Correctness is the main complaint, and the dangerous part is narrow.** Wrong output accounts for 29 of 55 complaints (53%) and 29 of 39 Sev1 or Sev2 complaints (74%). The 8 Sev1 rows are 5 distinct issues, each one an error that can reach a court or a client:
- Statute of limitations tracker applies standard deadlines to Jones Act cases (2 users)
- Privilege review marks attorney-client communications as discoverable (2 users)
- Case summaries confuse "cervical" and "cerebral" in client communications (2 users)
- A motion was filed in the wrong format twice because local rules weren't updated (1 user)
- Discovery templates still cite federal procedures amended in 2023 (1 user; tagged Sev1 at low confidence, so a human confirms it)

**2. Several of these look like stale legal rules, not bad AI.** 8 complaints (6 issues) describe the product applying a legal rule or reference record that is outdated, wrong, or missing: Jones Act periods, 2023 federal amendments, new local filing rules, federal court procedures, experts who changed firms years ago. That includes 4 of the 8 Sev1 rows. If this holds up, the fix is a content-freshness process, not a model change. This is a hypothesis to test (research item 2).

**3. Valuation tools are where users stop trusting the numbers.** Case valuation and damages has the most complaints of any area: 12 rows, 8 distinct issues, 9 of them Wrong output. The pattern is inconsistency, not one bug: "$50K, other times $120K for similar injuries," results that change with input order, merit scoring that "seems backwards," future medical costs that ignore inflation. It gets only 5 praise rows. Trial and litigation prep is the opposite: 13 praise, 5 complaints.

**4. The value that lands is time saved on document-heavy work.** The 45 praise rows are concrete and quotable: 400+ pages sorted "in an hour" instead of two days, a 300-page deposition summarized to 5 pages "in minutes," 200 medical records summarized in 30 minutes, trial prep "reduced by 60%," redaction cut from a full day to 30 minutes.

**5. The most hands-on users report the most serious problems.** Paralegals: 79% of their rows are complaints, against 38% for attorneys. Large firms: 71% complaints and 61% Sev1 or Sev2, against 38% and 19% for small firms. Heavy users (top quartile, 523+ queries a month): 52% Sev1 or Sev2, against 35% for everyone else. All 8 Sev1 rows come from medium or large firms. Tenure makes no difference (56% vs 55%).

**How to read the raw data.** 55 complaint mentions collapse to 43 distinct issues once near-identical feedback is grouped by text similarity (Supabase `theme_summary`). Keyword counts mislead in both directions: 16 rows say "inaccurate" or "incorrect," but only 4 of those are Sev1, and half the Sev1 rows use neither word. Channel isn't sentiment: 4 of 20 bug reports are praise. And none of the 100 rows is about asking CaseCompanion a question. The feedback spans 10 product areas.

## Recommended research

1. **Size the 5 Sev1 issues this week.** Reproduce each with the reporting users. How many matters are affected, and did anything reach a court, client, or opposing party? Bring in legal or compliance for privilege and deadlines.
2. **Test the stale-rules hypothesis.** List the rule sets and reference data CaseCompanion depends on (limitation periods by case type and jurisdiction, federal and local procedure, expert records), with an owner and a last-updated date for each.
3. **Valuation trust interviews.** 5 or 6 paralegals and case managers at large firms: what would they need to see to trust a number? Reproduce the input-order bug in parallel.
4. **Join account and revenue data.** Without account IDs, firm size is a weak stand-in for risk. It would also show whether the near-identical feedback comes from one firm or many.
5. **Settle the scope question.** Is CaseCompanion the Q&A tool or the whole platform? If Q&A is the focus, this dataset says almost nothing about it.

## Product implications

- **Give legal-correctness errors their own lane:** deadlines, privilege, court filings, and client-facing medical terms, with a named owner and a response target. The pipeline already alerts on these within about an hour.
- **Show the basis for high-stakes output:** the rule and jurisdiction behind every computed deadline, and a "withhold when unsure" default for privilege review. One user asked for exactly that ("more conservative settings").
- **Make freshness visible:** "last verified" dates on rules, templates, and expert records. Another user asked for "verification dates."
- **Make calculators deterministic and explainable:** same inputs, same answer, with the assumptions (inflation rate, earnings model) and a range shown next to the number.
- **Keep investing in the document-heavy time savers,** and put the quantified wins into QBRs and case studies.
