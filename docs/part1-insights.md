# CaseCompanion feedback: what 100 rows say

Daniel Rosenbaum · Nov 8, 2026 · 100 rows, Jul 8 to Sep 9, 2024, tagged by the pipeline and checked against SQL. "Complaints" means Negative or Mixed (55 rows); the other 45 are praise. The sample is small, two months long, and has no account IDs, so treat segment differences as directional.

## Core insights

**1. Correctness is the main complaint, and the dangerous part is narrow.** Wrong output is 29 of 55 complaints and 29 of 39 Sev1 or Sev2 complaints. The 8 Sev1 rows are 5 distinct issues, each an error that can reach a court or client:
- The statute of limitations tracker applies standard deadlines to Jones Act cases (2 users).
- Privilege review marks attorney-client communications as discoverable (2 users).
- Case summaries confuse "cervical" and "cerebral" in client communications (2 users).
- A motion was filed in the wrong format twice because local rules weren't updated (1 user).
- Discovery templates still cite federal procedures amended in 2023 (1 user, low confidence, so a human confirms it).

**2. Several look like stale legal rules, not bad AI.** 8 complaints (6 issues), including 4 of the 8 Sev1 rows, describe an outdated or missing rule or record: Jones Act periods, 2023 federal amendments, new local filing rules, experts who changed firms. If this holds, the fix is a content-freshness process, not a model change.

**3. Valuation is where users stop trusting the numbers.** Case valuation and damages has the most complaints of any area: 12 rows, 8 distinct issues, 9 of them Wrong output. The pattern is inconsistency: "$50K, other times $120K for similar injuries," results that change with input order, future medical costs that ignore inflation. It gets only 5 praise rows. Trial prep is the opposite: 13 praise, 5 complaints.

**4. The value that lands is time saved on document-heavy work.** 400+ pages sorted "in an hour" instead of two days, a 300-page deposition summarized "in minutes," trial prep "reduced by 60%," redaction cut from a full day to 30 minutes.

**5. The most hands-on users report the most serious problems.** 79% of paralegal rows are complaints, against 38% for attorneys. Large firms: 71% complaints and 61% Sev1 or Sev2, against 38% and 19% for small firms. Heavy users (512+ queries a month): 48% Sev1 or Sev2, against 36% for everyone else. All 8 Sev1 rows come from medium or large firms.

**Reading the raw data.** The 55 complaints are 43 distinct issues once near-identical feedback is grouped. Keywords mislead: 16 rows say "inaccurate" or "incorrect," but only 4 are Sev1. 4 of 20 bug reports are praise. No row is about asking CaseCompanion a question; the feedback spans 10 product areas.

## Recommended research

1. **Size the 5 Sev1 issues this week** with the reporting users: how many matters, and did anything reach a court, client, or opposing party? Bring in legal for privilege and deadlines.
2. **Test the stale-rules idea:** list the rule sets and reference data the product depends on, each with an owner and a last-updated date.
3. **Valuation trust interviews** with 5 or 6 large-firm paralegals and case managers, while reproducing the input-order bug.
4. **Join account and revenue data,** so risk is ranked by dollars and repeat feedback can be traced to one firm or many.
5. **Settle the scope question:** is CaseCompanion the Q&A tool or the whole platform? This data says little about Q&A.

## Product implications

- **Give legal-correctness errors their own lane** (deadlines, privilege, filings, client-facing medical terms) with a named owner and a response target. The pipeline already emails these within about an hour.
- **Show the basis for high-stakes output:** the rule and jurisdiction behind each deadline, and a "withhold when unsure" default for privilege review, which one user asked for.
- **Make freshness visible:** "last verified" dates on rules, templates, and expert records.
- **Make calculators consistent and explainable:** same inputs, same answer, with assumptions and a range shown.
- **Put the quantified time savings into QBRs and case studies.**
