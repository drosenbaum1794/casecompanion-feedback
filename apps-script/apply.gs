/**
 * Applies Claude Suggestions to the Feedback tab. The agent proposes, this
 * code decides. Order of guards:
 *   1. Validate every value against the current Taxonomy tab (exact match).
 *   2. Re-locate the row by fb_id right before writing (rows can move).
 *   3. Re-read the row, and re-check each human cell just before writing it.
 *      A cell a human filled is skipped, and the human's value stands.
 *   4. Record the outcome in the suggestion's "applied" cell.
 *
 * validateSuggestion_ and planRowWrite_ are pure functions with no sheet
 * access, so they are unit-tested locally (scripts/test-apps-script.mjs).
 */

function applySuggestions_(feedback, run) {
  const sugSheet = getSheet_(CONFIG.TABS.SUGGESTIONS);
  const suggestions = readTable_(sugSheet, CONFIG.SUGGESTION_HEADERS);
  const pending = suggestions.rows.filter((r) => r.values.fb_id && !r.values.applied);
  if (!pending.length) return;

  const taxonomy = readTaxonomy_();
  const pendingCounts = countBy_(pending, (r) => r.values.fb_id);
  const feedbackById = {};
  for (const r of feedback.rows) {
    if (r.values.fb_id) (feedbackById[r.values.fb_id] = feedbackById[r.values.fb_id] || []).push(r);
  }

  for (const s of pending) {
    if (!hasTimeLeft_(run)) {
      run.notes.push('Time budget reached; remaining suggestions wait for the next run.');
      break;
    }
    const matches = feedbackById[s.values.fb_id] || [];
    const problem = validateSuggestion_(s.values, {
      taxonomy: taxonomy.values,
      feedbackMatches: matches.length,
      feedbackSyncError: matches.length === 1 ? matches[0].values.sync_error : '',
      pendingCount: pendingCounts[s.values.fb_id],
    });

    let outcome;
    if (problem) {
      outcome = `Rejected: ${problem}`;
      run.rejected++;
      if (matches.length === 1) bumpErrorCount_(feedback, matches[0].rowNum);
    } else {
      outcome = writeSuggestion_(feedback, s.values, taxonomy.version, run);
    }
    sugSheet.getRange(s.rowNum, suggestions.col.applied).setValue(outcome);
  }
}

/** Returns a reason string if the suggestion must be rejected, else null. */
function validateSuggestion_(s, ctx) {
  if (ctx.feedbackMatches === 0) return `fb_id "${s.fb_id}" not found in Feedback`;
  if (ctx.feedbackMatches > 1 || ctx.feedbackSyncError === 'duplicate id') {
    return `fb_id "${s.fb_id}" appears more than once in Feedback`;
  }
  if (ctx.pendingCount > 1) return `more than one unapplied suggestion for "${s.fb_id}"`;
  for (const field of CONFIG.TAG_FIELDS) {
    const allowed = ctx.taxonomy[field];
    if (!allowed || !allowed.has(s[field])) return `${field} '${s[field]}' not in taxonomy`;
  }
  const injection = String(s.injection_suspected).toUpperCase();
  if (injection !== 'TRUE' && injection !== 'FALSE') {
    return `injection_suspected '${s.injection_suspected}' must be TRUE or FALSE`;
  }
  if (s.sentiment === 'Positive' && s.severity !== 'None') {
    return `Positive feedback must have severity None, got '${s.severity}'`;
  }
  if (s.theme === 'Other' && !s.suggested_theme) return 'theme Other needs a suggested_theme';
  if (!s.reason) return 'reason is empty';
  // Deliberately NOT rejected: Sev1 on a theme other than Wrong output.
  // Rejecting would delay a possible Sev1 alert; a human reviews it instead.
  return null;
}

/**
 * Decides which cells to write, given the row as it is right now.
 * Never writes a human field that already has a value.
 * Returns { writes: { header: value }, outcome, wroteTags }.
 */
function planRowWrite_(current, s, meta) {
  const injection = String(s.injection_suspected).toUpperCase() === 'TRUE';
  const proposed = {
    sentiment: s.sentiment,
    theme: s.theme,
    product_area: s.product_area,
    severity: s.severity,
    // A suspected injection always lands in the review queue at Low confidence.
    confidence: injection ? 'Low' : s.confidence,
    claude_reason: s.reason,
    suggested_theme: s.suggested_theme,
  };

  const writes = {};
  const humanFilled = [];
  for (const [field, value] of Object.entries(proposed)) {
    if (!value) continue;
    if (current[field]) {
      if (CONFIG.TAG_FIELDS.includes(field)) humanFilled.push(field);
      continue;
    }
    writes[field] = value;
  }

  const wroteTags = CONFIG.TAG_FIELDS.filter((f) => f in writes);
  if (!wroteTags.length) {
    return { writes: {}, outcome: 'Not applied: a human already filled every tag', wroteTags };
  }

  if (!current.status) writes.status = 'Pending';
  for (const [tag, original] of Object.entries(CONFIG.CLAUDE_ORIGINAL)) writes[original] = s[tag];
  writes.injection_suspected = injection ? 'TRUE' : 'FALSE';
  writes.prompt_version = s.prompt_version;
  writes.taxonomy_version = meta.taxonomyVersion;
  writes.model = CONFIG.MODEL_LABEL;
  writes.tagged_at = meta.now;

  const outcome = humanFilled.length
    ? `Partly applied: human filled ${humanFilled.join(', ')}`
    : 'Applied';
  return { writes, outcome, wroteTags };
}

function writeSuggestion_(feedback, s, taxonomyVersion, run) {
  const rowNums = findRowsById_(feedback, s.fb_id);
  if (rowNums.length !== 1) {
    run.rejected++;
    return `Rejected: fb_id "${s.fb_id}" found ${rowNums.length} times at write time`;
  }
  const rowNum = rowNums[0];
  const plan = planRowWrite_(readRow_(feedback, rowNum), s, { taxonomyVersion, now: new Date() });
  if (!plan.wroteTags.length) {
    run.notApplied++;
    return plan.outcome;
  }

  const raced = [];
  for (const [field, value] of Object.entries(plan.writes)) {
    const cell = feedback.sheet.getRange(rowNum, feedback.col[field]);
    // Last-moment check: a human may have typed into this cell since the re-read.
    if (CONFIG.HUMAN_FIELDS.includes(field) && cell.getDisplayValue().trim()) {
      if (CONFIG.TAG_FIELDS.includes(field)) raced.push(field);
      continue;
    }
    cell.setValue(value);
  }

  if (raced.length) {
    run.partly++;
    return plan.outcome === 'Applied'
      ? `Partly applied: human filled ${raced.join(', ')}`
      : `${plan.outcome}, ${raced.join(', ')}`;
  }
  if (plan.outcome === 'Applied') run.applied++;
  else run.partly++;
  return plan.outcome;
}

function bumpErrorCount_(feedback, rowNum) {
  const cell = feedback.sheet.getRange(rowNum, feedback.col.error_count);
  cell.setValue(Number(cell.getDisplayValue() || 0) + 1);
}

/** Allowed values by field, and the single taxonomy version in use. */
function readTaxonomy_() {
  const t = readTable_(getSheet_(CONFIG.TABS.TAXONOMY), CONFIG.TAXONOMY_HEADERS);
  const values = {};
  const versions = new Set();
  for (const r of t.rows) {
    const { field, value, version } = r.values;
    if (!field || !value) continue;
    (values[field] = values[field] || new Set()).add(value);
    if (version) versions.add(version);
  }
  if (versions.size !== 1) {
    throw new Error(`Taxonomy tab must have exactly one version, found: ${[...versions].join(', ') || 'none'}`);
  }
  return { values, version: [...versions][0] };
}
