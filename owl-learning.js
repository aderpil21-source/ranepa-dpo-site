(function () {
    'use strict';

    const LOCAL_RULES_KEY = 'ranepa_owl_learned_rules_v1';
    const LEARNING_QUEUE_KEY = 'ranepa_owl_learning_queue_v1';
    const PENDING_KEY = 'ranepa_owl_learning_pending_v1';
    const SESSION_KEY = 'ranepa_owl_learning_session_v1';
    const LAST_RESOLVED_KEY = 'ranepa_owl_learning_last_resolved_v1';

    const MAX_RULES = 240;
    const MAX_QUEUE = 120;
    const MAX_TEXT = 180;
    const FLUSH_DEBOUNCE_MS = 1200;
    let flushTimer = null;

    function normalize(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/https?:\/\/\S+/gi, ' ')
            .replace(/[\w.+-]+@[\w.-]+\.[a-zа-я]{2,}/gi, ' ')
            .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, ' ')
            .replace(/\b\d{5,}\b/g, ' ')
            .replace(/[^a-zа-я0-9\s-]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_TEXT);
    }

    function safeText(value) {
        return normalize(value);
    }

    function sessionId() {
        try {
            let id = sessionStorage.getItem(SESSION_KEY);
            if (!id) {
                id = 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
                sessionStorage.setItem(SESSION_KEY, id);
            }
            return id;
        } catch (e) {
            return 'session';
        }
    }

    function readJson(key, fallback, storage) {
        try {
            const source = storage || localStorage;
            const raw = source.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return parsed == null ? fallback : parsed;
        } catch (e) {
            return fallback;
        }
    }

    function writeJson(key, value, storage) {
        try {
            const target = storage || localStorage;
            target.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    }

    function editDistance(a, b) {
        a = String(a || '');
        b = String(b || '');

        if (a === b) return 0;
        if (!a.length) return b.length;
        if (!b.length) return a.length;
        if (Math.abs(a.length - b.length) > 2) return 99;

        const prev = new Array(b.length + 1);
        const curr = new Array(b.length + 1);
        const prevPrev = new Array(b.length + 1);

        for (let j = 0; j <= b.length; j++) prev[j] = j;

        for (let i = 1; i <= a.length; i++) {
            curr[0] = i;

            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                let value = Math.min(
                    prev[j] + 1,
                    curr[j - 1] + 1,
                    prev[j - 1] + cost
                );

                if (
                    i > 1 &&
                    j > 1 &&
                    a[i - 1] === b[j - 2] &&
                    a[i - 2] === b[j - 1]
                ) {
                    value = Math.min(value, prevPrev[j - 2] + 1);
                }

                curr[j] = value;
            }

            for (let j = 0; j <= b.length; j++) {
                prevPrev[j] = prev[j];
                prev[j] = curr[j];
            }
        }

        return prev[b.length];
    }

    function allowedDistance(word) {
        const len = String(word || '').length;
        if (len < 4) return 0;
        if (len <= 6) return 1;
        if (len <= 10) return 2;
        return 2;
    }

    function fuzzyWordEqual(a, b) {
        a = normalize(a);
        b = normalize(b);
        if (!a || !b) return false;
        if (a === b) return true;
        if (Math.abs(a.length - b.length) > 2) return false;

        const firstA = a.charAt(0);
        const firstB = b.charAt(0);
        if (firstA !== firstB && a.length > 5 && b.length > 5) return false;

        const max = Math.min(allowedDistance(a), allowedDistance(b));
        if (!max) return false;

        return editDistance(a, b) <= max;
    }

    let cachedVocabulary = null;
    let cachedVocabularySize = 0;

    function addWords(set, value) {
        normalize(value).split(' ').forEach(word => {
            if (word.length >= 4 && word.length <= 24) set.add(word);
        });
    }

    function buildVocabulary(extraValues) {
        const brain = window.OWL_BRAIN || {};
        const extras = Array.isArray(extraValues) ? extraValues : [];
        const estimated = extras.length;

        if (cachedVocabulary && cachedVocabularySize === estimated) {
            return cachedVocabulary;
        }

        const set = new Set();

        const replacements = brain.replacements || {};
        Object.keys(replacements).forEach(key => {
            addWords(set, key);
            addWords(set, replacements[key]);
        });

        const intents = brain.intents || {};
        Object.keys(intents).forEach(name => {
            (intents[name] || []).forEach(value => addWords(set, value));
        });

        (brain.negativeFeedback || []).forEach(value => addWords(set, value));

        extras.forEach(value => addWords(set, value));

        cachedVocabulary = [...set];
        cachedVocabularySize = estimated;
        return cachedVocabulary;
    }

    function correctText(value, extraValues) {
        const text = normalize(value);
        if (!text) return text;

        const vocabulary = buildVocabulary(extraValues);
        const words = text.split(' ');

        return words.map(word => {
            if (word.length < 4) return word;
            if (/^\d+$/.test(word)) return word;
            if (vocabulary.includes(word)) return word;

            let best = word;
            let bestDistance = 99;
            const max = allowedDistance(word);

            for (let i = 0; i < vocabulary.length; i++) {
                const candidate = vocabulary[i];
                if (Math.abs(candidate.length - word.length) > max) continue;

                if (
                    word.length > 5 &&
                    candidate.length > 5 &&
                    candidate.charAt(0) !== word.charAt(0)
                ) {
                    continue;
                }

                const distance = editDistance(word, candidate);
                if (distance < bestDistance && distance <= max) {
                    best = candidate;
                    bestDistance = distance;
                    if (distance === 1) break;
                }
            }

            return best;
        }).join(' ');
    }

    function phraseScore(a, b) {
        const aa = normalize(a);
        const bb = normalize(b);
        if (!aa || !bb) return 0;
        if (aa === bb) return 1;

        const aWords = aa.split(' ').filter(Boolean);
        const bWords = bb.split(' ').filter(Boolean);
        if (!aWords.length || !bWords.length) return 0;

        let matches = 0;
        aWords.forEach(word => {
            if (bWords.some(other => word === other || fuzzyWordEqual(word, other))) {
                matches += 1;
            }
        });

        const coverage = matches / Math.max(aWords.length, bWords.length);
        const lengthPenalty = Math.min(aWords.length, bWords.length) / Math.max(aWords.length, bWords.length);

        return coverage * 0.8 + lengthPenalty * 0.2;
    }

    function phraseMatches(a, b, threshold) {
        return phraseScore(a, b) >= Number(threshold || 0.84);
    }

    function getRules() {
        const rules = readJson(LOCAL_RULES_KEY, []);
        return Array.isArray(rules) ? rules : [];
    }

    function importSharedRules(items) {
        if (!Array.isArray(items)) return 0;
        const rules = getRules().filter(rule => rule && rule.source !== 'shared');
        let accepted = 0;

        items.slice(0, 240).forEach(item => {
            if (!item || String(item.status || '').toLowerCase() !== 'active') return;
            const confirmations = Number(item.confirmations || 0);
            const rejections = Number(item.rejections || 0);
            if (confirmations < 2 || confirmations <= rejections) return;

            const phrase = safeText(item.phrase);
            const action = String(item.action || '').slice(0, 40);
            const value = safeText(item.value || '');
            if (!phrase || !action || !value) return;
            if (!['program','preset','filter','staff'].includes(action)) return;

            rules.push({
                phrase,
                action,
                value,
                hits: confirmations,
                confirmations,
                rejections,
                updatedAt: Date.now(),
                source: 'shared'
            });
            accepted++;
        });

        saveRules(rules);
        return accepted;
    }

    async function refreshShared(endpoint) {
        endpoint = String(endpoint || window.OWL_LEARNING_ENDPOINT || '').trim();
        if (!endpoint) return { ok:false, reason:'no_endpoint' };
        try {
            const url = endpoint + (endpoint.includes('?') ? '&' : '?') + 'action=owl_learning_rules';
            const response = await fetch(url, { method:'GET', mode:'cors', cache:'no-store' });
            if (!response.ok) return { ok:false, reason:'http_' + response.status };
            const payload = await response.json();
            if (!payload || payload.ok === false || !Array.isArray(payload.rules)) {
                return { ok:false, reason:'bad_payload' };
            }
            return { ok:true, imported:importSharedRules(payload.rules) };
        } catch (e) {
            return { ok:false, reason:e && e.name ? e.name : 'network' };
        }
    }

    function saveRules(rules) {
        const clean = Array.isArray(rules) ? rules.slice(-MAX_RULES) : [];
        writeJson(LOCAL_RULES_KEY, clean);
    }

    function getPending() {
        const value = readJson(PENDING_KEY, null, sessionStorage);
        return value && typeof value === 'object' ? value : null;
    }

    function clearPending() {
        try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {}
    }

    function rememberUnknown(text, meta) {
        const phrase = safeText(text);
        if (!phrase || phrase.length < 3) return;

        const pending = {
            phrase,
            meta: meta && typeof meta === 'object' ? meta : {},
            createdAt: Date.now()
        };

        writeJson(PENDING_KEY, pending, sessionStorage);
        queueEvent({
            type: 'unknown',
            phrase,
            context: pending.meta
        });
    }

    function learn(phrase, action, value, source) {
        phrase = safeText(phrase);
        action = String(action || '').slice(0, 40);
        value = safeText(value || '');

        if (!phrase || !action) return false;

        const rules = getRules();
        const now = Date.now();
        const existing = rules.find(rule => rule.phrase === phrase && rule.action === action && rule.value === value);

        if (existing) {
            existing.hits = Number(existing.hits || 1) + 1;
            existing.updatedAt = now;
            existing.source = source || existing.source || 'local';
        } else {
            rules.push({
                phrase,
                action,
                value,
                hits: 1,
                createdAt: now,
                updatedAt: now,
                source: source || 'local'
            });
        }

        saveRules(rules);

        // Запоминаем последнее явно подтверждённое соответствие только в рамках
        // текущей вкладки. Если пользователь сразу скажет "не то", сможем
        // отправить отрицательное подтверждение именно для этой пары.
        writeJson(LAST_RESOLVED_KEY, {
            phrase,
            action,
            value,
            at: now
        }, sessionStorage);

        queueEvent({
            type: 'resolved',
            phrase,
            action,
            value,
            source: source || 'local'
        });
        return true;
    }

    function rejectLastResolved(action, value, source) {
        const last = readJson(LAST_RESOLVED_KEY, null, sessionStorage);
        if (!last || !last.phrase || !last.action) return false;
        if (Date.now() - Number(last.at || 0) > 30 * 60 * 1000) return false;

        const expectedAction = String(action || '');
        const expectedValue = safeText(value || '');
        if (expectedAction && String(last.action || '') !== expectedAction) return false;
        if (expectedValue && safeText(last.value || '') !== expectedValue) return false;

        // Убираем отвергнутое соответствие из локальной памяти немедленно,
        // чтобы Сова не повторяла его в этой же сессии.
        const rules = getRules().filter(rule => !(
            rule &&
            rule.phrase === last.phrase &&
            rule.action === last.action &&
            safeText(rule.value || '') === safeText(last.value || '')
        ));
        saveRules(rules);

        queueEvent({
            type: 'feedback',
            verdict: 'rejected',
            phrase: last.phrase,
            action: last.action,
            value: last.value,
            source: source || 'explicit-rejection'
        });

        try { sessionStorage.removeItem(LAST_RESOLVED_KEY); } catch (e) {}
        return true;
    }

    function resolvePending(action, value, source) {
        const pending = getPending();
        if (!pending || !pending.phrase) return false;

        const ok = learn(pending.phrase, action, value, source || 'explicit');
        clearPending();
        return ok;
    }

    function resolvePendingAsPreset(presetText, source) {
        return resolvePending('preset', presetText, source || 'preset-button');
    }

    function lookup(text) {
        const phrase = safeText(text);
        if (!phrase) return null;

        const rules = getRules();
        let best = null;
        let bestScore = 0;

        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            if (!rule || !rule.phrase) continue;

            let score = 0;
            if (rule.phrase === phrase) score = 1;
            else if (phrase.length >= 5 && rule.phrase.length >= 5) score = phraseScore(phrase, rule.phrase);

            if (score > bestScore) {
                best = rule;
                bestScore = score;
            }
        }

        if (!best) return null;

        const threshold = best.phrase.length <= 8 ? 0.92 : 0.86;
        if (bestScore < threshold) return null;

        return Object.assign({}, best, { score: bestScore });
    }

    function queueEvent(event) {
        const item = event && typeof event === 'object' ? Object.assign({}, event) : {};
        item.session = sessionId();
        item.at = Date.now();

        if (item.phrase) item.phrase = safeText(item.phrase);
        if (item.value) item.value = safeText(item.value);

        // Не отправляем произвольные вложенные пользовательские данные.
        if (item.context && typeof item.context === 'object') {
            item.context = {
                mode: String(item.context.mode || '').slice(0, 20),
                intent: String(item.context.intent || '').slice(0, 40),
                page: String(item.context.page || '').slice(0, 80)
            };
        }

        const queue = readJson(LEARNING_QUEUE_KEY, []);
        const list = Array.isArray(queue) ? queue : [];
        list.push(item);
        writeJson(LEARNING_QUEUE_KEY, list.slice(-MAX_QUEUE));

        // Отправляем только уже обезличенные события и не блокируем ответ пользователю.
        if (String(window.OWL_LEARNING_ENDPOINT || '').trim()) {
            if (flushTimer) clearTimeout(flushTimer);
            flushTimer = setTimeout(() => {
                flush().catch(() => {});
            }, FLUSH_DEBOUNCE_MS);
        }
    }

    function getQueue() {
        const queue = readJson(LEARNING_QUEUE_KEY, []);
        return Array.isArray(queue) ? queue.slice() : [];
    }

    function clearQueue() {
        writeJson(LEARNING_QUEUE_KEY, []);
    }

    async function flush(endpoint) {
        endpoint = String(endpoint || window.OWL_LEARNING_ENDPOINT || '').trim();
        if (!endpoint) return { ok: false, reason: 'no_endpoint' };

        const queue = getQueue();
        if (!queue.length) return { ok: true, sent: 0 };

        const batch = queue.slice(0, 40);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                mode: 'cors',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'learn_context',
                    events: batch
                })
            });

            if (!response.ok) {
                return { ok: false, reason: 'http_' + response.status };
            }

            let serverPayload = null;
            try {
                serverPayload = await response.clone().json();
            } catch (e) {}

            if (serverPayload && serverPayload.error) {
                return {
                    ok: false,
                    reason: 'server_' + String(serverPayload.error).slice(0, 80)
                };
            }
            if (serverPayload && serverPayload.ok === false) {
                return {
                    ok: false,
                    reason: 'server_rejected'
                };
            }

            const rest = queue.slice(batch.length);
            writeJson(LEARNING_QUEUE_KEY, rest);
            return { ok: true, sent: batch.length };
        } catch (e) {
            return { ok: false, reason: e && e.name ? e.name : 'network' };
        }
    }

    window.addEventListener('online', () => {
        if (String(window.OWL_LEARNING_ENDPOINT || '').trim()) flush().catch(() => {});
    });

    window.addEventListener('pagehide', () => {
        // Очередь уже сохранена в localStorage; на следующем открытии повторим отправку.
        if (flushTimer) clearTimeout(flushTimer);
    });

    window.OwlLearning = {
        normalize,
        safeText,
        editDistance,
        fuzzyWordEqual,
        phraseScore,
        phraseMatches,
        correctText,
        lookup,
        learn,
        rememberUnknown,
        getPending,
        clearPending,
        resolvePending,
        resolvePendingAsPreset,
        rejectLastResolved,
        queueEvent,
        getQueue,
        clearQueue,
        flush,
        importSharedRules,
        refreshShared
    };
})();
