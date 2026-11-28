"""tools/guide/course_build.py: the course pages in guide/course/, from tools/guide/course_data.py (called by build.py).

  guide/course/index.html       the two semesters at a glance, and how the course runs
  guide/course/<sem>.html       the schedule of one semester, week by week
  guide/course/<sem>-<nn>.html  one class day: date, reading, slides, labs, what is due, and the lesson plan
                                (tools/guide/course/<sem>-<nn>.html, an HTML fragment of <section id> blocks, when written)
The site is public: lesson plans and topics only, never quiz or test questions or answer keys.
"""
import html, os, re
from course_data import SEMESTERS

TYPE = {'L': ('Lecture', 'lec'), 'A': ('Activity', 'act'), 'Q': ('Quiz', 'quiz'), 'T': ('Exam', 'test'), 'R': ('Review', 'rev'), 'P': ('Project', 'proj')}
OPENSTAX = 'https://openstax.org/details/books/astronomy-2e'
WD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

def build(here, out_root, by_lab, ready, aliases, head, fix_links):
    src_dir, out = os.path.join(here, 'course'), os.path.join(out_root, 'course')
    os.makedirs(out, exist_ok=True)
    esc = html.escape
    page_head = lambda t, d: head(t, d).replace('href="guide.css"', 'href="../guide.css"')
    band = lambda extra='': ('<div class="band"><div class="in"><a href="../../">Planetarium</a><span class="crumb">›</span><a href="../index.html">Lab guides</a>'
                             f'<span class="crumb">›</span><a href="index.html">Course</a>{extra}<span class="sp"></span></div></div>')

    def lab_link(lid):
        if lid.startswith('new:'): return f'<span class="tbd">{esc(lid[4:].replace("-", " "))} lab (to be built)</span>'
        t = esc(by_lab[lid]['title']) if lid in by_lab else esc(lid)
        g = f' · <a href="../{lid}.html">guide</a>' if lid in ready or lid in aliases else ''
        return f'<a href="../../?lab={lid}" target="_blank" rel="noopener">{t}</a>{g}'

    def readings(rs): return ', '.join(f'§{esc(r)}' if r[0].isdigit() else esc(r) for r in rs)

    written = 0
    for s in SEMESTERS:
        rows, hw, ko = [], 0, 0
        n = len(s['days'])
        for i, ((typ, title, rd, decks, labs, note), d) in enumerate(zip(s['days'], s['dates'])):
            due = []
            if typ not in 'TP' and i > 0: ko += 1; due.append(f'Kickoff {ko}')
            if d.weekday() == 4 and i >= 5 and typ != 'T' and hw < 11: hw += 1; due.append(f'HW {hw}')
            rows.append(dict(i=i + 1, typ=typ, title=title, rd=rd, decks=decks, labs=labs, note=note, d=d, due=due, wk=(d - s['dates'][0]).days // 7 + 1))
        s['rows'] = rows

        # the schedule page
        o = page_head(f'{s["name"]} · PHYS 115', s['blurb']) + band(f'<span class="crumb">›</span><span>{esc(s["term"])}</span>')
        o += f'<div class="wrap one"><header class="lab"><div class="eyebrow">PHYS 115 · {esc(s["term"])} · MWF, 50 minutes</div><h1>{esc(s["name"])}</h1><p class="lede">{esc(s["blurb"])}</p>'
        o += '<p class="legend">' + ''.join(f'<span class="tag {c}">{t}</span>' for t, c in TYPE.values()) + '</p></header><main><table class="sched"><thead><tr><th>Date</th><th>Class</th><th>Reading</th><th>Due</th></tr></thead><tbody>'
        wk = 0
        for r in rows:
            for b, why in s['breaks'].items():
                if rows[r['i'] - 2]['d'].isoformat() < b < r['d'].isoformat() if r['i'] > 1 else False:
                    o += f'<tr class="brk"><td colspan="4">{esc(why)}</td></tr>'
            if r['wk'] != wk: wk = r['wk']; o += f'<tr class="wk"><td colspan="4">Week {wk}</td></tr>'
            t, c = TYPE[r['typ']]
            plan = os.path.exists(os.path.join(src_dir, f'{s["id"]}-{r["i"]:02d}.html'))
            labs = '' if not r['labs'] else '<div class="sub">' + ' · '.join(lab_link(l) for l in r['labs']) + '</div>'
            note = f'<div class="sub snote">{esc(r["note"])}</div>' if r['note'] else ''
            o += (f'<tr class="{c}"><td class="dt">{r["d"].strftime("%a %b")} {r["d"].day}</td>'
                  f'<td><span class="tag {c}">{t}</span> <a href="{s["id"]}-{r["i"]:02d}.html">{esc(r["title"])}</a>{"" if plan else " <span class=sketch>outline</span>"}{labs}{note}</td>'
                  f'<td class="rd">{readings(r["rd"])}</td><td class="due">{"<br>".join(r["due"])}</td></tr>')
        o += f'<tr class="brk"><td colspan="4">{esc(s["final"])}</td></tr></tbody></table></main></div></body></html>\n'
        open(os.path.join(out, s['id'] + '.html'), 'w', encoding='utf8').write(o)

        # a page per class day
        for r in rows:
            k = f'{s["id"]}-{r["i"]:02d}'
            t, c = TYPE[r['typ']]
            frag = os.path.join(src_dir, k + '.html')
            body = open(frag, encoding='utf8').read() if os.path.exists(frag) else ''
            if body: written += 1
            body = fix_links(body).replace('href="../?lab=', 'href="../../?lab=')
            toc = re.findall(r'<section id="([^"]+)">\s*<h2>(.*?)</h2>', body)
            facts = [('Reading', (f'<a href="{OPENSTAX}" target="_blank" rel="noopener">OpenStax Astronomy 2e</a> ' + readings(r['rd'])) if r['rd'] else '—'),
                     ('Slides', ', '.join(esc(x) + '.key' for x in r['decks']) or '—'),
                     ('Planetarium', '<br>'.join(lab_link(l) for l in r['labs']) or '—'),
                     ('Due', ', '.join(r['due']) or '—')]
            nav = (f'<a href="{s["id"]}-{r["i"] - 1:02d}.html">‹ previous class</a>' if r['i'] > 1 else '<span></span>') + \
                  f'<a href="{s["id"]}.html">{esc(s["term"])} schedule</a>' + \
                  (f'<a href="{s["id"]}-{r["i"] + 1:02d}.html">next class ›</a>' if r['i'] < n else '<span></span>')
            o = page_head(f'{r["title"]} · PHYS 115 class {r["i"]}', r['note'] or s['blurb']) + band(f'<span class="crumb">›</span><a href="{s["id"]}.html">{esc(s["term"])}</a>')
            o += '<div class="wrap">'
            o += (f'<header class="lab"><div class="eyebrow">{esc(s["term"])} · week {r["wk"]} · class {r["i"]} of {n} · {WD[r["d"].weekday()]}, {r["d"].strftime("%B")} {r["d"].day}</div>'
                  f'<h1>{esc(r["title"])}</h1><p><span class="tag {c}">{t}</span>{(" " + esc(r["note"])) if r["note"] else ""}</p>'
                  '<dl class="facts">' + ''.join(f'<dt>{a}</dt><dd>{b}</dd>' for a, b in facts) + '</dl></header>')
            o += '<nav class="toc" aria-label="On this page"><b>On this page</b><ol>' + ''.join(f'<li><a href="#{i}">{tt}</a></li>' for i, tt in toc) + '</ol></nav>' if toc else '<nav class="toc"></nav>'
            o += '<main>' + (body or '<section id="plan"><h2>Lesson plan</h2><p class="sketch-note">Not written yet: the schedule information above is all there is so far.</p></section>')
            o += f'<p class="daynav">{nav}</p></main></div></body></html>\n'
            open(os.path.join(out, k + '.html'), 'w', encoding='utf8').write(o)

    # the overview
    o = page_head('PHYS 115 · Encounters with the Cosmos', 'A two-semester introductory astronomy course built around the planetarium labs.') + band()
    o += ('<div class="wrap one"><header class="lab"><div class="eyebrow">Earlham College · PHYS 115</div><h1>Encounters with the Cosmos</h1>'
          '<p class="lede">Introductory astronomy in two semesters. The first goes from the sky overhead to the size of the solar system; '
          'the second from what starlight tells us to the expanding universe. The thread through both is the cosmic distance ladder, '
          'and the activities are labs in the planetarium, where every measurement is made by looking at the sky.</p></header><main>')
    o += '<div class="semcards">'
    for s in SEMESTERS:
        nl = sum(1 for r in s['rows'] if r['typ'] == 'A'); np_ = sum(1 for r in s['rows'] if os.path.exists(os.path.join(src_dir, f'{s["id"]}-{r["i"]:02d}.html')))
        o += (f'<a class="semcard" href="{s["id"]}.html"><span class="eyebrow">{esc(s["term"])} · {len(s["rows"])} classes</span><b>{esc(s["name"])}</b>'
              f'<span>{esc(s["blurb"])}</span><small>{nl} planetarium activities · {np_} lesson plans written</small></a>')
    o += '</div>'
    o += ('<section id="how"><h2>How a week runs</h2><ul>'
          '<li><b>Three 50-minute classes</b> (Monday, Wednesday, Friday), each opening with a <b>kickoff</b>: a short collaborative Moodle quiz on the reading or the last class.</li>'
          '<li><b>Activities are planetarium labs</b>, done in class: each has a lab guide with background, diagrams and the steps in detail.</li>'
          '<li><b>Homework</b> is due on Fridays (Moodle, two tries per problem).</li>'
          '<li><b>Quizzes</b> take 20 to 30 minutes at the start of a class; a midterm, and a final in exam week. In semester 2, a group project on an underrepresented astronomer or culture.</li>'
          '</ul><p class="sketch-note">Weights and counts follow the Fall 2025 syllabus for now (10 of 11 HWs, 30 of 33 kickoffs, activities, 3 quizzes, midterm, final, project); '
          'with a planetarium lab most weeks there are more activities than the 6 of Fall 2025, so their weighting needs a decision.</p></section>')
    o += '</main></div></body></html>\n'
    open(os.path.join(out, 'index.html'), 'w', encoding='utf8').write(o)
    return sum(len(s['rows']) for s in SEMESTERS), written
