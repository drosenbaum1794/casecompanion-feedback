/**
 * The sync engine. One function, runSync_(), does the work. Entry points:
 *   syncOnTimer()  time-driven, every 10 minutes, skips quietly if busy
 *   syncNow()      "Feedback tools > Sync now" menu item (menu.gs)
 *
 * Guarantees: never overwrites a human, never runs twice at once, never
 * loses a row silently. Every run is logged to the Health tab.
 *
 * Day 1 steps: lock, read by header, assign IDs, flag duplicate IDs,
 * apply Claude Suggestions. Day 2 adds fingerprinting, the Supabase push,
 * the delete guard, the tagger check, and alerts.
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
    errors: [],
    notes: [],
  };

  try {
    const feedback = readTable_(getSheet_(CONFIG.TABS.FEEDBACK), CONFIG.FEEDBACK_HEADERS);
    assignIds_(feedback, run);
    if (hasTimeLeft_(run)) applySuggestions_(feedback, run);
  } catch (e) {
    run.errors.push(e && e.message ? e.message : String(e));
  } finally {
    try {
      logHealth_(run);
    } catch (e) {
      console.error(`Health log failed: ${e}`);
    }
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

/** New rows get a follow_up checkbox; the template stops at the last data row. */
function ensureCheckbox_(feedback, rowNum) {
  const cell = feedback.sheet.getRange(rowNum, feedback.col.follow_up);
  if (!cell.getDataValidation()) cell.insertCheckboxes();
}

/**
 * Writes the run to the Health tab: the last 20 runs, newest first, plus the
 * rows that keep getting rejected suggestions.
 */
function logHealth_(run) {
  const sheet = getSheet_(CONFIG.TABS.HEALTH);
  const result = run.errors.length ? 'ERROR' : 'OK';
  const notes = [...run.errors.map((e) => `ERROR: ${e}`), ...run.notes].join(' | ');
  const newRow = [
    run.startedAt, run.trigger, result, run.idsAssigned, run.applied, run.partly,
    run.rejected, run.duplicateIds, ((Date.now() - run.startMs) / 1000).toFixed(1),
    notes || (run.idsAssigned + run.applied + run.partly + run.rejected ? '' : 'no changes'),
  ];
  const keep = CONFIG.HEALTH_KEEP_RUNS;
  const old = sheet.getRange(2, 1, keep, 10).getValues().filter((r) => r[0] !== '');
  const log = [newRow, ...old].slice(0, keep);
  while (log.length < keep) log.push(new Array(10).fill(''));
  sheet.getRange(2, 1, keep, 10).setValues(log);

  // Rows whose suggestions were rejected 3+ times go here instead of looping forever.
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
