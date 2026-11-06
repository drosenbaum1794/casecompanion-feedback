/**
 * Installable onEdit handler (installed by installTriggers). It never syncs;
 * it only stamps fields so the next sync carries the human's intent:
 *   - a tag changed on a Pending or Confirmed row  -> status Corrected
 *   - a tag or status changed                      -> reviewed_by, reviewed_at
 *   - a value outside the taxonomy (pastes skip    -> cell turns red with a note,
 *     dropdown validation)                            sync_error blocks the push
 *   - severity raised to Sev1                      -> alerts on the next sync (alerted_at is empty)
 * Loops over every cell in the edited range, so multi-cell pastes are handled.
 * Script writes do not fire onEdit, so Claude's tags never count as human edits.
 */

const INVALID_NOTE_PREFIX = 'Not in the taxonomy:';

function onFeedbackEdit(e) {
  const range = e && e.range;
  if (!range) return;
  const sheet = range.getSheet();
  if (sheet.getName() !== CONFIG.TABS.FEEDBACK || range.getLastRow() < 2) return;

  const width = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map((h) => String(h).trim());
  const col = {};
  headers.forEach((h, i) => { if (h && !(h in col)) col[h] = i + 1; });
  const needed = ['fb_id', 'feedback_text', 'status', 'reviewed_by', 'reviewed_at', 'sync_error', 'alerted_at',
    ...CONFIG.TAG_FIELDS, 'claude_sentiment', 'claude_theme', 'claude_product_area', 'claude_severity'];
  if (needed.some((h) => !(h in col))) return; // a renamed header: the sync will abort and alert

  const edited = headers.slice(range.getColumn() - 1, range.getLastColumn());
  if (!edited.some((h) => CONFIG.TAG_FIELDS.includes(h) || h === 'status')) return;

  const firstRow = Math.max(range.getRow(), 2);
  const n = range.getLastRow() - firstRow + 1;
  const values = sheet.getRange(firstRow, 1, n, width).getDisplayValues();
  const taxonomy = cachedTaxonomy_();
  const meta = { who: editorEmail_(e), now: new Date() };

  for (let i = 0; i < n; i++) {
    const rowNum = firstRow + i;
    const current = {};
    for (const [h, c] of Object.entries(col)) current[h] = String(values[i][c - 1]).trim();
    const plan = planEditRow_(current, edited, taxonomy, meta);
    if (!plan) continue;
    for (const field of plan.invalid) {
      sheet.getRange(rowNum, col[field]).setBackground('#f4c7c3')
        .setNote(`${INVALID_NOTE_PREFIX} "${current[field]}". Pick a value from the dropdown. This row won't sync until it's fixed.`);
    }
    for (const field of plan.valid) {
      const cell = sheet.getRange(rowNum, col[field]);
      if (String(cell.getNote()).startsWith(INVALID_NOTE_PREFIX)) cell.setBackground(null).clearNote();
    }
    for (const [field, value] of Object.entries(plan.writes)) {
      const cell = sheet.getRange(rowNum, col[field]);
      if (value === '') cell.clearContent();
      else cell.setValue(value);
    }
  }
}

/**
 * Decides what to stamp on one edited row. Pure, so it is unit-tested.
 * current: the row's values after the edit. edited: headers in the edited range.
 * Returns null when the row has no data, else { writes, invalid, valid }.
 */
function planEditRow_(current, edited, taxonomy, meta) {
  if (!current.fb_id && !current.feedback_text) return null;
  const writes = {};
  const invalid = [];
  const valid = [];

  for (const field of CONFIG.TAG_FIELDS) {
    if (!edited.includes(field)) continue;
    const value = current[field];
    if (value && !(taxonomy[field] || []).includes(value)) invalid.push(field);
    else valid.push(field);
  }
  const statusEdited = edited.includes('status');
  const statusInvalid = statusEdited && current.status && !CONFIG.STATUS_VALUES.includes(current.status);
  if (statusInvalid) invalid.push('status');
  else if (statusEdited) valid.push('status');

  let reviewed = false;
  const tagEdited = CONFIG.CORRECTION_FIELDS.some((f) => edited.includes(f));
  if (tagEdited) {
    const differsFromClaude = CONFIG.CORRECTION_FIELDS.some((f) => current[f] !== current[`claude_${f}`]);
    if (differsFromClaude && ['', 'Pending', 'Confirmed'].includes(current.status)) writes.status = 'Corrected';
    // Edited back to exactly Claude's tags: nothing is corrected any more, so it needs review again.
    if (!differsFromClaude && current.status === 'Corrected') writes.status = 'Pending';
    reviewed = true;
  }
  if (statusEdited && ['Confirmed', 'Corrected', 'Unsure'].includes(current.status)) reviewed = true;
  if (reviewed) {
    writes.reviewed_by = meta.who || '';
    writes.reviewed_at = meta.now;
  }

  // alerted_at is never cleared here. A row a human raises to Sev1 has never
  // alerted, so it alerts on the next sync anyway; clearing it on every
  // "set to Sev1" re-sent alerts when a paste or undo put back an existing Sev1.

  if (invalid.length) writes.sync_error = `invalid value in ${invalid.join(', ')}`;
  else if (current.sync_error.startsWith('invalid value')) writes.sync_error = '';

  return { writes, invalid, valid };
}

function cachedTaxonomy_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('taxonomy_v');
  if (hit) return JSON.parse(hit);
  const t = readTaxonomy_().values;
  const plain = {};
  for (const [field, set] of Object.entries(t)) plain[field] = [...set];
  cache.put('taxonomy_v', JSON.stringify(plain), 600);
  return plain;
}

function editorEmail_(e) {
  try {
    if (e && e.user && e.user.getEmail()) return e.user.getEmail();
    return Session.getActiveUser().getEmail();
  } catch (err) {
    return '';
  }
}
