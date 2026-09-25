import os

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

WORKER_URL = os.getenv("VK_WORKER_URL", "").rstrip("/")
WORKER_SECRET = os.getenv("VK_WORKER_SECRET", "")


@app.route("/api/vk-status", methods=["GET"])
def vk_status():
    if not WORKER_URL or not WORKER_SECRET:
        return jsonify({"ok": False, "error": "worker_not_configured"}), 503

    raw_ids = request.args.get("ids", "")
    ids = [x.strip() for x in raw_ids.split(",") if x.strip()][:50]
    items = {}

    for news_id in ids:
        try:
            response = requests.get(
                f"{WORKER_URL}/status/{news_id}",
                headers={"X-Worker-Secret": WORKER_SECRET},
                timeout=8,
            )
            response.raise_for_status()
            data = response.json()
            if data.get("status") != "missing":
                items[news_id] = {
                    "status": data.get("status"),
                    "post_id": data.get("post_id"),
                    "attempts": data.get("attempts"),
                    "error": data.get("error"),
                    "updated_at": data.get("updated_at"),
                }
        except Exception:
            # Один недоступный статус не должен ломать весь редактор.
            continue

    return jsonify({"ok": True, "items": items})
