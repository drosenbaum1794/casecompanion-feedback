/**
 * Review from the dashboard. The sheet stays the source of truth: the
 * dashboard POSTs a decision here, this writes it to the Feedback tab, then
 * pushes just that row to Supabase so the dashboard catches up in seconds.
 * (A full sync took 5 to 7 seconds; one row is a single call.) Everything
 * else, like suggestions, the delete guard, and health logs, stays with the
 * 10-minute sync, which also retries this row if the quick push failed.
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
    if (result.ok) {
      SpreadsheetApp.flush();
      // Same lock as the sync, so the two never write last_synced_hash at once.
      try {
        result.synced = pushOneRow_(result.fb_id);
      } catch (err) {
        result.synced = false;
        console.error(`Quick push of ${result.fb_id} failed: ${err}`);
      }
      // A row raised to Sev1 alerts now, as the next sync would.
      if (result.severity === 'Sev1') {
        try { sendAlerts_({ alerts: 0, notes: [], errors: [] }); } catch (err) { console.error(`Sev1 alert failed: ${err}`); }
      }
      result.sync = result.synced ? 'Saved to the sheet and synced.' : 'Saved to the sheet. It reaches the dashboard on the next sync, within 10 minutes.';
    }
  } catch (err) {
    result = { ok: false, error: `Could not save: ${err && err.message ? err.message : err}` };
  } finally {
    lock.releaseLock();
  }
  return json_(result);
}

/**
 * Pushes one row to Supabase, with the same fingerprint and payload as the
 * sync. last_synced_hash is written only if Supabase confirms it stored the
 * row, so a failed push is retried by the next sync. Returns true if synced.
 */
function pushOneRow_(fbId) {
  if (!PropertiesService.getScriptProperties().getProperty('INGEST_SECRET')) return false;
  const table = readTableWithRaw_(getSheet_(CONFIG.TABS.FEEDBACK), CONFIG.FEEDBACK_HEADERS);
  const hits = table.rows.filter((r) => r.values.fb_id === fbId);
  if (hits.length !== 1) return false;
  const r = hits[0];
  if (r.values.sync_error || !r.values.feedback_text) return false;
  const hashHeaders = CONFIG.FEEDBACK_HEADERS.filter((h) => !CONFIG.HASH_EXCLUDE.includes(h));
  const hash = sha256Hex_(rowFingerprint_(r.values, hashHeaders));
  if (hash === r.values.last_synced_hash) return true;
  const payload = buildPayload_(r, hash, sha256Hex_(r.values.feedback_text), Session.getScriptTimeZone());
  const res = callIngest_('upsert', { rows: [payload] }, null);
  if (!(res.stored || []).includes(fbId)) return false;
  table.sheet.getRange(r.rowNum, table.col.last_synced_hash).setValue(hash);
  return true;
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
  return { ok: true, fb_id: id, status: plan.writes.status, severity: plan.writes.severity || current.severity, row: rowNum };
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
