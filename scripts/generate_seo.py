"""Generate static head metadata and sitemap. Run with --check in CI."""
import argparse
import difflib
import html
import json
from pathlib import Path
import re
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://ranepa-dpo39.ru/'
BRAND = 'Западный филиал РАНХиГС'
PAGES = {
    'index.html': ('Доп образование и профпереподготовка в Калининграде | Западный филиал РАНХиГС', 'Программы профессиональной переподготовки и повышения квалификации в Калининграде. Очно и дистанционно. Госзакупки, управление и другие направления ДПО РАНХиГС.'),
    'programs.html': ('Программы ДПО в Калининграде | РАНХиГС', 'Каталог программ повышения квалификации и профессиональной переподготовки Западного филиала РАНХиГС: направления, сроки, формат и стоимость обучения.'),
    'students.html': ('Слушателям: обучение и документы | РАНХиГС Калининград', 'Информация для слушателей Центра дополнительного образования Западного филиала РАНХиГС: учебные материалы, расписание, документы и оплата обучения.'),
    'schedule.html': ('Расписание занятий ДПО | РАНХиГС Калининград', 'Расписание занятий по программам дополнительного образования Западного филиала РАНХиГС. Поиск по программе, дате, преподавателю и месту проведения.'),
    'news.html': ('Новости дополнительного образования | Западный филиал РАНХиГС', 'Новости и анонсы Центра дополнительного образования Западного филиала РАНХиГС: программы обучения, мероприятия и образовательные события в Калининграде.'),
    'contacts.html': ('Контакты Центра ДПО | РАНХиГС Калининград', 'Контакты Центра дополнительного образования Западного филиала РАНХиГС: телефоны, электронная почта и сотрудники. Калининград, ул. Артиллерийская, 62.'),
    'faq.html': ('Вопросы об обучении на программах ДПО | РАНХиГС', 'Ответы на вопросы об обучении в Западном филиале РАНХиГС: документы для поступления, формат занятий, совмещение с работой и доступ к учебным материалам.'),
    'ai-lecture.html': ('Практика ИИ — интерактивная AR-лаборатория | РАНХиГС', 'Интерактивная лаборатория «Практика ИИ»: знакомство с терминами искусственного интеллекта, задания и управление жестами в образовательном проекте РАНХиГС.'),
    'pay/index.html': ('Оплата обучения — Западный филиал РАНХиГС', 'Оплата обучения в Западном филиале РАНХиГС через Альфа-Банк, СберБанк Онлайн, Т-Банк и ВТБ. Банковские ссылки и реквизиты для оплаты по договору.'),
    'program.html': ('Программа ДПО | Западный филиал РАНХиГС', 'Подробная информация о программе дополнительного профессионального образования Западного филиала РАНХиГС: содержание, формат, сроки и условия обучения.'),
}
PRIVATE = {'vk-auth.html', 'media-player.html'}
START, END = '<!-- SEO: generated -->', '<!-- /SEO -->'


def canonical(path):
    return BASE + ('' if path == 'index.html' else 'pay/' if path == 'pay/index.html' else path)


def metadata(path, title, description):
    values = {'description': description, 'robots': 'index, follow, max-image-preview:large',
              'twitter:card': 'summary', 'twitter:title': title,
              'twitter:description': description, 'twitter:image': BASE + 'img/logo.png',
              'twitter:image:alt': BRAND}
    props = {'og:type': 'website', 'og:locale': 'ru_RU', 'og:site_name': BRAND,
             'og:title': title, 'og:description': description,
             'og:image': BASE + 'img/logo.png', 'og:image:alt': BRAND}
    # Query-specific canonical is set once by program-seo.js; no conflicting generic URL.
    if path != 'program.html':
        props['og:url'] = canonical(path)
    lines = [START]
    for attribute, items in [('name', values), ('property', props)]:
        lines.extend(f'<meta {attribute}="{key}" content="{html.escape(value, quote=True)}">' for key, value in items.items())
    if path != 'program.html':
        lines.append(f'<link rel="canonical" href="{canonical(path)}">')
    else:
        lines.append('<script src="./program-seo.js"></script>')
    lines.append(END)
    return '\n'.join(lines)


def render(path):
    source = (ROOT / path).read_text(encoding='utf-8')
    source = re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\n?', '', source, flags=re.S)
    head, rest = source.split('</head>', 1)
    # Keep verification tokens, CSP, referrer and viewport exactly as configured.
    head = re.sub(r'<meta\b[^>]*(?:name|property)=["\'](?:description|robots|og:[^"\']+|twitter:[^"\']+)["\'][^>]*>\s*', '', head, flags=re.I)
    head = re.sub(r'<link\b[^>]*rel=["\']canonical["\'][^>]*>\s*', '', head, flags=re.I)
    if path in PRIVATE:
        block = START + '\n<meta name="robots" content="noindex, nofollow">\n' + END
    else:
        title, description = PAGES[path]
        head = re.sub(r'(<title\b[^>]*>).*?(</title>)', lambda m: m[1] + html.escape(title) + m[2], head, flags=re.S)
        block = metadata(path, title, description)
    # Shared theme assets are allowed before metadata. Ignore them when locating
    # the first page-local script/style so --check reproduces the committed head.
    masked = re.sub(r'<link\\s+rel=["\\']stylesheet["\\']\\s+href=["\\'][^"\\']*theme\\.css[^"\\']*["\\'][^>]*>', lambda m: ' ' * len(m.group(0)), head, flags=re.I)
    masked = re.sub(r'<script\\s+src=["\\'][^"\\']*theme\\.js[^"\\']*["\\'][^>]*></script>', lambda m: ' ' * len(m.group(0)), masked, flags=re.I)
    match = re.search(r'<(?:script|style)\\b', masked)
    offset = match.start() if match else len(head)
    return head[:offset] + block + '\n' + head[offset:] + '</head>' + rest


def sitemap():
    visibility = json.loads((ROOT / 'site-settings.json').read_text(encoding='utf-8')).get('settings', {}).get('visibility', {})
    urls = [canonical(p) for p in PAGES if p != 'program.html']
    programs = {}
    for filename in ('portal-data.json', 'program-data.json'):
        for program in json.loads((ROOT / filename).read_text(encoding='utf-8')).get('programs', []):
            if program.get('id') and str(program.get('active', True)).upper() != 'FALSE':
                programs[str(program['id'])] = program
    if visibility.get('programs') is not False:
        urls += [BASE + 'program.html?id=' + quote(pid, safe='') for pid in sorted(programs)
                 if visibility.get('program:' + pid) is not False]
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(
        '  <url><loc>' + html.escape(url) + '</loc></url>\n' for url in urls) + '</urlset>\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs = {p: render(p) for p in [*PAGES, *sorted(PRIVATE)]}
    outputs['sitemap.xml'] = sitemap()
    stale = []
    for path, content in outputs.items():
        target = ROOT / path
        if target.read_text(encoding='utf-8') != content:
            stale.append(path)
            if not args.check:
                write_preserving_newlines(target, content)
    if args.check and stale:
        raise SystemExit('Run python scripts/generate_seo.py: ' + ', '.join(stale))
    print('SEO metadata and sitemap verified.' if args.check else 'Updated: ' + ', '.join(stale))


def write_preserving_newlines(target, content):
    # Some legacy pages mix CRLF and LF. Keep untouched lines byte-for-byte.
    original = target.read_bytes().decode('utf-8').splitlines(keepends=True)
    updated = content.splitlines(keepends=True)
    matcher = difflib.SequenceMatcher(None, [s.rstrip('\r\n') for s in original],
                                    [s.rstrip('\r\n') for s in updated], autojunk=False)
    chunks = []
    for kind, a, b, c, d in matcher.get_opcodes():
        chunks.extend(original[a:b] if kind == 'equal' else updated[c:d])
    target.write_bytes(''.join(chunks).encode('utf-8'))


if __name__ == '__main__':
    main()
