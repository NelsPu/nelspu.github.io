"""Check local links, responsive assets, article metadata and consultation fields."""
import json
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
pages = [*ROOT.glob('*.html'), *(ROOT / 'guide').glob('*.html')]
errors = []


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path, self.ids, self.links = path, [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        for attr in ('src', 'href'):
            if attrs.get(attr):
                self.links.append(attrs[attr])
        for item in attrs.get('srcset', '').split(','):
            if item.strip():
                self.links.append(item.strip().split()[0])
        if tag == 'img' and not all(attrs.get(key) for key in ('alt', 'width', 'height')):
            errors.append(f'{self.path.name}: image missing alt or dimensions')


parsed = {}
for path in pages:
    page = Page(path)
    source = path.read_text(encoding='utf-8')
    page.feed(source)
    parsed[path.resolve()] = page
    if len(page.ids) != len(set(page.ids)):
        errors.append(f'{path}: duplicate IDs')
    for data in re.findall(r'<script type="application/ld\+json">(.*?)</script>', source, re.S):
        json.loads(data)
    if not re.search(r'styles\.css\?v=12\.0', source):
        errors.append(f'{path}: stale stylesheet revision')

for path, page in parsed.items():
    for link in page.links:
        url = urlsplit(link)
        if url.scheme or url.netloc:
            continue
        target = (ROOT / unquote(url.path).lstrip('/') if url.path.startswith('/') else path.parent / unquote(url.path)).resolve()
        if not url.path:
            target = path
        if target.is_dir():
            target /= 'index.html'
        if not target.exists():
            errors.append(f'{path.name}: missing {link}')
        elif url.fragment and target in parsed and url.fragment not in parsed[target].ids:
            errors.append(f'{path.name}: missing anchor {link}')

projects = json.loads((ROOT / 'projects.json').read_text(encoding='utf-8'))['projects']
details = Counter(project['story']['detail'] for project in projects)
assert all(count == 1 for count in details.values()), 'Repeated project detail copy'
for project in projects:
    for name in set([project['cover']] + project['images']):
        media = project['media'][name]
        assert media['width'] > 0 and media['height'] > 0
        for variant in media['variants']:
            path = ROOT / variant['src']
            with Image.open(path) as image:
                assert image.width == variant['width'], str(path)
                assert abs(image.height / image.width - media['height'] / media['width']) < .003, str(path)

home = (ROOT / 'index.html').read_text(encoding='utf-8')
fields = re.search(r'<textarea[^>]*id="consultation-template"[^>]*>(.*?)</textarea>', home, re.S)[1].splitlines()
assert fields == ['案場地區：', '房屋類型：', '室內坪數：', '預計交屋時間：', '預算方向：']
assert not errors, '\n'.join(errors)
print(f'PASS: {len(pages)} pages, {len(projects)} projects, local links, image sizes, JSON-LD and five consultation fields.')
