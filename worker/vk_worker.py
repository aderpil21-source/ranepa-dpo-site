import hashlib
import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

VK_API = "https://api.vk.com/method/"
VK_VERSION = os.getenv("VK_API_VERSION", "5.199")
VK_GROUP_TOKEN = os.getenv("VK_GROUP_TOKEN", "")
VK_UPLOAD_TOKEN = os.getenv("VK_UPLOAD_TOKEN", "")
VK_OWNER_ID = os.getenv("VK_OWNER_ID", "")
WORKER_SECRET = os.getenv("WORKER_SECRET", "")
DB_PATH = Path(os.getenv("VK_WORKER_DB", "/var/lib/ranepa-vk-worker/state.sqlite3"))

_db_lock = threading.Lock()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            news_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            post_id INTEGER,
            title TEXT,
            cover_url TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def require_secret():
    supplied = request.headers.get("X-Worker-Secret", "")
    return bool(WORKER_SECRET) and supplied == WORKER_SECRET


def vk_call(method, params, token):
    response = requests.post(
        VK_API + method,
        data={**params, "access_token": token, "v": VK_VERSION},
        timeout=35,
    )
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        error = data["error"]
        raise RuntimeError(
            f"VK API error {error.get('error_code')}: "
            f"{error.get('error_msg', 'unknown error')}"
        )
    return data["response"]


def upload_cover_to_vk(url):
    if not url:
        return None
    if not VK_UPLOAD_TOKEN:
        raise RuntimeError("VK_UPLOAD_TOKEN is not configured")

    group_id = str(VK_OWNER_ID).lstrip("-")
    image = requests.get(url, timeout=60)
    image.raise_for_status()
    content_type = image.headers.get("Content-Type", "").split(";", 1)[0].lower()
    if not content_type.startswith("image/"):
        raise RuntimeError(f"Cover URL is not an image: {content_type or 'unknown'}")

    server = vk_call(
        "photos.getWallUploadServer",
        {"group_id": group_id},
        VK_UPLOAD_TOKEN,
    )
    upload_url = server.get("upload_url")
    if not upload_url:
        raise RuntimeError("VK did not return upload_url")

    uploaded = requests.post(
        upload_url,
        files={"photo": ("cover.jpg", image.content, content_type)},
        timeout=90,
    )
    uploaded.raise_for_status()
    payload = uploaded.json()

    saved = vk_call(
        "photos.saveWallPhoto",
        {
            "group_id": group_id,
            "server": payload.get("server"),
            "photo": payload.get("photo"),
            "hash": payload.get("hash"),
        },
        VK_UPLOAD_TOKEN,
    )
    if not saved:
        raise RuntimeError("VK did not return saved photo")

    photo = saved[0]
    owner_id = photo.get("owner_id")
    photo_id = photo.get("id")
    if owner_id is None or photo_id is None:
        raise RuntimeError("VK returned incomplete photo data")
    return f"photo{owner_id}_{photo_id}"


def job_row(news_id):
    with db() as conn:
        return conn.execute("SELECT * FROM jobs WHERE news_id=?", (news_id,)).fetchone()


def write_job(news_id, status, **values):
    with _db_lock, db() as conn:
        current = conn.execute(
            "SELECT attempts FROM jobs WHERE news_id=?", (news_id,)
        ).fetchone()
        attempts = values.pop(
            "attempts",
            int(current["attempts"]) if current else 0,
        )
        conn.execute(
            """
            INSERT INTO jobs(news_id,status,post_id,title,cover_url,attempts,error,updated_at)
            VALUES(?,?,?,?,?,?,?,?)
            ON CONFLICT(news_id) DO UPDATE SET
              status=excluded.status,
              post_id=COALESCE(excluded.post_id,jobs.post_id),
              title=COALESCE(excluded.title,jobs.title),
              cover_url=COALESCE(excluded.cover_url,jobs.cover_url),
              attempts=excluded.attempts,
              error=excluded.error,
              updated_at=excluded.updated_at
            """,
            (
                news_id,
                status,
                values.get("post_id"),
                values.get("title"),
                values.get("cover_url"),
                attempts,
                values.get("error"),
                now_iso(),
            ),
        )
        conn.commit()


def publish(payload):
    news_id = str(payload.get("id") or "").strip()
    title = str(payload.get("title") or "").strip()
    lead = str(payload.get("lead") or "").strip()
    cover = str(payload.get("coverImage") or "").strip()
    url = str(payload.get("url") or "").strip()

    if not news_id or not title:
        raise ValueError("id and title are required")

    existing = job_row(news_id)
    if existing and existing["status"] == "published":
        return {
            "ok": True,
            "duplicate": True,
            "post_id": existing["post_id"],
        }

    attempts = (int(existing["attempts"]) if existing else 0) + 1
    write_job(
        news_id,
        "publishing",
        title=title,
        cover_url=cover,
        attempts=attempts,
        error=None,
    )

    try:
        attachment = upload_cover_to_vk(cover) if cover else None

        message = f"🔥 {title}"
        if lead:
            message += f"\n\n{lead}"
        if url:
            message += f"\n\nЧитать подробнее на сайте: {url}"

        params = {
            "owner_id": VK_OWNER_ID,
            "from_group": 1,
            "message": message,
            # VK uses guid to protect repeated wall.post requests from duplicates.
            "guid": "ranepa-" + hashlib.sha256(news_id.encode("utf-8")).hexdigest()[:24],
        }
        if attachment:
            params["attachments"] = attachment

        result = vk_call("wall.post", params, VK_GROUP_TOKEN)
        post_id = result.get("post_id")
        if post_id is None:
            raise RuntimeError("VK did not return post_id")

        write_job(
            news_id,
            "published",
            post_id=post_id,
            title=title,
            cover_url=cover,
            attempts=attempts,
            error=None,
        )
        return {"ok": True, "post_id": post_id}

    except Exception as error:
        write_job(
            news_id,
            "error",
            title=title,
            cover_url=cover,
            attempts=attempts,
            error=str(error)[:800],
        )
        raise


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.get("/status/<news_id>")
def status(news_id):
    if not require_secret():
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    row = job_row(news_id)
    if not row:
        return jsonify({"ok": True, "status": "missing"})
    return jsonify({"ok": True, **dict(row)})


@app.post("/publish")
def publish_route():
    if not require_secret():
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    try:
        payload = request.get_json(force=True, silent=False) or {}
        result = publish(payload)
        return jsonify(result)
    except ValueError as error:
        return jsonify({"ok": False, "error": str(error)}), 400
    except Exception as error:
        return jsonify({"ok": False, "error": str(error)}), 502


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
