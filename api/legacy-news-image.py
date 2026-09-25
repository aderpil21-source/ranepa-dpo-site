"""Stable proxy for the four legacy Google Drive images used by News.

Future uploads use the configured media storage. This endpoint is intentionally
not a generic Google Drive proxy: only the known legacy file IDs are allowed.
"""

import requests
from flask import Flask, Response, request

app = Flask(__name__)

ALLOWED_IDS = {
    "1rM-29CE3Y34YY7R9somR41N3mDNhjtjJ",
    "1NR1WULHHEGn-Jweo_51J-HLxwWC6vwQ5",
    "1CzeO6rilqlxiStr4Rgnn8huQxppOdZ6J",
    "1qS3zmdzgMfBcIIVNXGGbaonBpShbs_IZ",
}

MAX_BYTES = 8 * 1024 * 1024


@app.route("/api/legacy-news-image", methods=["GET"])
def legacy_news_image():
    file_id = str(request.args.get("id") or "")
    if file_id not in ALLOWED_IDS:
        return ("Not found", 404)

    try:
        upstream = requests.get(
            "https://drive.google.com/uc",
            params={"export": "download", "id": file_id},
            timeout=20,
            allow_redirects=True,
        )
        upstream.raise_for_status()
    except requests.RequestException:
        return ("Image unavailable", 502)

    content_type = upstream.headers.get("Content-Type", "")
    body = upstream.content

    if not content_type.lower().startswith("image/") or len(body) > MAX_BYTES:
        return ("Invalid image response", 502)

    response = Response(body, status=200, content_type=content_type)
    response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=604800"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
