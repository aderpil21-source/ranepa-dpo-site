"""
api/chat.py — прокси для чата AR-Лаборатории, как Vercel Python Function.

На Vercel каждый .py файл в папке /api становится отдельной функцией на
своём пути: этот файл лежит в api/chat.py -> доступен на /api/chat.
Никакого отдельного процесса поднимать не нужно — Vercel сам вызывает
объект `app` (WSGI) на каждый запрос.

Раньше фронтенд дёргал generativelanguage.googleapis.com напрямую с пустым
?key= — это работает только внутри песочницы Google AI Studio. Здесь ключ
живёт в переменной окружения GEMINI_API_KEY, которую нужно задать в
Vercel → Project Settings → Environment Variables (НЕ в коде и НЕ в .env,
закоммиченном в репозиторий).

ВАЖНО про рейт-лимит ниже: он in-memory, то есть считает запросы только в
рамках одного тёплого инстанса функции. На Vercel это не гарантирует точный
общий лимит (инстансов может быть несколько, старые перезапускаются) — как
защита от полностью открытого крана он всё ещё полезен, но не как строгая
гарантия. Для точного лимита понадобится общее хранилище (Vercel KV /
Upstash Redis) — не стал добавлять эту зависимость без вашего решения,
скажите, если нужно.
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

API_KEY = os.environ.get("GEMINI_API_KEY")
MODEL = "gemini-3-flash-preview"
GOOGLE_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

SYSTEM_INSTRUCTION = {
    "parts": [{"text": "Ты встроенный ИИ-помощник лаборатории. Отвечай кратко, умно и дружелюбно."}]
}

MAX_TURNS = 20
MAX_MESSAGE_CHARS = 2000
RATE_LIMIT = 15
RATE_WINDOW_SEC = 60

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


@app.route("/api/chat", methods=["POST"])
def chat():
    # Проверяем на каждый вызов, а не при импорте модуля: на серверлесс-платформе
    # процесс может быть переиспользован между деплоями с разными env — лучше
    # явно сказать, что не так, чем упасть непонятно где.
    if not API_KEY:
        log.error("GEMINI_API_KEY не задан в переменных окружения Vercel")
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

    try:
        upstream = requests.post(
            GOOGLE_URL,
            params={"key": API_KEY},
            json={"contents": contents, "systemInstruction": SYSTEM_INSTRUCTION},
            timeout=15,
        )
    except requests.exceptions.Timeout:
        log.error("Upstream timeout for %s", ip)
        return jsonify({"error": "upstream_timeout"}), 504
    except requests.exceptions.RequestException as exc:
        log.error("Upstream request failed: %s", exc)
        return jsonify({"error": "upstream_unreachable"}), 502

    if upstream.status_code != 200:
        log.error("Upstream returned %s: %s", upstream.status_code, upstream.text[:300])
        return jsonify({"error": "upstream_error"}), 502

    return jsonify(upstream.json())


# Только для быстрой локальной проверки без Vercel CLI:
#   GEMINI_API_KEY=... python api/chat.py
# Для проверки, максимально похожей на прод, используйте `vercel dev`
# из корня репозитория — оно поднимет и статику, и все функции из /api сразу.
if __name__ == "__main__":
    app.run(port=5000, debug=True)
