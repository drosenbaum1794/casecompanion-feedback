/**
 * Deletes and recreates every trigger, so it is safe to run again.
 * Triggers run as whoever installs them, so Dan (the owner) installs them:
 * the script writes protected system columns that only he can edit.
 */
function installTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  for (const t of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(t);
  ScriptApp.newTrigger('syncOnTimer').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('onFeedbackEdit').forSpreadsheet(ss).onEdit().create();
  ss.toast('Triggers installed: sync every 10 minutes, plus the edit handler.', 'Feedback tools', 8);
}
