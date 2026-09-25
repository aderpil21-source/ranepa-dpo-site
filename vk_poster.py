import json
import os
import sys
import time
from pathlib import Path

import requests


# =========================
# НАСТРОЙКИ
# =========================

NEWS_API_URL = (
    "https://script.google.com/macros/s/"
    "AKfycbznjvWDxlxxlANkzTCChnvlyEbW3N74vpOEE8pJaccExiXQG7DZU1SghQApDslMNEOk"
    "/exec"
)

VK_API_URL = "https://api.vk.com/method/"
VK_API_VERSION = os.getenv("VK_API_VERSION", "5.199")

VK_TOKEN = os.getenv("VK_TOKEN")
VK_UPLOAD_TOKEN = os.getenv("VK_UPLOAD_TOKEN")
VK_OWNER_ID = os.getenv("VK_OWNER_ID")

STATE_FILE = Path("vk_published.json")


# =========================
# ПРОВЕРКА НАСТРОЕК
# =========================

if not VK_TOKEN:
    print("Ошибка: не найден VK_TOKEN")
    sys.exit(1)

if not VK_OWNER_ID:
    print("Ошибка: не найден VK_OWNER_ID")
    sys.exit(1)


# =========================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# =========================

def safe_text(value, default=""):
    """Безопасно превращает значение в строку."""
    if value is None:
        return default

    return str(value).strip()


def get_json(url, params=None, attempts=4):
    """
    GET JSON with recovery from transient Google Apps Script redirect failures.

    Apps Script web apps redirect to a short-lived script.googleusercontent.com URL.
    GitHub-hosted runners occasionally receive a stale/failed redirect (often 404).
    Each retry therefore starts again from the canonical script.google.com URL with
    a cache-busting query parameter instead of retrying the redirected URL.
    """
    base_params = dict(params or {})
    last_error = None

    for attempt in range(1, attempts + 1):
        request_params = {
            **base_params,
            "_cb": f"{int(time.time() * 1000)}-{attempt}",
        }
        try:
            response = requests.get(
                url,
                params=request_params,
                headers={
                    "Accept": "application/json,text/plain,*/*",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                    "User-Agent": (
                        "Mozilla/5.0 (X11; Linux x86_64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/153 Safari/537.36"
                    ),
                },
                timeout=(10, 45),
                allow_redirects=True,
            )

            response.raise_for_status()

            try:
                return response.json()
            except ValueError as error:
                preview = response.text[:180].replace("\n", " ")
                raise RuntimeError(
                    f"API вернул не JSON (HTTP {response.status_code}): {preview}"
                ) from error

        except (requests.RequestException, RuntimeError) as error:
            last_error = error
            final_url = ""
            try:
                final_url = response.url
            except Exception:
                pass

            print(
                f"Попытка {attempt}/{attempts} получить API не удалась: "
                f"{type(error).__name__}: {error}"
            )
            if final_url and "googleusercontent.com" in final_url:
                print("Сбой произошёл после временного редиректа Google; запрашиваем исходный URL заново.")

            if attempt < attempts:
                time.sleep(min(2 ** attempt, 8))

    raise RuntimeError(
        f"Не удалось получить данные API после {attempts} попыток: {last_error}"
    )


def vk_api_with_token(method, params, token):
    request_params = {
        **params,
        "access_token": token,
        "v": VK_API_VERSION,
    }

    response = requests.post(
        VK_API_URL + method,
        data=request_params,
        timeout=30,
    )

    response.raise_for_status()

    data = response.json()

    if "error" in data:
        error = data["error"]

        code = error.get("error_code")
        message = error.get("error_msg", "Неизвестная ошибка VK")

        raise RuntimeError(
            f"VK API error {code}: {message}"
        )

    return data["response"]


def vk_api(method, params):
    return vk_api_with_token(method, params, VK_TOKEN)


def get_news_image(news):
    value = (
        news.get("coverImage")
        or news.get("cover_image")
        or news.get("image")
        or news.get("imageUrl")
        or news.get("image_url")
    )
    value = safe_text(value)

    if value:
        return value

    blocks = news.get("blocks")
    if isinstance(blocks, list):
        for block in blocks:
            if not isinstance(block, dict):
                continue
            if block.get("hidden"):
                continue
            if safe_text(block.get("type")).lower() != "image":
                continue
            value = safe_text(block.get("url"))
            if value:
                return value

    return ""


def upload_image_to_vk(image_url):
    if not VK_UPLOAD_TOKEN:
        print("VK_UPLOAD_TOKEN не задан — публикуем без изображения.")
        return None

    group_id = safe_text(VK_OWNER_ID).lstrip("-")
    if not group_id.isdigit():
        raise RuntimeError("VK_OWNER_ID должен содержать числовой ID сообщества")

    print(f"Загружаем изображение в VK: {image_url}")

    image_response = requests.get(image_url, timeout=60)
    image_response.raise_for_status()

    content_type = image_response.headers.get("Content-Type", "").split(";", 1)[0].lower()
    if not content_type.startswith("image/"):
        raise RuntimeError(
            f"URL обложки вернул не изображение: {content_type or 'неизвестный тип'}"
        )

    upload_server = vk_api_with_token(
        "photos.getWallUploadServer",
        {"group_id": group_id},
        VK_UPLOAD_TOKEN,
    )
    upload_url = upload_server.get("upload_url")
    if not upload_url:
        raise RuntimeError("VK не вернул upload_url для изображения")

    filename = image_url.split("?", 1)[0].rsplit("/", 1)[-1] or "news.jpg"
    if "." not in filename:
        filename = "news.jpg"

    upload_response = requests.post(
        upload_url,
        files={"photo": (filename, image_response.content, content_type)},
        timeout=90,
    )
    upload_response.raise_for_status()
    upload_data = upload_response.json()

    if "error" in upload_data:
        error = upload_data["error"]
        raise RuntimeError(
            f"Ошибка загрузки изображения: {error.get('error_code')} "
            f"{error.get('error_msg', '')}"
        )

    save_params = {
        "group_id": group_id,
        "server": upload_data.get("server"),
        "photo": upload_data.get("photo"),
        "hash": upload_data.get("hash"),
    }

    if not all(save_params.get(key) for key in ("server", "photo", "hash")):
        raise RuntimeError("VK не вернул server/photo/hash после загрузки изображения")

    saved = vk_api_with_token(
        "photos.saveWallPhoto",
        save_params,
        VK_UPLOAD_TOKEN,
    )

    if not isinstance(saved, list) or not saved:
        raise RuntimeError("VK не вернул сохранённую фотографию")

    photo = saved[0]
    photo_owner_id = photo.get("owner_id")
    photo_id = photo.get("id")

    if photo_owner_id is None or photo_id is None:
        raise RuntimeError("VK не вернул owner_id/id сохранённой фотографии")

    attachment = f"photo{photo_owner_id}_{photo_id}"
    print(f"Изображение загружено: {attachment}")
    return attachment


# =========================
# СОСТОЯНИЕ ПУБЛИКАЦИЙ
# =========================

from datetime import datetime, timezone


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def empty_state():
    return {"version": 2, "items": {}}


def load_state():
    state = empty_state()
    if not STATE_FILE.exists():
        return state

    try:
        with STATE_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)

        # Совместимость со старым форматом: ["news-id", ...]
        if isinstance(data, list):
            for item in data:
                news_id = safe_text(item)
                if news_id:
                    state["items"][news_id] = {
                        "status": "published",
                        "post_id": None,
                        "updated_at": None,
                    }
            return state

        if isinstance(data, dict):
            if isinstance(data.get("items"), dict):
                return {
                    "version": 2,
                    "items": data.get("items", {}),
                }

            published = data.get("published", [])
            if isinstance(published, list):
                for item in published:
                    news_id = safe_text(item)
                    if news_id:
                        state["items"][news_id] = {
                            "status": "published",
                            "post_id": None,
                            "updated_at": None,
                        }
    except Exception as error:
        print(f"Не удалось прочитать {STATE_FILE}: {error}")

    return state


def save_state(state):
    tmp = STATE_FILE.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as file:
        json.dump(state, file, ensure_ascii=False, indent=2, sort_keys=True)
    tmp.replace(STATE_FILE)


def set_state(state, news_id, status, **extra):
    item = {
        "status": status,
        "updated_at": now_iso(),
        **extra,
    }
    state.setdefault("items", {})[news_id] = item
    save_state(state)


def is_published(state, news_id):
    return state.get("items", {}).get(news_id, {}).get("status") == "published"


# =========================
# ПОЛУЧЕНИЕ НОВОСТЕЙ
# =========================

def get_news():
    print("Получаем новости из Google Apps Script...")

    data = get_json(
        NEWS_API_URL,
        params={"type": "news"},
    )

    if isinstance(data, list):
        news = data

    elif isinstance(data, dict):
        news = (
            data.get("news")
            or data.get("items")
            or data.get("data")
            or []
        )

    else:
        news = []

    if not isinstance(news, list):
        news = []

    print(f"Получено новостей: {len(news)}")

    return news


# =========================
# ПОЛЯ НОВОСТИ
# =========================

def get_news_id(news):
    value = (
        news.get("id")
        or news.get("newsId")
        or news.get("uuid")
        or news.get("_id")
    )

    return safe_text(value)


def get_news_title(news):
    value = (
        news.get("title")
        or news.get("name")
        or "Новость"
    )

    return safe_text(value, "Новость")


def get_news_lead(news):
    value = (
        news.get("lead")
        or news.get("description")
        or news.get("excerpt")
        or news.get("summary")
        or ""
    )

    return safe_text(value)


def get_news_url(news):
    news_id = get_news_id(news)

    value = (
        news.get("url")
        or news.get("link")
        or news.get("href")
    )

    value = safe_text(value)

    if value:
        return value

    return f"https://ranepa-dpo39.ru/news.html?id={news_id}"


# =========================
# ПУБЛИКАЦИЯ В VK
# =========================

def publish_to_vk(news):
    news_id = get_news_id(news)
    title = get_news_title(news)
    lead = get_news_lead(news)
    news_url = get_news_url(news)

    if not news_id:
        raise RuntimeError("У новости отсутствует ID")

    message_parts = [
        title,
    ]

    if lead:
        message_parts.append(lead)

    message_parts.append(news_url)

    message = "\n\n".join(message_parts)

    # ID сообщества должен быть отрицательным.
    owner_id = safe_text(VK_OWNER_ID)

    if not owner_id.startswith("-"):
        owner_id = "-" + owner_id

    params = {
        "owner_id": owner_id,
        "from_group": 1,
        "message": message,
    }

    image_url = get_news_image(news)
    media_status = "none"
    media_error = None
    if image_url:
        try:
            attachment = upload_image_to_vk(image_url)
            if attachment:
                params["attachments"] = attachment
                media_status = "attached"
            else:
                media_status = "skipped"
        except Exception as error:
            media_status = "failed"
            media_error = safe_text(error)
            print(f"Не удалось прикрепить изображение: {error}")
            print("Продолжаем публикацию без изображения.")

    print(f"Публикуем в VK: {title}")

    response = vk_api(
        "wall.post",
        params,
    )

    post_id = response.get("post_id")
    if post_id is None:
        raise RuntimeError("VK не вернул post_id после wall.post")

    print(
        f"Успешно опубликовано: "
        f"post_id={post_id}, news_id={news_id}"
    )

    return {
        "post_id": post_id,
        "media_status": media_status,
        "media_error": media_error,
    }


# =========================
# ОСНОВНАЯ ЛОГИКА
# =========================

def main():
    state = load_state()

    published_ids = [
        news_id for news_id, item in state.get("items", {}).items()
        if item.get("status") == "published"
    ]
    print(f"Уже опубликовано ранее: {len(published_ids)}")

    news_list = get_news()

    published_count = 0
    skipped_count = 0
    error_count = 0

    for news in news_list:
        if not isinstance(news, dict):
            print(f"Пропускаем некорректную запись: {type(news).__name__}")
            error_count += 1
            continue

        news_id = get_news_id(news)
        title = get_news_title(news)

        if not news_id:
            print(f"Пропускаем новость без ID: {title}")
            error_count += 1
            continue

        if is_published(state, news_id):
            print(f"Уже опубликовано, пропускаем: {title}")
            skipped_count += 1
            continue

        # Фиксируем намерение до внешнего вызова. Если раннер оборвётся,
        # следующий запуск безопасно повторит запись, не считая её опубликованной.
        set_state(
            state,
            news_id,
            "publishing",
            title=title,
            attempts=int(state.get("items", {}).get(news_id, {}).get("attempts") or 0) + 1,
        )

        try:
            result = publish_to_vk(news)
            set_state(
                state,
                news_id,
                "published",
                title=title,
                post_id=result.get("post_id"),
                media_status=result.get("media_status"),
                media_error=result.get("media_error"),
                attempts=state["items"][news_id].get("attempts", 1),
                error=None,
            )
            published_count += 1

        except Exception as error:
            error_count += 1
            error_text = safe_text(error)
            set_state(
                state,
                news_id,
                "error",
                title=title,
                attempts=state["items"][news_id].get("attempts", 1),
                error=error_text[:500],
            )
            print(f"Ошибка публикации «{title}»: {error}")

    print()
    print("========== ИТОГ ==========")
    print(f"Новых публикаций: {published_count}")
    print(f"Пропущено: {skipped_count}")
    print(f"Ошибок: {error_count}")
    print("==========================")

    # Ошибка workflow нужна для внимания разработчика, но state уже сохранён
    # и следующий запуск сможет безопасно повторить только неуспешные записи.
    if error_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
