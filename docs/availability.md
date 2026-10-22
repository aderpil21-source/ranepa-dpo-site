# Availability of ranepa-dpo39.ru

## Deployed paths (22 October 2026)

| Function | Primary path | Automatic fallback | Shared dependency / limit |
| --- | --- | --- | --- |
| Material code in Students and Owl | Vercel `/api/material` | Independent Render account `/material`; concurrent requests, first validated live result wins | Both read the current Google Apps Script material source. No stale code directory is published or used. |
| Public programmes, schedule, news, settings | Same-origin validated JSON snapshots | Vercel static mirror, then raw GitHub mirror | Mirrors represent the last published snapshot. They are not a copy of private data. |
| Owl extended answers | Yandex Cloud function | Existing local catalogue/FAQ dialogue | Local navigation survives AI service failure; generated answers cannot be guaranteed if the AI provider is down. |
| Human operator | Existing Render/Telegram handoff | Existing contacts screen | Original Render account is suspended for billing. Live operator service is not recovered by moving material lookup. |
| CMS writes and file uploads | Google Apps Script; Yandex object storage | Existing local editor drafts, pending upload queue, retries | No independent writable database or replicated file store is configured. Never blindly retry ambiguous writes. |
| Site hosting | GitHub Pages custom domain | Full Vercel mirror at `https://ranepa-dpo-site.vercel.app` | No registrar/DNS failover is configured. A mirror does not by itself switch visitors if the main domain cannot load. |

There are no `chatgpt.site` dependencies in the shipped runtime. The old Sites material service is not called by the site.

## Monitoring and deployment

`material-resilience.yml` checks both provider endpoints and the Google material source every 15 minutes; a failed check is visible in GitHub Actions. It uses invalid code syntax and never logs a valid lecture code or material URL. Scheduled CI is a health check, not the failover mechanism: requests switch immediately without waiting for CI. Actual scheduler timing is controlled by GitHub.

Vercel is linked to the source GitHub repository for automatic deployments. Its production project is `ranepa-dpo-site` in `aderpil21-sources-projects`. The backup Render service is `ranepa-materials-access` (`srv-dbcur7jrjlhs73epi6a0`) in `My Workspace`. Render is on the free plan and can cold-start; Vercel is the normal serverless path. Do not claim that free services cannot be quota-limited or interrupted.

## Remaining work for stronger guarantees

* Move private material metadata and revocation state to an independently replicated authoritative store. Replicating old access codes into public files or serving an unchecked stale list is not a safe substitute.
* Restore live operator infrastructure, including its Telegram credentials and persistent session state, independently of the suspended billing account.
* Add independently replicated storage and an idempotent write protocol before making CMS mutations fail over.
* Configure controlled DNS/traffic failover using the domain registrar or DNS provider. Application code cannot switch a domain that a visitor cannot reach in the first place.

Availability cannot be guaranteed under every network block, provider outage, account suspension, or loss of connectivity. Test each deployed failure mode and state the untested limits explicitly.
