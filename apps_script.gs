// КОПИЯ кода Google Apps Script (для истории и следующих правок).
// Живёт не здесь, а в таблице «Aisha» → Расширения → Apps Script.
// Разворачивать ТОЛЬКО через «Управление развёртываниями → ✏️ → Новая версия»,
// иначе сменится адрес и данные уйдут в другую таблицу.
//
// Папка на Диске, где живут таблицы детей (создаётся сама при первом запуске).
const FOLDER_NAME = 'ABA — дети';
// Сколько последних номеров пакетов помним, чтобы не записать дубликат.
const UID_KEY = '_uids';
const UID_KEEP = 300;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const uid = (data.uid || '').toString();

    // Этот пакет уже принят раньше (у приложения потерялся наш ответ,
    // и оно повторило отправку) — второй раз не записываем.
    if (uid && isDuplicate(uid)) {
      return jsonOut({ ok: true, duplicate: true });
    }

    if (Array.isArray(data.goals)) {
      // Таблица выбирается по ребёнку из пакета (метка профиля в приложении).
      const child = (data.child || '').toString().trim() || 'Без имени';
      const ss = getChildSpreadsheet(child);

      const protocol = (data.protocol || 'Без протокола').trim();
      const dateStr = (data.date || '').trim();
      const sheet = ss.getSheetByName(protocol) || ss.insertSheet(protocol);

      // Пустой стартовый лист (создался вместе с таблицей) убираем,
      // чтобы не путал. Удалить единственный лист нельзя — потому проверяем.
      removeDefaultSheetIfEmpty(ss, sheet);

      if (sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, 4).setValues([['Цель', '', '%', 'Подсказки']]);
      }

      let resultCol = null;
      const lastCol = Math.max(sheet.getLastColumn(), 1);
      const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

      for (let c = 2; c <= headerRow.length; c += 3) {
        const headerValue = (headerRow[c - 1] || '').toString().trim();
        if (headerValue === dateStr) {
          resultCol = c;
          break;
        }
      }

      if (resultCol === null) {
        const currentLastCol = Math.max(sheet.getLastColumn(), 1);
        sheet.insertColumnsAfter(currentLastCol, 3);
        resultCol = currentLastCol + 1;
        sheet.getRange(1, resultCol).setValue(dateStr);
        sheet.getRange(1, resultCol + 1).setValue('%');
        sheet.getRange(1, resultCol + 2).setValue('Подсказки');
      }

      data.goals.forEach(goalObj => {
        const name = (goalObj.name || '').trim();
        const resp = goalObj.responses || '';
        const pct = goalObj.percent || '';
        const promptDetails = goalObj.promptDetails || '';

        const goalsList = sheet
          .getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1)
          .getValues()
          .flat();

        let row = -1;
        for (let i = 0; i < goalsList.length; i++) {
          const cellVal = goalsList[i];
          if (cellVal && cellVal.toString().trim().toLowerCase() === name.toLowerCase()) {
            row = i + 2;
            break;
          }
        }

        if (row < 2) {
          row = sheet.getLastRow() + 1;
          sheet.getRange(row, 1).setValue(name);
        }

        sheet.getRange(row, resultCol).setValue(resp);
        sheet.getRange(row, resultCol + 1).setValue(pct);
        sheet.getRange(row, resultCol + 2).setValue(promptDetails);
      });

      rememberUid(uid);
      return jsonOut({ ok: true });
    }

    // ABC-эпизоды: по одному на запись, лист «ABC» в таблице ребёнка.
    if (data.type === 'abc') {
      const child = (data.child || '').toString().trim() || 'Без имени';
      const ss = getChildSpreadsheet(child);
      let sheet = ss.getSheetByName('ABC');
      if (!sheet) {
        sheet = ss.insertSheet('ABC');
        sheet.getRange(1, 1, 1, 7).setValues([[
          'Дата', 'Время', 'Поведение', 'A (перед)', 'C (после)', 'Длительность', 'Интенсивность'
        ]]);
        removeDefaultSheetIfEmpty(ss, sheet);
      }
      sheet.appendRow([
        data.date || '', data.time || '', data.behavior || '',
        data.antecedent || '', data.consequence || '', data.duration || '', data.intensity || ''
      ]);
      rememberUid(uid);
      return jsonOut({ ok: true });
    }

    // Частота: одна строка на поведение (лист «Частота» в таблице ребёнка).
    if (data.type === 'freq') {
      const child = (data.child || '').toString().trim() || 'Без имени';
      const ss = getChildSpreadsheet(child);
      let sheet = ss.getSheetByName('Частота');
      if (!sheet) {
        sheet = ss.insertSheet('Частота');
        sheet.getRange(1, 1, 1, 6).setValues([[
          'Дата', 'Начало', 'Длительность (мин)', 'Поведение', 'Количество', 'Раз в час'
        ]]);
        removeDefaultSheetIfEmpty(ss, sheet);
      }
      (data.items || []).forEach(function (it) {
        sheet.appendRow([
          data.date || '', data.time || '', data.minutes || '',
          it.behavior || '', it.count || 0, it.rate || ''
        ]);
      });
      rememberUid(uid);
      return jsonOut({ ok: true });
    }

    // Генерализация освоенных целей: строка на пробу (лист «Генерализация»).
    // Приложение шлёт только ИЗМЕНЕНИЯ с прошлой отправки, поэтому строки
    // не повторяются; снятая отметка приходит как «отметка снята».
    if (data.type === 'gen') {
      const child = (data.child || '').toString().trim() || 'Без имени';
      const ss = getChildSpreadsheet(child);
      let sheet = ss.getSheetByName('Генерализация');
      if (!sheet) {
        sheet = ss.insertSheet('Генерализация');
        sheet.getRange(1, 1, 1, 7).setValues([[
          'Дата', 'Протокол', 'Цель', 'Категория', 'Условие', 'Отметка', 'Прогресс'
        ]]);
        removeDefaultSheetIfEmpty(ss, sheet);
      }
      (data.items || []).forEach(function (it) {
        sheet.appendRow([
          it.date || data.date || '', it.protocol || '', it.goal || '',
          it.category || '', it.condition || '', it.mark || '', it.progress || ''
        ]);
      });
      rememberUid(uid);
      return jsonOut({ ok: true });
    }

    // Заметки терапистов: лист «Заметки» в таблице ребёнка.
    if (data.type === 'note') {
      const child = (data.child || '').toString().trim() || 'Без имени';
      const ss = getChildSpreadsheet(child);
      let sheet = ss.getSheetByName('Заметки');
      if (!sheet) {
        sheet = ss.insertSheet('Заметки');
        sheet.getRange(1, 1, 1, 4).setValues([['Дата', 'Время', 'Откуда', 'Заметка']]);
        removeDefaultSheetIfEmpty(ss, sheet);
      }
      sheet.appendRow([
        data.date || '', data.time || '', data.source || '', data.text || ''
      ]);
      rememberUid(uid);
      return jsonOut({ ok: true });
    }

    return jsonOut({ ok: false, error: 'unknown_payload' });
  } catch (err) {
    // Любая ошибка — честный отказ: приложение оставит пакет в очереди
    // и дошлёт позже, вместо того чтобы посчитать его доставленным.
    return jsonOut({ ok: false, error: String(err) });
  }
}

// Номер пакета уже принимали? (защита от повторной записи)
function isDuplicate(uid) {
  const raw = PropertiesService.getScriptProperties().getProperty(UID_KEY) || '[]';
  let list;
  try {
    list = JSON.parse(raw);
  } catch (err) {
    list = [];
  }
  return list.indexOf(uid) !== -1;
}

// Запоминаем номер ТОЛЬКО после успешной записи — если запись не удалась,
// приложение повторит отправку и данные не потеряются.
function rememberUid(uid) {
  if (!uid) return;
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(UID_KEY) || '[]';
  let list;
  try {
    list = JSON.parse(raw);
  } catch (err) {
    list = [];
  }
  list.push(uid);
  if (list.length > UID_KEEP) list = list.slice(list.length - UID_KEEP);
  props.setProperty(UID_KEY, JSON.stringify(list));
}

// Ответ в JSON — приложение читает его и подтверждает доставку.
function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Таблица ребёнка: ищем по запомненному ID, если нет — создаём в папке
// и запоминаем. Блокировка — чтобы два одновременных запроса не создали
// две таблицы одному ребёнку.
function getChildSpreadsheet(child) {
  const props = PropertiesService.getScriptProperties();
  const key = 'ss::' + child;

  const savedId = props.getProperty(key);
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (err) {
      // Таблицу удалили вручную — создадим заново ниже.
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Пока ждали блокировку, таблицу мог создать параллельный запрос.
    const retryId = props.getProperty(key);
    if (retryId) {
      try {
        return SpreadsheetApp.openById(retryId);
      } catch (err) {}
    }

    const ss = SpreadsheetApp.create('ABA — ' + child);
    DriveApp.getFileById(ss.getId()).moveTo(getFolder());
    props.setProperty(key, ss.getId());
    return ss;
  } finally {
    lock.releaseLock();
  }
}

// Папка для таблиц: ID запоминаем, при первом запуске создаём.
function getFolder() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('aba_folder');
  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    } catch (err) {}
  }
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('aba_folder', folder.getId());
  return folder;
}

// Удаляем пустой автосозданный лист («Лист1»/«Sheet1»), когда появился
// хотя бы один лист протокола.
function removeDefaultSheetIfEmpty(ss, keepSheet) {
  if (ss.getSheets().length < 2) return;
  ['Лист1', 'Sheet1'].forEach(name => {
    const def = ss.getSheetByName(name);
    if (def && def !== keepSheet && def.getLastRow() === 0) {
      ss.deleteSheet(def);
    }
  });
}
