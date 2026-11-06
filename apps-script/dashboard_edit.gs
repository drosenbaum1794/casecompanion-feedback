/**
 * Review from the dashboard. The sheet stays the source of truth: the
 * dashboard POSTs a decision here, this writes it to the Feedback tab, then
 * runs a sync so Supabase (and the dashboard) catch up in seconds.
 *
 * Open by design, for the demo: no sign-in. What keeps it safe without one:
 *   - only taxonomy values can be written, plus an optional, cleaned name
 *   - the row must still hold the values the dashboard showed (else "changed, refresh")
 *   - a global rate limit (DASHBOARD_EDITS_PER_MINUTE)
 *   - an off switch: Feedback tools > Admin: turn dashboard editing off
 * Script writes don't fire onEdit, so this stamps reviewed_by, reviewed_at
 * and status itself, with the same meaning a sheet edit has.
 *
 * Request body (sent as text/plain so the browser skips a CORS preflight):
 *   { action: 'confirm' | 'correct' | 'unsure', fb_id, expected: {sentiment,
 *     theme, product_area, severity, status}, set: {...tags}, who }
 */

const DASHBOARD_EDITS_PER_MINUTE = 30;
const DASHBOARD_EDIT_FIELDS = ['sentiment', 'theme', 'product_area', 'severity'];

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    return json_({ ok: false, error: 'The request was not valid JSON.' });
  }
  if (PropertiesService.getScriptProperties().getProperty('DASHBOARD_EDITS') === 'off') {
    return json_({ ok: false, error: 'Editing from the dashboard is turned off. Make the change in the sheet.' });
  }
  if (!underRateLimit_()) {
    return json_({ ok: false, error: 'Too many edits in the last minute. Wait a moment and try again.' });
  }

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'The sheet is busy syncing. Try again in a few seconds.' });
  let result;
  try {
    result = applyDashboardEdit_(req);
  } catch (err) {
    result = { ok: false, error: `Could not save: ${err && err.message ? err.message : err}` };
  } finally {
    lock.releaseLock();
  }
  if (!result.ok) return json_(result);

  // Push to Supabase now rather than waiting for the 10-minute timer.
  const run = runSync_('dashboard');
  if (run.busy) result.sync = 'A sync is already running; it will carry this change.';
  else if (run.errors.length) result.sync = `Saved to the sheet. The sync reported: ${run.errors[0]}`;
  else result.sync = 'Saved to the sheet and synced.';
  result.synced = !run.busy && !run.errors.length;
  return json_(result);
}

function applyDashboardEdit_(req) {
  const id = String((req && req.fb_id) || '').trim();
  if (!/^fb_[a-z0-9]{8}$/.test(id)) return { ok: false, error: 'That is not a valid feedback ID.' };

  const sheet = getSheet_(CONFIG.TABS.FEEDBACK);
  const width = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map((h) => String(h).trim());
  const col = {};
  headers.forEach((h, i) => { if (h && !(h in col)) col[h] = i + 1; });
  const needed = ['fb_id', 'status', 'reviewed_by', 'reviewed_at', 'sync_error', ...DASHBOARD_EDIT_FIELDS,
    ...DASHBOARD_EDIT_FIELDS.map((f) => `claude_${f}`)];
  const missing = needed.filter((h) => !(h in col));
  if (missing.length) return { ok: false, error: `The Feedback tab is missing ${missing.join(', ')}.` };

  const hits = sheet.getRange(2, col.fb_id, Math.max(sheet.getLastRow() - 1, 1), 1)
    .createTextFinder(id).matchEntireCell(true).findAll().map((r) => r.getRow());
  if (hits.length !== 1) return { ok: false, error: hits.length ? `${id} appears more than once in the sheet.` : `${id} is not in the sheet.` };
  const rowNum = hits[0];
  const values = sheet.getRange(rowNum, 1, 1, width).getDisplayValues()[0];
  const current = {};
  for (const [h, c] of Object.entries(col)) current[h] = String(values[c - 1]).trim();

  const plan = planDashboardEdit_(current, req, cachedTaxonomy_(), { now: new Date() });
  if (!plan.ok) return plan;
  for (const [field, value] of Object.entries(plan.writes)) {
    const cell = sheet.getRange(rowNum, col[field]);
    if (value === '') cell.clearContent();
    else cell.setValue(value);
  }
  return { ok: true, fb_id: id, status: plan.writes.status, row: rowNum };
}

/**
 * Decides what a dashboard decision writes. Pure, so it is unit-tested.
 * Status follows the sheet's meaning: tags that differ from Claude's are
 * Corrected; tags equal to Claude's are Confirmed; Unsure stays in the queue.
 */
function planDashboardEdit_(current, req, taxonomy, meta) {
  const action = req && req.action;
  if (!['confirm', 'correct', 'unsure'].includes(action)) return { ok: false, error: 'Unknown action.' };
  if (current.status === 'Archived') return { ok: false, error: 'This row is archived. Change it in the sheet.' };
  if (current.sync_error && !current.sync_error.startsWith('invalid value')) {
    return { ok: false, error: `This row has a sync problem (${current.sync_error}). Fix it in the sheet.` };
  }

  // Never overwrite a change the dashboard didn't see.
  const expected = (req && req.expected) || {};
  for (const f of [...DASHBOARD_EDIT_FIELDS, 'status']) {
    if (String(expected[f] == null ? '' : expected[f]).trim() !== current[f]) {
      return { ok: false, conflict: true, error: 'This row changed in the sheet since the dashboard loaded it. Refresh and try again.' };
    }
  }

  const tags = {};
  for (const f of DASHBOARD_EDIT_FIELDS) tags[f] = current[f];
  if (action === 'correct') {
    const set = (req && req.set) || {};
    for (const f of DASHBOARD_EDIT_FIELDS) {
      if (!(f in set)) continue;
      const v = String(set[f] == null ? '' : set[f]).trim();
      if (!(taxonomy[f] || []).includes(v)) return { ok: false, error: `"${v}" is not a ${f.replace('_', ' ')} in the taxonomy.` };
      tags[f] = v;
    }
  }
  for (const f of DASHBOARD_EDIT_FIELDS) {
    if (!tags[f]) return { ok: false, error: 'This row has no tags yet. Wait for the tagger, or tag it in the sheet.' };
  }

  const writes = {};
  for (const f of DASHBOARD_EDIT_FIELDS) if (tags[f] !== current[f]) writes[f] = tags[f];
  if (action === 'unsure') writes.status = 'Unsure';
  else writes.status = DASHBOARD_EDIT_FIELDS.some((f) => tags[f] !== current[`claude_${f}`]) ? 'Corrected' : 'Confirmed';
  writes.reviewed_by = `${cleanName_(req.who) || 'Someone'} (dashboard)`;
  writes.reviewed_at = meta.now;
  if (current.sync_error) writes.sync_error = ''; // only a stale "invalid value": every tag is valid now
  return { ok: true, writes };
}

/** A typed name goes into a cell, so it can't start like a formula and stays short. */
function cleanName_(s) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').replace(/^[\s=+\-@']+/, '').trim().slice(0, 40);
}

function underRateLimit_() {
  const cache = CacheService.getScriptCache();
  const key = `dash_edits_${Math.floor(Date.now() / 60000)}`;
  const n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), 120);
  return n <= DASHBOARD_EDITS_PER_MINUTE;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function turnDashboardEditingOff() {
  PropertiesService.getScriptProperties().setProperty('DASHBOARD_EDITS', 'off');
  SpreadsheetApp.getUi().alert('Editing from the dashboard is off. The dashboard can still be viewed.');
}

function turnDashboardEditingOn() {
  PropertiesService.getScriptProperties().deleteProperty('DASHBOARD_EDITS');
  SpreadsheetApp.getUi().alert('Editing from the dashboard is on. Anyone with the dashboard link can confirm or correct tags.');
}
