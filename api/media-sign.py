"""Secure media-signing gateway for the news editor.

The browser never receives the reusable Yandex signer secret. It sends the
short-lived editor token; this endpoint validates that token against the
existing news backend, then requests a one-time upload URL server-to-server.
"""

import os
import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

NEWS_API_URL = os.getenv(
    "NEWS_API_URL",
    "https://script.google.com/macros/s/AKfycbznjvWDxlxxlANkzTCChnvlyEbW3N74vpOEE8pJaccExiXQG7DZU1SghQApDslMNEOk/exec",
)
YANDEX_SIGNER_URL = os.getenv("YANDEX_SIGNER_URL", "")
YANDEX_UPLOAD_TOKEN = os.getenv("YANDEX_UPLOAD_TOKEN", "")
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.getenv(
        "MEDIA_ALLOWED_ORIGINS",
        "https://ranepa-dpo39.ru,https://www.ranepa-dpo39.ru,https://ranepa-dpo-site.vercel.app",
    ).split(",")
    if origin.strip()
}

MAX_IMAGE_BYTES = 30 * 1024 * 1024
MAX_VIDEO_BYTES = 500 * 1024 * 1024
ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime",
}


def cors(response):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.after_request
def add_headers(response):
    return cors(response)


def error(message, code, status):
    return jsonify({"ok": False, "error": message, "code": code}), status


def editor_token_is_valid(token):
    if not token:
        return False
    try:
        response = requests.get(
            NEWS_API_URL,
            params={"type": "news", "admin": "1", "token": token},
            timeout=12,
            allow_redirects=True,
        )
        if response.status_code != 200:
            return False
        data = response.json()
        # The admin endpoint is expected to reject invalid/expired tokens.
        return bool(data.get("ok", True)) and not data.get("error")
    except (requests.RequestException, ValueError):
        return None


@app.route("/api/media-sign", methods=["POST", "OPTIONS"])
def media_sign():
    if request.method == "OPTIONS":
        return ("", 204)

    origin = request.headers.get("Origin", "")
    if origin not in ALLOWED_ORIGINS:
        return error("Источник запроса не разрешён", "BAD_ORIGIN", 403)

    if not YANDEX_SIGNER_URL or not YANDEX_UPLOAD_TOKEN:
        return error("Медиахранилище ещё не настроено", "STORAGE_NOT_CONFIGURED", 503)

    body = request.get_json(silent=True) or {}
    editor_token = str(body.get("editorToken") or "")
    valid = editor_token_is_valid(editor_token)
    if valid is None:
        return error("Не удалось проверить сессию редактора", "AUTH_UPSTREAM_UNAVAILABLE", 503)
    if not valid:
        return error("Сессия редактора истекла", "SESSION_EXPIRED", 401)

    filename = str(body.get("filename") or "").strip()
    content_type = str(body.get("contentType") or "").lower()
    try:
        size = int(body.get("size") or 0)
    except (TypeError, ValueError):
        size = 0

    if not filename or content_type not in ALLOWED_TYPES or size <= 0:
        return error("Недопустимый файл", "BAD_FILE", 400)

    limit = MAX_IMAGE_BYTES if content_type.startswith("image/") else MAX_VIDEO_BYTES
    if size > limit:
        return error("Файл превышает допустимый размер", "TOO_BIG", 413)

    try:
        signer = requests.post(
            YANDEX_SIGNER_URL,
            json={
                "token": YANDEX_UPLOAD_TOKEN,
                "filename": filename,
                "contentType": content_type,
                "size": size,
            },
            timeout=15,
        )
        data = signer.json()
    except requests.Timeout:
        return error("Хранилище не ответило вовремя", "SIGNER_TIMEOUT", 504)
    except (requests.RequestException, ValueError):
        return error("Не удалось связаться с хранилищем", "SIGNER_UNAVAILABLE", 502)

    if signer.status_code >= 400 or not data.get("ok") or not data.get("uploadUrl"):
        return error(
            data.get("error") or "Хранилище не выдало ссылку на загрузку",
            data.get("code") or "SIGNER_REJECTED",
            502,
        )

    return jsonify({
        "ok": True,
        "uploadUrl": data["uploadUrl"],
        "publicUrl": data.get("publicUrl"),
    })
