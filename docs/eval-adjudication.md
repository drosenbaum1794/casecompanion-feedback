# Eval label adjudication log

Done by Claude on 2026-11-06 at Dan's request, after Claude had seen the v1 run. Rules: change only fields named by a `review_flag` (computed from the taxonomy wording and Dan's own duplicate-pair labels, never from Claude's tags), blanks, and the 6 rows covered by Dan's Sev1 policy decision (option A). Every change cites the rule. Fields the flags did not name were left as Dan labeled them, even where Claude would have tagged differently.

| user_id | field | blind label | adjudicated | rule |
| --- | --- | --- | --- | --- |
| U13550 | theme | Bug or reliability | Wrong output | Twin of U13286. Taxonomy: a calculation that finishes with the wrong answer is Wrong output. |
| U13550 | severity | Sev3 | Sev2 | Twin pair severity conflict (Sev3 vs blank). Taxonomy Sev2: most calculation errors; the user noticed the number was wrong. |
| U13286 | severity | (blank) | Sev2 | Blank. Same rule as its twin U13550. |
| U12689 | theme | Bug or reliability | Wrong output | Twin of U13517. Tracker finishes with the wrong timeframe: wrong answer, not a failed function. |
| U12689 | product_area | Trial and litigation prep | Deadlines and calendaring | Taxonomy lists statute of limitations tracking under Deadlines and calendaring. |
| U12689 | severity | Sev2 | Sev1 | Sev1 policy A (Dan, 2026-11-06): a wrong deadline puts legal rights at risk. |
| U13517 | product_area | Legal research | Deadlines and calendaring | Taxonomy lists statute of limitations tracking under Deadlines and calendaring. |
| U13517 | severity | Sev2 | Sev1 | Sev1 policy A: a wrong deadline. |
| U12834 | product_area | Client intake and communication | Drafting and documents | Taxonomy lists privilege review under Drafting and documents. |
| U12834 | severity | Sev2 | Sev1 | Sev1 policy A: privileged material treated as producible. |
| U14144 | sentiment | Negative | Mixed | Text opens with praise ('highly accurate but...'). Taxonomy: praise plus a specific complaint is Mixed. |
| U14144 | theme | Bug or reliability | Wrong output | Twin of U12834. Misclassification is wrong output; nothing crashed or lost data. |
| U14144 | product_area | Platform and access | Drafting and documents | Taxonomy lists privilege review under Drafting and documents. |
| U14144 | severity | Sev2 | Sev1 | Sev1 policy A: privileged material treated as producible. |
| U13055 | severity | Sev2 | Sev1 | Sev1 policy A: wrong content the user calls dangerous for client communications. |
| U14342 | severity | Sev2 | Sev1 | Sev1 policy A: same as twin U13055. |
| U12778 | theme | Performance | Wrong output | Taxonomy: Performance is slow or unresponsive. Inaccurate transcription is wrong output. |
| U12778 | product_area | Drafting and documents | Medical records | Taxonomy lists OCR under Medical records. |
| U13913 | theme | Bug or reliability | Wrong output | Twin of U12778. Inaccurate transcription is wrong output; nothing crashed. |
| U13913 | product_area | Drafting and documents | Medical records | Taxonomy lists OCR under Medical records. |
| U12956 | product_area | Platform and access | Case valuation and damages | Taxonomy lists case merit scoring under Case valuation and damages. |
| U14243 | product_area | Legal research | Case valuation and damages | Taxonomy lists case merit scoring under Case valuation and damages. |
| U14243 | severity | Sev3 | Sev2 | Twin of U12956 (Sev2). Taxonomy Sev2: wrong output the user caught. |
| U14837 | product_area | Platform and access | Case valuation and damages | Taxonomy lists settlement calculators under Case valuation and damages. |
| U14573 | product_area | Platform and access | Medical records | Taxonomy lists timelines under Medical records. |
| U13649 | theme | Performance | Usability | Taxonomy: Performance is slow or unresponsive. Jargon makes an existing capability hard for clients to read: Usability. |
| U13649 | severity | None | Sev3 | Taxonomy: None is for praise only, and Mixed takes the complaint's severity. Friction is Sev3. |
| U13748 | product_area | Drafting and documents | Deadlines and calendaring | Taxonomy lists discovery deadlines under Deadlines and calendaring. |
| U12867 | product_area | Platform and access | Client intake and communication | Taxonomy lists client portal under Client intake and communication. |
| U14012 | product_area | Platform and access | Integrations | The sync between time tracking and the billing system is the subject. Taxonomy: Integrations when the connection itself is the subject. |
| U15002 | product_area | Client intake and communication | Billing and practice management | Taxonomy lists case status dashboards under Billing and practice management. |
| U12034 | product_area | Drafting and documents | Platform and access | Taxonomy lists upload under Platform and access. |
| U14111 | sentiment | Negative | Positive | Severity was blank and the text is praise only ('essential', 'prevents costly missed filings'). |
| U14111 | theme | Feature request | Value and wins | Praise. |
| U14111 | product_area | Legal research | Deadlines and calendaring | Taxonomy lists statute of limitations tracking under Deadlines and calendaring. |
| U14111 | severity | (blank) | None | Taxonomy: always None when sentiment is Positive. |

36 field changes across 21 rows. 160 labeled fields in total.
