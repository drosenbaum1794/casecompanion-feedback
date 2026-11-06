// Scores a tagging run against hand labels.
// Usage: node scripts/eval-score.mjs v1 [labels-file]
// Reads data/eval-labels.csv (or the given file) and data/eval-runs/<version>.csv.
// Prints per-field agreement, Sev1 recall and precision, agreement by confidence band,
// and near-duplicate pair consistency for both the labels and the run.
import { readFileSync } from 'node:fs';

const FIELDS = ['sentiment', 'theme', 'product_area', 'severity'];
// Near-duplicate pairs in the eval set: same issue, different user, different wording.
const PAIRS = [
  ['U12689', 'U13517'], ['U12834', 'U14144'], ['U13055', 'U14342'], ['U12778', 'U13913'],
  ['U12956', 'U14243'], ['U14837', 'U13418'], ['U13550', 'U13286'], ['U12267', 'U12298'],
];

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const version = process.argv[2];
if (!version) { console.error('Usage: node scripts/eval-score.mjs <version> [labels-file]'); process.exit(1); }
const labelsFile = process.argv[3] ?? 'data/eval-labels.csv';
const labels = new Map(parseCsv(readFileSync(labelsFile, 'utf8')).map((r) => [r.user_id, r]));
const run = new Map(parseCsv(readFileSync(`data/eval-runs/${version}.csv`, 'utf8')).map((r) => [r.user_id, r]));

const missingRun = [...labels.keys()].filter((id) => !run.has(id));
if (missingRun.length) console.log(`WARNING: run is missing ${missingRun.length} rows: ${missingRun.join(', ')}`);

const pct = (a, b) => (b ? `${a}/${b} (${Math.round((100 * a) / b)}%)` : 'n/a');

console.log(`\nRun ${version} vs ${labelsFile}\n`);
console.log('Per-field agreement (rows where the label is blank are skipped):');
for (const f of FIELDS) {
  let hit = 0, n = 0;
  for (const [id, l] of labels) {
    const r = run.get(id); if (!r || !l[f]) continue;
    n++; if (r[f] === l[f]) hit++;
  }
  console.log(`  ${f.padEnd(13)} ${pct(hit, n)}`);
}

let allHit = 0, allN = 0;
for (const [id, l] of labels) {
  const r = run.get(id); if (!r || FIELDS.some((f) => !l[f])) continue;
  allN++; if (FIELDS.every((f) => r[f] === l[f])) allHit++;
}
console.log(`  all 4 fields  ${pct(allHit, allN)}`);

const labelSev1 = [...labels].filter(([, l]) => l.severity === 'Sev1').map(([id]) => id);
const runSev1 = [...run].filter(([, r]) => r.severity === 'Sev1').map(([id]) => id);
const caught = labelSev1.filter((id) => run.get(id)?.severity === 'Sev1');
console.log(`\nSev1 recall:    ${pct(caught.length, labelSev1.length)}  (labeled Sev1: ${labelSev1.join(', ') || 'none'})`);
console.log(`Sev1 precision: ${pct(runSev1.filter((id) => labels.get(id)?.severity === 'Sev1').length, runSev1.length)}  (run Sev1: ${runSev1.join(', ') || 'none'})`);

console.log('\nSeverity confusion (rows = label, columns = run):');
const SEV = ['Sev1', 'Sev2', 'Sev3', 'None'];
console.log('  ' + 'label\\run'.padEnd(10) + SEV.map((s) => s.padStart(6)).join(''));
for (const ls of [...SEV, '']) {
  const ids = [...labels].filter(([, l]) => l.severity === ls).map(([id]) => id);
  if (!ids.length) continue;
  console.log('  ' + (ls || '(blank)').padEnd(10) + SEV.map((rs) => String(ids.filter((id) => run.get(id)?.severity === rs).length).padStart(6)).join(''));
}

console.log('\nAgreement by confidence band (all 4 fields match, labeled rows only):');
for (const band of ['High', 'Medium', 'Low']) {
  let hit = 0, n = 0;
  for (const [id, r] of run) {
    const l = labels.get(id); if (!l || r.confidence !== band || FIELDS.some((f) => !l[f])) continue;
    n++; if (FIELDS.every((f) => r[f] === l[f])) hit++;
  }
  console.log(`  ${band.padEnd(7)} ${pct(hit, n)}`);
}

console.log('\nNear-duplicate pair consistency (both copies get identical tags on a field):');
for (const [who, src] of [['labels', labels], [`run ${version}`, run]]) {
  const parts = FIELDS.map((f) => {
    const same = PAIRS.filter(([a, b]) => src.get(a)?.[f] && src.get(a)?.[f] === src.get(b)?.[f]).length;
    return `${f} ${same}/${PAIRS.length}`;
  });
  console.log(`  ${who.padEnd(9)} ${parts.join(', ')}`);
}

console.log('\nDisagreements:');
for (const [id, l] of labels) {
  const r = run.get(id); if (!r) continue;
  const diffs = FIELDS.filter((f) => l[f] !== r[f]).map((f) => `${f}: label "${l[f] || '(blank)'}" vs run "${r[f]}"`);
  if (diffs.length) console.log(`  ${id} [${r.confidence}] ${diffs.join('; ')}`);
}
