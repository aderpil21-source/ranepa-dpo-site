"""
api/chat.py -> доступен на /api/chat.

Gemini в России нестабилен/заблокирован — переключил бэкенд на YandexGPT
(Yandex Foundation Models). Фронтенд (ar-lab.html) трогать не пришлось:
он как отправлял {"contents": [...]} и ждал {"candidates": [...]} в ответе
(формат Gemini), так и продолжает — вся конвертация в формат Yandex и
обратно сделана здесь, внутри бэкенда.

Нужно два значения в переменных окружения Vercel (Project Settings ->
Environment Variables), НЕ в коде и НЕ в .env в репозитории:
  YANDEX_API_KEY   — API-ключ сервисного аккаунта
                     (Yandex Cloud -> сервисный аккаунт -> "Создать API-ключ")
  YANDEX_FOLDER_ID — id каталога, где создан сервисный аккаунт
                     (виден в консоли Yandex Cloud рядом с названием каталога)

У сервисного аккаунта должна быть роль ai.languageModels.user (или выше).
"""

import logging
import os
import time
from collections import defaultdict, deque

import requests
from flask import Flask, jsonify, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ar-lab-chat")

app = Flask(__name__)

YANDEX_API_KEY = os.environ.get("YANDEX_API_KEY")
YANDEX_FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID")
YANDEX_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
MODEL_URI_TEMPLATE = "gpt://{folder_id}/yandexgpt-lite"

SYSTEM_TEXT = "Ты встроенный ИИ-помощник лаборатории. Отвечай кратко, умно и дружелюбно."

MAX_TURNS = 20
MAX_MESSAGE_CHARS = 2000
RATE_LIMIT = 15
RATE_WINDOW_SEC = 60

# In-memory sliding-window лимитер — best-effort на serverless (см. предупреждение
# в конце файла), но всё равно лучше, чем полностью открытый кран.
_requests_by_ip = defaultdict(deque)


def is_rate_limited(ip: str) -> bool:
    now = time.time()
    q = _requests_by_ip[ip]
    while q and now - q[0] > RATE_WINDOW_SEC:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        return True
    q.append(now)
    return False


def validate_contents(contents):
    if not isinstance(contents, list) or not contents:
        return "contents должен быть непустым списком"
    if len(contents) > MAX_TURNS:
        return f"слишком длинная история (максимум {MAX_TURNS} реплик за запрос)"
    for turn in contents:
        if not isinstance(turn, dict):
            return "каждая реплика должна быть объектом"
        if turn.get("role") not in ("user", "model"):
            return "у каждой реплики должна быть role: user или model"
        parts = turn.get("parts")
        if not isinstance(parts, list) or not parts or not isinstance(parts[0], dict):
            return "у каждой реплики должны быть parts"
        text = parts[0].get("text", "")
        if not isinstance(text, str) or not text.strip():
            return "пустое сообщение в истории"
        if len(text) > MAX_MESSAGE_CHARS:
            return f"сообщение длиннее {MAX_MESSAGE_CHARS} символов"
    return None


def gemini_contents_to_yandex_messages(contents):
    """Фронтенд говорит на языке Gemini (role/parts) — переводим в язык Yandex (role/text)."""
    messages = [{"role": "system", "text": SYSTEM_TEXT}]
    for turn in contents:
        role = "assistant" if turn["role"] == "model" else "user"
        messages.append({"role": role, "text": turn["parts"][0]["text"]})
    return messages


@app.route("/api/chat", methods=["POST"])
def chat():
    if not YANDEX_API_KEY or not YANDEX_FOLDER_ID:
        log.error("YANDEX_API_KEY / YANDEX_FOLDER_ID не заданы в переменных окружения Vercel")
        return jsonify({"error": "server_misconfigured"}), 500

    ip = request.headers.get("X-Forwarded-For", request.remote_addr)

    if is_rate_limited(ip):
        log.warning("Rate limit hit: %s", ip)
        return jsonify({"error": "rate_limited"}), 429

    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "bad_json"}), 400

    contents = body.get("contents")
    error = validate_contents(contents)
    if error:
        log.info("Rejected payload from %s: %s", ip, error)
        return jsonify({"error": error}), 400

    payload = {
        "modelUri": MODEL_URI_TEMPLATE.format(folder_id=YANDEX_FOLDER_ID),
        "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": "800"},
        "messages": gemini_contents_to_yandex_messages(contents),
    }
    headers = {
        "Authorization": f"Api-Key {YANDEX_API_KEY}",
        "x-folder-id": YANDEX_FOLDER_ID,
        "Content-Type": "application/json",
    }

    try:
        upstream = requests.post(YANDEX_URL, headers=headers, json=payload, timeout=20)
    except requests.exceptions.Timeout:
        log.error("Upstream timeout for %s", ip)
        return jsonify({"error": "upstream_timeout"}), 504
    except requests.exceptions.RequestException as exc:
        log.error("Upstream request failed: %s", exc)
        return jsonify({"error": "upstream_unreachable"}), 502

    if upstream.status_code != 200:
        log.error("Upstream returned %s: %s", upstream.status_code, upstream.text[:300])
        return jsonify({"error": "upstream_error"}), 502

    try:
        data = upstream.json()
        yandex_text = data["result"]["alternatives"][0]["message"]["text"]
    except (KeyError, IndexError, ValueError):
        log.error("Unexpected Yandex response shape: %s", upstream.text[:300])
        return jsonify({"error": "upstream_error"}), 502

    if not yandex_text or not yandex_text.strip():
        return jsonify({"error": "empty_response"}), 502

    # Отдаём фронтенду ответ в форме, которую он уже умеет читать (формат Gemini) —
    # так ar-lab.html не пришлось трогать вообще.
    return jsonify({
        "candidates": [{"content": {"parts": [{"text": yandex_text}]}}]
    })


# Локальная проверка без Vercel CLI:
#   YANDEX_API_KEY=... YANDEX_FOLDER_ID=... python api/chat.py
if __name__ == "__main__":
    app.run(port=5000, debug=True)
