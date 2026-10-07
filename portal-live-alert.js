// Live refresh for the site-wide "МОЛНИЯ" alert.
// Primary source: Apps Script (so urgent notices do not depend on delayed GitHub cron runs).
// Fallback source: portal-alert.json on GitHub Pages/CDN.
(function () {
    'use strict';

    const POLL_MS = 60 * 1000;
    const LIVE_API_URL = 'https://script.google.com/macros/s/AKfycbxCqcmGgAhHU3dG7ClzCjJZpELqpF-ic9H_Qg49BysA30Ybl4khxnwPOS7Pj9gE3g9I/exec';
    let timer = null;
    let inFlight = null;

    function applyAlert(nextAlert) {
        if (typeof globalAlertLiveVerified !== 'undefined') {
            globalAlertLiveVerified = true;
        }

        const before = globalAlert && globalAlert.text ? String(globalAlert.text) : '';
        const after = nextAlert && nextAlert.text ? String(nextAlert.text) : '';

        globalAlert = nextAlert;

        if (typeof renderGlobalAlertTicker === 'function') {
            renderGlobalAlertTicker();
        }

        const modal = document.getElementById('urgentAlertModal');
        if (modal && modal.classList.contains('active')) {
            if (globalAlert && typeof renderUrgentAlertText === 'function') {
                renderUrgentAlertText();
            } else {
                modal.classList.remove('active');
            }
        }

        return before !== after;
    }

    function alertFromPayload(data) {
        return data && data.currentAlert && data.currentAlert.text
            ? data.currentAlert
            : null;
    }

    async function fetchWithTimeout(url, timeoutMs) {
        const controller = new AbortController();
        const timerId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                method: 'GET',
                cache: 'no-store',
                redirect: 'follow',
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                signal: controller.signal
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return await response.json();
        } finally {
            clearTimeout(timerId);
        }
    }

    async function refreshLiveAlert(options) {
        const opts = options || {};
        if (document.visibilityState === 'hidden') return false;
        if (inFlight) return inFlight;

        inFlight = (async () => {
            let liveError = null;

            // Important: ?type=alert is forward-compatible with the hardened backend.
            // Older deployments ignore the parameter and return the normal public payload,
            // which still contains currentAlert.
            try {
                const liveUrl = LIVE_API_URL + '?type=alert&_alert=' + Date.now();
                const liveData = await fetchWithTimeout(liveUrl, 12000);
                return applyAlert(alertFromPayload(liveData));
            } catch (error) {
                liveError = error;
            }

            // CDN fallback keeps the alert working even during a temporary Apps Script outage.
            try {
                const bucket = Math.floor(Date.now() / POLL_MS);
                const snapshotUrl = './portal-alert.json?v=' + bucket;
                const snapshotData = await fetchWithTimeout(snapshotUrl, 8000);
                return applyAlert(alertFromPayload(snapshotData));
            } catch (snapshotError) {
                if (!opts.silent) {
                    console.warn('Не удалось обновить МОЛНИЮ:', liveError, snapshotError);
                }
                return false;
            } finally {
                inFlight = null;
            }
        })();

        try {
            return await inFlight;
        } finally {
            inFlight = null;
        }
    }

    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    function start() {
        stop();
        if (document.visibilityState === 'hidden') return;

        refreshLiveAlert({ silent: true });
        timer = setInterval(() => {
            if (document.visibilityState !== 'hidden') {
                refreshLiveAlert({ silent: true });
            }
        }, POLL_MS);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') start();
        else stop();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    window.refreshGlobalAlertLive = refreshLiveAlert;
})();
