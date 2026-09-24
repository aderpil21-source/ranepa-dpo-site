import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import requests
from PIL import Image
from dotenv import load_dotenv


# ============================================================
# CONFIG
# ============================================================

load_dotenv()

VK_TOKEN = os.getenv("VK_TOKEN", "").strip().strip("'\"")
VK_OWNER_ID = os.getenv("VK_OWNER_ID", "").strip().strip("'\"")

# Версия API, с которой сейчас работает существующая интеграция.
VK_API_VERSION = os.getenv("VK_API_VERSION", "5.199").strip()

SITE_URL = "https://ranepa-dpo39.ru/"
NEWS_API = (
    "https://script.google.com/macros/s/"
    "AKfycbznjvWDxlxxlANkzTCChnvlyEbW3N74vpOEE8pJaccExiXQG7DZU1SghQApDslMNEOk"
    "/exec"
)

STATE_FILE = Path("vk_published.json")

REQUEST_TIMEOUT = 30
MAX_IMAGE_SIZE = 20 * 1024 * 1024

VK_API_URL = "https://api.vk.com/method/"


# ============================================================
# LOGGING
# ============================================================

def log(message: str):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] {message}", flush=True)


# ============================================================
# VALIDATION
# ============================================================

def validate_config():
    missing = []

    if not VK_TOKEN:
        missing.append("VK_TOKEN")

    if not VK_OWNER_ID:
        missing.append("VK_OWNER_ID")

    if missing:
        raise RuntimeError(
            "Не заданы GitHub Secrets: " + ", ".join(missing)
        )

    log(f"VK_OWNER_ID: {VK_OWNER_ID}")
    log(f"VK API version: {VK_API_VERSION}")


# ============================================================
# VK API
# ============================================================

def vk_request(method: str, params=None, timeout=REQUEST_TIMEOUT):
    params = dict(params or {})
    params["access_token"] = VK_TOKEN
    params["v"] = VK_API_VERSION

    url = VK_API_URL + method

    response = requests.post(
        url,
        data=params,
        timeout=timeout,
    )

    response.raise_for_status()

    try:
        result = response.json()
    except ValueError:
        raise RuntimeError(
            f"VK вернул не JSON для {method}: {response.text[:500]}"
        )

    if "error" in result:
        error = result["error"]

        code = error.get("error_code")
        message = error.get("error_msg", "Неизвестная ошибка VK")
        params_echo = error.get("request_params", [])

        raise VKError(
            code=code,
            message=message,
            request_params=params_echo,
        )

    return result.get("response")


class VKError(Exception):
    def __init__(self, code, message, request_params=None):
        self.code = code
        self.message = message
        self.request_params = request_params or []

        super().__init__(
            f"VK API error {code}: {message}"
        )


# ============================================================
# NEWS API
# ============================================================

def fetch_news():
    log("Получаем новости из API сайта...")

    response = requests.get(
        NEWS_API,
        params={"type": "news"},
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()

    data = response.json()

    items = data.get("items", [])

    if not isinstance(items, list):
        raise RuntimeError("API сайта вернул некорректный items")

    published = [
        item
        for item in items
        if item.get("status") == "published"
    ]

    log(f"Всего записей: {len(items)}")
    log(f"Опубликованных: {len(published)}")

    return published


# ============================================================
# NEWS SORTING
# ============================================================

def news_sort_key(item):
    """
    Стараемся сортировать новости от старых к новым.
    Основной ID у твоей системы строковый, поэтому дополнительно
    учитываем createdAt.
    """

    created_at = item.get("createdAt") or ""

    try:
        return (
            0,
            datetime.fromisoformat(
                created_at.replace("Z", "+00:00")
            ).timestamp(),
            str(item.get("id", "")),
        )
    except Exception:
        return (
            1,
            0,
            str(item.get("id", "")),
        )


# ============================================================
# STATE
# ============================================================

def load_state():
    if not STATE_FILE.exists():
        return {
            "published": {}
        }

    try:
        data = json.loads(
            STATE_FILE.read_text(encoding="utf-8")
        )

        if not isinstance(data, dict):
            raise ValueError()

        if not isinstance(data.get("published"), dict):
            data["published"] = {}

        return data

    except Exception as exc:
        log(f"Не удалось прочитать {STATE_FILE}: {exc}")

        # Не уничтожаем старый state.
        backup = STATE_FILE.with_suffix(".broken.json")

        try:
            STATE_FILE.rename(backup)
            log(f"Повреждённый state сохранён как {backup}")
        except Exception:
            pass

        return {
            "published": {}
        }


def save_state(state):
    temp_file = STATE_FILE.with_suffix(".tmp")

    temp_file.write_text(
        json.dumps(
            state,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    temp_file.replace(STATE_FILE)


def is_published(state, news_id):
    return str(news_id) in state.get("published", {})


def mark_published(
    state,
    news_id,
    vk_post_id,
    attachment=None,
):
    state.setdefault("published", {})[str(news_id)] = {
        "vk_post_id": vk_post_id,
        "attachment": attachment,
        "published_at": datetime.now(
            timezone.utc
        ).isoformat(),
    }

    save_state(state)


# ============================================================
# IMAGE
# ============================================================

def normalize_image_url(url):
    if not url:
        return None

    url = str(url).strip()

    # Google Drive compatibility
    if "drive.google.com" in url:
        match = (
            re.search(r"[?&]id=([\w-]+)", url)
            or re.search(r"/file/d/([\w-]+)", url)
        )

        if match:
            return (
                "https://drive.google.com/uc"
                f"?export=view&id={match.group(1)}"
            )

    return url


def get_cover_image_url(item):
    cover = (
        item.get("coverImage")
        or ""
    ).strip()

    if cover:
        return normalize_image_url(cover)

    for block in item.get("blocks", []) or []:
        if not isinstance(block, dict):
            continue

        if block.get("type") != "image":
            continue

        if block.get("hidden"):
            continue

        url = block.get("url")

        if url:
            return normalize_image_url(url)

    return None


def download_image(image_url):
    if not image_url:
        return None

    log(f"Скачиваем изображение: {image_url}")

    response = requests.get(
        image_url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 "
                "(compatible; RANEPA-DPO-VK-Publisher/1.0)"
            )
        },
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()

    content_length = response.headers.get("Content-Length")

    if content_length:
        try:
            if int(content_length) > MAX_IMAGE_SIZE:
                raise RuntimeError(
                    "Изображение слишком большое."
                )
        except ValueError:
            pass

    if len(response.content) > MAX_IMAGE_SIZE:
        raise RuntimeError(
            "Изображение превышает допустимый размер."
        )

    return response.content


def convert_to_jpeg(image_bytes):
    log("Подготавливаем изображение для VK...")

    image = Image.open(BytesIO(image_bytes))

    # Исправляем ориентацию EXIF.
    try:
        from PIL import ImageOps

        image = ImageOps.exif_transpose(image)
    except Exception:
        pass

    if image.mode not in ("RGB", "L"):
        background = Image.new(
            "RGB",
            image.size,
            "white",
        )

        if "A" in image.getbands():
            background.paste(
                image,
                mask=image.getchannel("A"),
            )
        else:
            background.paste(image)

        image = background

    elif image.mode == "L":
        image = image.convert("RGB")

    output = BytesIO()

    image.save(
        output,
        format="JPEG",
        quality=95,
        optimize=True,
    )

    jpeg_bytes = output.getvalue()

    log(
        f"Изображение подготовлено: "
        f"{len(jpeg_bytes)} байт"
    )

    return jpeg_bytes


# ============================================================
# VK PHOTO UPLOAD
# ============================================================

def get_wall_upload_server():
    """
    ВАЖНО:
    Этот метод является проблемным для Community Token.
    Поэтому VK_TOKEN здесь должен быть пользовательским токеном,
    имеющим необходимые права.
    """

    log("Получаем VK upload server...")

    return vk_request(
        "photos.getWallUploadServer",
        timeout=REQUEST_TIMEOUT,
    )


def upload_photo_to_vk(image_bytes):
    upload_server = get_wall_upload_server()

    upload_url = upload_server.get("upload_url")

    if not upload_url:
        raise RuntimeError(
            "VK не вернул upload_url."
        )

    log("Загружаем изображение на VK upload server...")

    response = requests.post(
        upload_url,
        files={
            "photo": (
                "cover.jpg",
                image_bytes,
                "image/jpeg",
            )
        },
        timeout=60,
    )

    response.raise_for_status()

    result = response.json()

    if result.get("error"):
        raise RuntimeError(
            f"VK upload error: {result}"
        )

    if not result.get("photo"):
        raise RuntimeError(
            f"VK upload не вернул photo: {result}"
        )

    log("Файл загружен на VK upload server.")

    return result


def save_wall_photo(upload_result):
    log("Сохраняем фотографию в VK...")

    response = vk_request(
        "photos.saveWallPhoto",
        params={
            "photo": upload_result["photo"],
            "server": upload_result["server"],
            "hash": upload_result["hash"],
        },
    )

    if not response:
        raise RuntimeError(
            "photos.saveWallPhoto не вернул фотографию."
        )

    photo = response[0]

    owner_id = photo["owner_id"]
    photo_id = photo["id"]

    attachment = (
        f"photo{owner_id}_{photo_id}"
    )

    log(f"Фото сохранено: {attachment}")

    return attachment


def prepare_vk_attachment(image_url):
    image_bytes = download_image(image_url)

    jpeg_bytes = convert_to_jpeg(image_bytes)

    upload_result = upload_photo_to_vk(
        jpeg_bytes
    )

    attachment = save_wall_photo(
        upload_result
    )

    return attachment


# ============================================================
# POST TEXT
# ============================================================

def build_post_message(item):
    title = (
        item.get("title")
        or "Новость Центра ДПО"
    ).strip()

    lead = (
        item.get("lead")
        or ""
    ).strip()

    news_id = str(
        item.get("id")
        or ""
    ).strip()

    if news_id:
        news_url = (
            f"{SITE_URL}news.html#{news_id}"
        )
    else:
        news_url = (
            f"{SITE_URL}news.html"
        )

    parts = [
        f"🔥 {title}",
    ]

    if lead:
        parts.append(lead)

    parts.append(
        f"Подробнее: {news_url}"
    )

    return "\n\n".join(parts)


# ============================================================
# VK WALL POST
# ============================================================

def get_group_owner_id():
    """
    Для стены сообщества owner_id должен быть отрицательным.
    """

    value = VK_OWNER_ID.strip()

    if value.startswith("-"):
        return value

    return f"-{value}"


def publish_post(message, attachment=None):
    params = {
        "owner_id": get_group_owner_id(),
        "from_group": 1,
        "message": message,
    }

    if attachment:
        params["attachments"] = attachment

    log("Публикуем запись на стене VK...")

    response = vk_request(
        "wall.post",
        params=params,
    )

    if not response:
        raise RuntimeError(
            "wall.post не вернул response."
        )

    post_id = response.get("post_id")

    if not post_id:
        raise RuntimeError(
            f"VK wall.post вернул неожиданный ответ: {response}"
        )

    log(
        f"Пост опубликован. VK post_id={post_id}"
    )

    return post_id


# ============================================================
# ONE NEWS
# ============================================================

def publish_news_item(item, state):
    news_id = str(
        item.get("id")
        or ""
    ).strip()

    if not news_id:
        raise RuntimeError(
            "У новости отсутствует id."
        )

    title = (
        item.get("title")
        or "Без названия"
    ).strip()

    log("=" * 70)
    log(
        f"Обрабатываем новость: "
        f"{news_id} — {title}"
    )

    if is_published(state, news_id):
        log(
            f"Новость {news_id} уже опубликована. Пропуск."
        )
        return False

    message = build_post_message(item)

    image_url = get_cover_image_url(item)

    attachment = None

    if image_url:
        log(
            f"Найдена картинка: {image_url}"
        )

        try:
            attachment = prepare_vk_attachment(
                image_url
            )

        except VKError as exc:
            if exc.code == 27:
                raise RuntimeError(
                    "\n"
                    "VK вернул ошибку 27: "
                    "Group authorization failed.\n\n"
                    "VK не разрешает photos.getWallUploadServer "
                    "с Community Token.\n"
                    "Для публикации фотографии нужен "
                    "подходящий User Token.\n\n"
                    f"Сообщение VK: {exc.message}"
                )

            if exc.code in (5, 15, 1130):
                raise RuntimeError(
                    "\n"
                    f"VK вернул ошибку {exc.code}: "
                    f"{exc.message}\n\n"
                    "Проверь тип VK_TOKEN, способ его получения "
                    "и привязку токена к окружению/IP."
                )

            raise

    else:
        log(
            "У новости нет изображения. "
            "Публикуем только текст."
        )

    post_id = publish_post(
        message=message,
        attachment=attachment,
    )

    mark_published(
        state=state,
        news_id=news_id,
        vk_post_id=post_id,
        attachment=attachment,
    )

    log(
        f"Новость {news_id} успешно опубликована."
    )

    return True


# ============================================================
# MAIN
# ============================================================

def main():
    validate_config()

    state = load_state()

    news = fetch_news()

    if not news:
        log("Опубликованных новостей нет.")
        return

    news.sort(key=news_sort_key)

    unpublished = [
        item
        for item in news
        if not is_published(
            state,
            str(item.get("id", ""))
        )
    ]

    log(
        f"Новых новостей для VK: "
        f"{len(unpublished)}"
    )

    if not unpublished:
        log("Новых публикаций нет.")
        return

    # Публикуем все пропущенные новости по порядку.
    for item in unpublished:
        try:
            publish_news_item(
                item,
                state,
            )

        except VKError as exc:
            log(
                f"ОШИБКА VK {exc.code}: "
                f"{exc.message}"
            )

            # Ошибка VK должна завершить workflow,
            # чтобы GitHub Actions показывал Failed.
            raise

        except Exception as exc:
            log(
                f"ОШИБКА при публикации: "
                f"{exc}"
            )
            raise

        # Небольшая пауза между постами.
        time.sleep(2)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"КРИТИЧЕСКАЯ ОШИБКА: {exc}")
        sys.exit(1)