import html
import time

import requests
from flask import Flask, Response, request

app = Flask(__name__)

NEWS_API = (
    "https://script.google.com/macros/s/"
    "AKfycbznjvWDxlxxlANkzTCChnvlyEbW3N74vpOEE8pJaccExiXQG7DZU1SghQApDslMNEOk"
    "/exec"
)

def fetch_news():
    last = None
    for attempt in range(4):
        try:
            r = requests.get(
                NEWS_API,
                params={"type": "news", "_cb": f"{int(time.time()*1000)}-{attempt}"},
                headers={"Cache-Control": "no-cache", "User-Agent": "RANEPA-DPO-Share/1.0"},
                timeout=(8, 25),
                allow_redirects=True,
            )
            r.raise_for_status()
            data = r.json()
            if isinstance(data, dict):
                return data.get("items") or data.get("news") or data.get("data") or []
            if isinstance(data, list):
                return data
            return []
        except Exception as exc:
            last = exc
            if attempt < 3:
                time.sleep(min(2 ** attempt, 4))
    raise last

@app.get("/api/share-news")
def share_news():
    news_id = (request.args.get("id") or "").strip()
    site_url = "https://ranepa-dpo39.ru/news.html#" + news_id

    try:
        items = fetch_news()
        item = next((x for x in items if str(x.get("id")) == news_id), None)
    except Exception:
        item = None

    if not item:
        title = "Новости Центра ДПО"
        lead = "Дополнительное профессиональное образование Западного филиала РАНХиГС"
        image = ""
    else:
        title = str(item.get("title") or "Новости Центра ДПО")
        lead = str(item.get("lead") or "")
        image = str(item.get("coverImage") or "")

    esc_title = html.escape(title, quote=True)
    esc_lead = html.escape(lead, quote=True)
    esc_image = html.escape(image, quote=True)
    esc_url = html.escape(site_url, quote=True)

    image_meta = ""
    if image:
        image_meta = (
            f'<meta property="og:image" content="{esc_image}">'
            f'<meta property="vk:image" content="{esc_image}">'
            f'<meta name="twitter:image" content="{esc_image}">'
        )

    body = f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta property="og:type" content="article">
<meta property="og:title" content="{esc_title}">
<meta property="og:description" content="{esc_lead}">
<meta property="og:url" content="{esc_url}">
{image_meta}
<meta name="twitter:card" content="summary_large_image">
<title>{esc_title}</title>
</head>
<body>
<p><a href="{esc_url}">Открыть новость на сайте</a></p>
</body>
</html>"""
    return Response(body, status=200, mimetype="text/html")
