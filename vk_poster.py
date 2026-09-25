import json
import os
import sys
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


def get_json(url, params=None):
    response = requests.get(
        url,
        params=params,
        timeout=30,
    )

    response.raise_for_status()

    return response.json()


def vk_api(method, params):
    request_params = {
        **params,
        "access_token": VK_TOKEN,
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


# =========================
# СОСТОЯНИЕ ПУБЛИКАЦИЙ
# =========================

def load_state():
    if not STATE_FILE.exists():
        return set()

    try:
        with STATE_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)

        if isinstance(data, list):
            return {safe_text(item) for item in data}

        if isinstance(data, dict):
            published = data.get("published", [])

            if isinstance(published, list):
                return {safe_text(item) for item in published}

    except Exception as error:
        print(f"Не удалось прочитать {STATE_FILE}: {error}")

    return set()


def save_state(published_ids):
    with STATE_FILE.open("w", encoding="utf-8") as file:
        json.dump(
            sorted(published_ids),
            file,
            ensure_ascii=False,
            indent=2,
        )


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
        "attachments": news_url,
    }

    print(f"Публикуем в VK: {title}")

    response = vk_api(
        "wall.post",
        params,
    )

    post_id = response.get("post_id")

    print(
        f"Успешно опубликовано: "
        f"post_id={post_id}, news_id={news_id}"
    )

    return post_id


# =========================
# ОСНОВНАЯ ЛОГИКА
# =========================

def main():
    published_ids = load_state()

    print(
        f"Уже опубликовано ранее: "
        f"{len(published_ids)}"
    )

    news_list = get_news()

    published_count = 0
    skipped_count = 0
    error_count = 0

    for news in news_list:
        if not isinstance(news, dict):
            print(
                f"Пропускаем некорректную запись: "
                f"{type(news).__name__}"
            )
            error_count += 1
            continue

        news_id = get_news_id(news)
        title = get_news_title(news)

        if not news_id:
            print(
                f"Пропускаем новость без ID: {title}"
            )
            error_count += 1
            continue

        if news_id in published_ids:
            print(
                f"Уже опубликовано, пропускаем: "
                f"{title}"
            )
            skipped_count += 1
            continue

        try:
            publish_to_vk(news)

            published_ids.add(news_id)
            published_count += 1

            # Сохраняем сразу после успешной публикации.
            save_state(published_ids)

        except Exception as error:
            error_count += 1

            print(
                f"Ошибка публикации "
                f"«{title}»: {error}"
            )

    print()
    print("========== ИТОГ ==========")
    print(f"Новых публикаций: {published_count}")
    print(f"Пропущено: {skipped_count}")
    print(f"Ошибок: {error_count}")
    print("==========================")

    # Не считаем отсутствие новостей ошибкой.
    # Но если VK не опубликовал ни одной новости
    # из-за ошибок, завершаем Actions с ошибкой.
    if error_count > 0 and published_count == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
