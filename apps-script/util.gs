/** Shared helpers for reading tabs by header name. */

class HeaderError_ extends Error {
  constructor(tab, problems) {
    super(`Tab "${tab}": ${problems.join('; ')}. Run aborted, no data changed.`);
    this.name = 'HeaderError';
  }
}

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`Missing tab: "${name}". Run aborted.`);
  return sheet;
}

/**
 * Reads a whole tab once with getDisplayValues().
 * Returns { sheet, col, rows } where col maps header name to 1-based column
 * and each row is { rowNum, values: { header: trimmed display value } }.
 * Throws HeaderError_ if a required header is missing or duplicated.
 */
function readTable_(sheet, requiredHeaders) {
  const data = sheet.getDataRange().getDisplayValues();
  const headers = (data[0] || []).map((h) => String(h).trim());
  const col = {};
  const duplicated = [];
  headers.forEach((h, i) => {
    if (!h) return;
    if (h in col) duplicated.push(h);
    else col[h] = i + 1;
  });
  const missing = requiredHeaders.filter((h) => !(h in col));
  const problems = [];
  if (missing.length) problems.push(`missing header(s) ${missing.join(', ')}`);
  if (duplicated.length) problems.push(`duplicate header(s) ${duplicated.join(', ')}`);
  if (problems.length) throw new HeaderError_(sheet.getName(), problems);

  const rows = [];
  for (let r = 1; r < data.length; r++) {
    const values = {};
    headers.forEach((h, i) => { if (h) values[h] = String(data[r][i]).trim(); });
    rows.push({ rowNum: r + 1, values });
  }
  return { sheet, col, rows };
}

/** Current display values of one row, keyed by header. */
function readRow_(table, rowNum) {
  const width = table.sheet.getLastColumn();
  const vals = table.sheet.getRange(rowNum, 1, 1, width).getDisplayValues()[0];
  const out = {};
  for (const [h, c] of Object.entries(table.col)) out[h] = String(vals[c - 1] ?? '').trim();
  return out;
}

/** Row numbers whose fb_id cell exactly equals id, found at call time. */
function findRowsById_(table, id) {
  const col = table.col.fb_id;
  const range = table.sheet.getRange(2, col, Math.max(table.sheet.getLastRow() - 1, 1), 1);
  return range.createTextFinder(id).matchEntireCell(true).findAll().map((r) => r.getRow());
}

function newId_(taken) {
  for (let attempt = 0; attempt < 100; attempt++) {
    let id = CONFIG.ID_PREFIX;
    for (let i = 0; i < CONFIG.ID_LENGTH; i++) {
      id += CONFIG.ID_ALPHABET[Math.floor(Math.random() * CONFIG.ID_ALPHABET.length)];
    }
    if (!taken.has(id)) return id;
  }
  throw new Error('Could not generate a unique fb_id after 100 attempts.');
}

function countBy_(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const k = keyFn(item);
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}
