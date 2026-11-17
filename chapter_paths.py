"""Add the guided chapter route and printable credit to the Pages output."""
from html import escape
import json
from pathlib import Path
import re

ARTICLE_START = '<article class="lesson-content">'
CSS_LINK = '<link rel="stylesheet" href="/chapter-path.css">'
PUBLIC_ROOT = 'https://nic0del.github.io/canopee-svt'
GROUP = re.compile(r'(<section class="overview-group" id="([01])"><h2>)([^<]+)(</h2>)')


def chapter_route(text, exercise):
    objective, question, correction = map(escape, exercise)
    groups = {match[2] for match in GROUP.finditer(text)}
    steps = []
    if '1' in groups:
        steps.append('<li><a href="#1">Comprendre le cours</a></li>')
    if '0' in groups:
        steps.append('<li><a href="#0">S’entraîner</a></li>')
    steps.append('<li><a href="#auto-evaluation">Vérifier ses acquis</a></li>')
    introduction = (
        '<section class="chapter-objectives" aria-labelledby="objectifs">'
        '<h2 id="objectifs">À la fin de ce chapitre, je sais…</h2>'
        f'<ul><li>{objective}</li></ul></section>'
        '<nav class="chapter-route" aria-label="Parcours du chapitre">'
        f'<ol>{"".join(steps)}</ol></nav>'
    )
    assessment = f'''
<section class="overview-group" id="auto-evaluation">
  <h2>Vérifier ses acquis</h2>
  <p>Réponds à la question, puis compare ton raisonnement avec la correction.</p>
  <section class="answer-block">
    <label for="response-bilan-1">{question}</label>
    <textarea id="response-bilan-1" data-answer="bilan-1" rows="4"></textarea>
    <div class="answer-actions">
      <span class="save-status" role="status"></span>
      <button class="clear-answer" type="button">Effacer</button>
    </div>
    <details class="model-answer">
      <summary>Afficher un élément de réponse</summary>
      <p>{correction}</p>
    </details>
  </section>
</section>
'''
    if ARTICLE_START not in text or '</article>' not in text or '/lesson.js' not in text:
        raise ValueError('Structure de chapitre incompatible')
    text = GROUP.sub(
        lambda match: match[1] + ('Comprendre le cours' if match[2] == '1' else 'S’entraîner') + match[4],
        text,
    )
    return text.replace(ARTICLE_START, ARTICLE_START + introduction, 1).replace(
        '</article>', assessment + '</article>', 1
    )


def update_lessons(site):
    exercises = json.loads(Path(__file__).with_name('chapter_exercises.json').read_text(encoding='utf-8'))
    catalogue = (site / 'catalogue.js').read_text(encoding='utf-8')
    chapters, _ = json.JSONDecoder().raw_decode(catalogue[catalogue.index('['):])
    urls = {chapter['overview'] for chapter in chapters if chapter.get('overview')}
    if exercises.keys() - urls:
        raise ValueError('Une autoévaluation ne correspond plus à un chapitre du catalogue')
    for chapter in chapters:
        urls.update(resource['url'] for resource in chapter['resources'] if resource['url'].startswith('/documents/'))

    for url in sorted(urls):
        file = site / url.strip('/') / 'index.html'
        text = file.read_text(encoding='utf-8')
        if url in exercises and 'id="auto-evaluation"' not in text:
            text = chapter_route(text, exercises[url])
        if CSS_LINK not in text:
            text = text.replace('</head>', CSS_LINK + '</head>', 1)
        if 'class="canopee-credit"' not in text:
            credit = (
                '<aside class="canopee-credit" aria-label="Crédit et source">'
                '<strong>Mise en ligne et adaptation pédagogique par Nicolas Delage · Canopée</strong><br>'
                'En cas de réutilisation, citez Canopée et '
                f'<a href="{escape(PUBLIC_ROOT + url, quote=True)}">le lien vers cette page</a>. '
                'Respectez les crédits des documents et illustrations cités.</aside>'
            )
            if '</main>' in text:
                text = text.replace('</main>', credit + '</main>', 1)
            else:
                text = text.replace('</body>', credit + '</body>', 1)
        file.write_text(text, encoding='utf-8')
