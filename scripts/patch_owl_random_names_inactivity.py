from pathlib import Path

path = Path('owl-operator.js')
text = path.read_text(encoding='utf-8')

if 'OWL_RANDOM_OPERATOR_NAMES_V1' not in text:
    old = """    const MAX_CONTEXT_MESSAGES = 10;\n    const WAIT_REASONS = [\n"""
    new = """    const MAX_CONTEXT_MESSAGES = 10;\n    // OWL_RANDOM_OPERATOR_NAMES_V1\n    const OPERATOR_DISPLAY_NAMES = [\n        'Мария', 'Дарья', 'Анна', 'Елена', 'Екатерина',\n        'Алина', 'Полина', 'Виктория', 'Ксения', 'Анастасия'\n    ];\n    const OPERATOR_INACTIVITY_MS = 10 * 60 * 1000;\n    const WAIT_REASONS = [\n"""
    if old not in text:
        raise SystemExit('constants anchor not found')
    text = text.replace(old, new, 1)

old = """    let pollTimer = null;\n    let pollInFlight = false;\n"""
new = """    let pollTimer = null;\n    let inactivityTimer = null;\n    let pollInFlight = false;\n"""
if old not in text:
    raise SystemExit('timer anchor not found')
text = text.replace(old, new, 1)

old = """                status: String(raw.status || 'idle'),\n                lastEventId: Number(raw.lastEventId || 0)\n"""
new = """                status: String(raw.status || 'idle'),\n                lastEventId: Number(raw.lastEventId || 0),\n                displayName: String(raw.displayName || ''),\n                lastActivityAt: Number(raw.lastActivityAt || 0)\n"""
if old not in text:
    raise SystemExit('load state anchor not found')
text = text.replace(old, new, 1)

old = """            return { sessionId: '', secret: '', status: 'idle', lastEventId: 0 };\n"""
new = """            return { sessionId: '', secret: '', status: 'idle', lastEventId: 0, displayName: '', lastActivityAt: 0 };\n"""
if old not in text:
    raise SystemExit('fallback state anchor not found')
text = text.replace(old, new, 1)

anchor = """    function randomWaitReason() {\n        return WAIT_REASONS[Math.floor(Math.random() * WAIT_REASONS.length)];\n    }\n"""
extra = '''

    function ensureOperatorDisplayName() {
        if (!OPERATOR_DISPLAY_NAMES.includes(state.displayName)) {
            state.displayName = OPERATOR_DISPLAY_NAMES[Math.floor(Math.random() * OPERATOR_DISPLAY_NAMES.length)];
            saveState();
        }
        return state.displayName;
    }

    function clearInactivityTimer() {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }

    function scheduleInactivityClose() {
        clearInactivityTimer();
        if (!isOperatorMode() || !state.lastActivityAt) return;
        const remaining = Math.max(0, OPERATOR_INACTIVITY_MS - (Date.now() - state.lastActivityAt));
        inactivityTimer = setTimeout(() => {
            if (!isOperatorMode()) return;
            if (Date.now() - state.lastActivityAt < OPERATOR_INACTIVITY_MS) {
                scheduleInactivityClose();
                return;
            }
            endHandoff(true);
        }, remaining);
    }

    function touchOperatorActivity() {
        state.lastActivityAt = Date.now();
        saveState();
        scheduleInactivityClose();
    }
'''
if 'function ensureOperatorDisplayName()' not in text:
    if anchor not in text:
        raise SystemExit('randomWaitReason anchor not found')
    text = text.replace(anchor, anchor + extra, 1)

old = """    async function startHandoff() {\n        if (isOperatorMode()) return;\n        ensureIdentity();\n\n"""
new = """    async function startHandoff() {\n        if (isOperatorMode()) return;\n        ensureIdentity();\n        state.displayName = '';\n        ensureOperatorDisplayName();\n        touchOperatorActivity();\n\n"""
if old not in text:
    raise SystemExit('startHandoff anchor not found')
text = text.replace(old, new, 1)

old = """    async function sendVisitorMessage(text) {\n        ensureIdentity();\n        try {\n"""
new = """    async function sendVisitorMessage(text) {\n        ensureIdentity();\n        touchOperatorActivity();\n        try {\n"""
if old not in text:
    raise SystemExit('visitor message anchor not found')
text = text.replace(old, new, 1)

old = """    async function endHandoff() {\n"""
new = """    async function endHandoff(autoClosed = false) {\n"""
if old not in text:
    raise SystemExit('endHandoff signature not found')
text = text.replace(old, new, 1)

old = """        state.status = 'idle';\n        state.lastEventId = 0;\n        announcedActive = false;\n        saveState();\n        stopPolling();\n        if (typeof window.addBotMsg === 'function') {\n            window.addBotMsg('Связь с оператором завершена. Я снова могу помочь как Сова.');\n        }\n"""
new = """        state.status = 'idle';\n        state.lastEventId = 0;\n        state.displayName = '';\n        state.lastActivityAt = 0;\n        announcedActive = false;\n        saveState();\n        stopPolling();\n        clearInactivityTimer();\n        if (typeof window.addBotMsg === 'function') {\n            window.addBotMsg(autoClosed\n                ? '⌛ Диалог с оператором автоматически завершён после 10 минут без активности. Я снова могу помочь как Сова.'\n                : 'Связь с оператором завершена. Я снова могу помочь как Сова.');\n        }\n"""
if old not in text:
    raise SystemExit('endHandoff body anchor not found')
text = text.replace(old, new, 1)

old = """                state.status = 'active';\n                if (!announcedActive && typeof window.addBotMsg === 'function') {\n                    const name = event.operator_name ? esc(event.operator_name) : 'Мария';\n                    window.addBotMsg('🟢 <b>Оператор ' + name + ' подключился.</b> Теперь ваши сообщения идут сотруднику напрямую.');\n"""
new = """                state.status = 'active';\n                touchOperatorActivity();\n                if (!announcedActive && typeof window.addBotMsg === 'function') {\n                    const name = esc(ensureOperatorDisplayName());\n                    window.addBotMsg('🟢 <b>Оператор ' + name + ' подключился.</b> Теперь ваши сообщения идут сотруднику напрямую.');\n"""
if old not in text:
    raise SystemExit('active status anchor not found')
text = text.replace(old, new, 1)

old = """                state.status = 'idle';\n                announcedActive = false;\n                if (typeof window.addBotMsg === 'function') {\n"""
new = """                state.status = 'idle';\n                state.displayName = '';\n                state.lastActivityAt = 0;\n                announcedActive = false;\n                clearInactivityTimer();\n                if (typeof window.addBotMsg === 'function') {\n"""
if old not in text:
    raise SystemExit('closed status anchor not found')
text = text.replace(old, new, 1)

old = """        if (event.type === 'message' && event.text) {\n            state.status = 'active';\n            saveState();\n            const name = event.operator_name ? event.operator_name : 'Мария';\n"""
new = """        if (event.type === 'message' && event.text) {\n            state.status = 'active';\n            touchOperatorActivity();\n            const name = ensureOperatorDisplayName();\n"""
if old not in text:
    raise SystemExit('message event anchor not found')
text = text.replace(old, new, 1)

old = """        if (isOperatorMode()) {\n            startPolling();\n            setTimeout(() => {\n"""
new = """        if (isOperatorMode()) {\n            ensureOperatorDisplayName();\n            scheduleInactivityClose();\n            startPolling();\n            setTimeout(() => {\n                if (!isOperatorMode()) return;\n"""
if old not in text:
    raise SystemExit('restore mode anchor not found')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
