/**
 * Program Admin module for the existing RANEPA_DPO Apps Script web app.
 *
 * Integration:
 * 1) At the TOP of existing doGet(e):
 *      var programAdminResponse = programAdminRouteGet_(e);
 *      if (programAdminResponse) return programAdminResponse;
 *
 * 2) At the TOP of existing doPost(e):
 *      var programAdminResponse = programAdminRoutePost_(e);
 *      if (programAdminResponse) return programAdminResponse;
 *
 * Do not put the news PIN in this file. Authentication reuses the temporary
 * news editor token and validates it through the existing admin news endpoint.
 */

var PROGRAM_ADMIN_SHEET = 'Programs';
var PROGRAM_ADMIN_API_URL = 'https://script.google.com/macros/s/AKfycbznjvWDxlxxlANkzTCChnvlyEbW3N74vpOEE8pJaccExiXQG7DZU1SghQApDslMNEOk/exec';

var PROGRAM_ADMIN_WRITABLE_FIELDS = [
  'tab','sector','price','price_en','hours','hours_en','format','format_en',
  'type','type_en','dates','dates_en','pdf_link',
  'title_ru','title_en','desc_ru','desc_en','long_desc_ru','long_desc_en',
  'bullets_ru','bullets_en','audience_ru','audience_en','goal_ru','goal_en',
  'outcomes_ru','outcomes_en','topics_ru','topics_en','document_ru','document_en',
  'teachers_ru','teachers_en','official_desc_ru','official_desc_en',
  'relation_note_ru','relation_note_en','source_file','source_pages',
  'source_status','detail_status'
];

function programAdminJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function programAdminRouteGet_(e) {
  var type = e && e.parameter ? String(e.parameter.type || '') : '';
  if (type !== 'programsDetailed') return null;

  try {
    return programAdminJson_({
      ok: true,
      programs: programAdminReadPrograms_()
    });
  } catch (err) {
    return programAdminJson_({
      ok: false,
      error: 'PROGRAM_LIST_FAILED',
      message: String(err && err.message ? err.message : err)
    });
  }
}

function programAdminRoutePost_(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return null;
  }

  var action = String(body.action || '');
  if (['programList','programSave','programToggle'].indexOf(action) === -1) {
    return null;
  }

  if (!programAdminValidateNewsToken_(String(body.token || ''))) {
    return programAdminJson_({ ok:false, code:'UNAUTHORIZED', error:'Сессия редактора недействительна' });
  }

  try {
    if (action === 'programList') {
      return programAdminJson_({ ok:true, items:programAdminReadPrograms_() });
    }

    if (action === 'programSave') {
      var id = String(body.id || '').trim();
      var patch = body.patch && typeof body.patch === 'object' ? body.patch : {};
      if (!id) return programAdminJson_({ ok:false, error:'PROGRAM_ID_REQUIRED' });

      programAdminSavePatch_(id, patch);
      return programAdminJson_({ ok:true, id:id });
    }

    if (action === 'programToggle') {
      var toggleId = String(body.id || '').trim();
      if (!toggleId) return programAdminJson_({ ok:false, error:'PROGRAM_ID_REQUIRED' });

      programAdminSetActive_(toggleId, body.active !== false && String(body.active).toUpperCase() !== 'FALSE');
      return programAdminJson_({ ok:true, id:toggleId, active:body.active !== false && String(body.active).toUpperCase() !== 'FALSE' });
    }
  } catch (err) {
    return programAdminJson_({
      ok:false,
      error:'PROGRAM_ADMIN_FAILED',
      message:String(err && err.message ? err.message : err)
    });
  }

  return programAdminJson_({ ok:false, error:'UNKNOWN_PROGRAM_ACTION' });
}

function programAdminValidateNewsToken_(token) {
  if (!token) return false;

  try {
    var response = UrlFetchApp.fetch(
      PROGRAM_ADMIN_API_URL + '?type=news&admin=1&token=' + encodeURIComponent(token),
      {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true
      }
    );

    if (response.getResponseCode() !== 200) return false;

    var data = JSON.parse(response.getContentText() || '{}');
    return !!data && data.ok !== false && !data.error;
  } catch (err) {
    return false;
  }
}

function programAdminSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PROGRAM_ADMIN_SHEET);
  if (!sheet) throw new Error('Лист Programs не найден');
  return sheet;
}

function programAdminHeaders_(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) throw new Error('В Programs нет колонок');

  var raw = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var headers = [];
  var index = {};

  raw.forEach(function(value, i) {
    var key = String(value || '').trim();
    headers.push(key);
    if (key) index[key] = i;
  });

  if (index.id == null) throw new Error('В Programs нет колонки id');
  if (index.active == null) throw new Error('В Programs нет колонки active');

  return { headers:headers, index:index };
}

function programAdminReadPrograms_() {
  var sheet = programAdminSheet_();
  var meta = programAdminHeaders_(sheet);
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, meta.headers.length).getDisplayValues();
  var items = [];

  values.forEach(function(row) {
    var id = String(row[meta.index.id] || '').trim();
    if (!id) return;

    var item = {};

    meta.headers.forEach(function(key, i) {
      if (!key) return;
      var value = row[i] == null ? '' : String(row[i]);

      if (key === 'active') {
        item.active = value.toUpperCase() !== 'FALSE';
      } else if (key === 'bullets_ru' || key === 'bullets_en') {
        item[key] = value
          ? value.split('|').map(function(x){ return x.trim(); }).filter(Boolean)
          : [];
      } else {
        item[key] = value;
      }
    });

    items.push(item);
  });

  return items;
}

function programAdminFindRow_(sheet, id, idColumnZeroBased) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var ids = sheet
    .getRange(2, idColumnZeroBased + 1, lastRow - 1, 1)
    .getDisplayValues();

  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === id) return i + 2;
  }

  return 0;
}

function programAdminSavePatch_(id, patch) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(15000);

  try {
    var sheet = programAdminSheet_();
    var meta = programAdminHeaders_(sheet);
    var row = programAdminFindRow_(sheet, id, meta.index.id);

    if (!row) throw new Error('Программа ' + id + ' не найдена');

    PROGRAM_ADMIN_WRITABLE_FIELDS.forEach(function(key) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
      if (meta.index[key] == null) return;

      var value = patch[key];
      if (Array.isArray(value)) value = value.join(' | ');
      if (value == null) value = '';

      sheet.getRange(row, meta.index[key] + 1).setValue(String(value));
    });

    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function programAdminSetActive_(id, active) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(15000);

  try {
    var sheet = programAdminSheet_();
    var meta = programAdminHeaders_(sheet);
    var row = programAdminFindRow_(sheet, id, meta.index.id);

    if (!row) throw new Error('Программа ' + id + ' не найдена');

    sheet.getRange(row, meta.index.active + 1).setValue(!!active);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}
