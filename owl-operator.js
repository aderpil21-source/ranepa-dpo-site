// Live operator handoff for the site assistant "Owl".
// Secrets never live in the browser: this client talks only to the operator backend.
(function () {
    'use strict';

    const DEFAULT_API = 'https://ranepa-owl-operator.onrender.com';
    const API = String(window.OWL_OPERATOR_API || DEFAULT_API).replace(/\/+$/, '');
    const STORAGE_KEY = 'ranepa_owl_operator_v1';
    const POLL_MS = 2200;
    const MAX_CONTEXT_MESSAGES = 10;
    const WAIT_REASONS = [
        'Передаю сотруднику контекст разговора, чтобы вам не пришлось повторять вопрос.',
        'Проверяю, кто из специалистов Центра ДПО сейчас свободен.',
        'Подбираю сотрудника, который лучше всего сможет помочь по вашему вопросу.',
        'Передаю запрос операторской группе и жду, пока сотрудник откроет диалог.',
        'Ищу свободного оператора — обычно это занимает совсем немного времени.'
    ];

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

    function randomWaitReason() {
        return WAIT_REASONS[Math.floor(Math.random() * WAIT_REASONS.length)];
    }


    // OWL_IMESSAGE_MOTION_V1
    let owlMessageMotionObserver = null;

    function owlMessageStream() {
        const root = document.getElementById('owlChat');
        if (!root) return null;
        const bubbles = root.querySelectorAll('.msg-user,.msg-bot');
        if (bubbles.length && bubbles[bubbles.length - 1].parentElement) {
            return bubbles[bubbles.length - 1].parentElement;
        }
        return root;
    }

    function markOwlMessageForMotion(node) {
        if (!(node instanceof Element)) return;
        const bubbles = node.matches('.msg-user,.msg-bot') ? [node] : Array.from(node.querySelectorAll('.msg-user,.msg-bot'));
        bubbles.forEach((bubble) => {
            if (bubble.classList.contains('owl-operator-typing')) return;
            bubble.classList.remove('owl-message-enter');
            requestAnimationFrame(() => bubble.classList.add('owl-message-enter'));
            setTimeout(() => bubble.classList.remove('owl-message-enter'), 620);
        });
    }

    function installOwlIMessageMotion() {
        if (!document.getElementById('owl-imessage-motion-style')) {
            const style = document.createElement('style');
            style.id = 'owl-imessage-motion-style';
            style.textContent = `
                #owlChat .msg-bot,
                #owlChat .msg-user {
                    animation: none !important;
                    will-change: transform, opacity;
                }
                #owlChat .msg-bot.owl-message-enter {
                    transform-origin: 8% 100%;
                    animation: owlMessageInLeft .42s cubic-bezier(.2,1.28,.32,1) both !important;
                }
                #owlChat .msg-user.owl-message-enter {
                    transform-origin: 92% 100%;
                    animation: owlMessageInRight .42s cubic-bezier(.2,1.28,.32,1) both !important;
                }
                #owlChat .owl-operator-typing {
                    width: fit-content;
                    max-width: min(76%, 330px);
                    display: flex !important;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 6px;
                    padding: 10px 14px !important;
                    transform-origin: 8% 100%;
                    animation: owlMessageInLeft .34s cubic-bezier(.2,1.2,.32,1) both !important;
                }
                #owlChat .owl-typing-label {
                    font-size: 12px;
                    line-height: 1.2;
                    opacity: .72;
                    font-weight: 700;
                    white-space: nowrap;
                }
                #owlChat .owl-typing-dots {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    height: 16px;
                }
                #owlChat .owl-typing-dots i {
                    width: 6px;
                    height: 6px;
                    border-radius: 999px;
                    background: currentColor;
                    opacity: .38;
                    animation: owlTypingDot 1.05s ease-in-out infinite;
                }
                #owlChat .owl-typing-dots i:nth-child(2) { animation-delay: .14s; }
                #owlChat .owl-typing-dots i:nth-child(3) { animation-delay: .28s; }
                @keyframes owlMessageInLeft {
                    0% { opacity: 0; transform: translateX(-8px) scale(.82); }
                    62% { opacity: 1; transform: translateX(0) scale(1.025); }
                    100% { opacity: 1; transform: translateX(0) scale(1); }
                }
                @keyframes owlMessageInRight {
                    0% { opacity: 0; transform: translateX(8px) scale(.82); }
                    62% { opacity: 1; transform: translateX(0) scale(1.025); }
                    100% { opacity: 1; transform: translateX(0) scale(1); }
                }
                @keyframes owlTypingDot {
                    0%, 60%, 100% { transform: translateY(0) scale(.92); opacity: .34; }
                    30% { transform: translateY(-3px) scale(1); opacity: .9; }
                }
                @media (prefers-reduced-motion: reduce) {
                    #owlChat .msg-bot.owl-message-enter,
                    #owlChat .msg-user.owl-message-enter,
                    #owlChat .owl-operator-typing,
                    #owlChat .owl-typing-dots i {
                        animation: none !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        const attach = () => {
            const root = document.getElementById('owlChat');
            if (!root || owlMessageMotionObserver) return;
            owlMessageMotionObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => mutation.addedNodes.forEach(markOwlMessageForMotion));
            });
            owlMessageMotionObserver.observe(root, { childList: true, subtree: true });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', attach, { once: true });
        } else {
            attach();
        }
    }

    installOwlIMessageMotion();

    function showOperatorTyping(name, text) {
        installOwlIMessageMotion();
        const root = document.getElementById('owlChat');
        const stream = owlMessageStream();
        const safeName = esc(name || 'Мария');
        const safeText = esc(text || '').replace(/\n/g, '<br>');
        if (!root || !stream || typeof window.addBotMsg !== 'function') {
            if (typeof window.addBotMsg === 'function') window.addBotMsg('<b>👤 Оператор ' + safeName + ':</b><br>' + safeText);
            return;
        }

        const previous = stream.querySelector('.owl-operator-typing');
        if (previous) previous.remove();

        const bubble = document.createElement('div');
        bubble.className = 'msg-bot owl-operator-typing';
        bubble.setAttribute('aria-live', 'polite');
        bubble.setAttribute('aria-label', 'Оператор ' + String(name || 'Мария') + ' печатает');
        bubble.innerHTML = '<span class="owl-typing-label">' + safeName + ' печатает</span>' +
            '<span class="owl-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
        stream.appendChild(bubble);
        try { bubble.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}

        const delay = Math.min(3900, Math.max(1500, 1050 + String(text || '').length * 18 + Math.random() * 520));
        setTimeout(() => {
            if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
            window.addBotMsg('<b>👤 Оператор ' + safeName + ':</b><br>' + safeText);
            refreshOptions();
        }, delay);
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
                    : '🟡 Ждём оператора. Сообщим здесь, когда сотрудник откроет запрос.') +
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
            window.addBotMsg('⏳ <b>Ждём оператора.</b> ' + randomWaitReason());
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
                    const name = event.operator_name ? esc(event.operator_name) : 'Мария';
                    window.addBotMsg('🟢 <b>Оператор ' + name + ' подключился.</b> Теперь ваши сообщения идут сотруднику напрямую.');
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
            const name = event.operator_name ? event.operator_name : 'Мария';
            if (!announcedActive && typeof window.addBotMsg === 'function') {
                window.addBotMsg('🟢 <b>Оператор ' + esc(name) + ' подключился.</b>');
            }
            announcedActive = true;
            showOperatorTyping(name, event.text);
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
