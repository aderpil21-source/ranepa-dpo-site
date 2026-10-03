from pathlib import Path
import re


def sub_once(text, pattern, replacement, label, flags=0):
    out, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'patch target not found: {label}')
    return out


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'patch target not found: {label}')
    return text.replace(old, new, 1)


# ---------------- backend ----------------
p = Path('operator/app.py')
s = p.read_text(encoding='utf-8')

# Session recovery + stable random-looking operator aliases.
s = replace_once(
    s,
    "def session_short(session_id):\n    return hashlib.sha256(session_id.encode('utf-8')).hexdigest()[:12]\n\n\ndef add_event",
    "def session_short(session_id):\n    return hashlib.sha256(session_id.encode('utf-8')).hexdigest()[:12]\n\n\nOPERATOR_ALIASES = ('Анна', 'Мария', 'Елена', 'Ирина', 'Дарья', 'Ольга', 'Алексей', 'Никита')\n\n\ndef ensure_operator_alias(session):\n    current = clean_text(session.get('operator_name'), 40) if isinstance(session, dict) else ''\n    if current:\n        return current\n    seed = str((session or {}).get('id') or (session or {}).get('short') or 'owl')\n    digest = hashlib.sha256(seed.encode('utf-8')).digest()\n    alias = OPERATOR_ALIASES[digest[0] % len(OPERATOR_ALIASES)]\n    session['operator_name'] = alias\n    return alias\n\n\ndef rehydrate_session(session_id, secret='', status='waiting'):\n    with lock:\n        existing = sessions.get(session_id)\n        if existing:\n            if not existing.get('secret') and secret:\n                existing['secret'] = secret\n                existing['recovered'] = False\n            return existing\n        short = session_short(session_id)\n        session = {\n            'id': session_id,\n            'short': short,\n            'secret': secret,\n            'status': status,\n            'operator_name': '',\n            'created_at': now_ts(),\n            'updated_at': now_ts(),\n            'next_event_id': 1,\n            'events': [],\n            'recovered': True\n        }\n        sessions[session_id] = session\n        short_to_session[short] = session_id\n        add_event(session, 'status', status=status, reason='recovered')\n        return session\n\n\ndef resolve_session_ref(ref, recover=False):\n    ref = str(ref or '').strip()\n    with lock:\n        if valid_session_id(ref) and len(ref) > 12:\n            session = sessions.get(ref)\n            if not session and recover:\n                session = rehydrate_session(ref, '', 'waiting')\n            return session\n        session_id = short_to_session.get(ref.lower()) if re.fullmatch(r'[a-f0-9]{12}', ref, re.I) else None\n        return sessions.get(session_id) if session_id else None\n\n\ndef add_event",
    'session helpers',
)

s = replace_once(
    s,
    "        if secret is not None and session.get('secret') != secret:\n            return None",
    "        if secret is not None and session.get('secret') != secret:\n            if not session.get('secret') and session.get('recovered') and valid_secret(secret):\n                session['secret'] = secret\n                session['recovered'] = False\n            else:\n                return None",
    'secret recovery binding',
)

# Telegram cards carry full non-secret session ID when possible, so reply survives Render restarts.
s = sub_once(
    s,
    r"def keyboard\(short\):.*?(?=\n\ndef format_context)",
    """def keyboard(session):
    session_id = str(session.get('id') or '')
    short = str(session.get('short') or '')
    use_id = bool(valid_session_id(session_id) and len(session_id) <= 48)
    reply_data = f'owl_replyid:{session_id}' if use_id else f'owl_reply:{short}'
    end_data = f'owl_endid:{session_id}' if use_id else f'owl_end:{short}'
    return {
        'inline_keyboard': [[
            {'text': '👀 Открыть и ответить', 'callback_data': reply_data},
            {'text': '✅ Завершить', 'callback_data': end_data}
        ]]
    }
""",
    'keyboard',
    re.S,
)
s = s.replace("'reply_markup': keyboard(short)", "'reply_markup': keyboard(session)")

s = replace_once(
    s,
    "+ f'\\n\\nOWL_SESSION:{short}'",
    "+ '\\n\\nНажмите «👀 Открыть и ответить», чтобы посетитель увидел подключение оператора.'\n        + f'\\n\\nOWL_SESSION_ID:{session[\"id\"]}'",
    'start card marker',
)
s = replace_once(
    s,
    "msg += f'\\n\\nOWL_SESSION:{short}'",
    "msg += f'\\n\\nOWL_SESSION_ID:{session[\"id\"]}'",
    'visitor card marker',
)

s = replace_once(
    s,
    "                'events': []\n            }",
    "                'events': [],\n                'recovered': False\n            }",
    'new session recovery flag',
)

# Missing in-memory sessions are rebuilt instead of being falsely reported as closed.
s = replace_once(
    s,
    "    session = get_session(session_id, secret, allow_closed=False)\n    if not session:\n        return jsonify({'ok': False, 'error': 'session_not_active'}), 404",
    "    session = get_session(session_id, secret, allow_closed=True)\n    if not session:\n        session = rehydrate_session(session_id, secret, 'waiting')\n    if session.get('status') == 'closed':\n        return jsonify({'ok': False, 'error': 'session_not_active'}), 404",
    'message recovery',
)
s = replace_once(
    s,
    "    session = get_session(session_id, secret, allow_closed=True)\n    if not session:\n        return jsonify({'ok': False, 'error': 'session_not_found'}), 404\n\n    with lock:\n        events =",
    "    session = get_session(session_id, secret, allow_closed=True)\n    if not session:\n        session = rehydrate_session(session_id, secret, 'waiting')\n\n    with lock:\n        events =",
    'events recovery',
)

s = sub_once(
    s,
    r"def activate_reply\(.*?(?=\n\ndef close_from_telegram)",
    """def activate_reply(ref, from_user, callback_id=None):
    with lock:
        session = resolve_session_ref(ref, recover=True)
        if not session:
            if callback_id:
                callback_answer(callback_id, 'Диалог не найден. Откройте самый новый запрос.')
            return
        if session.get('status') == 'closed':
            if callback_id:
                callback_answer(callback_id, 'Диалог уже закрыт')
            return

        name = ensure_operator_alias(session)
        session['status'] = 'active'
        add_event(session, 'status', status='active', operator_name=name)
        admin_id = str((from_user or {}).get('id') or '')
        if admin_id:
            reply_state[admin_id] = (session['id'], now_ts() + 600)
        logging.info('Owl operator accepted session=%s alias=%s', session['short'], name)

    try:
        tg('sendMessage', {
            'chat_id': OPERATOR_CHAT_ID,
            'text': (
                f'🟢 Вы подключились как оператор {name}.\\n'
                'Напишите следующее сообщение — оно появится прямо в чате Совы.\\n\\n'
                f'OWL_REPLY_ID:{session["id"]}'
            ),
            'reply_markup': {'force_reply': True, 'selective': True}
        })
        if callback_id:
            callback_answer(callback_id, f'Открыто. Вы — оператор {name}')
    except Exception:
        logging.exception('Failed to arm operator reply')
""",
    'activate reply',
    re.S,
)

s = sub_once(
    s,
    r"def close_from_telegram\(.*?(?=\n\ndef marker_from_message)",
    """def close_from_telegram(ref, from_user, callback_id=None):
    with lock:
        session = resolve_session_ref(ref, recover=False)
        if not session:
            if callback_id:
                callback_answer(callback_id, 'Диалог не найден')
            return
        if session.get('status') != 'closed':
            session['status'] = 'closed'
            name = ensure_operator_alias(session)
            add_event(session, 'status', status='closed', reason='operator', operator_name=name)

    if callback_id:
        callback_answer(callback_id, 'Диалог завершён')
    try:
        tg('sendMessage', {
            'chat_id': OPERATOR_CHAT_ID,
            'text': f'✅ Диалог с посетителем завершён.\\n\\nOWL_SESSION:{session["short"]}'
        })
    except Exception:
        logging.exception('Failed to announce operator close')
""",
    'close callback',
    re.S,
)

s = sub_once(
    s,
    r"def marker_from_message\(.*?(?=\n\ndef handle_operator_message)",
    """def marker_from_message(message):
    reply = (message or {}).get('reply_to_message') or {}
    src = str(reply.get('text') or reply.get('caption') or '')
    match = re.search(r'OWL_(?:REPLY_ID|SESSION_ID):([A-Za-z0-9_-]{12,100})', src)
    if match:
        return match.group(1)
    match = re.search(r'OWL_(?:REPLY|SESSION):([a-f0-9]{12})', src, re.I)
    if match:
        return match.group(1).lower()

    user_id = str(((message or {}).get('from') or {}).get('id') or '')
    pending = reply_state.get(user_id)
    if pending:
        ref, expires = pending
        if expires >= now_ts():
            return ref
        reply_state.pop(user_id, None)
    return ''
""",
    'message marker',
    re.S,
)

s = sub_once(
    s,
    r"def handle_operator_message\(.*?(?=\n\ndef handle_callback)",
    """def handle_operator_message(message):
    chat_id = str(((message or {}).get('chat') or {}).get('id') or '')
    if chat_id != str(OPERATOR_CHAT_ID):
        return
    text = str((message or {}).get('text') or (message or {}).get('caption') or '').strip()
    if not text or text.startswith('/'):
        return

    ref = marker_from_message(message)
    if not ref:
        return

    with lock:
        session = resolve_session_ref(ref, recover=True)
        if not session or session.get('status') == 'closed':
            return
        name = ensure_operator_alias(session)
        session['status'] = 'active'
        add_event(session, 'message', text=text[:1800], operator_name=name)
        user_id = str(((message or {}).get('from') or {}).get('id') or '')
        if user_id:
            reply_state.pop(user_id, None)

    try:
        tg('sendMessage', {
            'chat_id': OPERATOR_CHAT_ID,
            'text': f'✅ Ответ отправлен на сайт.\\n\\nOWL_SESSION:{session["short"]}',
            'reply_markup': keyboard(session)
        })
    except Exception:
        logging.exception('Failed to acknowledge operator message')
""",
    'operator message',
    re.S,
)

s = sub_once(
    s,
    r"def handle_callback\(.*?(?=\n\ndef process_update)",
    """def handle_callback(callback):
    message = (callback or {}).get('message') or {}
    chat_id = str((message.get('chat') or {}).get('id') or '')
    if chat_id != str(OPERATOR_CHAT_ID):
        return

    data = str((callback or {}).get('data') or '')
    match = re.fullmatch(r'owl_(reply|end)(id)?:([A-Za-z0-9_-]{12,100})', data, re.I)
    if not match:
        return
    action, id_mode, ref = match.group(1).lower(), bool(match.group(2)), match.group(3)
    if not id_mode:
        ref = ref.lower()
    logging.info('Owl callback action=%s ref=%s', action, ref[:16])
    if action == 'reply':
        activate_reply(ref, (callback or {}).get('from') or {}, callback.get('id'))
    else:
        close_from_telegram(ref, (callback or {}).get('from') or {}, callback.get('id'))
""",
    'callback parser',
    re.S,
)

p.write_text(s, encoding='utf-8')


# ---------------- browser client ----------------
p = Path('owl-operator.js')
s = p.read_text(encoding='utf-8')

s = replace_once(
    s,
    "    const MAX_CONTEXT_MESSAGES = 10;\n",
    "    const MAX_CONTEXT_MESSAGES = 10;\n    const WAIT_REASONS = [\n        'Передаю сотруднику контекст разговора, чтобы вам не пришлось повторять вопрос.',\n        'Проверяю, кто из специалистов Центра ДПО сейчас свободен.',\n        'Подбираю сотрудника, который лучше всего сможет помочь по вашему вопросу.',\n        'Передаю запрос операторской группе и жду, пока сотрудник откроет диалог.',\n        'Ищу свободного оператора — обычно это занимает совсем немного времени.'\n    ];\n",
    'wait reasons',
)

s = replace_once(
    s,
    "    function userMessageCount() {\n",
    "    function randomWaitReason() {\n        return WAIT_REASONS[Math.floor(Math.random() * WAIT_REASONS.length)];\n    }\n\n    function showOperatorTyping(name, text) {\n        const root = document.getElementById('owlChat');\n        const safeName = esc(name || 'Мария');\n        const safeText = esc(text || '').replace(/\\n/g, '<br>');\n        if (!root || typeof window.addBotMsg !== 'function') {\n            if (typeof window.addBotMsg === 'function') window.addBotMsg('<b>👤 Оператор ' + safeName + ':</b><br>' + safeText);\n            return;\n        }\n        const bubble = document.createElement('div');\n        bubble.className = 'msg-bot owl-operator-typing';\n        bubble.setAttribute('aria-live', 'polite');\n        bubble.innerHTML = '<b>👤 Оператор ' + safeName + '</b> печатает<span data-typing-dots>…</span>';\n        root.appendChild(bubble);\n        try { bubble.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}\n        const dots = bubble.querySelector('[data-typing-dots]');\n        let step = 0;\n        const ticker = setInterval(() => {\n            step = (step + 1) % 3;\n            if (dots) dots.textContent = '.'.repeat(step + 1);\n        }, 320);\n        const delay = Math.min(4600, Math.max(1200, 850 + String(text || '').length * 24 + Math.random() * 700));\n        setTimeout(() => {\n            clearInterval(ticker);\n            if (bubble.parentNode) bubble.parentNode.removeChild(bubble);\n            window.addBotMsg('<b>👤 Оператор ' + safeName + ':</b><br>' + safeText);\n            refreshOptions();\n        }, delay);\n    }\n\n    function userMessageCount() {\n",
    'typing helper',
)

s = s.replace(
    "'🟡 Оператор вызван. Можно продолжать писать, сообщения уже передаются сотруднику.'",
    "'🟡 Ждём оператора. Сообщим здесь, когда сотрудник откроет запрос.'",
)

s = replace_once(
    s,
    "        if (typeof window.addBotMsg === 'function') {\n            window.addBotMsg('👤 Зову сотрудника Центра ДПО. Передаю оператору последние сообщения этого диалога.');\n        }",
    "        if (typeof window.addBotMsg === 'function') {\n            window.addBotMsg('👤 Зову сотрудника Центра ДПО. Передаю оператору последние сообщения этого диалога.');\n            window.addBotMsg('⏳ <b>Ждём оператора.</b> ' + randomWaitReason());\n        }",
    'waiting message',
)

s = replace_once(
    s,
    "                    const who = event.operator_name ? ' — ' + esc(event.operator_name) : '';\n                    window.addBotMsg('🟢 <b>Оператор подключился' + who + '.</b> Теперь ваши сообщения идут сотруднику напрямую.');",
    "                    const name = event.operator_name ? esc(event.operator_name) : 'Мария';\n                    window.addBotMsg('🟢 <b>Оператор ' + name + ' подключился.</b> Теперь ваши сообщения идут сотруднику напрямую.');",
    'active site status',
)

s = replace_once(
    s,
    "            if (typeof window.addBotMsg === 'function') {\n                const name = event.operator_name ? esc(event.operator_name) : 'Оператор Центра ДПО';\n                window.addBotMsg('<b>👤 ' + name + ':</b><br>' + esc(event.text).replace(/\\n/g, '<br>'));\n            }\n            refreshOptions();",
    "            const name = event.operator_name ? event.operator_name : 'Мария';\n            if (!announcedActive && typeof window.addBotMsg === 'function') {\n                window.addBotMsg('🟢 <b>Оператор ' + esc(name) + ' подключился.</b>');\n            }\n            announcedActive = true;\n            showOperatorTyping(name, event.text);",
    'typing message',
)

p.write_text(s, encoding='utf-8')

# Browser cache-bust.
p = Path('index.html')
s = p.read_text(encoding='utf-8')
s = s.replace('./owl-operator.js?v=20261003-1', './owl-operator.js?v=20261003-2')
p.write_text(s, encoding='utf-8')

# Remove temporary implementation helpers from feature branch.
for name in [
    '.github/workflows/owl-polish-once.yml',
    'scripts/owl_polish_once.py',
    'scripts/owl_polish_v2.py',
]:
    q = Path(name)
    if q.exists():
        q.unlink()
