"""Build the static AIoT guide into dist/. Run: python aiot-guide/build.py

Reads content/<id>.json (chapters), content/questions-base.json + questions-<id>.json (practice bank),
content/site.json (home, exam facts, formulas) and copies static/ as is. No runtime dependencies.
"""
from pathlib import Path
from html import escape as e
import json, re, shutil

HERE = Path(__file__).resolve().parent
CONTENT, STATIC, DIST = HERE / 'content', HERE / 'static', HERE / 'dist'
SITE = json.loads((CONTENT / 'site.json').read_text(encoding='utf-8'))
ALLOWED = {'p', 'b', 'em', 'br', 'ul', 'ol', 'li', 'code', 'sub', 'sup', 'strong', 'small'}
SVG_TAGS = {'svg', 'g', 'defs', 'marker', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan', 'title'}
BANNED = re.compile(r'考古|抱佛腳|衝刺|出題最多|最常考|考題九成|你有資料背景|你熟')
problems = []


def clean(html, where):
    def tag(m):
        if m[2].lower() in ALLOWED and not m[3].strip():
            return m[0]
        # Cross-references to another chapter are the one kind of link allowed in content.
        if m[2].lower() == 'a' and (m[1] or re.fullmatch(r' href="s[12]-\d\d\.html(#[\w-]+)?"', m[3])):
            return m[0]
        problems.append(f'stripped {m[0][:40]} in {where}')
        return ''
    return re.sub(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>', tag, html or '')


def check_svg(svg, where):
    svg = svg.strip()
    body = re.sub(r'url\(#[\w-]+\)', '', svg)
    bad = [x for x in ('style=', 'fill="', 'stroke="', '<script') if x in body]
    tags = {x.lower() for x in re.findall(r'<([a-zA-Z]+)', svg)} - SVG_TAGS
    if bad or tags or not svg.startswith('<svg viewBox="0 0 600 '):
        problems.append(f'svg in {where}: {bad} {tags}')
    return svg


def load_chapters():
    chapters = {}
    for ch in SITE['chapters']:
        data = json.loads((CONTENT / f"{ch['id']}.json").read_text(encoding='utf-8'))
        raw = json.dumps(data, ensure_ascii=False)
        for m in BANNED.finditer(raw):
            problems.append(f"banned wording {m[0]!r} in {ch['id']}: {raw[max(0, m.start() - 20):m.end() + 20]}")
        data.update(ch)
        chapters[ch['id']] = data
    return chapters


CH = load_chapters()
ORDER = [c['id'] for c in SITE['chapters']]
SUBJ = SITE['subjects']


def minutes(c):
    # Everything shown by default counts; collapsed details, predict answers and videos do not.
    parts = [c.get('case', {}).get('body', ''), c.get('prereq', ''), c.get('bridge', '')] + c['learn'] + c['keypoints'] + c['pitfalls']
    for s in c['sections']:
        parts += [s.get('body', ''), s.get('after', ''), s.get('caption', ''), s.get('predict', {}).get('q', '')]
        if s.get('table'):
            parts += s['table']['head'] + [x for r in s['table']['rows'] for x in r]
    parts += [x['q'] + ''.join(x['o']) for x in c['examples']] + [x['q'] for x in c['check']] + [x['def'] for x in c['terms']]
    chars = len(re.sub(r'\s', '', re.sub(r'<[^>]+>', '', ''.join(parts))))
    labs = sum(1 for s in c['sections'] if s.get('lab'))
    return 5 * round((chars / 300 + labs * 3 + len(c['check']) * 0.5) / 5)


# ---------- page frame ----------
NAV = [('index.html', '首頁'), ('practice.html', '練習'), ('glossary.html', '名詞'), ('reference.html', '速查'), ('exam.html', '考試資訊'), ('about.html', '關於')]
LOGO = '<svg viewBox="0 0 26 26" aria-hidden="true"><path class="tr" d="M3 20h7l6-14h7"/><circle class="nd" cx="3.5" cy="20" r="3"/><circle class="nd" cx="22.5" cy="6" r="3"/></svg>'
READER = '''<div id="reader" role="region" aria-label="朗讀播放器"><div class="in">
<div class="ctl"><button type="button" id="rdPrev" aria-label="上一段">⏮</button><button type="button" id="rdPlay" class="main" aria-label="暫停或繼續">⏸</button><button type="button" id="rdNext" aria-label="下一段">⏭</button><button type="button" id="rdStop" aria-label="停止朗讀">⏹</button></div>
<div class="now" aria-live="polite"><b id="rdPos"></b><span id="rdText"></span></div>
<label>語速 <select id="rdRate"><option value="0.8">0.8×</option><option value="1" selected>1×</option><option value="1.2">1.2×</option><option value="1.4">1.4×</option><option value="1.7">1.7×</option></select></label>
<label>聲音 <select id="rdVoice"></select></label>
</div></div>'''


def page(name, title, main, desc, scripts='', current=None, jsonld=None):
    nav = ''.join('<a href="%s"%s>%s</a>' % (h, ' aria-current="page"' if (current or name) == h else '', t) for h, t in NAV)
    full = f'{title}｜{SITE["name"]}' if name != 'index.html' else SITE['name']
    abs_url = SITE['url'] + ('' if name == 'index.html' else name)
    ld = '<script type="application/ld+json">' + json.dumps(jsonld or {'@context': 'https://schema.org', '@type': 'WebPage', 'name': full, 'url': abs_url, 'inLanguage': 'zh-Hant', 'isPartOf': {'@type': 'WebSite', 'name': SITE['name'], 'url': SITE['url']}}, ensure_ascii=False).replace('</', '<\\/') + '</script>'
    html = f'''<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(full)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{abs_url}">
<meta name="theme-color" content="#12344D">
<meta property="og:type" content="{'website' if name == 'index.html' else 'article'}">
<meta property="og:site_name" content="{e(SITE["name"])}">
<meta property="og:locale" content="zh_TW">
<meta property="og:title" content="{e(full)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{abs_url}">
<meta property="og:image" content="{SITE["url"]}assets/og-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
{ld}
<script>try{{var t=localStorage.getItem('aiot-guide-theme');if(t)document.documentElement.dataset.theme=t}}catch(e){{}}</script>
<link rel="stylesheet" href="assets/site.css">
</head>
<body>
<header class="top"><div class="wrap"><a class="brand" href="index.html">{LOGO}{e(SITE["name"])}</a><nav class="nav" aria-label="主要導覽">{nav}</nav><button type="button" class="theme" id="themeBtn">深淺色</button></div></header>
{main}
<footer class="site"><div class="wrap">{e(SITE["footer"])}<br>內容更新於 {SITE["updated"]}・程式碼 MIT、內容 CC BY 4.0・<a href="{SITE["repo"]}" rel="noopener">原始碼與問題回報</a></div></footer>
{READER}
{scripts}<script src="assets/site.js"></script>
</body>
</html>
'''
    (DIST / name).write_text(html, encoding='utf-8')


def sidebar(cur=None):
    out = ''
    for s, sub in SUBJ.items():
        out += f'<div class="grp">{e(sub["short"])}・建議順序</div>'
        for cid in SITE['reading']:
            c = CH[cid]
            if c['subject'] != s:
                continue
            attr = ' aria-current="page"' if cid == cur else ''
            out += f'<a href="{cid}.html"{attr}><span class="c">{e(c["code"])}</span><span>{e(c["title"])}</span></a>'
    return out


def table(t, where):
    head = ''.join(f'<th>{clean(x, where)}</th>' for x in t['head'])
    rows = ''.join('<tr>' + ''.join(f'<{"th" if j == 0 else "td"}>{clean(x, where)}</{"th" if j == 0 else "td"}>' for j, x in enumerate(r)) + '</tr>' for r in t['rows'])
    return f'<div class="tblwrap" tabindex="0" role="region" aria-label="表格，可左右捲動"><table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>'


SAY = '<button type="button" class="say" data-say-card>朗讀</button>'


def locator(cid):
    stops = SITE['home']['stops']
    if cid in SITE['home']['across']:
        return '<div class="loc noread"><span class="acrossnote">這章貫穿整條資料路徑</span></div>'
    items = ''
    for st in stops:
        on = cid in st['chapters']
        items += f'<li{" class=on aria-current=step" if on else ""}><a href="{st["chapters"][0]}.html">{e(st["name"])}</a></li>'
    return f'<ol class="loc noread" aria-label="資料路徑上的位置">{items}</ol>'


def chapter(cid):
    c = CH[cid]
    READ = SITE['reading']
    i = READ.index(cid)
    w = cid
    sections = ''
    for k, s in enumerate(c['sections']):
        where = f'{w} section {k + 1}'
        sections += f'<section id="{e(s["id"])}" data-read class="{"first" if k == 0 else ""}"><h2><span class="txt">{e(s["h"])}</span>{SAY}</h2>'
        if s.get('predict'):
            pr = s['predict']
            sections += f'<details class="pr" data-say="{e("先想一想。" + pr["q"] + "。答案：" + pr["a"])}"><summary><span class="prk">先想一想</span>{e(pr["q"])}</summary><p>{e(pr["a"])}</p></details>'
        sections += clean(s.get('body', ''), where)
        if s.get('lab'):
            sections += f'<div class="lab" data-lab="{e(s["lab"])}"><noscript><p>這個互動實驗需要 JavaScript。</p></noscript></div>'
        if s.get('after'):
            sections += clean(s['after'], where)
        if s.get('svg'):
            cap = f'<figcaption>{e(s["caption"])}</figcaption>' if s.get('caption') else ''
            sections += f'<figure class="dg" title="點圖放大">{check_svg(s["svg"], where)}{cap}</figure>'
        if s.get('table'):
            sections += table(s['table'], where)
        if s.get('video'):
            v = SITE['videos'][s['video']]
            sections += f'<details class="vid"><summary>看動畫：{e(v["title"])}（{v["seconds"]} 秒）</summary><video controls preload="none" playsinline src="media/{s["video"]}.mp4" poster="media/{s["video"]}-poster.jpg"></video>'
            if v.get('transcript'):
                sections += f'<p class="small muted noread">{e(v["transcript"])}</p>'
            sections += '</details>'
        if s.get('more'):
            sections += f'<details class="more"><summary>{e(s["more"]["label"])}</summary>{clean(s["more"]["body"], where)}</details>'
        sections += '</section>'
    toc = ''.join(f'<a href="#{e(s["id"])}">{e(s["h"])}</a>' for s in c['sections'])
    tail = '<a href="#keypoints">重點整理</a><a href="#examples">例題</a><a href="#check">自我檢查</a><a href="#terms">本章名詞</a>' + ('<a href="#sources">來源</a>' if c.get('sources') else '')
    official = '' if c['official'] == c['title'] else f'<span class="noread">官方項目：{e(c["official"])}</span>'
    keys = ''.join(f'<li>{clean(x, w)}</li>' for x in c['keypoints'])
    pits = ''.join(f'<li>{clean(x, w)}</li>' for x in c['pitfalls'])
    exs = ''
    for x in c['examples']:
        say = x['q'] + '。' + '。'.join(f'選項{"ABCD"[k]}，{o}' for k, o in enumerate(x['o'])) + f'。答案是{"ABCD"[x["a"]]}。' + re.sub(r'<[^>]+>', '', x['think'])
        opts = ''.join(f'<button type="button" class="opt"><span class="k">{"ABCD"[k]}</span><span>{e(o)}</span></button>' for k, o in enumerate(x['o']))
        exs += f'<div class="ex" data-a="{x["a"]}" data-say="{e(say)}"><div class="stem">{e(x["q"])}</div><div class="opts">{opts}</div><div class="why" hidden><b>答案：{"ABCD"[x["a"]]}</b><p>{clean(x["think"], w)}</p></div></div>'
    chk = ''.join(f'<details class="fl" data-say="{e(q["q"] + "。答：" + q["a"])}"><summary>{e(q["q"])}</summary><p>{e(q["a"])}</p></details>' for q in c['check'])
    terms = ''.join('<p><b>%s</b>%s：%s</p>' % (e(t['term']), ' <span class="muted small">' + e(t['en']) + '</span>' if t.get('en') else '', e(t['def'])) for t in c['terms'])
    prev_ = CH[READ[i - 1]] if i else None
    next_ = CH[READ[i + 1]] if i + 1 < len(READ) else None
    pager = f'<a class="px" href="practice.html#{cid}"><small>讀完這章</small>練習這一章（{QCOUNT.get(cid, 0)} 題）</a>'
    if prev_:
        pager += f'<a href="{prev_["id"]}.html"><small>上一章</small>{e(prev_["code"] + " " + prev_["title"])}</a>'
    if next_:
        # Say so when the next chapter is not simply the next official number.
        k = ORDER.index(cid)
        label = '下一章' if k + 1 < len(ORDER) and ORDER[k + 1] == next_['id'] else '下一章（建議順序）'
        pager += f'<a class="nx" href="{next_["id"]}.html"><small>{label}</small>{e(next_["code"] + " " + next_["title"])}</a>'
    else:
        pager += '<a class="nx" href="practice.html"><small>全部讀完了</small>接著做兩科混合練習，熟了再開限時作答</a>'
    learn = ''.join(f'<li>{e(x)}</li>' for x in c['learn'])
    pre = clean(c.get('prereq', ''), w)
    prereq = f'<div class="prereq" data-read><b class="lb">先備知識</b>{pre if pre.lstrip().startswith("<p>") else "<p>" + pre + "</p>"}</div>' if pre else ''
    bridge = f'<p class="bridge"><b>有 AI 或軟體背景的話：</b>{clean(c["bridge"], w)}</p>' if c.get('bridge') else ''
    guide = ''
    if c.get('guidePages'):
        guide = f'<p class="small muted noread">對應官方科一學習指引第 {c["guidePages"][0]}–{c["guidePages"][1]} 頁（PDF 頁碼），可到<a href="{SITE["links"]["resources"]}" rel="noopener" target="_blank">官方學習資源</a>下載。</p>'
    labs = f'<script src="assets/labs-core.js" defer></script>\n<script src="assets/labs/{cid}.js" defer></script>\n' if any(x.get('lab') for x in c['sections']) else ''
    case = f'<div class="case" data-read><b>{e(c["case"]["title"])}</b><p>{e(c["case"]["body"])}</p></div>' if c.get('case') else ''
    sources = ''
    if c.get('sources'):
        links = ''.join(f'<li><a href="{e(u)}" rel="noopener" target="_blank">{e(t)}</a></li>' for t, u in c['sources'])
        sources = f'<section id="sources"><h2>來源與延伸閱讀</h2><ul class="srcs">{links}</ul>{guide}</section>'
        guide = ''
    main = f'''<main class="wrap doc {c["subject"]}">
<aside class="side" aria-label="章節">{sidebar(cid)}</aside>
<article>
<details class="sidemenu"><summary>全部章節</summary><div class="side">{sidebar(cid)}</div></details>
<details class="sidemenu tocmenu noread"><summary>本章目錄</summary><div class="in">{toc}{tail}</div></details>
<header class="chead">{locator(cid)}<div class="meta"><span class="tag {c["subject"]}">{e(SUBJ[c["subject"]]["short"])} {e(c["code"])}</span>{official}<span class="noread">約 {minutes(c)} 分鐘</span></div>
<h1>{e(c["title"])}</h1><p class="sub">{e(c["subtitle"])}</p><p>{e(c["summary"])}</p>
<div class="row noread"><button type="button" class="btn ghost" data-read-all>朗讀整章</button><a class="btn ghost" href="practice.html#{cid}">練習這一章</a></div></header>
{case}<div class="learn"><h2>讀完這章，你能</h2><ul>{learn}</ul></div>
{prereq}{bridge}
{sections}
<section id="keypoints" data-read><div class="keys"><h2>重點整理</h2><ul>{keys}</ul></div><div class="pits"><h2>容易混淆的地方</h2><ul>{pits}</ul></div></section>
<section id="examples" data-read><h2><span class="txt">例題：怎麼想</span>{SAY}</h2><p class="small muted noread">先選一個答案，再看解題思路。朗讀時會連答案一起唸。</p>{exs}</section>
<section id="check" data-read><h2><span class="txt">自我檢查</span>{SAY}</h2><div class="flgrid">{chk}</div></section>
<section id="terms" data-read><h2><span class="txt">本章名詞</span>{SAY}</h2><div class="termgrid">{terms}</div>{guide}</section>
{sources}
<nav class="pager noprint" aria-label="章節切換">{pager}</nav>
</article>
<nav class="toc" aria-label="本章目錄"><b>本章目錄</b>{toc}{tail}</nav>
</main>'''
    page(f'{cid}.html', f'{c["code"]} {c["title"]}', main, c['summary'], labs, current='index.html', jsonld={
        '@context': 'https://schema.org', '@type': 'LearningResource', 'name': f'{c["code"]} {c["title"]}', 'headline': c['title'], 'description': c['summary'],
        'url': SITE['url'] + cid + '.html', 'inLanguage': 'zh-Hant', 'learningResourceType': '教學文章與互動實驗', 'teaches': c['learn'], 'dateModified': SITE['updated'],
        'educationalAlignment': {'@type': 'AlignmentObject', 'alignmentType': 'educationalSubject', 'targetName': SUBJ[c['subject']]['name']},
        'author': {'@type': 'Person', 'name': SITE['author']}, 'license': 'https://creativecommons.org/licenses/by/4.0/',
        'isPartOf': {'@type': 'WebSite', 'name': SITE['name'], 'url': SITE['url']}})


def home():
    h = SITE['home']
    stops = ''
    for st in h['stops']:
        links = ''.join(f'<a href="{x}.html">{e(CH[x]["code"] + " " + CH[x]["title"])}</a>' for x in st['chapters'])
        stops += f'<div class="stop"><b>{e(st["name"])}</b><span class="what">{e(st["what"])}</span>{links}</div>'
    across = ''.join(f'<a href="{x}.html">{e(CH[x]["code"] + " " + CH[x]["title"])}</a>' for x in h['across'])
    mins = [minutes(CH[x]) for x in ORDER]
    start = f'共 {len(ORDER)} 章，每章約 {min(mins)}–{max(mins)} 分鐘，可分次讀。' + h['start']
    subs = ''
    for s, sub in SUBJ.items():
        body = ''
        for tp in sub['topics']:
            items = ''
            for cid in tp['chapters']:
                c = CH[cid]
                items += f'<li><a href="{cid}.html"><span class="tag">{e(c["code"])}</span><span><span class="t">{e(c["title"])}</span><span class="d">{e(c["subtitle"])}</span></span></a></li>'
            body += f'<div class="topic">{e(tp["name"])}</div><ul class="chlist">{items}</ul>'
        subs += f'<div class="subject {s}"><h2>{e(sub["name"])}</h2><p class="desc">{e(sub["desc"])}</p>{body}</div>'
    tools = ''.join(f'<a class="tool" href="{t["href"]}"><b>{e(t["name"])}</b><span>{e(t["desc"])}</span></a>' for t in h['tools'])
    main = f'''<main>
<div class="wrap hero"><h1>{e(h["title"])}</h1><p class="lead">{e(h["lead"])}</p>
<div class="row" style="margin-top:16px"><a class="btn" href="s1-21.html">{e(h["startBtn"])}</a></div><p class="small muted" style="max-width:44em">{e(start)}</p>
<div class="trace">{stops}</div>
<div class="across"><b>{e(h["acrossLabel"])}</b>{across}</div></div>
<div class="band" id="chapters"><div class="wrap"><div class="subjects">{subs}</div></div></div>
<div class="band"><div class="wrap"><div class="tools">{tools}</div></div></div>
</main>'''
    page('index.html', SITE['name'], main, SITE['description'], jsonld={'@context': 'https://schema.org', '@type': 'WebSite', 'name': SITE['name'], 'url': SITE['url'], 'description': SITE['description'], 'inLanguage': 'zh-Hant', 'author': {'@type': 'Person', 'name': SITE['author']}, 'license': 'https://creativecommons.org/licenses/by/4.0/'})


def load_questions():
    bank = json.loads((CONTENT / 'questions-base.json').read_text(encoding='utf-8'))
    dropped = edited = 0
    out = []
    edits, drops = {}, set()
    for f in CONTENT.glob('questions-s*.json'):
        d = json.loads(f.read_text(encoding='utf-8'))
        drops |= set(d.get('drop', []))
        edits.update(d.get('edits', {}))
    ids = {q['id'] for q in bank}
    for x in sorted((drops | set(edits)) - ids):
        problems.append(f'edit or drop for unknown question id {x}')
    for q in bank:
        if q['id'] in drops:
            dropped += 1
            continue
        if q['id'] in edits:
            q = {**q, **edits[q['id']]}
            edited += 1
        assert len(q['o']) == 4 and q['a'] in range(4), q['id']
        if q['lesson'] not in CH or CH[q['lesson']]['subject'] != q['subject']:
            problems.append(f"question {q['id']}: lesson {q['lesson']} does not match subject {q['subject']}")
        if q.get('sec') and q['lesson'] in CH and q['sec'] not in {s['id'] for s in CH[q['lesson']]['sections']}:
            problems.append(f"question {q['id']}: section {q['sec']} not in {q['lesson']}")
        out.append({k: q[k] for k in ('id', 'subject', 'lesson', 'q', 'o', 'a', 'e', 'sec') if k in q})
    print(f'questions: {len(out)} kept, {edited} edited, {dropped} dropped')
    for q in out:
        for m in BANNED.finditer(q['q'] + q['e']):
            problems.append(f"banned wording {m[0]!r} in question {q['id']}")
    return out


QUESTIONS = load_questions()
QCOUNT = {cid: sum(1 for q in QUESTIONS if q['lesson'] == cid) for cid in ORDER}


def practice():
    out = QUESTIONS
    chs = [{'id': c, 'subject': CH[c]['subject'], 'code': CH[c]['code'], 'title': CH[c]['title'], 'secs': {s['id']: s['h'] for s in CH[c]['sections']}} for c in ORDER]
    js = 'window.AIOT_QUESTIONS=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\nwindow.AIOT_CHAPTERS=' + json.dumps(chs, ensure_ascii=False, separators=(',', ':')) + ';\n'
    (DIST / 'assets' / 'questions.js').write_text(js.replace('</', '<\\/'), encoding='utf-8')
    n = {s: sum(1 for q in out if q['subject'] == s) for s in SUBJ}
    opts = ''.join(f'<option value="{s}">{e(SUBJ[s]["name"])}（{n[s]} 題）</option>' for s in SUBJ)
    main = f'''<main class="wrap page"><h1>練習</h1><p class="intro">全部 {len(out)} 題都是本站自編的練習題，不是官方試題。剛開始建議讀完一章後按「練習這一章」，或在下面選那一章；熟了再混合兩科或限時作答。限時作答以每題 90 秒計，是本站依每科 75 分鐘估算的節奏，不是官方規定。</p>
<div class="panel noprint" id="quizSetup"><div class="formgrid">
<label for="fSubject">科目<select id="fSubject"><option value="">兩科</option>{opts}</select></label>
<label for="fChapter">章節<select id="fChapter"></select></label>
<label for="fCount">題數<select id="fCount"><option value="10">10 題</option><option value="25">25 題</option><option value="50">50 題</option><option value="0">全部</option></select></label>
<label for="fMode">方式<select id="fMode"><option value="learn">每題立刻看解析</option><option value="exam">限時作答（每題 90 秒）</option></select></label>
<button type="button" class="btn" id="qStart">開始</button></div><p class="small muted" id="fAvail"></p><button type="button" class="btn ghost" id="qWrong" hidden></button></div>
<div id="quizApp"></div></main>'''
    page('practice.html', '練習', main, f'{len(out)} 題 AIoT 情境練習題，涵蓋兩個科目 15 個主題，每題附解析。', '<script src="assets/questions.js"></script>\n')


ALIASES = {'dos': 'dos／ddos', 'ddos': 'dos／ddos', 'osi 七層': 'osi', 'osi 模型': 'osi'}


def glossary():
    terms = {}
    for cid in ORDER:
        for t in CH[cid]['terms']:
            key = t['term'].strip().lower()
            key = ALIASES.get(key, key)
            cur = terms.setdefault(key, {**t, 'where': []})
            if len(t['def']) > len(cur['def']):
                cur['def'] = t['def']
            if cid not in cur['where']:
                cur['where'].append(cid)
    items = sorted(terms.values(), key=lambda t: t['term'].lower())
    html = ''
    for t in items:
        where = ''.join(f'<a href="{c}.html">{e(CH[c]["code"] + " " + CH[c]["title"])}</a>' for c in t['where'])
        subjects = ' '.join(sorted({CH[c]['subject'] for c in t['where']}))
        en = ' <span class="en">' + e(t['en']) + '</span>' if t.get('en') else ''
        html += f'<div class="gitem" data-s="{subjects}"><b>{e(t["term"])}</b>{en}<p>{e(t["def"])}</p><div class="where">{where}</div></div>'
    opts = ''.join(f'<option value="{s}">{e(SUBJ[s]["short"])}</option>' for s in SUBJ)
    main = f'''<main class="wrap page"><h1>名詞</h1><p class="intro">讀到不懂的縮寫就來這裡查。每個名詞都連回講解它的章節。</p>
<div class="panel"><div class="formgrid"><label for="gq">搜尋<input id="gq" type="search" placeholder="例如 MQTT、遲滯、OEE"></label><label for="gs">科目<select id="gs"><option value="">兩科</option>{opts}</select></label><span class="small muted" id="gcount"></span></div></div>
<div class="glist">{html}</div></main>'''
    page('glossary.html', '名詞', main, f'{len(items)} 個物聯網與 AIoT 名詞的白話解釋。')
    print('glossary terms:', len(items))


def reference():
    fm = ''.join('<div><b>%s</b><code>%s</code>%s%s%s</div>' % (
        e(f['name']), e(f['expr']),
        '<p class="small muted" style="margin:4px 0 0">' + e(f['note']) + '</p>' if f.get('note') else '',
        '<p class="small" style="margin:4px 0 0">例：' + e(f['eg']) + '</p>' if f.get('eg') else '',
        '<p class="small" style="margin:4px 0 0"><a href="%s.html">%s %s</a></p>' % (f['chapter'], e(CH[f['chapter']]['code']), e(CH[f['chapter']]['title'])) if f.get('chapter') else '') for f in SITE['formulas'])
    blocks = ''
    for s, sub in SUBJ.items():
        cards = ''
        for cid in ORDER:
            c = CH[cid]
            if c['subject'] != s:
                continue
            pits = ''.join(f'<li>{clean(x, cid)}</li>' for x in c['pitfalls'])
            cards += f'<div class="panel {s}"><h3><a href="{cid}.html"><span class="tag">{e(c["code"])}</span> {e(c["title"])}</a></h3><ul>' + ''.join(f'<li>{clean(x, cid)}</li>' for x in c['keypoints']) + f'</ul><details class="more"><summary>容易混淆的地方（{len(c["pitfalls"])} 條）</summary><ul>{pits}</ul></details></div>'
        blocks += f'<h2 style="margin-top:28px">{e(sub["name"])}</h2><div class="refgrid">{cards}</div>'
    main = f'''<main class="wrap page"><h1>速查</h1><p class="intro">讀過一輪之後回來複習用：先是會用到的公式，再來是每章的重點，展開可看容易混淆的地方。</p>
<h2>公式</h2><div class="formula">{fm}</div>{blocks}</main>'''
    page('reference.html', '速查', main, 'AIoT 常用公式、15 個主題的重點整理與容易混淆的地方。')


def exam():
    x = SITE['exam']
    rows = ''.join(f'<tr><th>{e(a)}</th><td>{e(b)}</td></tr>' for a, b in x['facts'])
    scope = ''
    for s, sub in SUBJ.items():
        for tp in sub['topics']:
            for cid in tp['chapters']:
                c = CH[cid]
                alias = '' if c['title'] == c['official'] else f'（本站：{e(c["title"])}）'
                scope += f'<tr><td>{e(sub["short"])}</td><td>{e(tp["name"])}</td><td><a href="{cid}.html">{e(c["code"])} {e(c["official"])}</a>{alias}</td></tr>'
    links = ''.join(f'<li><a href="{u}" rel="noopener" target="_blank">{e(t)}</a></li>' for t, u in x['links'])
    tips = ''.join(f'<li>{e(t)}</li>' for t in x['tips'])
    main = f'''<main class="wrap page"><h1>考試資訊</h1><p class="intro">{e(x["intro"])}</p>
<div class="panel"><div class="tblwrap" tabindex="0" role="region" aria-label="表格，可左右捲動"><table><tbody>{rows}</tbody></table></div><p class="small muted">{e(x["checked"])}</p></div>
<h2 style="margin-top:28px">考試範圍與本站章節</h2><p>章節編號照官方簡章：科一用「.」（如 2.1），科二用「-」（如 2-1）。點評鑑內容就能讀那一章。</p><div class="tblwrap" tabindex="0" role="region" aria-label="表格，可左右捲動"><table><thead><tr><th>科目</th><th>評鑑主題</th><th>評鑑內容</th></tr></thead><tbody>{scope}</tbody></table></div>
<h2 style="margin-top:28px">作答提醒</h2><ul>{tips}</ul>
<h2 style="margin-top:28px">官方資源</h2><ul>{links}</ul></main>'''
    page('exam.html', '考試資訊', main, 'iPAS AIoT 應用工程師初級兩個學科的考試形式、及格標準與範圍對照。')


def about():
    a = SITE['about']
    body = ''.join(f'<h2 style="margin-top:24px">{e(h)}</h2>' + ''.join(f'<p>{e(p)}</p>' for p in ps) for h, ps in a)
    page('about.html', '關於', f'<main class="wrap page" style="max-width:860px">{"<h1>關於</h1>"}{body}</main>', '這個網站的內容來源、使用範圍與聲明。')


def not_found():
    main = '<main class="wrap page"><h1>找不到這一頁</h1><p class="intro">網址可能打錯，或頁面已經搬走。</p><p><a class="btn" href="index.html">回首頁</a></p></main>'
    page('404.html', '找不到頁面', main, '找不到這一頁。')
    f = DIST / '404.html'
    # GitHub Pages serves this at any depth, so links must be absolute.
    base = SITE['url']
    f.write_text(f.read_text(encoding='utf-8').replace('<head>', f'<head>\n<base href="{base}">\n<meta name="robots" content="noindex">', 1).replace(f'<link rel="canonical" href="{base}404.html">\n', ''), encoding='utf-8')


def discovery():
    pages = [f.name for f in sorted(DIST.glob('*.html')) if f.name != '404.html']
    urls = ''.join(f'<url><loc>{SITE["url"]}{"" if n == "index.html" else n}</loc><lastmod>{SITE["updated"]}</lastmod></url>\n' for n in pages)
    (DIST / 'sitemap.xml').write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n', encoding='utf-8')
    (DIST / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {SITE["url"]}sitemap.xml\n', encoding='utf-8')
    (DIST / '.nojekyll').write_text('', encoding='utf-8')
    lines = [f'# {SITE["name"]}', '', f'> {SITE["description"]}', '', '本站為個人製作的非官方網站，與 iPAS 及其主辦、承辦、執行單位無關。內容採 CC BY 4.0。', '']
    for k, sub in SUBJ.items():
        lines.append(f'## {sub["name"]}')
        for cid in ORDER:
            if CH[cid]['subject'] == k:
                lines.append(f'- [{CH[cid]["code"]} {CH[cid]["title"]}]({SITE["url"]}{cid}.html)：{CH[cid]["summary"]}')
        lines.append('')
    lines += ['## 工具', f'- [練習題]({SITE["url"]}practice.html)', f'- [名詞查詢]({SITE["url"]}glossary.html)', f'- [公式、重點與容易混淆處速查]({SITE["url"]}reference.html)', f'- [考試資訊]({SITE["url"]}exam.html)', '']
    (DIST / 'llms.txt').write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    DIST.mkdir(exist_ok=True)
    for old in DIST.iterdir():
        shutil.rmtree(old) if old.is_dir() else old.unlink()
    shutil.copytree(STATIC, DIST, dirs_exist_ok=True)
    home()
    for cid in ORDER:
        chapter(cid)
    practice(); glossary(); reference(); exam(); about(); not_found(); discovery()
    # every marker id must be unique across the site, and every internal link must resolve
    ids = re.findall(r'<marker id="([^"]+)"', ''.join(s.get('svg', '') for c in CH.values() for s in c['sections']))
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        problems.append(f'duplicate marker ids within site: {sorted(dup)[:5]}')
    for f in DIST.glob('*.html'):
        for href in re.findall(r'href="([^"#:]+\.html)', f.read_text(encoding='utf-8')):
            if not (DIST / href).exists() and f.name != '404.html':
                problems.append(f'broken link {href} in {f.name}')
    print(f'built {len(list(DIST.glob("*.html")))} pages')
    print('PROBLEMS:' if problems else 'no problems')
    for p in problems:
        print(' ', p)
