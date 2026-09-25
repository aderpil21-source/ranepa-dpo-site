"""Fast public News feed with CDN caching.

Visitors never call Apps Script directly. This endpoint fetches the public
news feed server-side and allows Vercel's CDN to cache it briefly so a burst
of visitors shares the same upstream response.
"""

import os
import time
import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

ALLOWED_ORIGINS = {
    "https://ranepa-dpo39.ru",
    "https://www.ranepa-dpo39.ru",
    "https://ranepa-dpo-site.vercel.app",
}

NEWS_API_URL = os.getenv(
    "NEWS_API_URL",
    "https://script.google.com/macros/s/AKfycbznjvWDxlxxlANkzTCChnvlyEbW3N74vpOEE8pJaccExiXQG7DZU1SghQApDslMNEOk/exec",
)


@app.after_request
def add_headers(response):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    return response


@app.get("/api/news-live")
def news_live():
    try:
        upstream = requests.get(
            NEWS_API_URL,
            params={"type": "news", "_cb": str(int(time.time() // 30))},
            timeout=12,
            allow_redirects=True,
        )
        upstream.raise_for_status()
        data = upstream.json()
    except requests.Timeout:
        return jsonify({"ok": False, "error": "News upstream timeout"}), 504
    except (requests.RequestException, ValueError):
        return jsonify({"ok": False, "error": "News upstream unavailable"}), 502

    items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return jsonify({"ok": False, "error": "Invalid news payload"}), 502

    public_items = [
        item for item in items
        if isinstance(item, dict) and item.get("status") == "published"
    ]

    response = jsonify({
        "ok": True,
        "generatedAt": int(time.time()),
        "items": public_items,
    })

    # One upstream response can serve many visitors for 30 seconds.
    # If revalidation is slow, CDN may keep serving the previous response briefly.
    response.headers["Cache-Control"] = "public, s-maxage=15, stale-while-revalidate=60"
    response.headers["CDN-Cache-Control"] = "public, s-maxage=15, stale-while-revalidate=60"
    response.headers["Vercel-CDN-Cache-Control"] = "public, s-maxage=15, stale-while-revalidate=60"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
