/**
 * Alerts. People shouldn't have to remember to look.
 *   Sev1:          any row tagged Sev1 (any confidence), or raised to Sev1 by a human
 *   Possible Sev1: Wrong output tagged Sev2 at Low confidence
 * Each row alerts once: alerted_at is set after sending. Routing is by firm
 * size (Routing tab) plus one alert channel. More than ALERT_DIGEST_OVER
 * alerts in one run go out as a single digest.
 */

/** Which rows need an alert now. Pure, so it is unit-tested. */
function selectAlertRows_(rows) {
  const out = [];
  for (const r of rows) {
    const v = r.values;
    if (!v.fb_id || !v.theme || v.alerted_at || v.status === 'Archived' || v.sync_error === 'duplicate id') continue;
    if (v.severity === 'Sev1') out.push({ row: r, kind: 'Sev1' });
    else if (v.theme === 'Wrong output' && v.severity === 'Sev2' && v.confidence === 'Low') {
      out.push({ row: r, kind: 'Possible Sev1' });
    }
  }
  return out;
}

function sendAlerts_(run) {
  const feedback = readTable_(getSheet_(CONFIG.TABS.FEEDBACK), CONFIG.FEEDBACK_HEADERS);
  const due = selectAlertRows_(feedback.rows);
  if (!due.length) return;

  const routing = readRouting_();
  const recipientsFor = (v) => [...new Set([routing[v.firm_size], routing.alert_channel].filter(Boolean))];
  const allRecipients = [...new Set(due.flatMap((d) => recipientsFor(d.row.values)))];
  if (!allRecipients.length) throw new Error('Routing tab has no email for these segments or the alert channel.');

  const emailsNeeded = due.length > CONFIG.ALERT_DIGEST_OVER ? 1 : due.length;
  if (MailApp.getRemainingDailyQuota() < emailsNeeded * allRecipients.length) {
    throw new Error('Daily email quota too low to send Sev1 alerts; they will retry next sync.');
  }

  if (due.length > CONFIG.ALERT_DIGEST_OVER) {
    const sev1 = due.filter((d) => d.kind === 'Sev1').length;
    MailApp.sendEmail({
      to: allRecipients.join(','),
      subject: `[Feedback alert] ${sev1} Sev1 and ${due.length - sev1} possible Sev1 rows need review`,
      body: due.map((d) => alertText_(d)).join('\n\n----------\n\n'),
    });
  } else {
    for (const d of due) {
      const v = d.row.values;
      MailApp.sendEmail({
        to: recipientsFor(v).join(','),
        subject: `[${d.kind}] ${v.theme}: ${v.product_area} (${v.firm_size} firm ${v.user_role})`,
        body: alertText_(d),
      });
    }
  }

  const now = new Date();
  for (const d of due) {
    const rowNums = findRowsById_(feedback, d.row.values.fb_id);
    if (rowNums.length === 1) feedback.sheet.getRange(rowNums[0], feedback.col.alerted_at).setValue(now);
  }
  run.alerts += due.length;
  run.notes.push(`Sent ${due.length} alert(s)${due.length > CONFIG.ALERT_DIGEST_OVER ? ' as one digest' : ''}.`);
}

function alertText_(d) {
  const v = d.row.values;
  return [
    `${d.kind}: ${v.theme} / ${v.product_area} (severity ${v.severity}, confidence ${v.confidence})`,
    '',
    'Customer text (verbatim, unverified):',
    `"${v.feedback_text}"`,
    '',
    `Who: ${v.user_role}, ${v.firm_size} firm, ${v.months_subscribed} months subscribed, ${v.monthly_queries} queries/month`,
    `Channel: ${v.channel}, ${v.feedback_date}`,
    `Why Claude tagged it: ${v.claude_reason}`,
    v.injection_suspected === 'TRUE' ? 'WARNING: this text may contain instructions aimed at the tagger. Review it by hand.' : '',
    '',
    `Open row: ${rowLink_(v.fb_id)}`,
  ].filter((line) => line !== null).join('\n');
}

function rowLink_(fbId) {
  if (CONFIG.WEBAPP_URL) return `${CONFIG.WEBAPP_URL}?id=${encodeURIComponent(fbId)}`;
  return `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit (search for ${fbId})`;
}

/** segment -> email, plus 'alert_channel'. */
function readRouting_() {
  const t = readTable_(getSheet_(CONFIG.TABS.ROUTING), ['segment', 'csm_email']);
  const out = {};
  for (const r of t.rows) if (r.values.segment && r.values.csm_email) out[r.values.segment] = r.values.csm_email;
  return out;
}

/**
 * The tagging task runs outside this script, so its silence must be noticed.
 * Alerts when untagged rows have waited TAGGER_STALL_HOURS with no new
 * suggestion since they started waiting.
 */
function checkTagger_(run) {
  const props = PropertiesService.getScriptProperties();
  const fb = readTable_(getSheet_(CONFIG.TABS.FEEDBACK), ['fb_id', 'feedback_text', 'theme', 'status']);
  const untagged = fb.rows.filter((r) => r.values.fb_id && r.values.feedback_text && !r.values.theme && r.values.status !== 'Archived');
  if (!untagged.length) {
    props.deleteProperty('UNTAGGED_SINCE_MS');
    return;
  }
  let since = Number(props.getProperty('UNTAGGED_SINCE_MS') || 0);
  if (!since) {
    since = Date.now();
    props.setProperty('UNTAGGED_SINCE_MS', String(since));
  }
  const waitedHours = (Date.now() - since) / 3600000;
  if (waitedHours < CONFIG.TAGGER_STALL_HOURS) return;

  const sug = getSheet_(CONFIG.TABS.SUGGESTIONS);
  const t = readTable_(sug, ['run_at']);
  const raw = sug.getDataRange().getValues();
  let newest = 0;
  for (const r of t.rows) {
    const v = raw[r.rowNum - 1][t.col.run_at - 1];
    const ms = v instanceof Date ? v.getTime() : Date.parse(String(v));
    if (Number.isFinite(ms) && ms > newest) newest = ms;
  }
  if (newest > since) {
    // The task is producing suggestions (perhaps rejected ones); the wait clock restarts.
    props.setProperty('UNTAGGED_SINCE_MS', String(newest));
    return;
  }
  const msg = `${untagged.length} rows have waited ${waitedHours.toFixed(1)} hours for tags and the tagging task has written no suggestions since. ` +
    'It may be paused, waiting for an approval, or failing. Check the scheduled task in the Claude app.';
  run.notes.push(`Tagger check: ${msg}`);
  sendOwnerAlertOnce_('TAGGER_STALL', '[Feedback pipeline] Tagging task may have stopped', msg);
}

/**
 * Emails the owner when a timer sync fails. The same error repeats at most
 * once an hour; a different error always gets through, so one failure can't
 * hide the next.
 */
function alertOnFailure_(run) {
  if (!run.errors.length || run.trigger !== 'timer') return;
  const props = PropertiesService.getScriptProperties();
  const signature = sha256Hex_(run.errors.map((e) => e.replace(/\d+/g, '#')).join('|'));
  const last = Number(props.getProperty('LAST_FAILURE_ALERT_MS') || 0);
  const sameError = signature === props.getProperty('LAST_FAILURE_SIGNATURE');
  if (sameError && Date.now() - last < CONFIG.FAILURE_ALERT_MINUTES * 60000) return;
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[Feedback pipeline] Sync failed',
    `The 10-minute sync failed at ${run.startedAt}.\n\n${run.errors.join('\n')}\n\nSee the Health tab for details.`);
  props.setProperty('LAST_FAILURE_ALERT_MS', String(Date.now()));
  props.setProperty('LAST_FAILURE_SIGNATURE', signature);
}

function sendOwnerAlertOnce_(key, subject, body) {
  const props = PropertiesService.getScriptProperties();
  const prop = `LAST_ALERT_${key}_MS`;
  const last = Number(props.getProperty(prop) || 0);
  if (Date.now() - last < CONFIG.REPEAT_ALERT_HOURS * 3600000) return;
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), subject, body);
  props.setProperty(prop, String(Date.now()));
}
