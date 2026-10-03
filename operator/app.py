import hashlib
import logging
import os
import re
import threading
import time
from collections import defaultdict

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024

logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO').upper(),
    format='%(asctime)s [%(levelname)s] %(threadName)s: %(message)s'
)

BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
OPERATOR_CHAT_ID = os.getenv('OPERATOR_CHAT_ID', '').strip()
ALLOWED_ORIGINS = {
    x.strip().rstrip('/')
    for x in os.getenv(
        'ALLOWED_ORIGINS',
        'https://ranepa-dpo39.ru,https://www.ranepa-dpo39.ru'
    ).split(',')
    if x.strip()
}
SESSION_TTL_SECONDS = max(900, int(os.getenv('SESSION_TTL_SECONDS', '7200')))
POLL_TIMEOUT = max(5, min(45, int(os.getenv('TELEGRAM_POLL_TIMEOUT', '25'))))

sessions = {}
short_to_session = {}
reply_state = {}
lock = threading.RLock()
telegram_offset = 0
telegram_thread_started = False


def now_ts():
    return int(time.time())


def origin_allowed(origin):
    if not origin:
        return True
    clean = origin.rstrip('/')
    return clean in ALLOWED_ORIGINS or clean.startswith('http://localhost:') or clean.startswith('http://127.0.0.1:')


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin', '').rstrip('/')
    if origin and origin_allowed(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Vary'] = 'Origin'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Cache-Control'] = 'no-store'
    return response


def reject_origin():
    origin = request.headers.get('Origin', '')
    if origin and not origin_allowed(origin):
        return jsonify({'ok': False, 'error': 'origin_not_allowed'}), 403
    return None


@app.route('/api/owl/handoff/<path:_path>', methods=['OPTIONS'])
def preflight(_path):
    bad = reject_origin()
    return bad or ('', 204)


def valid_session_id(value):
    return bool(re.fullmatch(r'[A-Za-z0-9_-]{12,100}', str(value or '')))


def valid_secret(value):
    return bool(re.fullmatch(r'[A-Fa-f0-9]{32,160}', str(value or '')))


def session_short(session_id):
    return hashlib.sha256(session_id.encode('utf-8')).hexdigest()[:12]


def add_event(session, event_type, **data):
    next_id = int(session.get('next_event_id', 1))
    event = {'id': next_id, 'type': event_type, **data, 'at': now_ts()}
    session['next_event_id'] = next_id + 1
    session.setdefault('events', []).append(event)
    if len(session['events']) > 120:
        session['events'] = session['events'][-120:]
    session['updated_at'] = now_ts()
    return event


def get_session(session_id, secret=None, allow_closed=True):
    with lock:
        session = sessions.get(session_id)
        if not session:
            return None
        if secret is not None and session.get('secret') != secret:
            return None
        if now_ts() - int(session.get('updated_at', 0)) > SESSION_TTL_SECONDS:
            if session.get('status') != 'closed':
                session['status'] = 'closed'
                add_event(session, 'status', status='closed', reason='expired')
        if not allow_closed and session.get('status') == 'closed':
            return None
        return session


def clean_text(value, limit):
    return re.sub(r'\s+', ' ', str(value or '')).strip()[:limit]


def tg(method, payload=None, timeout=20):
    if not BOT_TOKEN:
        raise RuntimeError('telegram_not_configured')
    url = f'https://api.telegram.org/bot{BOT_TOKEN}/{method}'
    response = requests.post(url, json=payload or {}, timeout=timeout)
    data = response.json() if response.content else {}
    if not response.ok or not data.get('ok'):
        raise RuntimeError(f'telegram_{method}_failed: {data}')
    return data.get('result')


def keyboard(short):
    return {
        'inline_keyboard': [[
            {'text': '✍️ Ответить', 'callback_data': f'owl_reply:{short}'},
            {'text': '✅ Завершить', 'callback_data': f'owl_end:{short}'}
        ]]
    }


def format_context(conversation):
    lines = []
    for item in conversation[-10:]:
        if not isinstance(item, dict):
            continue
        role = '👤' if item.get('role') == 'user' else '🦉'
        text = clean_text(item.get('text'), 700)
        if text:
            lines.append(f'{role} {text}')
    return '\n'.join(lines)[:3000]


def send_start_card(session, conversation, page):
    short = session['short']
    context = format_context(conversation)
    page_line = clean_text(page, 350)
    text = (
        '🦉 Новый запрос оператору с сайта\n\n'
        + (context if context else 'Контекст чата не передан.')
        + ('\n\n🌐 ' + page_line if page_line else '')
        + f'\n\nOWL_SESSION:{short}'
    )
    return tg('sendMessage', {
        'chat_id': OPERATOR_CHAT_ID,
        'text': text[:3900],
        'reply_markup': keyboard(short),
        'disable_web_page_preview': True
    })


def send_user_message_card(session, text, page=''):
    short = session['short']
    body = clean_text(text, 1800)
    page_line = clean_text(page, 250)
    msg = '🦉 Сообщение с сайта\n\n👤 ' + body
    if page_line:
        msg += '\n\n🌐 ' + page_line
    msg += f'\n\nOWL_SESSION:{short}'
    return tg('sendMessage', {
        'chat_id': OPERATOR_CHAT_ID,
        'text': msg[:3900],
        'reply_markup': keyboard(short),
        'disable_web_page_preview': True
    })


def parse_payload():
    return request.get_json(silent=True) or {}


def auth_from_payload(payload):
    session_id = str(payload.get('session_id') or '').strip()
    secret = str(payload.get('secret') or '').strip()
    if not valid_session_id(session_id) or not valid_secret(secret):
        return None, ('invalid_session', 400)
    return (session_id, secret), None


@app.get('/healthz')
def healthz():
    return jsonify({
        'ok': True,
        'service': 'ranepa-owl-operator',
        'telegram_configured': bool(BOT_TOKEN and OPERATOR_CHAT_ID),
        'sessions': len(sessions)
    })


@app.post('/api/owl/handoff/start')
def handoff_start():
    bad = reject_origin()
    if bad:
        return bad
    if not BOT_TOKEN or not OPERATOR_CHAT_ID:
        return jsonify({'ok': False, 'error': 'operator_not_configured'}), 503

    payload = parse_payload()
    auth, error = auth_from_payload(payload)
    if error:
        return jsonify({'ok': False, 'error': error[0]}), error[1]
    session_id, secret = auth
    conversation = payload.get('conversation') if isinstance(payload.get('conversation'), list) else []
    page = payload.get('page') or ''

    with lock:
        session = sessions.get(session_id)
        if session and session.get('secret') != secret:
            return jsonify({'ok': False, 'error': 'session_conflict'}), 409
        if not session:
            short = session_short(session_id)
            session = {
                'id': session_id,
                'short': short,
                'secret': secret,
                'status': 'waiting',
                'operator_name': '',
                'created_at': now_ts(),
                'updated_at': now_ts(),
                'next_event_id': 1,
                'events': []
            }
            sessions[session_id] = session
            short_to_session[short] = session_id
            add_event(session, 'status', status='waiting')
        elif session.get('status') == 'closed':
            session['status'] = 'waiting'
            session['operator_name'] = ''
            add_event(session, 'status', status='waiting')

    try:
        send_start_card(session, conversation, page)
    except Exception:
        logging.exception('Failed to send Owl handoff start card')
        return jsonify({'ok': False, 'error': 'telegram_delivery_failed'}), 502

    with lock:
        last_id = int(session.get('next_event_id', 1)) - 1
        status = session.get('status', 'waiting')
    return jsonify({'ok': True, 'status': status, 'last_event_id': last_id})


@app.post('/api/owl/handoff/message')
def handoff_message():
    bad = reject_origin()
    if bad:
        return bad
    payload = parse_payload()
    auth, error = auth_from_payload(payload)
    if error:
        return jsonify({'ok': False, 'error': error[0]}), error[1]
    session_id, secret = auth
    text = clean_text(payload.get('text'), 1800)
    if not text:
        return jsonify({'ok': False, 'error': 'empty_message'}), 400

    session = get_session(session_id, secret, allow_closed=False)
    if not session:
        return jsonify({'ok': False, 'error': 'session_not_active'}), 404

    try:
        send_user_message_card(session, text, payload.get('page') or '')
    except Exception:
        logging.exception('Failed to deliver visitor message to Telegram')
        return jsonify({'ok': False, 'error': 'telegram_delivery_failed'}), 502

    return jsonify({'ok': True, 'status': session.get('status', 'waiting')})


@app.get('/api/owl/handoff/events')
def handoff_events():
    bad = reject_origin()
    if bad:
        return bad
    session_id = str(request.args.get('session_id') or '').strip()
    secret = str(request.args.get('secret') or '').strip()
    try:
        after = max(0, int(request.args.get('after') or 0))
    except ValueError:
        after = 0

    if not valid_session_id(session_id) or not valid_secret(secret):
        return jsonify({'ok': False, 'error': 'invalid_session'}), 400

    session = get_session(session_id, secret, allow_closed=True)
    if not session:
        return jsonify({'ok': False, 'error': 'session_not_found'}), 404

    with lock:
        events = [e for e in session.get('events', []) if int(e.get('id', 0)) > after]
        return jsonify({
            'ok': True,
            'status': session.get('status', 'waiting'),
            'operator_name': session.get('operator_name', ''),
            'events': events
        })


@app.post('/api/owl/handoff/end')
def handoff_end():
    bad = reject_origin()
    if bad:
        return bad
    payload = parse_payload()
    auth, error = auth_from_payload(payload)
    if error:
        return jsonify({'ok': False, 'error': error[0]}), error[1]
    session_id, secret = auth
    session = get_session(session_id, secret, allow_closed=True)
    if not session:
        return jsonify({'ok': True, 'status': 'closed'})

    with lock:
        if session.get('status') != 'closed':
            session['status'] = 'closed'
            add_event(session, 'status', status='closed', reason='visitor')
    try:
        tg('sendMessage', {
            'chat_id': OPERATOR_CHAT_ID,
            'text': f'✅ Посетитель завершил диалог с оператором.\n\nOWL_SESSION:{session["short"]}'
        })
    except Exception:
        logging.exception('Failed to announce visitor close')
    return jsonify({'ok': True, 'status': 'closed'})


def callback_answer(callback_id, text=''):
    try:
        tg('answerCallbackQuery', {'callback_query_id': callback_id, 'text': text[:180]})
    except Exception:
        logging.exception('answerCallbackQuery failed')


def operator_display(user):
    if not isinstance(user, dict):
        return 'Оператор Центра ДПО'
    full = ' '.join(x for x in [user.get('first_name', ''), user.get('last_name', '')] if x).strip()
    return full or user.get('username') or 'Оператор Центра ДПО'


def activate_reply(short, from_user, callback_id=None):
    with lock:
        session_id = short_to_session.get(short)
        session = sessions.get(session_id) if session_id else None
        if not session or session.get('status') == 'closed':
            if callback_id:
                callback_answer(callback_id, 'Диалог уже закрыт')
            return

        name = operator_display(from_user)
        session['status'] = 'active'
        session['operator_name'] = name
        add_event(session, 'status', status='active', operator_name=name)
        admin_id = str((from_user or {}).get('id') or '')
        if admin_id:
            reply_state[admin_id] = (short, now_ts() + 600)

    try:
        tg('sendMessage', {
            'chat_id': OPERATOR_CHAT_ID,
            'text': (
                '✍️ Ответ посетителю сайта\n'
                'Напишите следующее сообщение — оно появится прямо в чате Совы.\n\n'
                f'OWL_REPLY:{short}'
            ),
            'reply_markup': {'force_reply': True, 'selective': True}
        })
        if callback_id:
            callback_answer(callback_id, 'Пишите ответ')
    except Exception:
        logging.exception('Failed to arm operator reply')


def close_from_telegram(short, from_user, callback_id=None):
    with lock:
        session_id = short_to_session.get(short)
        session = sessions.get(session_id) if session_id else None
        if not session:
            if callback_id:
                callback_answer(callback_id, 'Диалог не найден')
            return
        if session.get('status') != 'closed':
            session['status'] = 'closed'
            name = operator_display(from_user)
            add_event(session, 'status', status='closed', reason='operator', operator_name=name)

    if callback_id:
        callback_answer(callback_id, 'Диалог завершён')
    try:
        tg('sendMessage', {
            'chat_id': OPERATOR_CHAT_ID,
            'text': f'✅ Диалог с посетителем завершён.\n\nOWL_SESSION:{short}'
        })
    except Exception:
        logging.exception('Failed to announce operator close')


def marker_from_message(message):
    reply = (message or {}).get('reply_to_message') or {}
    src = str(reply.get('text') or reply.get('caption') or '')
    match = re.search(r'OWL_(?:REPLY|SESSION):([a-f0-9]{12})', src, re.I)
    if match:
        return match.group(1).lower()

    user_id = str(((message or {}).get('from') or {}).get('id') or '')
    pending = reply_state.get(user_id)
    if pending:
        short, expires = pending
        if expires >= now_ts():
            return short
        reply_state.pop(user_id, None)
    return ''


def handle_operator_message(message):
    chat_id = str(((message or {}).get('chat') or {}).get('id') or '')
    if chat_id != str(OPERATOR_CHAT_ID):
        return
    text = str((message or {}).get('text') or (message or {}).get('caption') or '').strip()
    if not text or text.startswith('/'):
        return

    short = marker_from_message(message)
    if not short:
        return

    with lock:
        session_id = short_to_session.get(short)
        session = sessions.get(session_id) if session_id else None
        if not session or session.get('status') == 'closed':
            return
        name = operator_display((message or {}).get('from') or {})
        session['status'] = 'active'
        session['operator_name'] = name
        add_event(session, 'message', text=text[:1800], operator_name=name)
        user_id = str(((message or {}).get('from') or {}).get('id') or '')
        if user_id:
            reply_state.pop(user_id, None)

    try:
        tg('sendMessage', {
            'chat_id': OPERATOR_CHAT_ID,
            'text': f'✅ Ответ отправлен на сайт.\n\nOWL_SESSION:{short}',
            'reply_markup': keyboard(short)
        })
    except Exception:
        logging.exception('Failed to acknowledge operator message')


def handle_callback(callback):
    message = (callback or {}).get('message') or {}
    chat_id = str((message.get('chat') or {}).get('id') or '')
    if chat_id != str(OPERATOR_CHAT_ID):
        return

    data = str((callback or {}).get('data') or '')
    match = re.fullmatch(r'owl_(reply|end):([a-f0-9]{12})', data, re.I)
    if not match:
        return
    action, short = match.group(1).lower(), match.group(2).lower()
    if action == 'reply':
        activate_reply(short, (callback or {}).get('from') or {}, callback.get('id'))
    else:
        close_from_telegram(short, (callback or {}).get('from') or {}, callback.get('id'))


def process_update(update):
    if update.get('callback_query'):
        handle_callback(update['callback_query'])
    elif update.get('message'):
        handle_operator_message(update['message'])


def telegram_poll_loop():
    global telegram_offset
    logging.info('Owl Telegram operator polling started')
    while True:
        try:
            result = tg('getUpdates', {
                'offset': telegram_offset,
                'timeout': POLL_TIMEOUT,
                'allowed_updates': ['message', 'callback_query']
            }, timeout=POLL_TIMEOUT + 10)
            for update in result or []:
                telegram_offset = max(telegram_offset, int(update.get('update_id', 0)) + 1)
                try:
                    process_update(update)
                except Exception:
                    logging.exception('Failed to process Telegram update')
        except Exception as exc:
            logging.warning('Telegram polling error: %s', exc)
            time.sleep(4)


def start_telegram_thread():
    global telegram_thread_started
    if telegram_thread_started or not BOT_TOKEN or not OPERATOR_CHAT_ID:
        return
    telegram_thread_started = True
    threading.Thread(target=telegram_poll_loop, name='telegram-operator', daemon=True).start()


start_telegram_thread()


if __name__ == '__main__':
    port = int(os.getenv('PORT', '10000'))
    app.run(host='0.0.0.0', port=port, threaded=True)
