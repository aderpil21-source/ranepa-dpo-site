# VK worker: deployment notes

## Purpose

This service publishes a news item to VK only when the editor explicitly opts in.
It is designed for a host with a stable outbound IP so the VK upload token does not
jump between GitHub-hosted runner addresses.

## Required environment variables

Create `/etc/ranepa-vk-worker.env` readable only by root:

```
VK_GROUP_TOKEN=...
VK_UPLOAD_TOKEN=...
VK_OWNER_ID=-241627750
VK_API_VERSION=5.199
WORKER_SECRET=...
VK_WORKER_DB=/var/lib/ranepa-vk-worker/state.sqlite3
```

Do not commit real values.

## Runtime protections

- SQLite stores one row per `news_id`.
- A published `news_id` is returned as a duplicate instead of being posted again.
- `wall.post` receives a deterministic `guid` derived from `news_id`.
- If a cover exists and its upload fails, the worker records an error and does not
  silently publish a degraded text-only post.
- Network/VK failures are recorded with attempt count and can be retried by calling
  `POST /publish` with the same news item again.
- `GET /health` is public; publish/status endpoints require `X-Worker-Secret`.

## Host layout

```
/opt/ranepa-vk-worker/
  vk_worker.py
  .venv/
/var/lib/ranepa-vk-worker/
  state.sqlite3
/etc/ranepa-vk-worker.env
```

Put Nginx/Caddy in front of `127.0.0.1:8080` and expose only HTTPS.

## Important VK token note

The upload token must be valid from the worker's fixed outbound IP. Do not reuse a
token that VK has already restricted to a different address; authorize/issue the
upload token for the worker environment before the final production test.
