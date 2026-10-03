// Live operator handoff for the site assistant "Owl".
// Secrets never live in the browser: this client talks only to the operator backend.
(function () {
    'use strict';

    const DEFAULT_API = 'https://ranepa-owl-operator.onrender.com';
    const API = String(window.OWL_OPERATOR_API || DEFAULT_API).replace(/\/+$/, '');
    const STORAGE_KEY = 'ranepa_owl_operator_v1';
    const POLL_MS = 2200;
    const MAX_CONTEXT_MESSAGES = 10;

    let state = loadState();
    let pollTimer = null;
    let pollInFlight = false;
    let announcedActive = false;
    let originalSetOptions = null;
    let originalHandleUserMessage = null;

    function loadState() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return {
                sessionId: String(raw.sessionId || ''),
                secret: String(raw.secret || ''),
                status: String(raw.status || 'idle'),
                lastEventId: Number(raw.lastEventId || 0)
            };
        } catch (e) {
            return { sessionId: '', secret: '', status: 'idle', lastEventId: 0 };
        }
    }

    function saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    }

    function randomHex(bytes) {
        const arr = new Uint8Array(bytes);
        crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    }

    function ensureIdentity() {
        if (!state.sessionId) {
            state.sessionId = (crypto.randomUUID ? crypto.randomUUID() : randomHex(16));
        }
        if (!state.secret || state.secret.length < 32) {
            state.secret = randomHex(32);
        }
        saveState();
    }

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[ch]);
    }

    function userMessageCount() {
        const root = document.getElementById('owlChat') || document;
        return root.querySelectorAll('.msg-user').length;
    }

    function isOperatorMode() {
        return state.status === 'waiting' || state.status === 'active';
    }

    function normalizeOperatorCommand(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[.,!?;:()[\]{}"'«»]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function wantsOperator(text) {
        const value = normalizeOperatorCommand(text);
        if (!value) return false;

        const exact = new Set([
            'оператор',
            'оператора',
            'позови оператора',
            'позвать оператора',
            'вызови оператора',
            'вызвать оператора',
            'хочу оператора',
            'нужен оператор',
            'нужна помощь оператора',
            'живой человек',
            'позови человека',
            'хочу живого человека',
            'соедини с оператором',
            'соедините с оператором',
            'соедини с человеком',
            'соедините с человеком',
            'соедини с сотрудником',
            'соедините с сотрудником',
            'хочу поговорить с оператором',
            'хочу поговорить с человеком',
            'хочу поговорить с сотрудником',
            'менеджер',
            'позови менеджера',
            'вызови менеджера',
            'соедини с менеджером',
            'сотрудник',
            'позови сотрудника'
        ]);
        if (exact.has(value)) return true;

        return /^(?:пожалуйста\s+)?(?:позови|позвать|вызови|вызвать|соедини|соедините|переключи|переключите)\s+(?:меня\s+)?(?:с\s+)?(?:оператором|оператора|оператор|человеком|человека|сотрудником|сотрудника|менеджером|менеджера)$/.test(value);
    }

    function operatorButtonHtml() {
        if (isOperatorMode()) {
            return '<div class="owl-guided-hint" data-owl-operator-status style="margin-top:8px;">' +
                (state.status === 'active'
                    ? '🟢 Оператор подключён. Пишите сообщения прямо здесь.'
                    : '🟡 Оператор вызван. Можно продолжать писать, сообщения уже передаются сотруднику.') +
                '</div>' +
                '<button class="chat-opt-btn" data-owl-operator-control="cancel" onclick="window.endOwlOperatorHandoff()">✕ Завершить связь с оператором</button>';
        }

        if (userMessageCount() < 3) return '';
        return '<button class="chat-opt-btn" data-owl-operator-control="call" onclick="window.startOwlOperatorHandoff()" ' +
            'style="background:linear-gradient(135deg,rgba(41,52,91,.95),rgba(202,15,62,.92));color:#fff;border-color:rgba(255,255,255,.2);">' +
            '👤 Позвать оператора</button>';
    }

    function decorateOptions(html) {
        const raw = String(html || '');
        if (raw.includes('data-owl-operator-control=')) return raw;
        const extra = operatorButtonHtml();
        return extra ? raw + extra : raw;
    }

    function refreshOptions() {
        const box = document.getElementById('chatOptions');
        if (!box || typeof originalSetOptions !== 'function') return;
        const clean = box.innerHTML
            .replace(/<button[^>]*data-owl-operator-control=[\s\S]*?<\/button>/gi, '')
            .replace(/<div[^>]*data-owl-operator-status[\s\S]*?<\/div>/gi, '');
        originalSetOptions(decorateOptions(clean));
    }

    function recentConversation() {
        const root = document.getElementById('owlChat') || document;
        return Array.from(root.querySelectorAll('.msg-user,.msg-bot'))
            .slice(-MAX_CONTEXT_MESSAGES)
            .map(node => ({
                role: node.classList.contains('msg-user') ? 'user' : 'assistant',
                text: String(node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 900)
            }))
            .filter(item => item.text);
    }

    async function api(path, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(API + path, {
                ...options,
                mode: 'cors',
                cache: 'no-store',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...(options && options.headers ? options.headers : {})
                }
            });
            let data = null;
            try { data = await response.json(); } catch (e) {}
            if (!response.ok) {
                const error = new Error((data && data.error) || ('HTTP ' + response.status));
                error.status = response.status;
                throw error;
            }
            return data || {};
        } finally {
            clearTimeout(timer);
        }
    }

    async function startHandoff() {
        if (isOperatorMode()) return;
        ensureIdentity();

        if (typeof window.addBotMsg === 'function') {
            window.addBotMsg('👤 Зову сотрудника Центра ДПО. Передаю оператору последние сообщения этого диалога.');
        }
        state.status = 'waiting';
        saveState();
        refreshOptions();

        try {
            const result = await api('/api/owl/handoff/start', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: state.sessionId,
                    secret: state.secret,
                    page: location.href.slice(0, 500),
                    conversation: recentConversation()
                })
            });
            state.status = result.status === 'active' ? 'active' : 'waiting';
            state.lastEventId = Math.max(state.lastEventId, Number(result.last_event_id || 0));
            saveState();
            startPolling();
            refreshOptions();
        } catch (error) {
            state.status = 'idle';
            saveState();
            refreshOptions();
            if (typeof window.addBotMsg === 'function') {
                window.addBotMsg('Не удалось подключить оператора. Попробуйте ещё раз чуть позже — Сова продолжит работать как обычно.');
            }
            console.warn('Owl operator start failed:', error && error.message ? error.message : error);
        }
    }

    async function sendVisitorMessage(text) {
        ensureIdentity();
        try {
            await api('/api/owl/handoff/message', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: state.sessionId,
                    secret: state.secret,
                    text: String(text || '').slice(0, 1800),
                    page: location.href.slice(0, 500)
                })
            });
            startPolling();
        } catch (error) {
            if (typeof window.addBotMsg === 'function') {
                window.addBotMsg('⚠️ Сообщение оператору сейчас не отправилось. Попробуйте повторить его через несколько секунд.');
            }
            console.warn('Owl operator message failed:', error && error.message ? error.message : error);
        }
    }

    async function endHandoff() {
        if (!state.sessionId || !state.secret) {
            state.status = 'idle';
            saveState();
            refreshOptions();
            return;
        }
        try {
            await api('/api/owl/handoff/end', {
                method: 'POST',
                body: JSON.stringify({ session_id: state.sessionId, secret: state.secret })
            });
        } catch (e) {}
        state.status = 'idle';
        state.lastEventId = 0;
        announcedActive = false;
        saveState();
        stopPolling();
        if (typeof window.addBotMsg === 'function') {
            window.addBotMsg('Связь с оператором завершена. Я снова могу помочь как Сова.');
        }
        refreshOptions();
    }

    function applyEvent(event) {
        if (!event || !event.type) return;

        if (event.type === 'status') {
            if (event.status === 'active') {
                state.status = 'active';
                if (!announcedActive && typeof window.addBotMsg === 'function') {
                    const who = event.operator_name ? ' — ' + esc(event.operator_name) : '';
                    window.addBotMsg('🟢 <b>Оператор подключился' + who + '.</b> Теперь ваши сообщения идут сотруднику напрямую.');
                    announcedActive = true;
                }
            } else if (event.status === 'closed') {
                state.status = 'idle';
                announcedActive = false;
                if (typeof window.addBotMsg === 'function') {
                    window.addBotMsg('✅ Оператор завершил диалог. Если появятся новые вопросы, Сова снова на связи.');
                }
                stopPolling();
            } else if (event.status === 'waiting') {
                state.status = 'waiting';
            }
            saveState();
            refreshOptions();
            return;
        }

        if (event.type === 'message' && event.text) {
            state.status = 'active';
            saveState();
            announcedActive = true;
            if (typeof window.addBotMsg === 'function') {
                const name = event.operator_name ? esc(event.operator_name) : 'Оператор Центра ДПО';
                window.addBotMsg('<b>👤 ' + name + ':</b><br>' + esc(event.text).replace(/\n/g, '<br>'));
            }
            refreshOptions();
        }
    }

    async function pollOnce() {
        if (pollInFlight || !isOperatorMode() || !state.sessionId || !state.secret) return;
        pollInFlight = true;
        try {
            const qs = new URLSearchParams({
                session_id: state.sessionId,
                secret: state.secret,
                after: String(state.lastEventId || 0)
            });
            const data = await api('/api/owl/handoff/events?' + qs.toString(), { method: 'GET', headers: {} });
            const events = Array.isArray(data.events) ? data.events : [];
            events.forEach(event => {
                state.lastEventId = Math.max(state.lastEventId, Number(event.id || 0));
                applyEvent(event);
            });
            if (data.status && data.status !== state.status) {
                applyEvent({ type: 'status', status: data.status, operator_name: data.operator_name || '' });
            }
            saveState();
        } catch (error) {
            console.warn('Owl operator poll failed:', error && error.message ? error.message : error);
        } finally {
            pollInFlight = false;
        }
    }

    function startPolling() {
        if (pollTimer) return;
        pollOnce();
        pollTimer = setInterval(pollOnce, POLL_MS);
    }

    function stopPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        pollInFlight = false;
    }

    function patchOwl() {
        if (typeof window.setOptions !== 'function' || typeof window.handleUserMessage !== 'function') {
            setTimeout(patchOwl, 120);
            return;
        }
        if (window.__owlOperatorPatched) return;
        window.__owlOperatorPatched = true;

        originalSetOptions = window.setOptions;
        originalHandleUserMessage = window.handleUserMessage;

        window.setOptions = function (html) {
            return originalSetOptions.call(this, decorateOptions(html));
        };

        window.handleUserMessage = async function (messageOverride, alreadyRendered) {
            const input = document.getElementById('chatUserInput');
            const hasOverride = typeof messageOverride === 'string';
            const text = (hasOverride ? messageOverride : (input ? input.value : '')).trim();
            if (!text) return;

            if (!isOperatorMode() && wantsOperator(text)) {
                if (!alreadyRendered) {
                    if (typeof window.addUserMsg === 'function') window.addUserMsg(text);
                    if (input) input.value = '';
                }
                await startHandoff();
                return;
            }

            if (isOperatorMode()) {
                if (!alreadyRendered) {
                    if (typeof window.addUserMsg === 'function') window.addUserMsg(text);
                    if (input) input.value = '';
                }
                await sendVisitorMessage(text);
                refreshOptions();
                return;
            }

            const result = await originalHandleUserMessage.apply(this, arguments);
            // setOptions() normally runs during the answer; this extra refresh covers
            // paths that return without replacing the options container.
            if (userMessageCount() >= 3) setTimeout(refreshOptions, 0);
            return result;
        };

        window.startOwlOperatorHandoff = startHandoff;
        window.endOwlOperatorHandoff = endHandoff;

        if (isOperatorMode()) {
            startPolling();
            setTimeout(() => {
                if (typeof window.addBotMsg === 'function') {
                    window.addBotMsg(state.status === 'active'
                        ? '🟢 Связь с оператором восстановлена.'
                        : '🟡 Запрос оператору восстановлен. Ожидаем сотрудника.');
                }
                refreshOptions();
            }, 250);
        } else {
            refreshOptions();
        }
    }

    window.startOwlOperatorHandoff = startHandoff;
    window.endOwlOperatorHandoff = endHandoff;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', patchOwl, { once: true });
    } else {
        patchOwl();
    }
})();
