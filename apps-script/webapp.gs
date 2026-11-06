/**
 * Row opener: links from the dashboard and alert emails carry an fb_id, never
 * a row number, because row numbers go stale after a sort or insert.
 * doGet(?id=fb_x) finds the row right now and links straight to it.
 * The page shows no feedback content; opening the sheet still needs access.
 */
function doGet(e) {
  const id = String((e && e.parameter && e.parameter.id) || '').trim();
  if (!/^fb_[a-z0-9]{8}$/.test(id)) return page_('That link has no valid feedback ID.', null);

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.TABS.FEEDBACK);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const idCol = headers.findIndex((h) => String(h).trim() === 'fb_id') + 1;
  if (!idCol) return page_('The Feedback tab has no fb_id column.', null);

  const rows = sheet.getRange(2, idCol, Math.max(sheet.getLastRow() - 1, 1), 1)
    .createTextFinder(id).matchEntireCell(true).findAll().map((r) => r.getRow());
  if (rows.length === 0) return page_(`No row has the ID ${id}. It may have been deleted.`, null);
  if (rows.length > 1) return page_(`${id} appears ${rows.length} times. Fix the duplicate first.`, null);

  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit#gid=${sheet.getSheetId()}&range=A${rows[0]}`;
  return page_(`${id} is on row ${rows[0]} of the Feedback tab.`, url);
}

function page_(message, url) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const button = url
    ? `<p><a href="${esc(url)}" target="_top" style="display:inline-block;padding:10px 16px;background:#1a73e8;color:#fff;border-radius:6px;text-decoration:none">Open row</a></p>`
    : '';
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Open feedback row</title></head>
    <body style="font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 16px">
    <h2 style="font-weight:600">CaseCompanion feedback</h2><p>${esc(message)}</p>${button}</body></html>`;
  return HtmlService.createHtmlOutput(html).setTitle('Open feedback row');
}
