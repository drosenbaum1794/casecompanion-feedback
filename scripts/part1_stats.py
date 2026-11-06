"""Numbers for the Part 1 insights memo, computed from the tagged data.

Usage: python3 scripts/part1_stats.py
Reads data/feedback-tagged.csv (production tags from the scheduled task, prompt v2).

"Complaint" = sentiment Negative or Mixed. Mixed is undercounted by the tagger
(see docs/prompt-log.md), so the memo reports them together.

ISSUES groups complaint rows that describe the same problem in different words.
This grouping is Claude's reading of the text. It is a stand-in until the Day 2
embedding clusters exist, and it is listed here in full so anyone can check it.
"""
import csv
from collections import Counter, defaultdict

rows = list(csv.DictReader(open('data/feedback-tagged.csv')))
by_id = {r['user_id']: r for r in rows}

# issue_key -> user_ids. Complaint rows not listed are their own issue.
ISSUES = {
    'Jones Act deadlines wrong': ['U12689', 'U13517'],
    'Privileged communications marked discoverable': ['U12834', 'U14144'],
    'Medical terms confused in case summaries (cervical/cerebral)': ['U13055', 'U14342'],
    'OCR fails on handwritten notes': ['U12778', 'U13913', 'U12412'],
    'Case merit scoring backwards': ['U12956', 'U14243'],
    'Intake AI overrates case merit': ['U12801', 'U12389'],
    'Settlement demand calculator depends on input order': ['U14837', 'U13418'],
    'Future medical expenses ignore inflation': ['U13550', 'U13286'],
    'Medical bill review false positives': ['U13187', 'U15167'],
    'Expert witness database outdated': ['U12478', 'U12567'],
    'Calendar sync double-books depositions': ['U13682', 'U13022'],
    'Settlement authority ignores client circumstances': ['U13781', 'U15068'],
}
issue_of = {uid: k for k, ids in ISSUES.items() for uid in ids}
for k, ids in ISSUES.items():
    for uid in ids:
        assert uid in by_id, uid
        assert by_id[uid]['sentiment'] in ('Negative', 'Mixed'), (uid, k)

# Root-cause reading: complaints where the product applied an outdated or
# wrong legal rule, procedure, or reference record. Claude's hypothesis, for research.
STALE_RULES_OR_DATA = ['U14474', 'U12989', 'U12689', 'U13517', 'U12478', 'U12567', 'U13583', 'U14771']

complaints = [r for r in rows if r['sentiment'] in ('Negative', 'Mixed')]
praise = [r for r in rows if r['sentiment'] == 'Positive']
def issue(r): return issue_of.get(r['user_id'], 'solo:' + r['user_id'])

def pct(a, b): return f'{a}/{b} ({round(100 * a / b)}%)' if b else 'n/a'

print(f'Rows: {len(rows)}, {min(r["feedback_date"] for r in rows)} to {max(r["feedback_date"] for r in rows)}')
print(f'Praise: {len(praise)}  Complaints: {len(complaints)} '
      f'(Negative {sum(r["sentiment"]=="Negative" for r in rows)}, Mixed {sum(r["sentiment"]=="Mixed" for r in rows)})')
distinct = {issue(r) for r in complaints}
print(f'Complaint mentions: {len(complaints)}  Distinct issues: {len(distinct)}  '
      f'(near-duplicate groups: {len(ISSUES)}, covering {sum(len(v) for v in ISSUES.values())} rows)')

def table(field, subset, label):
    print(f'\n{label}: mentions / distinct issues')
    m = Counter(r[field] for r in subset)
    d = defaultdict(set)
    for r in subset: d[r[field]].add(issue(r))
    for k, n in m.most_common(): print(f'  {k:34} {n:3} / {len(d[k])}')

table('theme', complaints, 'Complaints by theme')
table('severity', complaints, 'Complaints by severity')
table('product_area', complaints, 'Complaints by product area')

print('\nPraise by product area:')
for k, n in Counter(r['product_area'] for r in praise).most_common(): print(f'  {k:34} {n:3}')

print('\nSev1 rows:')
sev1 = [r for r in rows if r['severity'] == 'Sev1']
for r in sev1:
    print(f'  {r["user_id"]} {r["user_role"]:12} {r["firm_size"]:6} q={r["monthly_queries"]:>3} '
          f'{r["confidence"]:6} {issue(r)[:60]}')
print(f'  Sev1 mentions {len(sev1)}, distinct issues {len({issue(r) for r in sev1})}')
wo = [r for r in complaints if r['theme'] == 'Wrong output']
print(f'\nWrong output share of complaints: {pct(len(wo), len(complaints))}; '
      f'of Sev1+Sev2 complaints: {pct(len([r for r in wo if r["severity"] in ("Sev1","Sev2")]), len([r for r in complaints if r["severity"] in ("Sev1","Sev2")]))}')
print(f'Stale rule/reference-data reading: {len(STALE_RULES_OR_DATA)} rows, '
      f'{len({issue(by_id[u]) for u in STALE_RULES_OR_DATA})} issues, '
      f'Sev1 among them: {sum(by_id[u]["severity"]=="Sev1" for u in STALE_RULES_OR_DATA)}')

val = [r for r in rows if r['product_area'] == 'Case valuation and damages']
print(f'\nCase valuation and damages: {len(val)} rows, praise {sum(r["sentiment"]=="Positive" for r in val)}, '
      f'complaints {sum(r["sentiment"]!="Positive" for r in val)}, '
      f'Wrong output {sum(r["theme"]=="Wrong output" for r in val)}')

print('\nSegments (share of rows that are complaints / share that are Sev1 or Sev2):')
for field in ('user_role', 'firm_size'):
    for k in sorted({r[field] for r in rows}):
        seg = [r for r in rows if r[field] == k]
        c = [r for r in seg if r['sentiment'] != 'Positive']
        s12 = [r for r in seg if r['severity'] in ('Sev1', 'Sev2')]
        print(f'  {field}={k:13} n={len(seg):3}  complaints {pct(len(c), len(seg)):12}  Sev1/2 {pct(len(s12), len(seg))}')

q = sorted(int(r['monthly_queries']) for r in rows)
q75 = q[int(0.75 * len(q))]
heavy = [r for r in rows if int(r['monthly_queries']) >= q75]
light = [r for r in rows if int(r['monthly_queries']) < q75]
for name, seg in (('heavy (top quartile, >= %d queries/mo)' % q75, heavy), ('everyone else', light)):
    s12 = [r for r in seg if r['severity'] in ('Sev1', 'Sev2')]
    print(f'  {name:38} n={len(seg):3}  complaints {pct(sum(r["sentiment"]!="Positive" for r in seg), len(seg)):12}  Sev1/2 {pct(len(s12), len(seg))}')
for name, seg in (('tenure <= 6 months', [r for r in rows if int(r['months_subscribed']) <= 6]),
                  ('tenure > 6 months', [r for r in rows if int(r['months_subscribed']) > 6])):
    print(f'  {name:38} n={len(seg):3}  complaints {pct(sum(r["sentiment"]!="Positive" for r in seg), len(seg))}')

print('\nChannel vs sentiment:')
for ch in sorted({r['channel'] for r in rows}):
    seg = [r for r in rows if r['channel'] == ch]
    print(f'  {ch:14} n={len(seg):3}  praise {pct(sum(r["sentiment"]=="Positive" for r in seg), len(seg))}')
kw = [r for r in rows if any(w in r['feedback_text'].lower() for w in ('inaccura', 'incorrect'))]
print(f'\nRows containing "inaccurate"/"incorrect": {len(kw)}; of those tagged Sev1: {sum(r["severity"]=="Sev1" for r in kw)}; '
      f'all Sev1 rows: {len(sev1)}')
