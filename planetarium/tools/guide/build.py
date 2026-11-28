"""tools/guide/build.py: builds the lab guides, planetarium/guide/.

  python3 tools/guide/build.py

- Each tools/guide/src/<lab id>.html (a header comment with title and lede, then <section id> blocks each starting with an <h2>)
  becomes guide/<lab id>.html, with the page frame, the table of contents and the figures filled in (<!--FIG:name--> takes
  tools/guide/<name>.svg.html, made by the figure scripts such as eclipse_figs.py).
- guide/index.html lists every lab of js/labs/presets.js by group, linking those that have a guide.
- js/labs/guides.js tells the planetarium which labs have one (the lab card then links to it).
- A link to another lab's guide that does not exist yet is pointed at that lab in the planetarium instead.
- ALIASES: labs covered by another lab's guide (a section of it). guide/<alias>.html is a small page that sends the reader
  there; the index links straight to the section, and the lab card links to the alias page.
"""
import html, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))          # planetarium/
SRC, OUT = os.path.join(HERE, 'src'), os.path.join(ROOT, 'guide')

presets = open(os.path.join(ROOT, 'js', 'labs', 'presets.js'), encoding='utf8').read()
groups = re.search(r"export const GROUPS = \[([^\]]*)\]", presets).group(1)
GROUPS = re.findall(r"'([^']*)'", groups)
LABS = [dict(id=m[0], group=m[1], title=m[2].replace('\\’', '’'), who=m[3]) for m in
        re.findall(r"\{ id: '([^']+)', group: '([^']+)', title: '((?:[^'\\]|\\.)*)', who: '((?:[^'\\]|\\.)*)'", presets)]
BY = {l['id']: l for l in LABS}
ready = sorted(f[:-5] for f in os.listdir(SRC) if f.endswith('.html'))
# lab id -> (the guide that covers it, the section id there)
ALIASES = {'proxima-parallax': ('parallax', 'proxima'), 'barnard-parallax': ('parallax', 'barnard')}
ALIASES = {k: v for k, v in ALIASES.items() if v[0] in ready and k not in ready}

FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' \
        '<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600&family=Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@600&display=swap" rel="stylesheet">'
def head(title, desc):
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>{html.escape(title)}</title><meta name="description" content="{html.escape(desc)}">{FONTS}<link rel="stylesheet" href="guide.css"></head><body>')
BAND = '<div class="band"><div class="in"><a href="../">Planetarium</a><span class="crumb">›</span><a href="index.html">Lab guides</a><span class="sp"></span></div></div>'

def fix_links(body):
    def sub(m):
        lab = m.group(1)
        if lab in ready or lab in ALIASES or lab == 'index': return m.group(0)
        return f'href="../?lab={lab}" target="_blank" rel="noopener"' if lab in BY else m.group(0)
    return re.sub(r'href="([a-z0-9-]+)\.html"', sub, body)

def page(lab_id):
    src = open(os.path.join(SRC, lab_id + '.html'), encoding='utf8').read()
    meta = dict(re.findall(r'^(\w+):\s*(.+)$', re.search(r'<!--(.*?)-->', src, re.S).group(1), re.M))
    body = src[src.index('-->') + 3:]
    body = re.sub(r'<!--FIG:([\w-]+)-->', lambda m: open(os.path.join(HERE, m.group(1) + '.svg.html'), encoding='utf8').read(), body)
    body = fix_links(body)
    toc = re.findall(r'<section id="([^"]+)">\s*<h2>(.*?)</h2>', body)
    lab = BY[lab_id]
    title = meta.get('title', lab['title'])
    out = head(f'{title} · Lab guide', meta.get('lede', '')) + BAND
    out += '<div class="wrap">'
    out += (f'<header class="lab"><div class="eyebrow">{html.escape(lab["group"])} · lab guide</div><h1>{title}</h1>'
            f'<p class="who">{lab["who"]}</p><p><a class="go" href="../?lab={lab_id}" target="_blank" rel="noopener">Open this lab in the planetarium ↗</a></p>'
            f'<p class="lede">{meta.get("lede", "")}</p></header>')
    out += '<nav class="toc" aria-label="On this page"><b>On this page</b><ol>' + ''.join(f'<li><a href="#{i}">{t}</a></li>' for i, t in toc) + '</ol></nav>'
    out += '<main>' + body + '</main></div></body></html>\n'
    open(os.path.join(OUT, lab_id + '.html'), 'w', encoding='utf8').write(out)

def index():
    out = head('Lab guides · Planetarium', 'Background, diagrams and step-by-step instructions for the planetarium labs.') + BAND
    out += ('<div class="wrap"><header class="lab"><div class="eyebrow">Planetarium</div><h1>Lab guides</h1>'
            '<p class="lede">Each lab in the planetarium sets the date, the place and the view and gives a short prompt. These guides add the background: '
            'what is being measured and why, diagrams from other points of view than the Earth’s, the steps in detail, and what can go wrong. '
            'They never give the answers.</p></header><div class="groups">')
    for g in GROUPS:
        labs = [l for l in LABS if l['group'] == g]
        if not labs: continue
        out += f'<div class="group"><h2>{html.escape(g)}</h2><ul>'
        for l in labs:
            if l['id'] in ready: out += f'<li><a href="{l["id"]}.html">{l["title"]}<small>guide</small></a></li>'
            elif l['id'] in ALIASES: g, sec = ALIASES[l['id']]; out += f'<li><a href="{g}.html#{sec}">{l["title"]}<small>part of the {g.replace("-", " ")} guide</small></a></li>'
            else: out += f'<li><span>{l["title"]}<small>coming</small></span></li>'
        out += '</ul></div>'
    out += '</div></div></body></html>\n'
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf8').write(out)

os.makedirs(OUT, exist_ok=True)
for r in ready:
    if r not in BY: raise SystemExit(f'guide source {r}.html: no lab with that id')
    page(r)
index()
for a, (g, sec) in ALIASES.items():
    to = f'{g}.html#{sec}'
    open(os.path.join(OUT, a + '.html'), 'w', encoding='utf8').write(
        f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url={to}">'
        f'<title>{html.escape(BY[a]["title"])} · Lab guide</title><link rel="canonical" href="{to}"></head>'
        f'<body><p>This lab is covered in <a href="{to}">the {html.escape(BY[g]["title"])} guide</a>.</p></body></html>\n')
open(os.path.join(ROOT, 'js', 'labs', 'guides.js'), 'w', encoding='utf8').write(
    '// labs/guides.js: GENERATED by tools/guide/build.py. The labs that have a guide page in guide/ (the lab card links to it).\n'
    f'export const GUIDES = new Set({sorted(ready + list(ALIASES))!r});\n'.replace("'", "'"))
print(f'{len(ready)} guide(s): {", ".join(ready)}' + (f'; covered by another guide: {", ".join(ALIASES)}' if ALIASES else '') + f'; index of {len(LABS)} labs in {len(GROUPS)} groups')
