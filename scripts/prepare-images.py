"""Generate responsive WebP assets without changing the original photographs.

Run with Python and Pillow after adding project or article images.
"""
import json
import posixpath
import re
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
cache = {}


def prepare(source):
    source = Path(source)
    key = source.as_posix()
    if key in cache:
        return cache[key]
    with Image.open(ROOT / source) as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
        width, height = image.size
        variants = []
        for target in sorted({min(width, size) for size in (640, 1280, 1920)}):
            output = Path('responsive') / source.parent / f'{source.stem}-{target}.webp'
            destination = ROOT / output
            destination.parent.mkdir(parents=True, exist_ok=True)
            if not destination.exists() or destination.stat().st_mtime < (ROOT / source).stat().st_mtime:
                resized = image.resize((target, round(height * target / width)), Image.Resampling.LANCZOS)
                resized.save(destination, 'WEBP', quality=82, method=6)
            variants.append({'src': output.as_posix(), 'width': target})
    result = {'width': width, 'height': height, 'src': variants[-1]['src'], 'variants': variants}
    cache[key] = result
    return result


def main():
    data_path = ROOT / 'projects.json'
    data = json.loads(data_path.read_text(encoding='utf-8'))
    for project in data['projects']:
        project['media'] = {}
        for name in dict.fromkeys([project['cover']] + project['images']):
            source = Path('projects') / project['id'] / name
            webp = source.with_suffix('.webp')
            project['media'][name] = prepare(webp if (ROOT / webp).exists() else source)
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=4) + '\n', encoding='utf-8', newline='\n')

    for page in list(ROOT.glob('*.html')) + list((ROOT / 'guide').glob('*.html')):
        base = page.parent.relative_to(ROOT).as_posix()
        def update(match):
            tag = match.group()
            attr = re.search(r'\bsrc="([^"]+)"', tag)
            if not attr or attr[1].startswith(('http', 'data:')):
                return tag
            relative = attr[1].split('?')[0]
            source = Path(posixpath.normpath(posixpath.join(base, relative)))
            if source.suffix.lower() not in ('.jpg', '.jpeg', '.webp') or not (ROOT / source).is_file():
                return tag
            info = prepare(source)
            for name in ('srcset', 'sizes', 'width', 'height'):
                tag = re.sub(rf'\s{name}="[^"]*"', '', tag)
            srcset = ', '.join(f'{posixpath.relpath(v["src"], base)} {v["width"]}w' for v in info['variants'])
            sizes = '100vw' if 'fetchpriority="high"' in tag else '(max-width: 800px) calc(100vw - 40px), 960px'
            attrs = f' width="{info["width"]}" height="{info["height"]}" srcset="{srcset}" sizes="{sizes}"'
            if 'decoding=' not in tag:
                attrs += ' decoding="async"'
            return tag[:-1] + attrs + '>'
        html = page.read_text(encoding='utf-8')
        html = re.sub(r'<img\b[^>]*>', update, html)
        page.write_text(html, encoding='utf-8', newline='\n')
    print(f'Prepared {len(cache)} source images; originals preserved.')


if __name__ == '__main__':
    main()
