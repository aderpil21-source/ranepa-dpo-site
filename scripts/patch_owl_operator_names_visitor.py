from pathlib import Path

path = Path('owl-operator.js')
text = path.read_text(encoding='utf-8')

old_names = """    const OPERATOR_DISPLAY_NAMES = [\n        'Мария', 'Дарья', 'Анна', 'Елена', 'Екатерина',\n        'Алина', 'Полина', 'Виктория', 'Ксения', 'Анастасия'\n    ];"""
new_names = """    const OPERATOR_DISPLAY_NAMES = [\n        // 5 женских\n        'Мария', 'Дарья', 'Анна', 'Елена', 'Екатерина',\n        // 5 мужских\n        'Алексей', 'Дмитрий', 'Максим', 'Михаил', 'Александр'\n    ];"""
if old_names not in text:
    raise SystemExit('operator names block not found')
text = text.replace(old_names, new_names, 1)

old_state = """                displayName: String(raw.displayName || ''),\n                lastActivityAt: Number(raw.lastActivityAt || 0)"""
new_state = """                displayName: String(raw.displayName || ''),\n                visitorName: String(raw.visitorName || ''),\n                lastActivityAt: Number(raw.lastActivityAt || 0)"""
if old_state not in text:
    raise SystemExit('state load block not found')
text = text.replace(old_state, new_state, 1)

old_fallback = "return { sessionId: '', secret: '', status: 'idle', lastEventId: 0, displayName: '', lastActivityAt: 0 };"
new_fallback = "return { sessionId: '', secret: '', status: 'idle', lastEventId: 0, displayName: '', visitorName: '', lastActivityAt: 0 };"
if old_fallback not in text:
    raise SystemExit('state fallback not found')
text = text.replace(old_fallback, new_fallback, 1)

anchor = """    function randomWaitReason() {\n        return WAIT_REASONS[Math.floor(Math.random() * WAIT_REASONS.length)];\n    }\n\n"""
insert = r'''    function randomWaitReason() {
        return WAIT_REASONS[Math.floor(Math.random() * WAIT_REASONS.length)];
    }

    function askVisitorName() {
        return new Promise((resolve) => {
            const previous = document.getElementById('owlVisitorNameOverlay');
            if (previous) previous.remove();

            if (!document.getElementById('owl-visitor-name-style')) {
                const style = document.createElement('style');
                style.id = 'owl-visitor-name-style';
                style.textContent = `
                    #owlVisitorNameOverlay {
                        position: fixed;
                        inset: 0;
                        z-index: 2147483000;
                        display: grid;
                        place-items: center;
                        padding: 18px;
                        background: rgba(8, 12, 20, .44);
                        backdrop-filter: blur(10px);
                        -webkit-backdrop-filter: blur(10px);
                        animation: owlNameFadeIn .18s ease both;
                    }
                    #owlVisitorNameOverlay .owl-name-card {
                        width: min(92vw, 390px);
                        border-radius: 22px;
                        padding: 20px;
                        background: rgba(23,31,41,.97);
                        color: #fff;
                        border: 1px solid rgba(255,255,255,.12);
                        box-shadow: 0 22px 70px rgba(0,0,0,.28);
                        transform-origin: 50% 80%;
                        animation: owlNameCardIn .28s cubic-bezier(.2,1.15,.32,1) both;
                    }
                    #owlVisitorNameOverlay .owl-name-title {
                        font-size: 18px;
                        line-height: 1.25;
                        font-weight: 800;
                        margin: 0 0 6px;
                    }
                    #owlVisitorNameOverlay .owl-name-subtitle {
                        font-size: 13px;
                        line-height: 1.45;
                        opacity: .72;
                        margin-bottom: 14px;
                    }
                    #owlVisitorNameOverlay .owl-name-input {
                        width: 100%;
                        box-sizing: border-box;
                        border-radius: 14px;
                        border: 1px solid rgba(255,255,255,.16);
                        background: rgba(255,255,255,.08);
                        color: #fff;
                        padding: 12px 14px;
                        outline: none;
                        font: inherit;
                        transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
                    }
                    #owlVisitorNameOverlay .owl-name-input::placeholder { color: rgba(255,255,255,.46); }
                    #owlVisitorNameOverlay .owl-name-input:focus {
                        border-color: rgba(255,95,97,.72);
                        box-shadow: 0 0 0 4px rgba(202,15,62,.14);
                        background: rgba(255,255,255,.1);
                    }
                    #owlVisitorNameOverlay .owl-name-actions {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 10px;
                        margin-top: 14px;
                    }
                    #owlVisitorNameOverlay .owl-name-btn {
                        min-height: 42px;
                        border-radius: 13px;
                        border: 1px solid rgba(255,255,255,.12);
                        font: inherit;
                        font-weight: 750;
                        cursor: pointer;
                        transition: transform .15s ease, filter .15s ease, background .15s ease;
                    }
                    #owlVisitorNameOverlay .owl-name-btn:active { transform: scale(.975); }
                    #owlVisitorNameOverlay .owl-name-skip { background: rgba(255,255,255,.08); color: #fff; }
                    #owlVisitorNameOverlay .owl-name-save {
                        background: linear-gradient(135deg,#29345B,#CA0F3E);
                        color: #fff;
                    }
                    @keyframes owlNameFadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes owlNameCardIn { from { opacity: 0; transform: translateY(10px) scale(.96); } to { opacity: 1; transform: none; } }
                    @media (prefers-reduced-motion: reduce) {
                        #owlVisitorNameOverlay,
                        #owlVisitorNameOverlay .owl-name-card { animation: none !important; }
                    }
                `;
                document.head.appendChild(style);
            }

            const overlay = document.createElement('div');
            overlay.id = 'owlVisitorNameOverlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'owlVisitorNameTitle');
            overlay.innerHTML = `
                <div class="owl-name-card">
                    <div class="owl-name-title" id="owlVisitorNameTitle">Как к вам обращаться?</div>
                    <div class="owl-name-subtitle">Необязательно. Можно указать имя, чтобы оператор обращался к вам лично, или просто пропустить.</div>
                    <input class="owl-name-input" id="owlVisitorNameInput" type="text" maxlength="60" autocomplete="name" placeholder="Например, Антон">
                    <div class="owl-name-actions">
                        <button class="owl-name-btn owl-name-skip" type="button" data-action="skip">Пропустить</button>
                        <button class="owl-name-btn owl-name-save" type="button" data-action="save">Продолжить</button>
                    </div>
                </div>`;

            const finish = (value) => {
                const name = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 60);
                document.removeEventListener('keydown', onKeyDown, true);
                overlay.remove();
                resolve(name);
            };
            const onKeyDown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    finish('');
                } else if (event.key === 'Enter') {
                    event.preventDefault();
                    const input = overlay.querySelector('#owlVisitorNameInput');
                    finish(input ? input.value : '');
                }
            };

            overlay.addEventListener('click', (event) => {
                const button = event.target.closest('[data-action]');
                if (!button) return;
                const input = overlay.querySelector('#owlVisitorNameInput');
                finish(button.dataset.action === 'save' && input ? input.value : '');
            });
            document.addEventListener('keydown', onKeyDown, true);
            document.body.appendChild(overlay);
            setTimeout(() => {
                const input = overlay.querySelector('#owlVisitorNameInput');
                if (input) input.focus({ preventScroll: true });
            }, 30);
        });
    }

'''
if anchor not in text:
    raise SystemExit('randomWaitReason anchor not found')
text = text.replace(anchor, insert, 1)

old_recent = """        return Array.from(root.querySelectorAll('.msg-user,.msg-bot'))\n            .slice(-MAX_CONTEXT_MESSAGES)\n            .map(node => ({\n                role: node.classList.contains('msg-user') ? 'user' : 'assistant',\n                text: String(node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 900)\n            }))\n            .filter(item => item.text);"""
new_recent = """        const items = Array.from(root.querySelectorAll('.msg-user,.msg-bot'))\n            .slice(-MAX_CONTEXT_MESSAGES)\n            .map(node => ({\n                role: node.classList.contains('msg-user') ? 'user' : 'assistant',\n                text: String(node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 900)\n            }))\n            .filter(item => item.text);\n        if (state.visitorName) {\n            items.unshift({ role: 'user', text: 'Как ко мне обращаться: ' + state.visitorName });\n        }\n        return items;"""
if old_recent not in text:
    raise SystemExit('recentConversation block not found')
text = text.replace(old_recent, new_recent, 1)

old_start = """    async function startHandoff() {\n        if (isOperatorMode()) return;\n        ensureIdentity();\n        state.displayName = '';\n        ensureOperatorDisplayName();"""
new_start = """    async function startHandoff() {\n        if (isOperatorMode()) return;\n        state.visitorName = await askVisitorName();\n        ensureIdentity();\n        state.displayName = '';\n        ensureOperatorDisplayName();\n        saveState();"""
if old_start not in text:
    raise SystemExit('startHandoff block not found')
text = text.replace(old_start, new_start, 1)

old_fail = """            state.status = 'idle';\n            state.displayName = '';\n            state.lastActivityAt = 0;"""
new_fail = """            state.status = 'idle';\n            state.displayName = '';\n            state.visitorName = '';\n            state.lastActivityAt = 0;"""
if old_fail not in text:
    raise SystemExit('failure reset block not found')
text = text.replace(old_fail, new_fail, 1)

old_end = """        state.status = 'idle';\n        state.lastEventId = 0;\n        state.displayName = '';\n        state.lastActivityAt = 0;"""
new_end = """        state.status = 'idle';\n        state.lastEventId = 0;\n        state.displayName = '';\n        state.visitorName = '';\n        state.lastActivityAt = 0;"""
if old_end not in text:
    raise SystemExit('end reset block not found')
text = text.replace(old_end, new_end, 1)

# Reset visitor name when remote operator closes too.
old_closed = """                state.status = 'idle';\n                state.displayName = '';\n                state.lastActivityAt = 0;"""
new_closed = """                state.status = 'idle';\n                state.displayName = '';\n                state.visitorName = '';\n                state.lastActivityAt = 0;"""
if old_closed not in text:
    raise SystemExit('closed reset block not found')
text = text.replace(old_closed, new_closed, 1)

path.write_text(text, encoding='utf-8')
print('Patched owl-operator.js')
