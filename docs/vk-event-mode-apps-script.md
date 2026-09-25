# Событийная публикация новостей во VK — патч Apps Script

Этот патч нужен перед включением ветки `feature/vk-opt-in-event` в production.

## Что меняется

- публикация на сайте остаётся независимой;
- VK запускается только когда редактор поставил галочку «Опубликовать во ВКонтакте»;
- постоянный cron GitHub Actions больше не нужен;
- Apps Script не хранит VK-токены и не вызывает VK напрямую;
- Apps Script вызывает отдельный worker по HTTPS;
- worker защищён общим секретом и сам отвечает за фото, повторные попытки и защиту от дублей.

## Script Properties

Добавить в свойства скрипта:

- `VK_WORKER_URL` — базовый HTTPS URL worker без завершающего `/`;
- `VK_WORKER_SECRET` — длинный случайный секрет.

Секреты не вставлять в исходный код.

## Добавить эти функции в модуль новостей

```javascript
function newsWantsVk_(item) {
  const blocks = Array.isArray(item && item.blocks) ? item.blocks : [];
  return blocks.some(function (b) {
    return b && b.type === '__system_vk' && b.publishToVk === true;
  });
}

function queueNewsToVk_(item, newsId) {
  if (!newsWantsVk_(item)) {
    return { ok: true, skipped: true };
  }

  const props = PropertiesService.getScriptProperties();
  const workerUrl = String(props.getProperty('VK_WORKER_URL') || '').replace(/\/$/, '');
  const workerSecret = String(props.getProperty('VK_WORKER_SECRET') || '');

  if (!workerUrl || !workerSecret) {
    console.error('VK worker не настроен: нет VK_WORKER_URL/VK_WORKER_SECRET');
    return { ok: false, error: 'worker_not_configured' };
  }

  const idToUse = String(item.id || newsId || '');
  const payload = {
    id: idToUse,
    title: item.title || '',
    lead: item.lead || '',
    coverImage: item.coverImage || '',
    url: 'https://ranepa-dpo39.ru/news.html#' + encodeURIComponent(idToUse)
  };

  let lastError = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = UrlFetchApp.fetch(workerUrl + '/publish', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'X-Worker-Secret': workerSecret },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      const code = response.getResponseCode();
      const raw = response.getContentText();
      let data = {};
      try { data = JSON.parse(raw); } catch (e) {}

      if (code >= 200 && code < 300 && data.ok) {
        console.log('VK worker принял новость ' + idToUse);
        return data;
      }

      lastError = 'HTTP ' + code + ': ' + raw.slice(0, 300);
    } catch (err) {
      lastError = String(err && err.message || err);
    }

    Utilities.sleep(Math.min(1000 * Math.pow(2, attempt - 1), 4000));
  }

  console.error('VK worker не принял новость: ' + lastError);
  return { ok: false, error: lastError };
}
```

## В `newsSave_` заменить только два вызова

При обновлении существующей новости:

```javascript
if (isNewPublish) {
  sendNewsEmailNotification_(item);
  queueNewsToVk_(item, item.id);
}
```

При создании новой опубликованной новости:

```javascript
if (status === 'published') {
  sendNewsEmailNotification_(item, newId);
  queueNewsToVk_(item, newId);
}
```

Старый вызов `postNewsToVk_` больше не использовать.

## После проверки

Старую функцию `postNewsToVk_` и старые VK-токены из исходника удалить. VK-токены должны находиться только на worker-сервере.
