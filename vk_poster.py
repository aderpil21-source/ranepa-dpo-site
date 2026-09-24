import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests


# ============================================================
# CONFIG
# ============================================================

NEWS_API_URL = (
    "https://script.google.com/macros/s/"
    "AKfycbznjvWDxlxxlANkzTCChnvlyEbW3N74vpOEE8pJaccExiXQG7DZU1SghQApDslMNEOk"
    "/exec"
)

VK_TOKEN = os.getenv("VK_TOKEN")
VK_OWNER_ID = os.getenv("VK_OWNER_ID")
VK_API_VERSION = os.getenv("VK_API_VERSION", "5.199")

STATE_FILE = Path("vk_published.json")

REQUEST_TIMEOUT = 30


# ============================================================
# HELPERS
# ============================================================

def fail(message):
    print(f"ОШИБКА: {message}")
    sys.exit(1)


def get_json(url, params=None):
    response = requests.get(
        url,
        params=params,
        timeout=REQUEST_TIMEOUT,
        headers={
            "User-Agent": "Ranepa-DPO-VK-Publisher/1.0"
        }
    )

    response.raise_for_status()

    try:
        return response.json()
    except Exception:
        print("Ответ сервера:")
        print(response.text[:2000])
        raise


def vk_api(method, params):
    url = f"https://api.vk.com/method/{method}"

    params = dict(params)
    params["access_token"] = VK_TOKEN
    params["v"] = VK_API_VERSION

    response = requests.post(
        url,
        data=params,
        timeout=REQUEST_TIMEOUT,
        headers={
            "User-Agent": "Ranepa-DPO-VK-Publisher/1.0"
        }
    )

    response.raise_for_status()

    data = response.json()

    if "error" in data:
        error = data["error"]

        code = error.get("error_code")
        message = error.get("error_msg")

        raise RuntimeError(
            f"VK API error {code}: {message}"
        )

    return data.get("response")


# ============================================================
# STATE
# ============================================================

def load_state():
    if not STATE_FILE.exists():
        return {}

    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, dict):
            return data

    except Exception as e:
        print(f"Не удалось прочитать {STATE_FILE}: {e}")

    return {}


def save_state(state):
    temp_file = STATE_FILE.with_suffix(".tmp")

    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(
            state,
            f,
            ensure_ascii=False,
            indent=2
        )

    temp_file.replace(STATE_FILE)


# ============================================================
# NEWS
# ============================================================

def get_news():
    print("Получаем новости из API сайта...")

    data = get_json(
        NEWS_API_URL,
        params={
            "type": "news"
        }
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
        fail("API сайта вернул неожиданный формат данных.")

    print(f"Всего записей: {len(news)}")

    return news


def is_published(news):
    status = str(news.get("status", "")).lower().strip()

    return status in {
        "published",
        "опубликовано",
        "опубликован",
        "public"
    }


def get_news_id(news):
    return str(
        news.get("id")
        or news.get("_id")
        or news.get("uuid")
        or ""
    ).strip()


def get_news_title(news):
    return (
        news.get("title")
        or news.get("name")
        or "Новость"
    ).strip()


def get_news_lead(news):
    return (
        news.get("lead")
        or news.get("description")
        or news.get("excerpt")
        or ""
    ).strip()


def get_news_url(news):
    """
    Если API уже хранит URL новости — используем его.
    Иначе строим URL по ID.
    """

    url = (
        news.get("url")
        or news.get("link")
        or news.get("href")
        or news.get("newsUrl")
        or ""
    )

    if url:
        return str(url).strip()

    news_id = get_news_id(news)

    if news_id:
        return f"https://ranepa-dpo39.ru/news.html?id={news_id}"

    return "https://ranepa-dpo39.ru/"


# ============================================================
# IMAGE
# ============================================================

def normalize_image_url(url):
    if not url:
        return ""

    url = str(url).strip()

    # Google Drive:
    # https://drive.google.com/file/d/FILE_ID/view
    if "drive.google.com/file/d/" in url:
        try:
            file_id = url.split("/file/d/")[1].split("/")[0]

            return (
                "https://drive.google.com/uc"
                f"?export=view&id={file_id}"
            )
        except Exception:
            pass

    # Google Drive:
    # https://drive.google.com/open?id=FILE_ID
    if "drive.google.com/open?id=" in url:
        file_id = url.split("open?id=")[1].split("&")[0]

        return (
            "https://drive.google.com/uc"
            f"?export=view&id={file_id}"
        )

    return url


def extract_image(news):
    # 1. Обложка
    cover = news.get("coverImage")

    if cover:
        if isinstance(cover, dict):
            cover = (
                cover.get("url")
                or cover.get("src")
                or cover.get("publicUrl")
            )

        if cover:
            return normalize_image_url(cover)

    # 2. Иногда поле называется image
    image = news.get("image")

    if image:
        if isinstance(image, dict):
            image = (
                image.get("url")
                or image.get("src")
                or image.get("publicUrl")
            )

        if image:
            return normalize_image_url(image)

    # 3. Первый image-блок
    blocks = news.get("blocks") or []

    if isinstance(blocks, list):
        for block in blocks:

            if not isinstance(block, dict):
                continue

            block_type = str(
                block.get("type")
                or block.get("blockType")
                or ""
            ).lower()

            if block_type not in {
                "image",
                "img",
                "photo",
                "picture"
            }:
                continue

            url = (
                block.get("url")
                or block.get("src")
                or block.get("image")
                or block.get("publicUrl")
            )

            if isinstance(url, dict):
                url = (
                    url.get("url")
                    or url.get("src")
                    or url.get("publicUrl")
                )

            if url:
                return normalize_image_url(url)

    return ""


# ============================================================
# VK POST
# ============================================================

def publish_to_vk(news):
    news_id = get_news_id(news)
    title = get_news_title(news)
    lead = get_news_lead(news)
    news_url = get_news_url(news)
    image_url = extract_image(news)

    print()
    print(f"Обрабатываем новость: {news_id} — {title}")

    if image_url:
        print(f"Найдена картинка: {image_url}")
    else:
        print("Картинка не найдена.")

    # --------------------------------------------------------
    # Формируем текст
    # --------------------------------------------------------

    parts = []

    if title:
        parts.append(title)

    if lead:
        parts.append(lead)

    parts.append(
        f"Подробнее: {news_url}"
    )

    message = "\n\n".join(parts).strip()

    # --------------------------------------------------------
    # Параметры wall.post
    # --------------------------------------------------------

    params = {
        "owner_id": VK_OWNER_ID,
        "from_group": 1,
        "message": message,
    }

    # VK позволяет передавать URL изображения
    # как изображение ссылки.
    #
    # Важно:
    # это НЕ загрузка фото через photos.getWallUploadServer.
    # Поэтому нам не нужен пользовательский токен.
    if image_url:
        params["link_image"] = image_url

    print("Публикуем запись в VK...")

    response = vk_api(
        "wall.post",
        params
    )

    post_id = response.get("post_id")

    if not post_id:
        raise RuntimeError(
            f"VK не вернул post_id: {response}"
        )

    print(
        f"VK: опубликовано успешно. "
        f"post_id={post_id}"
    )

    return {
        "post_id": post_id,
        "news_id": news_id,
        "title": title,
        "url": news_url,
        "image_url": image_url,
    }


# ============================================================
# MAIN
# ============================================================

def main():

    if not VK_TOKEN:
        fail(
            "Не найден секрет VK_TOKEN. "
            "Добавь его в GitHub Secrets."
        )

    if not VK_OWNER_ID:
        fail(
            "Не найден VK_OWNER_ID. "
            "Добавь ID сообщества в GitHub Secrets."
        )

    print(f"VK_OWNER_ID: {VK_OWNER_ID}")
    print(f"VK API version: {VK_API_VERSION}")
    print("Режим: Community Token")
    print()

    state = load_state()

    news_list = get_news()

    published_news = [
        news
        for news in news_list
        if is_published(news)
    ]

    print(
        f"Опубликованных на сайте: "
        f"{len(published_news)}"
    )

    # --------------------------------------------------------
    # Сортируем по дате, если она есть
    # --------------------------------------------------------

    def sort_key(item):
        return (
            item.get("publishedAt")
            or item.get("published_at")
            or item.get("date")
            or item.get("createdAt")
            or item.get("created_at")
            or ""
        )

    published_news.sort(
        key=sort_key
    )

    # --------------------------------------------------------
    # Только новые для VK
    # --------------------------------------------------------

    new_news = []

    for news in published_news:

        news_id = get_news_id(news)

        if not news_id:
            print(
                "Пропускаем запись без ID:"
            )
            print(news)
            continue

        if news_id in state:
            continue

        new_news.append(news)

    print(
        f"Новых новостей для VK: "
        f"{len(new_news)}"
    )

    if not new_news:
        print("Новых новостей нет.")
        return

    # --------------------------------------------------------
    # Публикуем по одной
    # --------------------------------------------------------

    for news in new_news:

        news_id = get_news_id(news)

        try:

            result = publish_to_vk(news)

            state[news_id] = {
                "published": True,
                "post_id": result["post_id"],
                "title": result["title"],
                "url": result["url"],
                "image_url": result["image_url"],
            }

            save_state(state)

            print(
                f"Состояние сохранено: {news_id}"
            )

        except Exception as e:

            print()
            print(
                f"ОШИБКА при публикации "
                f"{news_id}:"
            )
            print(str(e))

            # Важно:
            # эту новость НЕ записываем в state.
            # Значит, следующий запуск попробует её снова.

            continue


if __name__ == "__main__":
    main()