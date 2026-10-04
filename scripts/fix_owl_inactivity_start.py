from pathlib import Path

path = Path('owl-operator.js')
text = path.read_text(encoding='utf-8')

old = """        ensureIdentity();\n        state.displayName = '';\n        ensureOperatorDisplayName();\n        touchOperatorActivity();\n\n        if (typeof window.addBotMsg === 'function') {\n"""
new = """        ensureIdentity();\n        state.displayName = '';\n        ensureOperatorDisplayName();\n\n        if (typeof window.addBotMsg === 'function') {\n"""
if old not in text:
    raise SystemExit('start prelude anchor not found')
text = text.replace(old, new, 1)

old = """        state.status = 'waiting';\n        saveState();\n        refreshOptions();\n"""
new = """        state.status = 'waiting';\n        touchOperatorActivity();\n        refreshOptions();\n"""
if old not in text:
    raise SystemExit('waiting state anchor not found')
text = text.replace(old, new, 1)

old = """        } catch (error) {\n            state.status = 'idle';\n            saveState();\n            refreshOptions();\n"""
new = """        } catch (error) {\n            state.status = 'idle';\n            state.displayName = '';\n            state.lastActivityAt = 0;\n            clearInactivityTimer();\n            saveState();\n            refreshOptions();\n"""
if old not in text:
    raise SystemExit('start catch anchor not found')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
