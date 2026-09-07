/**
 * Fools' Valley — receives submissions from apply.html into the responses sheet.
 *
 * SET UP (once):
 *  1. Open the sheet:
 *     https://docs.google.com/spreadsheets/d/1jvnXjP01_LNSArW46_WRvXsriALNjm_IQPLOzD9qt5E/edit
 *  2. Extensions -> Apps Script. Delete what's there, paste this file, Save.
 *  3. Run  setupSheet  once. Authorise when asked. (This writes the header row.)
 *  4. Deploy -> New deployment -> gear icon -> Web app.
 *       Description:  form endpoint
 *       Execute as:   Me
 *       Who has access: ANYONE          <- this one matters; not "anyone with Google account"
 *     Deploy, authorise, and copy the Web app URL.
 *  5. Paste that URL into apply.html, into the ENDPOINT line near the bottom.
 *
 * If you later change this script (e.g. add skills to SKILLS), use Deploy ->
 * Manage deployments -> edit -> Version: New version. A brand new deployment
 * gives you a different URL. Adding skills/roles is safe: new columns are
 * appended automatically and old responses are never touched.
 */

var SHEET_ID   = '1jvnXjP01_LNSArW46_WRvXsriALNjm_IQPLOzD9qt5E';
var SHEET_NAME = 'Responses';

/* One column per skill, so the sheet filters cleanly. */
var SKILLS = [
  ['cook',   'Chef - runs a kitchen for 25+',        'Chef: can run a kitchen (25+)'],
  ['cook',   'Supportive cook',                      'Cook: supporting role'],
  ['cook',   'Cooks meat and fish',                  'Cooks meat & fish'],
  ['cook',   'Baking',                               'Baking'],
  ['cook',   'Fermenting and preserving',            'Fermenting & preserving'],
  ['garden', 'Can plan and lead planting',           'Garden: can plan & lead planting'],
  ['garden', 'Experienced hands',                    'Garden: experienced'],
  ['garden', 'Beginner, keen',                       'Garden: beginner'],
  ['build',  'Licensed electrician',                 'Licensed electrician'],
  ['build',  'Basic electrics',                      'Basic electrics'],
  ['build',  'Plumbing',                             'Plumbing'],
  ['build',  'Carpentry and timber structures',      'Carpentry & timber'],
  ['build',  'Machinery',                            'Machinery'],
  ['build',  'Welding',                              'Welding'],
  ['build',  'Repairs and supported construction',   'Repairs & supported build'],
  ['build',  'Beginner, keen',                       'Building: beginner'],
  ['space',  'Cleaning',                             'Cleaning'],
  ['space',  'Watering plants',                      'Watering plants'],
  ['space',  'Preparing rooms',                      'Preparing rooms'],
  ['space',  'Welcoming arrivals',                   'Welcoming arrivals'],
  ['space',  'Contact person',                       'Contact person'],
  ['space',  'Organising meetings and cleanups',     'Organising meetings & cleanups'],
  ['space',  'Admin and purchasing',                 'Admin & purchasing'],
  ['event',  'Can design and organize retreats from scratch', 'Events: designs & organizes from scratch'],
  ['event',  'Supportive role, taking on elements',   'Events: supportive role']
];

var ROLES = ['Kitchen','Gardening','Building and maintenance','Space keeper',
             'Marketing, social media, photography','Facilitation','Event and retreat production'];

var LANGS = ['Portuguese','English','Spanish','French','German','Italian'];

function headers_() {
  var h = ['Timestamp','Name','Email','Can stay in Portugal','Arrangements','Roles'];
  ROLES.forEach(function(r){ h.push('R: ' + r); });
  SKILLS.forEach(function(s){ h.push(s[2]); });
  return h.concat(['Facilitation practices','Languages','Other languages',
                   'Driving','Own car','CV link','Contact preference','Anything else']);
}

/* Reads the sheet's existing header row and appends any columns from headers_()
 * that aren't there yet. Never deletes or reorders anything, so you can add new
 * skills/roles to the form at any time without touching old responses: just
 * update SKILLS/ROLES here, save, and deploy a new version. The new columns
 * appear at the right end of the sheet on the next submission (or when you run
 * setupSheet). Old columns for renamed/removed skills simply stop being filled. */
function ensureHeaders_(sh) {
  var wanted  = headers_();
  var lastCol = sh.getLastColumn();
  var current = lastCol > 0
    ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String).filter(String)
    : [];
  if (current.length === 0) {
    sh.getRange(1, 1, 1, wanted.length).setValues([wanted])
      .setFontWeight('bold').setBackground('#e7ecd8').setWrap(true)
      .setVerticalAlignment('bottom');
    sh.setFrozenRows(1);
    return wanted;
  }
  var missing = wanted.filter(function (h) { return current.indexOf(h) === -1; });
  if (missing.length) {
    sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing])
      .setFontWeight('bold').setBackground('#e7ecd8').setWrap(true)
      .setVerticalAlignment('bottom');
    current = current.concat(missing);
  }
  return current;
}

/* Safe to run any time — never clears existing responses. */
function setupSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  var h  = ensureHeaders_(sh);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);
  sh.setColumnWidth(1, 140);
  sh.setColumnWidth(2, 160);
  sh.setColumnWidth(3, 210);
  for (var c = 7; c <= 6 + ROLES.length + SKILLS.length; c++) sh.setColumnWidth(c, 58);
  if (!sh.getFilter()) sh.getRange(1, 1, 1, h.length).createFilter();
  Logger.log('Headers in place: ' + h.length + ' columns.');
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d  = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    var has = function (field, value) {
      return String(d[field] || '').split(', ').indexOf(value) > -1 ? 'yes' : '';
    };

    // Build values keyed by column NAME, then write in whatever order the
    // sheet's header row actually has — so adding new skills/roles never
    // misaligns older columns.
    var vals = {
      'Timestamp': new Date(),
      'Name': d.name || '',
      'Email': d.email || '',
      'Can stay in Portugal': d.visa || '',
      'Arrangements': d.arrangement || '',
      'Roles': d.role || '',
      'Facilitation practices': d.facilitation || '',
      'Languages': d.lang || '',
      'Other languages': d.lang_other || '',
      'Driving': d.driving || '',
      // Reads "Licence, coming with own car" / "Licence, no car" / "No licence".
      'Own car': /own car/i.test(d.driving || '') ? 'yes' : '',
      'CV link': d.cv || '',
      'Contact preference': d.contact || '',
      'Anything else': d.notes || ''
    };
    ROLES.forEach(function (r) { vals['R: ' + r] = has('role', r); });
    SKILLS.forEach(function (s) { vals[s[2]] = has(s[0], s[1]); });

    var headers = ensureHeaders_(sh);
    var row = headers.map(function (h) { return (h in vals) ? vals[h] : ''; });
    sh.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput('Fools’ Valley form endpoint is live.');
}
