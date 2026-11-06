/**
 * The sync engine. One function, runSync_(), does the work. Entry points:
 *   syncOnTimer()  time-driven, every 10 minutes, skips quietly if busy
 *   syncNow()      "Feedback tools > Sync now" menu item (menu.gs)
 *   onFeedbackEdit (edit.gs) never syncs; it only stamps fields.
 *
 * Guarantees: never overwrites a human, never runs twice at once, never
 * loses a row silently. Every run is logged to the Health tab.
 *
 * Steps: lock; read by header (abort if a header is missing); assign IDs;
 * apply Claude Suggestions; send Sev1 alerts; push changed rows to Supabase;
 * reconcile IDs (delete guard); push the taxonomy if it changed; check that
 * the tagging task is still running; log the run.
 */

function syncOnTimer() {
  runSync_('timer');
}

function runSync_(trigger) {
  const lock = LockService.getDocumentLock();
  const waitMs = trigger === 'menu' ? CONFIG.MENU_LOCK_WAIT_MS : 0;
  if (!lock.tryLock(waitMs)) return { busy: true };

  const run = {
    trigger,
    startedAt: new Date(),
    startMs: Date.now(),
    idsAssigned: 0,
    duplicateIds: 0,
    applied: 0,
    partly: 0,
    notApplied: 0,
    rejected: 0,
    alerts: 0,
    pushed: 0,
    deactivated: 0,
    networkCalls: 0,
    errors: [],
    notes: [],
  };

  const step = (name, fn) => {
    if (!hasTimeLeft_(run)) {
      run.notes.push(`Time budget reached before "${name}"; it runs next sync.`);
      return;
    }
    try {
      fn();
    } catch (e) {
      run.errors.push(`${name}: ${e && e.message ? e.message : e}`);
    }
  };

  try {
    // A missing or renamed header aborts the whole run before anything changes.
    const feedback = readTable_(getSheet_(CONFIG.TABS.FEEDBACK), CONFIG.FEEDBACK_HEADERS);
    step('assign IDs', () => assignIds_(feedback, run));
    step('re-check invalid values', () => revalidateFlaggedRows_(feedback, run));
    step('apply suggestions', () => applySuggestions_(feedback, run));
    step('Sev1 alerts', () => sendAlerts_(run));
    step('push to Supabase', () => pushChanges_(run));
    step('taxonomy', () => pushTaxonomyIfChanged_(run));
    step('tagger check', () => checkTagger_(run));
  } catch (e) {
    run.errors.push(e && e.message ? e.message : String(e));
  } finally {
    try { logHealth_(run); } catch (e) { console.error(`Health log failed: ${e}`); }
    try { logRunToSupabase_(run); } catch (e) { console.error(`Supabase run log failed: ${e}`); }
    try { alertOnFailure_(run); } catch (e) { console.error(`Failure alert failed: ${e}`); }
    lock.releaseLock();
  }
  return run;
}

function hasTimeLeft_(run) {
  return Date.now() - run.startMs < CONFIG.MAX_RUNTIME_MS;
}

/**
 * Gives every row with feedback text an fb_id. IDs must exist before the
 * tagging task can see a row. Duplicate IDs (from a copied row) are not
 * fixed automatically: both rows get sync_error "duplicate id" and are
 * skipped until a human resolves it.
 */
function assignIds_(feedback, run) {
  const { sheet, col, rows } = feedback;
  const counts = countBy_(rows.filter((r) => r.values.fb_id), (r) => r.values.fb_id);
  const taken = new Set(Object.keys(counts));

  for (const r of rows) {
    if (r.values.fb_id || !r.values.feedback_text) continue;
    if (!hasTimeLeft_(run)) {
      run.notes.push('Time budget reached while assigning IDs; the rest get IDs next run.');
      break;
    }
    const cell = sheet.getRange(r.rowNum, col.fb_id);
    if (cell.getDisplayValue().trim()) continue; // filled since the read
    const id = newId_(taken);
    taken.add(id);
    cell.setValue(id);
    r.values.fb_id = id;
    ensureCheckbox_(feedback, r.rowNum);
    run.idsAssigned++;
  }

  for (const r of rows) {
    const id = r.values.fb_id;
    if (!id) continue;
    const isDuplicate = counts[id] > 1;
    if (isDuplicate) run.duplicateIds++;
    if (isDuplicate && r.values.sync_error !== 'duplicate id') {
      sheet.getRange(r.rowNum, col.sync_error).setValue('duplicate id');
      r.values.sync_error = 'duplicate id';
    } else if (!isDuplicate && r.values.sync_error === 'duplicate id') {
      sheet.getRange(r.rowNum, col.sync_error).clearContent();
      r.values.sync_error = '';
    }
  }
  if (run.duplicateIds) {
    run.notes.push(`${run.duplicateIds} rows share an fb_id; fix them by hand (see sync_error).`);
  }
}

/**
 * A pasted typo sets sync_error "invalid value in ..." (edit.gs). If the
 * typo is then removed in a way that doesn't fire onEdit (Undo, or a script),
 * the flag would stick and the row would never sync. Every sync re-checks
 * flagged rows and clears the flag, red fill, and note once every tag is valid.
 * Found by test scenario 6.
 */
function revalidateFlaggedRows_(feedback, run) {
  const flagged = feedback.rows.filter((r) => String(r.values.sync_error || '').startsWith('invalid value'));
  if (!flagged.length) return;
  const taxonomy = readTaxonomy_().values;
  for (const r of flagged) {
    if (invalidTagFields_(r.values, taxonomy).length) continue;
    feedback.sheet.getRange(r.rowNum, feedback.col.sync_error).clearContent();
    r.values.sync_error = '';
    for (const f of CONFIG.TAG_FIELDS) {
      const cell = feedback.sheet.getRange(r.rowNum, feedback.col[f]);
      if (String(cell.getNote()).startsWith(INVALID_NOTE_PREFIX)) cell.setBackground(null).clearNote();
    }
    run.notes.push(`${r.values.fb_id}: invalid value was fixed, row syncs again.`);
  }
}

/** Tag fields whose value is filled but not in the taxonomy. Pure, so it is unit-tested. */
function invalidTagFields_(values, taxonomy) {
  return CONFIG.TAG_FIELDS.filter((f) => values[f] && !(taxonomy[f] && taxonomy[f].has(values[f])));
}

/** New rows get a follow_up checkbox; the template stops at the last data row. */
function ensureCheckbox_(feedback, rowNum) {
  const cell = feedback.sheet.getRange(rowNum, feedback.col.follow_up);
  if (!cell.getDataValidation()) cell.insertCheckboxes();
}

function runSummary_(run) {
  return run.idsAssigned + run.applied + run.partly + run.rejected + run.alerts + run.pushed + run.deactivated;
}

/**
 * Writes the run to the Health tab: the last 20 runs, newest first, plus the
 * rows that need a human (repeated rejections, duplicate IDs, invalid values).
 */
function logHealth_(run) {
  const sheet = getSheet_(CONFIG.TABS.HEALTH);
  const width = 11;
  const result = run.errors.length ? 'ERROR' : 'OK';
  const notes = [...run.errors.map((e) => `ERROR: ${e}`), ...run.notes].join(' | ');
  const newRow = [
    run.startedAt, run.trigger, result, run.idsAssigned, run.applied, run.partly, run.rejected,
    run.pushed, run.alerts, ((Date.now() - run.startMs) / 1000).toFixed(1),
    notes || (runSummary_(run) ? '' : 'no changes'),
  ];
  const keep = CONFIG.HEALTH_KEEP_RUNS;
  const old = sheet.getRange(2, 1, keep, width).getValues().filter((r) => r[0] !== '');
  const log = [newRow, ...old].slice(0, keep);
  while (log.length < keep) log.push(new Array(width).fill(''));
  sheet.getRange(2, 1, keep, width).setValues(log);

  const attention = [];
  try {
    const fb = readTable_(getSheet_(CONFIG.TABS.FEEDBACK), ['fb_id', 'error_count', 'sync_error']);
    for (const r of fb.rows) {
      const n = Number(r.values.error_count || 0);
      if (n >= CONFIG.MAX_REJECTIONS) attention.push([r.values.fb_id, `${n} rejected suggestions`]);
      else if (r.values.sync_error) attention.push([r.values.fb_id || `(row ${r.rowNum})`, r.values.sync_error]);
    }
  } catch (e) {
    attention.push(['(unreadable)', String(e.message || e)]);
  }
  const size = CONFIG.HEALTH_ATTENTION_ROWS;
  const block = attention.slice(0, size);
  while (block.length < size) block.push(['', '']);
  sheet.getRange(2, 12, size, 2).setValues(block);
}
