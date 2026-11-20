"""Generate search metadata while preserving all visible course headings."""
from html import escape, unescape
from html.parser import HTMLParser
import json
import re

LEVELS = ['Seconde SVT', 'Première spécialité SVT', 'Terminale spécialité SVT',
          'Première enseignement scientifique', 'Terminale enseignement scientifique']
ROOT = 'https://nic0del.github.io/canopee-svt'

class MetadataParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_h1 = False
        self.heading = []
    def handle_starttag(self, tag, attrs):
        if tag == 'h1':
            self.in_h1 = True
    def handle_endtag(self, tag):
        if tag == 'h1':
            self.in_h1 = False
    def handle_data(self, text):
        if self.in_h1:
            self.heading.append(text)

def update_search_metadata(site):
    source = (site/'catalogue.js').read_text(encoding='utf-8')
    chapters, _ = json.JSONDecoder().raw_decode(source[source.index('['):])
    pages = {}
    for chapter in chapters:
        level = LEVELS[chapter['level']]
        pages[chapter['overview']] = (level, True)
        for resource in chapter['resources']:
            if resource['url'].startswith('/documents/'):
                pages[resource['url']] = (level, False)
    for path in (site/'documents').glob('*/index.html'):
        url = '/' + path.parent.relative_to(site).as_posix() + '/'
        if url not in pages:
            text = path.read_text(encoding='utf-8')
            parent = next((chapter for chapter in chapters if chapter['overview'] in text), None)
            if parent:
                pages[url] = (LEVELS[parent['level']], False)
    for url, (level, chapter) in pages.items():
        path = site/url.strip('/')/'index.html'
        text = path.read_text(encoding='utf-8')
        parser = MetadataParser()
        parser.feed(text)
        heading = ' '.join(' '.join(parser.heading).split())
        if not heading:
            raise ValueError(f'Titre visible introuvable pour {url}')
        title = f'{heading} | {level} | Canopée'
        description = (
            f'{heading} — {level}. Cours, activités, autoévaluation et QCM progressifs en cinq niveaux sur Canopée.'
            if chapter else f'{heading} — {level}. Ressource pédagogique du chapitre, à consulter en ligne sur Canopée.'
        )
        text = re.sub(r'<title>.*?</title>', lambda _: '<title>'+escape(title)+'</title>',
                      text, count=1, flags=re.DOTALL|re.IGNORECASE)
        text = re.sub(r"""<meta\b(?=[^>]*\bname=["']description["'])[^>]*>""", '', text, flags=re.IGNORECASE)
        text = re.sub(r"""<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>""", '', text, flags=re.IGNORECASE)
        tags = f'<meta name="description" content="{escape(description, quote=True)}">'
        tags += f'<link rel="canonical" href="{escape(ROOT+url, quote=True)}">'
        text = text.replace('</head>', tags+'</head>', 1)
        path.write_text(text, encoding='utf-8')
