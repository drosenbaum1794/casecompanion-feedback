/** "Feedback tools" menu. Appears on the desktop web app, not the phone app. */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Feedback tools')
    .addItem('Sync now', 'syncNow')
    .addSeparator()
    .addItem('Install triggers (admin, run once)', 'installTriggers')
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
    ? `Sync failed: ${run.errors[0]}`
    : `Sync done: ${run.idsAssigned} IDs assigned, ${run.applied} applied, ` +
      `${run.partly} partly applied, ${run.rejected} rejected.`;
  ss.toast(msg, 'Feedback tools', 10);
}
