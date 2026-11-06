/**
 * One-way push from the sheet to Supabase.
 *
 * Each row gets a fingerprint: trimmed display values in fixed header order,
 * hashed with SHA-256. Only rows whose fingerprint differs from
 * last_synced_hash are sent, 25 at a time. last_synced_hash is written only
 * for the IDs Supabase confirms it stored, so a failed push retries itself.
 * A sync with nothing to do makes no network calls (except a heartbeat for
 * the health banner, at most every HEARTBEAT_MINUTES).
 */

function pushChanges_(run) {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) {
    run.notes.push('Supabase push skipped: no ingest secret yet (Feedback tools > Admin: create ingest secret).');
    return;
  }
  const table = readTableWithRaw_(getSheet_(CONFIG.TABS.FEEDBACK), CONFIG.FEEDBACK_HEADERS);
  const hashHeaders = CONFIG.FEEDBACK_HEADERS.filter((h) => !CONFIG.HASH_EXCLUDE.includes(h));
  const tz = Session.getScriptTimeZone();

  const allIds = [];
  const pending = [];
  for (const r of table.rows) {
    const id = r.values.fb_id;
    if (!id) continue;
    allIds.push(id); // duplicates and invalid rows still count as present for the delete guard
    if (r.values.sync_error || !r.values.feedback_text) continue;
    const hash = sha256Hex_(rowFingerprint_(r.values, hashHeaders));
    if (hash === r.values.last_synced_hash) continue;
    pending.push(buildPayload_(r, hash, sha256Hex_(r.values.feedback_text), tz));
  }

  for (let i = 0; i < pending.length; i += CONFIG.PUSH_BATCH) {
    if (!hasTimeLeft_(run)) {
      run.notes.push(`Time budget reached; ${pending.length - i} rows push next sync.`);
      break;
    }
    const batch = pending.slice(i, i + CONFIG.PUSH_BATCH);
    const res = callIngest_('upsert', { rows: batch }, run);
    const stored = new Set(res.stored || []);
    writeSyncedHashes_(batch.filter((p) => stored.has(p.fb_id)));
    run.pushed += stored.size;
    for (const rej of res.rejected || []) run.notes.push(`Supabase rejected ${rej.fb_id}: ${rej.reason}`);
  }

  reconcileIds_(allIds, run);
}

/** Canonical string for the fingerprint. Exported for tests. */
function rowFingerprint_(values, headers) {
  return headers.map((h) => String(values[h] == null ? '' : values[h]).trim()).join('␟');
}

function buildPayload_(r, rowHash, textHash, tz) {
  const v = r.values;
  const raw = r.raw;
  const iso = (h) => (raw[h] instanceof Date ? raw[h].toISOString() : v[h]);
  const num = (h) => (typeof raw[h] === 'number' ? String(raw[h]) : v[h]);
  const day = (h) => (raw[h] instanceof Date ? Utilities.formatDate(raw[h], tz, 'yyyy-MM-dd') : v[h]);
  const payload = {};
  for (const h of CONFIG.FEEDBACK_HEADERS) payload[h] = v[h];
  payload.feedback_date = day('feedback_date');
  for (const h of ['months_subscribed', 'monthly_queries', 'avg_session_duration_min']) payload[h] = num(h);
  for (const h of ['reviewed_at', 'tagged_at', 'alerted_at']) payload[h] = iso(h);
  payload.follow_up = raw.follow_up === true ? 'TRUE' : String(v.follow_up || 'FALSE').toUpperCase();
  payload.row_hash = rowHash;
  payload.text_hash = textHash;
  delete payload.last_synced_hash;
  delete payload.sync_error;
  delete payload.error_count;
  return payload;
}

/** Writes last_synced_hash for confirmed rows, re-locating them by fb_id first. */
function writeSyncedHashes_(confirmed) {
  if (!confirmed.length) return;
  const sheet = getSheet_(CONFIG.TABS.FEEDBACK);
  const t = readTable_(sheet, ['fb_id', 'last_synced_hash']);
  const rowOf = {};
  for (const r of t.rows) if (r.values.fb_id) rowOf[r.values.fb_id] = r.rowNum;
  for (const p of confirmed) {
    const rowNum = rowOf[p.fb_id];
    if (rowNum) sheet.getRange(rowNum, t.col.last_synced_hash).setValue(p.row_hash);
  }
}

/**
 * Sends the full ID list only when it changed since the last accepted
 * reconcile. Supabase marks missing IDs inactive, but refuses if more than 3
 * would vanish at once; then the sync alerts instead.
 */
function reconcileIds_(allIds, run) {
  const props = PropertiesService.getScriptProperties();
  const listHash = sha256Hex_([...allIds].sort().join(','));
  if (listHash === props.getProperty('LAST_ID_LIST_HASH')) return;
  const res = callIngest_('reconcile_ids', { ids: [...new Set(allIds)] }, run);
  if (res.refused) {
    const msg = `Delete guard: ${res.missing_count} rows would disappear from Supabase at once, so nothing was deactivated. ` +
      `Check the Feedback tab for cleared or deleted rows (e.g. ${(res.sample || []).slice(0, 5).join(', ')}).`;
    run.errors.push(msg);
    sendOwnerAlertOnce_('DELETE_GUARD', '[Feedback pipeline] Delete guard tripped', msg);
    return;
  }
  run.deactivated += res.deactivated || 0;
  if (res.deactivated) run.notes.push(`Marked inactive in Supabase: ${res.missing.join(', ')}`);
  if (res.reactivated) run.notes.push(`Reactivated ${res.reactivated} rows in Supabase.`);
  props.setProperty('LAST_ID_LIST_HASH', listHash);
}

function pushTaxonomyIfChanged_(run) {
  if (!PropertiesService.getScriptProperties().getProperty('INGEST_SECRET')) return;
  const t = readTable_(getSheet_(CONFIG.TABS.TAXONOMY), CONFIG.TAXONOMY_HEADERS);
  const rows = t.rows.map((r) => r.values).filter((v) => v.field && v.value);
  const hash = sha256Hex_(JSON.stringify(rows));
  const props = PropertiesService.getScriptProperties();
  if (hash === props.getProperty('LAST_TAXONOMY_HASH')) return;
  const version = readTaxonomy_().version;
  callIngest_('taxonomy', { rows, version }, run);
  props.setProperty('LAST_TAXONOMY_HASH', hash);
  run.notes.push(`Taxonomy ${version} pushed to Supabase.`);
}

/** Logs the run to Supabase sync_runs when something happened, plus a periodic heartbeat. */
function logRunToSupabase_(run) {
  if (run.busy) return;
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('INGEST_SECRET')) return;
  const last = Number(props.getProperty('LAST_RUN_LOGGED_MS') || 0);
  const due = Date.now() - last > CONFIG.HEARTBEAT_MINUTES * 60 * 1000;
  if (!runSummary_(run) && !run.errors.length && !due) return;
  callIngest_('log_run', {
    run: {
      started_at: run.startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      trigger: run.trigger,
      result: run.errors.length ? 'ERROR' : 'OK',
      ids_assigned: run.idsAssigned,
      applied: run.applied,
      partly_applied: run.partly,
      rejected: run.rejected,
      rows_pushed: run.pushed,
      deactivated: run.deactivated,
      errors: run.errors.join(' | '),
    },
  }, run);
  props.setProperty('LAST_RUN_LOGGED_MS', String(Date.now()));
}

function callIngest_(action, body, run) {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (run) run.networkCalls++;
  const res = UrlFetchApp.fetch(`${CONFIG.SUPABASE_URL}/functions/v1/ingest`, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      apikey: CONFIG.SUPABASE_ANON_KEY,
      'x-ingest-secret': secret,
    },
    payload: JSON.stringify({ action, ...body }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code !== 200) throw new Error(`ingest ${action} failed: HTTP ${code} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function sha256Hex_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

/** Like readTable_, but each row also carries raw values (Dates, numbers, booleans). */
function readTableWithRaw_(sheet, requiredHeaders) {
  const t = readTable_(sheet, requiredHeaders);
  const raw = sheet.getDataRange().getValues();
  for (const r of t.rows) {
    const rawRow = raw[r.rowNum - 1] || [];
    r.raw = {};
    for (const [h, c] of Object.entries(t.col)) r.raw[h] = rawRow[c - 1];
  }
  return t;
}
