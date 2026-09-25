"""Narrow server-side proxy for the News editor backend.

Public news rendering does not use this endpoint. It exists only to keep
editor authentication and mutations off the browser-to-Apps-Script path.
"""

import os
import requests
from flask import Flask, jsonify, request, Response

app = Flask(__name__)

NEWS_API_URL = os.getenv(
    "NEWS_API_URL",
    "https://script.google.com/macros/s/AKfycbznjvWDxlxxlANkzTCChnvlyEbW3N74vpOEE8pJaccExiXQG7DZU1SghQApDslMNEOk/exec",
)

ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.getenv(
        "NEWS_ALLOWED_ORIGINS",
        "https://ranepa-dpo39.ru,https://www.ranepa-dpo39.ru,https://ranepa-dpo-site.vercel.app",
    ).split(",")
    if origin.strip()
}

ALLOWED_POST_ACTIONS = {"newsLogin", "newsSave", "newsDelete"}


def add_cors(response):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.after_request
def after_request(response):
    return add_cors(response)


def fail(message, code, status):
    return jsonify({"ok": False, "error": message, "code": code}), status


@app.route("/api/news-backend", methods=["GET", "POST", "OPTIONS"])
def news_backend():
    if request.method == "OPTIONS":
        return ("", 204)

    origin = request.headers.get("Origin", "")
    if origin not in ALLOWED_ORIGINS:
        return fail("Источник запроса не разрешён", "BAD_ORIGIN", 403)

    try:
        if request.method == "GET":
            # Editor reads only. Public visitors use news-data.json.
            if request.args.get("type") != "news" or request.args.get("admin") != "1":
                return fail("Недопустимый запрос", "BAD_REQUEST", 400)

            params = {
                "type": "news",
                "admin": "1",
                "token": request.args.get("token", ""),
            }
            upstream = requests.get(
                NEWS_API_URL,
                params=params,
                timeout=20,
                allow_redirects=True,
            )
        else:
            body = request.get_json(silent=True) or {}
            action = str(body.get("action") or "")
            if action not in ALLOWED_POST_ACTIONS:
                return fail("Недопустимое действие", "BAD_ACTION", 400)

            upstream = requests.post(
                NEWS_API_URL,
                json=body,
                timeout=20,
                allow_redirects=True,
            )

        content_type = upstream.headers.get("Content-Type", "application/json")
        return Response(
            upstream.content,
            status=upstream.status_code,
            content_type=content_type,
        )

    except requests.Timeout:
        return fail("Сервер редактора не ответил вовремя", "UPSTREAM_TIMEOUT", 504)
    except requests.RequestException:
        return fail("Не удалось связаться с сервером редактора", "UPSTREAM_UNAVAILABLE", 502)
