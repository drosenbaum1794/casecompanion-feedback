/** "Feedback tools" menu. Appears on the desktop web app, not the phone app. */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Feedback tools')
    .addItem('Sync now', 'syncNow')
    .addSeparator()
    .addItem('Admin: install triggers (run once)', 'installTriggers')
    .addItem('Admin: create ingest secret', 'createIngestSecret')
    .addToUi();
}

function syncNow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const run = runSync_('menu');
  if (run.busy) {
    ss.toast('Sync busy, try again in a minute.', 'Feedback tools', 8);
    return;
  }
  const msg = run.errors.length
    ? `Sync finished with errors: ${run.errors[0]} (see Health tab)`
    : `Sync done: ${run.idsAssigned} IDs, ${run.applied} applied, ${run.partly} partly applied, ` +
      `${run.rejected} rejected, ${run.pushed} pushed, ${run.alerts} alerts.`;
  ss.toast(msg, 'Feedback tools', 10);
}

/**
 * Creates the shared secret that lets this script write to Supabase. It is
 * shown once, here, so it never passes through chat or the repo. Paste it
 * into Supabase as the INGEST_SECRET edge function secret.
 */
function createIngestSecret() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('INGEST_SECRET')) {
    const answer = ui.alert('Replace the ingest secret?',
      'A secret already exists. Replacing it stops the Supabase push until you paste the new one into Supabase too.',
      ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;
  }
  const secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  props.setProperty('INGEST_SECRET', secret);
  // The code sits alone in its own box with a Copy button, so the
  // instructions can't be copied along with it.
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px">
    <p>Paste this into Supabase as the value of the <b>INGEST_SECRET</b> edge function secret.
    It is 64 characters and will not be shown again.</p>
    <input id="s" readonly value="${secret}" style="width:100%;font-family:monospace;font-size:13px;padding:6px">
    <p><button onclick="var s=document.getElementById('s');s.select();navigator.clipboard.writeText(s.value)
      .then(function(){document.getElementById('m').textContent='Copied. Now paste it into Supabase.';})"
      style="padding:8px 14px">Copy code</button> <span id="m" style="color:#188038"></span></p></div>`;
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(200), 'Ingest secret created');
}
