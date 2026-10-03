from pathlib import Path
import runpy

path = Path('scripts/owl_polish_v2.py')
text = path.read_text(encoding='utf-8')
old = "re.subn(pattern, replacement, text, count=1, flags=flags)"
new = "re.subn(pattern, lambda _m: replacement, text, count=1, flags=flags)"
if old not in text and new not in text:
    raise SystemExit('sub_once implementation not found')
if old in text:
    text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')
runpy.run_path(str(path), run_name='__main__')
