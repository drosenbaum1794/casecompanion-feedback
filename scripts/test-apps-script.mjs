// Unit tests for the pure decision logic in apps-script/apply.gs.
// Loads config.gs and apply.gs into a sandbox (no Google services needed).
// Usage: node scripts/test-apps-script.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx = vm.createContext({ console });
for (const f of ['config.gs', 'apply.gs', 'edit.gs', 'alerts.gs', 'push.gs', 'sync.gs', 'dashboard_edit.gs']) {
  vm.runInContext(readFileSync(new URL(`../apps-script/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
}
const { validateSuggestion_, planRowWrite_, planEditRow_, selectAlertRows_, rowFingerprint_, planDashboardEdit_, cleanName_ } = ctx;

const taxonomy = {
  sentiment: new Set(['Positive', 'Negative', 'Mixed']),
  theme: new Set(['Wrong output', 'Bug or reliability', 'Value and wins', 'Other']),
  product_area: new Set(['Medical records', 'Deadlines and calendaring']),
  severity: new Set(['Sev1', 'Sev2', 'Sev3', 'None']),
  confidence: new Set(['High', 'Medium', 'Low']),
};
const okCtx = { taxonomy, feedbackMatches: 1, feedbackSyncError: '', pendingCount: 1 };
const good = {
  fb_id: 'fb_abc12345', sentiment: 'Negative', theme: 'Wrong output', product_area: 'Medical records',
  severity: 'Sev2', confidence: 'High', reason: 'OCR misreads handwriting.', suggested_theme: '',
  injection_suspected: 'FALSE', prompt_version: 'v2',
};
const meta = { taxonomyVersion: 'v1', now: 'NOW' };
const emptyRow = Object.fromEntries(
  ['sentiment', 'theme', 'product_area', 'severity', 'confidence', 'claude_reason', 'suggested_theme', 'status'].map((k) => [k, '']));

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ok  ${name}`); }

console.log('validateSuggestion_');
test('accepts a valid suggestion', () => assert.equal(validateSuggestion_(good, okCtx), null));
test('rejects a value outside the taxonomy', () =>
  assert.equal(validateSuggestion_({ ...good, severity: 'High' }, okCtx), "severity 'High' not in taxonomy"));
test('rejects near-miss spelling (exact match only)', () =>
  assert.match(validateSuggestion_({ ...good, theme: 'Wrong Output' }, okCtx), /theme 'Wrong Output' not in taxonomy/));
test('rejects unknown fb_id', () =>
  assert.match(validateSuggestion_(good, { ...okCtx, feedbackMatches: 0 }), /not found/));
test('rejects fb_id duplicated in Feedback', () =>
  assert.match(validateSuggestion_(good, { ...okCtx, feedbackSyncError: 'duplicate id' }), /more than once/));
test('rejects two pending suggestions for one row', () =>
  assert.match(validateSuggestion_(good, { ...okCtx, pendingCount: 2 }), /more than one unapplied/));
test('rejects praise with a severity', () =>
  assert.match(validateSuggestion_({ ...good, sentiment: 'Positive', theme: 'Value and wins' }, okCtx), /Positive feedback must have severity None/));
test('rejects Other without suggested_theme', () =>
  assert.match(validateSuggestion_({ ...good, theme: 'Other' }, okCtx), /suggested_theme/));
test('rejects a non-boolean injection flag', () =>
  assert.match(validateSuggestion_({ ...good, injection_suspected: 'maybe' }, okCtx), /TRUE or FALSE/));
test('does NOT reject Sev1 on a Bug (would delay an alert)', () =>
  assert.equal(validateSuggestion_({ ...good, theme: 'Bug or reliability', severity: 'Sev1' }, okCtx), null));

console.log('planRowWrite_');
test('empty row: writes all tags, Pending, originals, stamps', () => {
  const p = planRowWrite_(emptyRow, good, meta);
  assert.equal(p.outcome, 'Applied');
  assert.equal(p.writes.theme, 'Wrong output');
  assert.equal(p.writes.status, 'Pending');
  assert.equal(p.writes.claude_theme, 'Wrong output');
  assert.equal(p.writes.claude_reason, good.reason);
  assert.equal(p.writes.taxonomy_version, 'v1');
  assert.equal(p.writes.model, 'scheduled task');
  assert.equal(p.writes.tagged_at, 'NOW');
});
test('human-filled theme survives and outcome says so', () => {
  const p = planRowWrite_({ ...emptyRow, theme: 'Usability' }, good, meta);
  assert.equal('theme' in p.writes, false);
  assert.equal(p.outcome, 'Partly applied: human filled theme');
  assert.equal(p.writes.claude_theme, 'Wrong output'); // Claude's proposal still recorded in its own column
});
test('every tag human-filled: writes nothing at all', () => {
  const full = { ...emptyRow, sentiment: 'Mixed', theme: 'Usability', product_area: 'Medical records', severity: 'Sev3', confidence: 'High' };
  const p = planRowWrite_(full, good, meta);
  assert.deepEqual(Object.keys(p.writes), []);
  assert.equal(p.outcome, 'Not applied: a human already filled every tag');
});
test('existing status (Confirmed) is not touched', () => {
  const p = planRowWrite_({ ...emptyRow, status: 'Confirmed' }, good, meta);
  assert.equal('status' in p.writes, false);
});
test('suspected injection forces confidence Low', () => {
  const p = planRowWrite_(emptyRow, { ...good, injection_suspected: 'TRUE', confidence: 'High' }, meta);
  assert.equal(p.writes.confidence, 'Low');
  assert.equal(p.writes.injection_suspected, 'TRUE');
  assert.equal(p.writes.status, 'Pending');
});

console.log('planEditRow_ (human edits)');
const tax = {
  sentiment: ['Positive', 'Negative', 'Mixed'],
  theme: ['Wrong output', 'Usability'],
  product_area: ['Medical records'],
  severity: ['Sev1', 'Sev2', 'Sev3', 'None'],
  confidence: ['High', 'Medium', 'Low'],
};
const m = { who: 'rep@example.com', now: 'NOW' };
const tagged = {
  fb_id: 'fb_abc12345', feedback_text: 'x', sentiment: 'Negative', theme: 'Wrong output',
  product_area: 'Medical records', severity: 'Sev2', confidence: 'High', status: 'Pending',
  claude_sentiment: 'Negative', claude_theme: 'Wrong output', claude_product_area: 'Medical records',
  claude_severity: 'Sev2', alerted_at: '', sync_error: '',
};
test('changing a tag on a Pending row marks it Corrected and stamps the reviewer', () => {
  const p = planEditRow_({ ...tagged, theme: 'Usability' }, ['theme'], tax, m);
  assert.equal(p.writes.status, 'Corrected');
  assert.equal(p.writes.reviewed_by, 'rep@example.com');
  assert.equal(p.writes.reviewed_at, 'NOW');
});
test('re-selecting Claude\'s own value is not a correction', () => {
  const p = planEditRow_({ ...tagged }, ['theme'], tax, m);
  assert.equal('status' in p.writes, false);
});
test('editing tags back to Claude\'s values turns Corrected back to Pending', () => {
  const p = planEditRow_({ ...tagged, status: 'Corrected' }, ['severity'], tax, m);
  assert.equal(p.writes.status, 'Pending');
});
test('setting status Confirmed stamps the reviewer, nothing else', () => {
  const p = planEditRow_({ ...tagged, status: 'Confirmed' }, ['status'], tax, m);
  assert.equal(p.writes.reviewed_by, 'rep@example.com');
  assert.equal('status' in p.writes, false);
});
test('an Unsure row stays Unsure when a tag changes', () => {
  const p = planEditRow_({ ...tagged, status: 'Unsure', theme: 'Usability' }, ['theme'], tax, m);
  assert.equal('status' in p.writes, false);
});
test('a pasted typo is flagged invalid and blocks the sync', () => {
  const p = planEditRow_({ ...tagged, theme: 'Acuracy' }, ['theme'], tax, m);
  assert.deepEqual([...p.invalid], ['theme']);
  assert.equal(p.writes.sync_error, 'invalid value in theme');
});
test('fixing the typo clears the sync block', () => {
  const p = planEditRow_({ ...tagged, theme: 'Usability', sync_error: 'invalid value in theme' }, ['theme'], tax, m);
  assert.equal(p.writes.sync_error, '');
});
test('a duplicate-id error is never cleared by an edit', () => {
  const p = planEditRow_({ ...tagged, theme: 'Usability', sync_error: 'duplicate id' }, ['theme'], tax, m);
  assert.equal('sync_error' in p.writes, false);
});
test('re-setting Sev1 on an already-alerted row does not re-arm the alert', () => {
  const p = planEditRow_({ ...tagged, severity: 'Sev1', alerted_at: '11/6/2026' }, ['severity'], tax, m);
  assert.equal('alerted_at' in p.writes, false);
});
test('a row a human raises to Sev1 alerts, because it never alerted before', () => {
  assert.equal(selectAlertRows_([{ values: { ...tagged, severity: 'Sev1', alerted_at: '', status: 'Corrected' } }])[0].kind, 'Sev1');
});
test('a multi-column paste checks every edited field', () => {
  const p = planEditRow_({ ...tagged, theme: 'Nope', severity: 'High' }, ['theme', 'product_area', 'severity'], tax, m);
  assert.deepEqual([...p.invalid], ['theme', 'severity']);
});
test('an empty row is ignored', () => {
  assert.equal(planEditRow_({ fb_id: '', feedback_text: '' }, ['theme'], tax, m), null);
});

console.log('selectAlertRows_');
const row = (v) => ({ values: { fb_id: 'fb_aaaaaaaa', theme: 'Wrong output', severity: 'Sev2', confidence: 'High', status: 'Pending', alerted_at: '', sync_error: '', ...v } });
test('Sev1 alerts once', () => {
  assert.equal(selectAlertRows_([row({ severity: 'Sev1' })])[0].kind, 'Sev1');
  assert.equal(selectAlertRows_([row({ severity: 'Sev1', alerted_at: 'x' })]).length, 0);
});
test('Wrong output Sev2 at Low confidence is a possible Sev1', () => {
  assert.equal(selectAlertRows_([row({ confidence: 'Low' })])[0].kind, 'Possible Sev1');
  assert.equal(selectAlertRows_([row({ confidence: 'Low', theme: 'Bug or reliability' })]).length, 0);
});
test('Archived and untagged rows never alert', () => {
  assert.equal(selectAlertRows_([row({ severity: 'Sev1', status: 'Archived' }), row({ severity: 'Sev1', theme: '' })]).length, 0);
});

console.log('rowFingerprint_');
test('fingerprint changes when any synced field changes, ignores whitespace', () => {
  const h = ['a', 'b'];
  assert.equal(rowFingerprint_({ a: ' 1 ', b: '2' }, h), rowFingerprint_({ a: '1', b: '2' }, h));
  assert.notEqual(rowFingerprint_({ a: '1', b: '2' }, h), rowFingerprint_({ a: '1', b: '3' }, h));
  assert.notEqual(rowFingerprint_({ a: '12', b: '' }, h), rowFingerprint_({ a: '1', b: '2' }, h));
});

console.log('invalidTagFields_ (sync re-check after Undo)');
const { invalidTagFields_ } = ctx;
test('a fixed row has no invalid fields, so its flag clears', () =>
  assert.deepEqual([...invalidTagFields_({ ...tagged }, taxonomy)], []));
test('a row still holding a typo stays flagged', () =>
  assert.deepEqual([...invalidTagFields_({ ...tagged, theme: 'Acuracy' }, taxonomy)], ['theme']));
test('empty tags are not invalid (untagged rows)', () =>
  assert.deepEqual([...invalidTagFields_({ sentiment: '', theme: '', product_area: '', severity: '', confidence: '' }, taxonomy)], []));

console.log('planDashboardEdit_ (review from the dashboard)');
const taxArr = Object.fromEntries(Object.entries(taxonomy).map(([k, v]) => [k, [...v]]));
const dashRow = {
  fb_id: 'fb_abc12345', sentiment: 'Negative', theme: 'Wrong output', product_area: 'Medical records', severity: 'Sev2',
  claude_sentiment: 'Negative', claude_theme: 'Wrong output', claude_product_area: 'Medical records', claude_severity: 'Sev2',
  status: 'Pending', sync_error: '',
};
const seen = (r) => ({ sentiment: r.sentiment, theme: r.theme, product_area: r.product_area, severity: r.severity, status: r.status });
const dm = { now: 'NOW' };
test('confirm with Claude\'s tags: Confirmed, stamped, no tag writes', () => {
  const p = planDashboardEdit_(dashRow, { action: 'confirm', expected: seen(dashRow), who: 'Dan' }, taxArr, dm);
  assert.equal(p.ok, true);
  assert.deepEqual({ ...p.writes }, { status: 'Confirmed', reviewed_by: 'Dan (dashboard)', reviewed_at: 'NOW' });
});
test('correct a tag: writes it and marks Corrected', () => {
  const p = planDashboardEdit_(dashRow, { action: 'correct', expected: seen(dashRow), set: { severity: 'Sev1' } }, taxArr, dm);
  assert.equal(p.writes.severity, 'Sev1');
  assert.equal(p.writes.status, 'Corrected');
  assert.equal(p.writes.reviewed_by, 'Someone (dashboard)');
});
test('correcting back to Claude\'s exact tags is Confirmed, not Corrected', () => {
  const row = { ...dashRow, severity: 'Sev3', status: 'Corrected' };
  const p = planDashboardEdit_(row, { action: 'correct', expected: seen(row), set: { severity: 'Sev2' } }, taxArr, dm);
  assert.equal(p.writes.status, 'Confirmed');
});
test('unsure keeps the tags and sets Unsure', () => {
  const p = planDashboardEdit_(dashRow, { action: 'unsure', expected: seen(dashRow) }, taxArr, dm);
  assert.equal(p.writes.status, 'Unsure');
  assert.equal('severity' in p.writes, false);
});
test('refuses when the sheet changed since the dashboard loaded (never overwrite a human)', () => {
  const p = planDashboardEdit_({ ...dashRow, theme: 'Bug or reliability' },
    { action: 'correct', expected: seen(dashRow), set: { severity: 'Sev1' } }, taxArr, dm);
  assert.equal(p.ok, false);
  assert.equal(p.conflict, true);
});
test('refuses a status change made in the sheet meanwhile', () =>
  assert.equal(planDashboardEdit_({ ...dashRow, status: 'Confirmed' }, { action: 'unsure', expected: seen(dashRow) }, taxArr, dm).conflict, true));
test('refuses a value outside the taxonomy', () =>
  assert.match(planDashboardEdit_(dashRow, { action: 'correct', expected: seen(dashRow), set: { theme: 'Hacked' } }, taxArr, dm).error, /not a theme/));
test('refuses an unknown action', () =>
  assert.equal(planDashboardEdit_(dashRow, { action: 'delete', expected: seen(dashRow) }, taxArr, dm).ok, false));
test('refuses an archived row', () => {
  const row = { ...dashRow, status: 'Archived' };
  assert.match(planDashboardEdit_(row, { action: 'confirm', expected: seen(row) }, taxArr, dm).error, /archived/);
});
test('refuses an untagged row', () => {
  const row = { ...dashRow, sentiment: '', theme: '', product_area: '', severity: '', status: '' };
  assert.match(planDashboardEdit_(row, { action: 'confirm', expected: seen(row) }, taxArr, dm).error, /no tags yet/);
});
test('clears a stale invalid-value flag once every tag is valid', () => {
  const row = { ...dashRow, sync_error: 'invalid value in theme' };
  assert.equal(planDashboardEdit_(row, { action: 'confirm', expected: seen(row) }, taxArr, dm).writes.sync_error, '');
});
test('refuses a row with a duplicate-ID sync problem', () => {
  const row = { ...dashRow, sync_error: 'duplicate id' };
  assert.equal(planDashboardEdit_(row, { action: 'confirm', expected: seen(row) }, taxArr, dm).ok, false);
});
test('a typed name cannot start like a formula and is capped', () => {
  assert.equal(cleanName_('=HYPERLINK("x")'), 'HYPERLINK("x")');
  assert.equal(cleanName_('  @+-Dan'), 'Dan');
  assert.equal(cleanName_('x'.repeat(80)).length, 40);
  assert.equal(cleanName_(null), '');
});

console.log(`\n${passed} tests passed`);
