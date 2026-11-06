# Taxonomy v1

Status: **locked as v1 on 2026-11-06.** Dan approved all changes, including dropping `question_type`. The live copy is the sheet's Taxonomy tab, which drives every dropdown.

Method: Claude read all 100 rows and tested the scope doc's draft against them, row by row. One caveat: Claude had already read the draft, so this is a review of the draft against the data, not a fully independent proposal.

## Summary of changes from the draft

| # | Change | Why |
| --- | --- | --- |
| 1 | Add theme **Feature request** | About 4 rows ask for a new capability on something that already works ("doesn't factor in client's emotional attachment", "needs more emotional language options"). None of Usability, Coverage gap, or Other fits, so they would pile into Other. |
| 2 | Add product area **Legal research** | Citation checking, research memos, case law matching and case similarity search (about 6 rows) don't belong in Drafting or Trial prep. |
| 3 | Add product area **Billing and practice management** | Time tracking, expense tracking, billing breakdowns, fee agreements, archival search, status dashboards, settlement and lien tracking (about 10 rows) have no home in the draft. |
| 4 | Rename **Damages and valuation** to **Case valuation and damages** | Also covers case merit scoring and outcome prediction, which are valuation tools. |
| 5 | Sharpen the **Sev1 vs Sev2** line | As drafted, almost every calculation error "could reach an opposing party" through a demand letter, which would make about 15 rows Sev1. Proposed test below. |
| 6 | Tie-break rules for Mixed sentiment and Wrong output vs Bug | Both come up often in the data and the draft doesn't settle them. |
| 7 | **Recommend dropping `question_type`** | None of the 100 rows is a question someone asked CaseCompanion. It would be "Not applicable" on every row, which adds a review step with no signal. The finding itself goes in Part 1 ("the feedback is about the whole platform, not Q&A"). **Dan's call.** |
| 8 | Replace the draft's example rows | Nearly every example in the draft (cervical/cerebral, upload crash, "way slower", federal court checklist, timeline filtering, Needles, video tutorials, 400+ pages, and the severity examples) is in the eval set. The tagging task reads the Taxonomy tab, so those examples would leak into the eval score. The examples below come only from rows outside the eval set and outside their near-duplicate twins. |

## Themes

One theme per row. For Mixed rows, tag the complaint or request, not the praise, since that's the part someone can act on.

| Theme | Definition | Example 1 | Example 2 |
| --- | --- | --- | --- |
| Wrong output | The product showed something factually or numerically wrong: bad numbers, wrong terms, wrong advice, or outdated rules or reference data. | "Medical bill review AI is inaccurate, flagging legitimate charges as potentially fraudulent." | "Expert witness cost calculator... Quoted $500/hour for biomechanical engineer when accurate market rate is $800-1200/hour." |
| Bug or reliability | A function failed: crashes, errors, timeouts, sync failures, lost or duplicated data. | "Witness contact management system duplicates entries when importing... Created 47 duplicate contacts." | "Case value benchmarking tool crashes when analyzing cases with multiple defendants." |
| Performance | Works, but slow or unresponsive. | *(illustrative)* "Search results take over a minute to load on large cases." | *(illustrative)* "The app freezes for several seconds every time I open a document." |
| Coverage gap | Works, but not for a specific jurisdiction, court, case type, or industry convention. | "Need better templates for demand letters in product liability cases... don't address complex manufacturing defect theories." | "Automated demand letter generation saves hours but needs industry-specific templates. Insurance companies expect certain formatting." |
| Usability | An existing capability is hard to find, filter, search, read, or control. | "Document production organizer... becomes unwieldy with 10,000+ documents. Need better folder structure and search." | "Case archival system needs better search functionality. Can't find closed cases from 2+ years ago." |
| Feature request | Works as designed, but the user wants a new capability, factor, or customization. | "Damages summary generator for closing arguments... needs more emotional language options." | "Mediation brief generator... needs better customization for different mediator styles." |
| Integration request | Wants a connection to another system that doesn't exist yet. | "Case expense tracking is useful but needs integration with accounting software." | *(illustrative)* "Please connect to Clio so we stop re-entering contacts." |
| Value and wins | Praise, time saved, outcomes improved. | "Fed it a 300-page deposition and got a perfect 5-page summary in minutes." | "Settlement conference preparation tool... Helped achieve 40% higher settlement!" |
| Training and docs | Learning materials, onboarding, documentation. | *(illustrative)* "New staff need a quick-start guide for the intake workflow." | *(illustrative)* "The help article on lien tracking is out of date." |
| Other | Nothing fits. Fill `suggested_theme`. | | |

Performance, Integration request, and Training and docs each have only 1 or 2 rows in the data, and those rows are in the eval set, so their examples are written by hand and marked illustrative.

**Wrong output vs Bug:** if the product *shows wrong facts or numbers*, it's Wrong output. If a function *fails, loses data, or duplicates data*, it's Bug. A crash during a calculation is a Bug. A calculation that finishes with the wrong answer is Wrong output.

## Product areas

The feature the feedback is about. Use Integrations only when the connection itself is the subject.

| Product area | Covers |
| --- | --- |
| Medical records | Chronologies, timelines, summaries, OCR, medical bill review, medical illustrations |
| Case valuation and damages | Damages and settlement calculators, case merit scoring, outcome prediction, value benchmarking, expense projections |
| Deadlines and calendaring | Statute of limitations tracking, discovery deadlines, deposition scheduling, trial timelines |
| Drafting and documents | Demand letters, motions, briefs, templates, privilege review, redaction, fee agreements, document production, voice-to-text |
| Legal research | Citation checking, research memos, case law matching, case similarity search |
| Trial and litigation prep | Jury tools, expert witnesses, exhibits, witness analysis, opposing counsel research, trial checklists |
| Client intake and communication | Intake chatbot and screening, client portal, client messages and templates, satisfaction surveys |
| Billing and practice management | Time and expense tracking, billing analysis, case status dashboards, settlement and lien tracking, archives |
| Integrations | Connections to outside systems (LexisNexis, Needles, Outlook, accounting, court e-filing) when the connection is the subject |
| Platform and access | Login, upload, speed, overall product, training |

## Sentiment

| Value | Definition |
| --- | --- |
| Positive | Praise only. |
| Negative | Complaint or problem only. |
| Mixed | Praise plus a specific complaint or request ("great, but..."). Theme and severity follow the complaint. |

Channel is not sentiment. Four `bug_report` rows are pure praise.

## Severity

| Level | Definition |
| --- | --- |
| Sev1 | Wrong output that puts a client's legal rights at risk or has already reached a court, client, or opposing party. Specifically: a wrong deadline, privileged material treated as producible, a wrong or non-compliant court filing, or wrong content in client-facing or court-facing documents that the user calls dangerous or that went out. |
| Sev2 | Wrong or broken, but the user caught it before harm, or it blocks a workflow or loses data. Most calculation errors land here: the user noticed the number was wrong. |
| Sev3 | Friction, gaps, requests, slowness. |
| None | Praise. Always None for Positive rows. |

**Tie-break:** when torn between two levels, pick the higher one and set confidence to Low. Wrong output tagged Sev2 at Low confidence also sends a "possible Sev1" alert, per the scope doc.

The Sev1 definition names categories of legal harm (deadlines, privilege, filings). It does not quote any eval row.

## Confidence

High, Medium, Low, unchanged from the draft.

## Decisions

Approved by Dan on 2026-11-06: changes 1 to 8 as proposed, with `question_type` dropped.
