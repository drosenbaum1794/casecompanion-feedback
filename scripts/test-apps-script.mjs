// Unit tests for the pure decision logic in apps-script/apply.gs.
// Loads config.gs and apply.gs into a sandbox (no Google services needed).
// Usage: node scripts/test-apps-script.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx = vm.createContext({ console });
for (const f of ['config.gs', 'apply.gs']) {
  vm.runInContext(readFileSync(new URL(`../apps-script/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
}
const { validateSuggestion_, planRowWrite_ } = ctx;

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

console.log(`\n${passed} tests passed`);
