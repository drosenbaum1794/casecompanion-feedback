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
  ui.alert('Ingest secret created',
    'Copy this value now. Paste it into Supabase as the INGEST_SECRET edge function secret. ' +
    'It is saved in this script\'s properties and will not be shown again.\n\n' + secret,
    ui.ButtonSet.OK);
}
