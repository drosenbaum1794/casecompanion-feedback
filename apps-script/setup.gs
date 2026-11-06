/**
 * Deletes and recreates every trigger, so it is safe to run again.
 * Triggers run as whoever installs them, so Dan (the owner) installs them:
 * the script writes protected system columns that only he can edit.
 */
function installTriggers() {
  for (const t of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(t);
  ScriptApp.newTrigger('syncOnTimer').timeBased().everyMinutes(10).create();
  // Day 2: installable onEdit handler for human corrections.
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Triggers installed: sync runs every 10 minutes.', 'Feedback tools', 8);
}
