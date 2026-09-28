import json
from html.parser import HTMLParser
from pathlib import Path
import sys
import unittest
import xml.etree.ElementTree as ET
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from generate_seo import PAGES, PRIVATE, BASE


class Head(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.tags = []
        self.feed(source.split('</head>')[0])

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def find(self, tag, **attrs):
        return [a for t, a in self.tags if t == tag and all(a.get(k) == v for k, v in attrs.items())]


class SeoTest(unittest.TestCase):
    def test_all_html_pages_covered(self):
        self.assertEqual({str(p.relative_to(ROOT)).replace('\\', '/') for p in ROOT.rglob('*.html')}, set(PAGES) | PRIVATE)

    def test_unique_complete_metadata(self):
        descriptions = set()
        for path in PAGES:
            with self.subTest(path=path):
                head = Head((ROOT / path).read_text(encoding='utf-8'))
                self.assertEqual(len(head.find('title')), 1)
                for name in ('description', 'robots', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt'):
                    tags = head.find('meta', name=name)
                    self.assertEqual(len(tags), 1, name)
                    self.assertTrue(tags[0]['content'])
                for prop in ('og:title', 'og:description', 'og:type', 'og:locale', 'og:site_name', 'og:image', 'og:image:alt'):
                    self.assertEqual(len(head.find('meta', property=prop)), 1, prop)
                description = head.find('meta', name='description')[0]['content']
                self.assertNotIn(description, descriptions)
                descriptions.add(description)
                links = head.find('link', rel='canonical')
                self.assertEqual(len(links), 0 if path == 'program.html' else 1)
                if links:
                    self.assertEqual(links[0]['href'], head.find('meta', property='og:url')[0]['content'])

    def test_service_pages_noindex(self):
        for path in PRIVATE:
            head = Head((ROOT / path).read_text(encoding='utf-8'))
            self.assertEqual(head.find('meta', name='robots'), [{'name': 'robots', 'content': 'noindex, nofollow'}])

    def test_sitemap_and_crawlability(self):
        urls = [n.text for n in ET.parse(ROOT / 'sitemap.xml').iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
        self.assertEqual(len(urls), len(set(urls)))
        self.assertNotIn('Disallow: /*?*', (ROOT / 'robots.txt').read_text())
        visibility = json.loads((ROOT / 'site-settings.json').read_text(encoding='utf-8'))['settings']['visibility']
        for url in urls:
            self.assertTrue(url.startswith(BASE))
            parts = urlsplit(url)
            self.assertFalse(parts.fragment)
            path = parts.path.lstrip('/') or 'index.html'
            self.assertNotIn(path, PRIVATE)
            self.assertTrue((ROOT / (path + 'index.html' if path.endswith('/') else path)).exists())
            if path == 'program.html':
                pid = parse_qs(parts.query)['id'][0]
                self.assertIsNot(visibility.get('program:' + pid), False)
                self.assertIsNot(visibility.get('programs'), False)
        self.assertIn(BASE + 'contacts.html', urls)
        self.assertIn(BASE + 'pay/', urls)
        self.assertIn(BASE + 'program.html?id=c14', urls)

    def test_payment_integrity_workflow(self):
        # Execute the repository's existing payment integrity check verbatim.
        workflow = (ROOT / '.github/workflows/payment-page-integrity.yml').read_text()
        code = workflow.split('run: |\n', 1)[1]
        code = '\n'.join(line[10:] if line.startswith('          ') else line for line in code.splitlines())
        exec(compile(code, 'payment-page-integrity.yml', 'exec'), {})


if __name__ == '__main__':
    unittest.main()
