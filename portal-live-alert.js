// Lightweight refresh for the site-wide "МОЛНИЯ" alert.
// Thousands of visitors poll a tiny static JSON file from GitHub Pages/CDN.
// Only the scheduled GitHub Action talks to Apps Script/Google Sheets.
(function () {
    'use strict';

    const POLL_MS = 5 * 60 * 1000;
    let timer = null;
    let inFlight = null;

    async function refreshLiveAlert(options) {
        const opts = options || {};
        if (document.visibilityState === 'hidden') return false;
        if (inFlight) return inFlight;

        inFlight = (async () => {
            try {
                const bucket = Math.floor(Date.now() / POLL_MS);
                const snapshotUrl = './portal-alert.json?v=' + bucket;
                const response = await fetch(snapshotUrl, {
                    method: 'GET',
                    cache: 'no-store'
                });
                if (!response.ok) throw new Error('Alert snapshot HTTP ' + response.status);

                const data = await response.json();
                if (typeof globalAlertLiveVerified !== 'undefined') {
                    globalAlertLiveVerified = true;
                }
                const nextAlert = data && data.currentAlert && data.currentAlert.text
                    ? data.currentAlert
                    : null;

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
            } catch (error) {
                if (!opts.silent) {
                    console.warn('Не удалось обновить важное уведомление из статического snapshot:', error);
                }
                return false;
            } finally {
                inFlight = null;
            }
        })();

        return inFlight;
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
