"""Build the static AIoT guide into dist/. Run: python aiot-guide/build.py

Reads content/<id>.json (chapters), content/questions-base.json + questions-<id>.json (practice bank),
content/site.json (home, exam facts, formulas) and copies static/ as is. No runtime dependencies.
"""
from pathlib import Path
from html import escape as e
import hashlib, json, re, shutil

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


def video(key, title=True):
    v = SITE['videos'][key]
    name = f'：{e(v["title"])}' if title else ''
    out = f'<details class="vid"><summary>看動畫{name}（{v["seconds"]} 秒）</summary><video controls preload="none" playsinline src="media/{key}.mp4" data-poster="media/{key}-poster.jpg"></video>'
    if v.get('transcript'):
        out += f'<p class="small muted noread">{e(v["transcript"])}</p>'
    return out + '</details>'


PHONE_BYTES = {}  # page -> bytes the phone pictures add to it


def steps_used(svg):
    return {int(x) for v in re.findall(r'data-s="([^"]+)"', svg) for x in v.split()}


def fig_page(where):
    # where is "s1-22 section 6" in a chapter, "reference s1-21" on the review page: the chapter id either way.
    return where.split()[1] if where.startswith('reference') else where.split()[0]


def check_phone(svg, svgm, where, steps, loop):
    """A phone picture (svgm) redraws the same figure upright, 360 wide. See SPEC.md 圖（SVG）."""
    if len(svgm.encode('utf-8')) > 1.1 * len(svg.encode('utf-8')):
        problems.append(f'phone svg in {where}: {len(svgm.encode("utf-8"))} bytes, more than 1.1 x the desktop picture ({len(svg.encode("utf-8"))})')
    if steps and steps_used(svgm) != steps_used(svg):
        problems.append(f'phone svg in {where}: data-s steps {sorted(steps_used(svgm))} differ from the desktop picture {sorted(steps_used(svg))}')
    if loop:
        if 'class="lp-move"' not in svgm or 'class="lp-still"' not in svgm:
            problems.append(f'loop phone svg in {where}: needs a <g class="lp-move"> and a <g class="lp-still">')
        # <style> inside an svg applies to the whole page, so the phone copy names its own keyframes and classes lp-m-.
        names = lambda s: set(re.findall(r'(?:\.|@keyframes\s+)(lp-[\w-]+)', ''.join(re.findall(r'<style>(.*?)</style>', s, re.S)))) - {'lp-move', 'lp-still'}
        mine = names(svgm)
        for n in sorted(x for x in mine if not x.startswith('lp-m-')):
            problems.append(f'loop phone svg in {where}: name {n} must start with lp-m-')
        for n in sorted(mine & names(svg)):
            problems.append(f'loop phone svg in {where}: name {n} is also used by the desktop picture')
    # Every id in the phone copy is <desktop prefix>-m-..., e.g. s1-22-6-m-arr2 next to s1-22-6-arr2.
    pre = {i.rsplit('-', 1)[0] for i in re.findall(r'\sid="([^"]+)"', svg)} or {fig_page(where)}
    for i in re.findall(r'\sid="([^"]+)"', svgm):
        if not any(i.startswith(p + '-m-') for p in pre):
            problems.append(f'phone svg in {where}: id {i!r} must start with one of {sorted(p + "-m-" for p in pre)}')


def figure(svg, caption, where, steps=None, start=1, loop=False, svgm=None):
    svg = check_svg(svg, where, loop)
    cap = f'<figcaption>{e(caption)}</figcaption>' if caption else ''
    has = ''
    if svgm:
        # Two drawings of one figure: v-d for desktop, v-m upright for phones (≤600px). CSS shows one; zoom and print show v-d.
        svgm = check_svg(svgm, where + ' phone', loop, phone=True)
        check_phone(svg, svgm, where, steps, loop)
        page_ = 'reference' if where.startswith('reference') else fig_page(where)
        PHONE_BYTES[page_] = PHONE_BYTES.get(page_, 0) + len(svgm.encode('utf-8')) + len(' class="v-m"  class="v-d" has-m')
        svg = svg.replace('<svg ', '<svg class="v-d" ', 1) + svgm.replace('<svg ', '<svg class="v-m" ', 1)
        has = ' has-m'
    if loop:
        # A looping animation: .lp-move plays, .lp-still is the complete still picture shown when motion is off.
        if 'class="lp-move"' not in svg or 'class="lp-still"' not in svg:
            problems.append(f'loop figure in {where}: needs a <g class="lp-move"> and a <g class="lp-still">')
        # The pause button stays hidden until site.js shows it (only when motion is on), since without JS there is nothing to pause.
        tog = '<button type="button" class="btn ghost lp-tog noread noprint" hidden>暫停動畫</button>'
        return f'<figure class="dg loop{has}"><div class="dgs">{svg}</div>{tog}{cap}</figure>'
    if not steps:
        return f'<figure class="dg{has}" title="點圖放大"><div class="dgs">{svg}</div>{cap}</figure>'
    # A step figure: parts marked data-s="2 3" show only at those steps; the rest always show.
    n = len(steps)
    used = steps_used(svg)
    if not used or max(used) > n or min(used) < 1 or not 1 <= start <= n:
        problems.append(f'step figure in {where}: data-s {sorted(used)} vs {n} steps, start {start}')
    items = ''.join(f'<li{" class=on" if i + 1 == start else ""}>{e(t)}</li>' for i, t in enumerate(steps))
    ctl = f'<div class="stepctl noread" hidden><button type="button" class="btn ghost" data-d="-1">上一步</button><span class="stepn">{start} / {n}</span><button type="button" class="btn ghost" data-d="1">下一步</button></div>'
    return f'<figure class="dg stepfig{has}" data-cur="{start}" data-n="{n}"><div class="dgs">{svg}</div>{ctl}<ol class="stepcap" aria-live="polite">{items}</ol>{cap}</figure>'


def check_svg(svg, where, loop=False, widths=None, phone=False):
    """Chapter figures are 600 wide; question figures pass widths=(320, 420) since they sit in the narrow answer box;
    a chapter figure's phone copy (phone=True) is 360 wide and 200–760 tall."""
    svg = svg.strip()
    body = re.sub(r'url\(#[\w-]+\)', '', svg)
    bad = [x for x in ('style=', 'fill="', 'stroke="', '<script') if x in body]
    tags = {x.lower() for x in re.findall(r'<([a-zA-Z]+)', svg)} - SVG_TAGS
    if loop:
        # Loop figures carry their own keyframes: only motion, never colours, and only lp- names.
        tags.discard('style')
        for css in re.findall(r'<style>(.*?)</style>', svg, re.S):
            names = re.findall(r'(?:^|})\s*(@keyframes\s+[\w-]+|[^{}@]+)\s*{', css)
            if re.search(r'url\(|@import|fill|stroke|color|background', css) or any(not re.match(r'(@keyframes\s+lp-|\.lp-)', n.strip()) for n in names if not re.match(r'^[\d.%,\s]+$|^(from|to)$', n.strip())):
                bad.append('loop style')
    if widths:
        m = re.match(r'<svg viewBox="0 0 (\d+) (\d+)" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="[^"]+">', svg)
        if not m or not widths[0] <= int(m[1]) <= widths[1] or not 80 <= int(m[2]) <= 320:
            bad.append(f'opening tag: viewBox "0 0 W H" with W {widths[0]}–{widths[1]}, H 80–320, role="img" and an aria-label')
    elif phone:
        m = re.match(r'<svg viewBox="0 0 360 (\d+)" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="[^"]+">', svg)
        if not m or not 200 <= int(m[1]) <= 760:
            bad.append('opening tag: viewBox "0 0 360 H" with H 200–760, role="img" and an aria-label')
    elif not svg.startswith('<svg viewBox="0 0 600 '):
        bad.append('viewBox must be 0 0 600 H')
    if bad or tags:
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
UI = SITE['ui']


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
# Home is the chapter list, so one item covers both; the brand link still goes to the top of home.
NAV = [('index.html#chapters', '章節'), ('practice.html', '練習'), ('glossary.html', '關鍵字'), ('reference.html', '速查'), ('exam.html', '考試資訊'), ('about.html', '關於')]
LOGO = '<svg viewBox="0 0 26 26" aria-hidden="true"><path class="tr" d="M3 20h7l6-14h7"/><circle class="nd" cx="3.5" cy="20" r="3"/><circle class="nd" cx="22.5" cy="6" r="3"/></svg>'
READER = '''<div id="reader" role="region" aria-label="朗讀播放器"><div class="in">
<div class="ctl"><button type="button" id="rdPrev" aria-label="上一段" title="上一段">⏮</button><button type="button" id="rdPlay" class="main" aria-label="暫停或繼續" title="暫停或繼續">⏸</button><button type="button" id="rdNext" aria-label="下一段" title="下一段">⏭</button><button type="button" id="rdStop" aria-label="停止朗讀" title="停止朗讀">⏹</button></div>
<div class="now" aria-live="polite"><b id="rdPos"></b><span id="rdText"></span></div>
<label>語速 <select id="rdRate"><option value="0.8">0.8×</option><option value="1" selected>1×</option><option value="1.2">1.2×</option><option value="1.4">1.4×</option><option value="1.7">1.7×</option></select></label>
<label>聲音 <select id="rdVoice"></select></label>
</div></div>'''


def page(name, title, main, desc, scripts='', current=None, jsonld=None):
    here = {'index.html': 'index.html#chapters'}.get(current or name, current or name)
    nav = ''.join('<a href="%s"%s>%s</a>' % (h, ' aria-current="page"' if here == h else '', t) for h, t in NAV)
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
<meta name="theme-color" content="#22434C" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1D363C" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="{'website' if name == 'index.html' else 'article'}">
<meta property="og:site_name" content="{e(SITE["name"])}">
<meta property="og:locale" content="zh_TW">
<meta property="og:title" content="{e(full)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{abs_url}">
<meta property="og:image" content="{SITE["url"]}assets/og-card-2.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="AIoT 導讀：一筆感測資料從感測、訊號、控制器、傳輸、平台走到分析與行動">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
{ld}
<script>document.documentElement.className='js';try{{var t=localStorage.getItem('aiot-guide-theme');if(t)document.documentElement.dataset.theme=t}}catch(e){{}}</script>
<link rel="stylesheet" href="assets/site.css">
</head>
<body>
<a class="skip" href="#main">跳到主要內容</a>
<header class="top"><div class="wrap"><a class="brand" href="index.html">{LOGO}{e(SITE["name"])}</a><nav class="nav" aria-label="主要導覽">{nav}</nav><button type="button" class="theme jsonly" id="themeBtn">深淺色</button></div></header>
{main}
<footer class="site"><div class="wrap">{e(SITE["footer"])}<br>程式碼 MIT・內容 CC BY 4.0・<a href="{SITE["repo"]}" rel="noopener">原始碼與回報</a></div></footer>
{READER}
{scripts}<script src="assets/site.js"></script>
</body>
</html>
'''
    # Fingerprint our own CSS/JS so a returning visitor never mixes a new page with cached old assets.
    html = re.sub(r'((?:href|src)="(assets/[\w/.-]+\.(?:css|js)))"', lambda m: f'{m[1]}?v={hashlib.md5((DIST / m[2]).read_bytes()).hexdigest()[:8]}"', html)
    (DIST / name).write_text(html, encoding='utf-8')


def sidebar(cur=None):
    out = ''
    for s, sub in SUBJ.items():
        out += f'<div class="grp">{e(sub["short"])}</div>'
        for cid in SITE['reading']:
            c = CH[cid]
            if c['subject'] != s:
                continue
            attr = ' aria-current="page"' if cid == cur else ''
            out += f'<a href="{cid}.html"{attr}><span class="c {c["subject"]}">{e(c["code"])}</span><span>{e(c["title"])}</span></a>'
    return out


def table(t, where):
    head = ''.join(f'<th>{clean(x, where)}</th>' for x in t['head'])
    # Four or more columns get readable minimum widths on phones and scroll sideways instead of stacking characters.
    wide = ' wide' if len(t['head']) >= 4 else ''
    # Three columns or fewer stack into one block per row on phones; each cell carries its column name for the label.
    names = [] if wide else [re.sub(r'<[^>]+>', '', x).strip() for x in t['head']]
    dh = lambda j: f' data-h="{e(names[j])}"' if j < len(names) else ''
    rows = ''.join('<tr>' + ''.join(f'<{"th" if j == 0 else "td"}{dh(j)}>{clean(x, where)}</{"th" if j == 0 else "td"}>' for j, x in enumerate(r)) + '</tr>' for r in t['rows'])
    return f'<div class="tblwrap{wide}" tabindex="0" role="region" aria-label="表格，可左右捲動"><table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>'


SAY = '<button type="button" class="say" data-say-card>朗讀</button>'
GUIDE_NOTE = '<p class="small muted noread">括號「指引 p.N」是官方指引的寫法。</p>'


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
    link, used = linker(cid)
    for k, s in enumerate(c['sections']):
        where = f'{w} section {k + 1}'
        sections += f'<section id="{e(s["id"])}" data-read class="{"first" if k == 0 else ""}"><h2><span class="txt">{e(s["h"])}</span>{SAY}</h2>'
        if s.get('predict'):
            pr = s['predict']
            sections += f'<details class="pr" data-say="{e("先想一想。" + pr["q"] + "。答案：" + pr["a"])}"><summary><span class="prk">先想一想</span>{e(pr["q"])}</summary><p>{e(pr["a"])}</p></details>'
        # Extra figures sit where the text needs them: after the predict, the body, the after text, or at the end.
        figs = {}
        for f in s.get('figs', []):
            figs.setdefault(f.get('pos', 'end'), []).append(figure(f['svg'], f.get('caption'), where, f.get('steps'), f.get('start', 1), f.get('loop'), f.get('svgm')))
        sections += ''.join(figs.pop('after-predict', []))
        sections += link(clean(s.get('body', ''), where))
        sections += ''.join(figs.pop('after-body', []))
        if s.get('lab'):
            sections += f'<div class="lab" data-lab="{e(s["lab"])}"><p class="lab-wait jsonly">實驗載入中…</p><p class="nojs">這個互動實驗需要 JavaScript。</p></div>'
        if s.get('after'):
            sections += link(clean(s['after'], where))
        sections += ''.join(figs.pop('after-after', []))
        if s.get('svg'):
            sections += figure(s['svg'], s.get('caption'), where, s.get('steps'), s.get('start', 1), s.get('loop'), s.get('svgm'))
        sections += ''.join(figs.pop('end', []))
        for pos in figs:
            problems.append(f'unknown figure position {pos} in {where}')
        if s.get('table'):
            sections += table(s['table'], where)
        if s.get('video'):
            sections += video(s['video'])
        if s.get('more'):
            sections += f'<details class="more"><summary>{e(s["more"]["label"])}</summary>{link(clean(s["more"]["body"], where))}</details>'
        sections += '</section>'
    toc = ''.join(f'<a href="#{e(s["id"])}">{e(s["h"])}</a>' for s in c['sections'])
    # The contents column on wide screens shows only the topic before a full-width colon; the full heading is its title.
    toc_short = ''.join(f'<a href="#{e(s["id"])}" title="{e(s["h"])}">{e(s["h"].split("：")[0])}</a>' if '：' in s['h'] else f'<a href="#{e(s["id"])}">{e(s["h"])}</a>' for s in c['sections'])
    tail = '<a href="#keypoints">重點整理</a><a href="#examples">例題</a><a href="#check">自我檢查</a><a href="#terms">本章關鍵字</a>' + ('<a href="#sources">來源</a>' if c.get('sources') else '')
    official = '' if c['official'] == c['title'] else f'<span class="noread">官方：{e(c["official"])}</span>'
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
    pager = f'<a class="px btn ghost" href="practice.html#{cid}">練習本章（{QCOUNT.get(cid, 0)} 題）</a>'
    if prev_:
        pager += f'<a href="{prev_["id"]}.html"><small>上一章</small>{e(prev_["code"] + " " + prev_["title"])}</a>'
    if next_:
        # Crossing into the other subject shows that subject's name in its own colour.
        mark = f'<span class="tag {next_["subject"]}">{e(SUBJ[next_["subject"]]["short"])}</span> ' if next_['subject'] != c['subject'] else ''
        pager += f'<a class="nx" href="{next_["id"]}.html"><small>下一章</small>{mark}{e(next_["code"] + " " + next_["title"])}</a>'
    else:
        pager += '<a class="nx" href="practice.html"><small>全部讀完</small>兩科混合練習</a>'
    # The pinned contents bar on phones and tablets also leads on: previous and next chapter, and the full chapter list.
    menu_x = ''.join(f'<a href="{x["id"]}.html"><span class="muted">{e(UI[k])}</span> {e(x["code"] + " " + x["title"])}</a>' for k, x in (('menuPrev', prev_), ('menuNext', next_)) if x)
    menu_x += f'<a href="index.html#map">{e(UI["menuAll"])}</a>'
    learn = ''.join(f'<li>{e(x)}</li>' for x in c['learn'])
    pre = clean(c.get('prereq', ''), w)
    prereq = f'<div class="prereq" data-read><b class="lb">先備知識</b>{pre if pre.lstrip().startswith("<p>") else "<p>" + pre + "</p>"}</div>' if pre else ''
    # Phones and tablets fold the AI/software comparison (site.js opens every details[data-wide] from 901px up); read aloud it stays one segment, label included.
    br = clean(c['bridge'], w) if c.get('bridge') else ''
    bridge = f'<details class="more bridge" data-wide data-say="{e(UI["bridge"] + "：" + re.sub(r"<[^>]+>", "", br))}"><summary>{e(UI["bridge"])}</summary><p>{br}</p></details>' if br else ''
    guide = ''
    if c.get('guidePages'):
        guide = f'<p class="small muted noread">對應官方學習指引 p.{c["guidePages"][0]}–{c["guidePages"][1]}（PDF 頁碼）</p>'
    labs = f'<script src="assets/labs-core.js" defer></script>\n<script src="assets/labs/{cid}.js" defer></script>\n' if any(x.get('lab') for x in c['sections']) else ''
    case = f'<div class="case" data-read><b>{e(c["case"]["title"])}</b><p>{e(c["case"]["body"])}</p></div>' if c.get('case') else ''
    sources = ''
    if c.get('sources'):
        links = ''.join(f'<li><a href="{e(u)}" rel="noopener" target="_blank">{e(t)}</a></li>' for t, u in c['sources'])
        sources = f'<section id="sources"><details class="more fold" data-wide><summary><h2>{e(UI["sources"].format(n=len(c["sources"])))}</h2></summary><ul class="srcs">{links}</ul>{guide}</details></section>'
        guide = ''
    main = f'''<main class="wrap doc {c["subject"]}">
<aside class="side" aria-label="章節">{sidebar(cid)}</aside>
<article id="main">
<details class="sidemenu"><summary>全部章節</summary><div class="side">{sidebar(cid)}</div></details>
<details class="sidemenu tocmenu noread"><summary>本章目錄</summary><div class="in"><a href="#main">{e(UI["menuTop"])}</a>{toc}{tail}<div class="tmx">{menu_x}</div></div></details>
<header class="chead">{locator(cid)}<div class="meta"><span class="tag">{e(c["code"])}</span><span>{e(SUBJ[c["subject"]]["short"])}</span>{official}<span class="noread">約 {minutes(c)} 分鐘</span><button type="button" class="btn ghost noread noprint" data-read-all>朗讀整章</button></div>
<h1>{e(c["title"])}</h1><p class="sub">{e(c["subtitle"])}</p><p>{e(c["summary"])}</p></header>
{case}<div class="learn"><h2>讀完這章，你能</h2><ul>{learn}</ul></div>
{prereq}{bridge}
{sections}
<section id="keypoints" data-read><div class="keys"><h2>重點整理</h2><ul>{keys}</ul></div><p class="small noread noprint"><a href="reference.html#r-{cid}">本章速查卡</a></p><div class="pits"><h2>容易混淆的地方</h2>{GUIDE_NOTE if '指引 p.' in pits else ''}<ul>{pits}</ul></div></section>
<section id="examples" data-read><h2><span class="txt">例題：怎麼想</span>{SAY}</h2>{exs}</section>
<section id="check" data-read><h2><span class="txt">自我檢查</span>{SAY}</h2><div class="flgrid">{chk}</div></section>
<section id="terms" class="hasfold" data-read>{SAY}<details class="more fold" data-wide><summary><h2><span class="txt">{e(UI["terms"].format(n=len(c["terms"])))}</span></h2></summary><div class="termgrid">{terms}</div>{guide}</details></section>
{sources}
<nav class="pager noprint" aria-label="章節切換">{pager}</nav>
</article>
<nav class="toc" aria-label="本章目錄"><b>本章目錄</b>{toc_short}{tail}</nav>
{glossary_data(used)}</main>'''
    page(f'{cid}.html', f'{c["code"]} {c["title"]}', main, c['summary'], labs, current='index.html#chapters', jsonld={
        '@context': 'https://schema.org', '@type': 'LearningResource', 'name': f'{c["code"]} {c["title"]}', 'headline': c['title'], 'description': c['summary'],
        'url': SITE['url'] + cid + '.html', 'inLanguage': 'zh-Hant', 'learningResourceType': '教學文章與互動實驗', 'teaches': c['learn'], 'dateModified': SITE['updated'],
        'educationalAlignment': {'@type': 'AlignmentObject', 'alignmentType': 'educationalSubject', 'targetName': SUBJ[c['subject']]['name']},
        'author': {'@type': 'Person', 'name': SITE['author']}, 'license': 'https://creativecommons.org/licenses/by/4.0/',
        'isPartOf': {'@type': 'WebSite', 'name': SITE['name'], 'url': SITE['url']}})


def home():
    h = SITE['home']
    stops = ''
    for st in h['stops']:
        links = ''.join(f'<a class="tag {CH[x]["subject"]}" href="{x}.html" title="{e(CH[x]["title"])}">{e(CH[x]["code"])}</a>' for x in st['chapters'])
        stops += f'<div class="stop"><b>{e(st["name"])}</b><span class="what">{e(st["what"])}</span><span class="codes">{links}</span></div>'
    across = ''.join(f'<span class="ag">{e(name)}' + ''.join(f'<a class="tag {CH[x]["subject"]}" href="{x}.html" title="{e(CH[x]["title"])}">{e(CH[x]["code"])}</a>' for x in ids) + '</span>' for name, ids in h['acrossGroups'])
    subs = ''
    for s, sub in SUBJ.items():
        # Listed in the recommended reading order, the same order as the sidebar and the pager.
        items = ''
        for cid in [x for x in SITE['reading'] if CH[x]['subject'] == s]:
            c = CH[cid]
            items += f'<li><a href="{cid}.html" data-title="{e(c["code"] + " " + c["title"])}"><span class="tag">{e(c["code"])}</span><span><span class="t">{e(c["title"])}</span><span class="d">{e(c["subtitle"])}</span><span class="m">約 {minutes(c)} 分鐘・{QCOUNT.get(cid, 0)} 題</span></span></a></li>'
        body = f'<ul class="chlist">{items}</ul>'
        subs += f'<div class="subject {s}"><h2>{e(sub["name"])}</h2><p class="desc">{e(sub["desc"])}</p>{body}</div>'
    # {conf} in a tool description is the number of confusable groups, so it never goes stale.
    cpath = CONTENT / 'confusables.json'
    nconf = len(json.loads(cpath.read_text(encoding='utf-8'))['groups']) if cpath.exists() else 0
    tools = ''.join(f'<a class="tool" href="{t["href"]}"><b>{e(t["name"])}</b><span>{e(t["desc"].replace("{conf}", str(nconf)))}</span></a>' for t in h['tools'])
    main = f'''<main id="main">
<div class="wrap hero"><h1>{e(h["title"])}</h1><p class="lead">{e(h["lead"])}</p>
<div class="row"><a class="btn" href="{SITE["reading"][0]}.html" data-start>{e(h["startBtn"])}</a></div></div>
<div class="band" id="chapters"><div class="wrap"><div class="subjects">{subs}</div><p class="small muted chnote">章號沿用官方編號，依建議順序排列。</p></div></div>
<div class="band" id="map"><div class="wrap"><h2>{e(h["mapTitle"])}</h2>
{video(h["video"], False) if h.get("video") else ""}<div class="trace">{stops}</div>
<p class="across"><b>{e(h["acrossLabel"])}</b>{across}</p></div></div>
<div class="band"><div class="wrap"><div class="tools">{tools}</div></div></div>
</main>'''
    page('index.html', SITE['name'], main, SITE['description'], jsonld={'@context': 'https://schema.org', '@type': 'WebSite', 'name': SITE['name'], 'url': SITE['url'], 'description': SITE['description'], 'inLanguage': 'zh-Hant', 'author': {'@type': 'Person', 'name': SITE['author']}, 'license': 'https://creativecommons.org/licenses/by/4.0/'})


def load_confusables():
    """Confusable groups, each with a stable id: its own "id" if given, else <chapter>-<sec>.
    Questions point at a group with "conf": "<id>"; the glossary card carries the anchor conf-<id>."""
    cpath = CONTENT / 'confusables.json'
    groups = json.loads(cpath.read_text(encoding='utf-8'))['groups'] if cpath.exists() else []
    seen = {}
    for g in groups:
        g['cid'] = g.get('id') or f"{g['chapter']}-{g.get('sec') or 'all'}"
        if not re.fullmatch(r'[a-z0-9-]+', g['cid']):
            problems.append(f"confusables: id {g['cid']!r} must be lowercase letters, digits and hyphens")
        if g['cid'] in seen:
            problems.append(f"confusables: {g['title']} and {seen[g['cid']]} share id {g['cid']}; give one of them an \"id\"")
        seen[g['cid']] = g['title']
    return groups


CONF = load_confusables()


def check_explain(q):
    """Fields of the worked explanation: w (one short note per original option), tip, e, conf. See SPEC.md 練習題詳解."""
    qid = q['id']
    w = q.get('w')
    if w is None:
        problems.append(f'question {qid}: needs w, one short note per option (SPEC.md 練習題詳解)')
    else:
        if not (isinstance(w, list) and len(w) == 4 and all(isinstance(x, str) for x in w)):
            problems.append(f'question {qid}: w must be 4 strings, one per option in the original order')
        else:
            for k, x in enumerate(w):
                if not 6 <= len(x) <= 28:
                    problems.append(f'question {qid}: w[{k}] is {len(x)} characters (6–28)')
                if re.search(r'(選項|^)[A-DＡ-Ｄ](?![A-Za-z0-9])', x):
                    problems.append(f'question {qid}: w[{k}] names an option by letter; options are shuffled')
    if 'tip' in q and not (isinstance(q['tip'], str) and 0 < len(q['tip']) <= 32):
        problems.append(f"question {qid}: tip must be a sentence of at most 32 characters")
    if len(q['e']) > 120:
        problems.append(f"question {qid}: e is {len(q['e'])} characters (at most 120)")
    if 'conf' in q and q['conf'] not in {g['cid'] for g in CONF}:
        problems.append(f"question {qid}: conf {q['conf']!r} is not a group in confusables.json")


def check_qfig(q, seen):
    """A small figure in the explanation (fig, figcap, loop). See SPEC.md 練習題詳解. seen: names already used by other questions' figures."""
    qid, svg = q['id'], q['fig']
    where = f'question {qid} fig'
    if not isinstance(svg, str) or not svg.strip():
        problems.append(f'{where}: must be an SVG string')
        return
    loop = q.get('loop', False)
    if loop is not True and 'loop' in q:
        problems.append(f'question {qid}: loop is either true or left out')
    svg = check_svg(svg, where, loop is True, widths=(320, 420))
    if len(svg.encode('utf-8')) > 6144:
        problems.append(f'{where}: {len(svg.encode("utf-8"))} bytes (at most 6 KB)')
    if loop is True and ('class="lp-move"' not in svg or 'class="lp-still"' not in svg):
        problems.append(f'{where}: a loop needs a <g class="lp-move"> and a <g class="lp-still">')
    # Every id (markers included) starts with q-<question id>-, so two figures on one review page never clash.
    for i in re.findall(r'\sid="([^"]+)"', svg):
        if not i.startswith(f'q-{qid}-'):
            problems.append(f'{where}: id {i!r} must start with q-{qid}-')
        elif i in seen:
            problems.append(f'{where}: id {i!r} is also used by question {seen[i]}')
        seen[i] = qid
    # A loop's own class and keyframes names share the page with other questions' loops, so they must not repeat either.
    for css in re.findall(r'<style>(.*?)</style>', svg, re.S):
        for n in set(re.findall(r'(?:\.|@keyframes\s+)(lp-[\w-]+)', css)) - {'lp-move', 'lp-still'}:
            if seen.get('css:' + n, qid) != qid:
                problems.append(f'{where}: animation name {n} is also used by question {seen["css:" + n]}')
            seen['css:' + n] = qid
    # Phones show it about 300 px wide: few labels, none in the small ts size.
    labels = {re.sub(r'<[^>]+>', '', t).strip() for t in re.findall(r'<text\b[^>]*>(.*?)</text>', svg, re.S)}
    if len(labels) > 6:
        problems.append(f'{where}: {len(labels)} different labels (at most 6)')
    if re.search(r'<(?:text|tspan)\b[^>]*class="[^"]*\bts\b', svg):
        problems.append(f'{where}: text is too small at phone width; use t or larger, not ts')
    if 'figcap' in q and not (isinstance(q['figcap'], str) and 0 < len(q['figcap']) <= 40):
        problems.append(f'question {qid}: figcap must be a sentence of at most 40 characters')


def load_questions():
    bank = json.loads((CONTENT / 'questions-base.json').read_text(encoding='utf-8'))
    dropped = edited = 0
    out = []
    edits, drops, where = {}, set(), {}
    for f in sorted(CONTENT.glob('questions-s*.json')):
        d = json.loads(f.read_text(encoding='utf-8'))
        drops |= set(d.get('drop', []))
        for k in d.get('edits', {}):
            if k in where:
                problems.append(f'question {k} is edited in both {where[k]} and {f.name}')
            where[k] = f.name
        edits.update(d.get('edits', {}))
        # New questions written by this site go in "add": same fields as questions-base.json.
        for q in d.get('add', []):
            miss = {'id', 'subject', 'lesson', 'q', 'o', 'a', 'e'} - set(q)
            if miss:
                problems.append(f'added question in {f.name} lacks {sorted(miss)}')
                continue
            bank.append(q)
    ids = [q['id'] for q in bank]
    for x in sorted({i for i in ids if ids.count(i) > 1}):
        problems.append(f'question id {x} is used twice')
    ids = set(ids)
    for x in sorted((drops | set(edits)) - ids):
        problems.append(f'edit or drop for unknown question id {x}')
    figs = {}
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
        check_explain(q)
        if 'fig' in q:
            check_qfig(q, figs)
            q = {**q, 'fig': q['fig'].strip()}
        elif 'figcap' in q or 'loop' in q:
            problems.append(f"question {q['id']}: figcap and loop need a fig")
        out.append({k: q[k] for k in ('id', 'subject', 'lesson', 'q', 'o', 'a', 'e', 'sec', 'w', 'tip', 'conf', 'fig', 'figcap', 'loop') if k in q})
    print(f'questions: {len(out)} kept, {edited} edited, {dropped} dropped')
    for q in out:
        for m in BANNED.finditer(q['q'] + q['e']):
            problems.append(f"banned wording {m[0]!r} in question {q['id']}")
    return out


QUESTIONS = load_questions()
QCOUNT = {cid: sum(1 for q in QUESTIONS if q['lesson'] == cid) for cid in ORDER}


def practice():
    out = QUESTIONS
    # next: the chapter after this one in the recommended reading order, so a finished chapter drill can point onward.
    READ = SITE['reading']
    nxt = {c: (READ[k + 1] if k + 1 < len(READ) else None) for k, c in enumerate(READ)}
    chs = [{'id': c, 'subject': CH[c]['subject'], 'code': CH[c]['code'], 'title': CH[c]['title'], 'next': nxt.get(c), 'secs': {s['id']: s['h'] for s in CH[c]['sections']}} for c in READ]
    # Names of the confusable groups that questions point at, for the 「易混淆：…」 link under an explanation.
    used = {q['conf'] for q in out if q.get('conf')}
    confs = {g['cid']: g['title'] for g in CONF if g['cid'] in used}
    js = 'window.AIOT_QUESTIONS=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\nwindow.AIOT_CHAPTERS=' + json.dumps(chs, ensure_ascii=False, separators=(',', ':')) + ';\nwindow.AIOT_CONF=' + json.dumps(confs, ensure_ascii=False, separators=(',', ':')) + ';\n'
    # Practice wording that lives in site.json (keyboard hint, the buttons repeated under the review list).
    ui = {k: UI[k] for k in ('keyHint', 'keyHintExam', 'redo', 'rest', 'again')}
    js += 'window.AIOT_UI=' + json.dumps(ui, ensure_ascii=False, separators=(',', ':')) + ';\n'
    (DIST / 'assets' / 'questions.js').write_text(js.replace('</', '<\\/'), encoding='utf-8')
    n = {s: sum(1 for q in out if q['subject'] == s) for s in SUBJ}
    opts = ''.join(f'<option value="{s}">{e(SUBJ[s]["name"])}（{n[s]} 題）</option>' for s in SUBJ)
    main = f'''<main id="main" class="wrap page"><h1>練習</h1>
<p class="nojs">練習需要 JavaScript，請開啟後重新整理。</p>
<div class="panel noprint jsonly" id="quizSetup"><div class="formgrid"><div class="qmain">
<label for="fSubject">科目<select id="fSubject"><option value="">兩科</option>{opts}</select></label>
<label for="fChapter">章節<select id="fChapter"></select></label>
<label for="fMode">方式<select id="fMode"><option value="learn">逐題看解析</option><option value="exam">限時（每題 90 秒，本站估算）</option></select></label>
</div><div class="qside">
<label for="fCount">題數<select id="fCount"><option value="10">10 題</option><option value="25">25 題</option><option value="50">50 題</option><option value="0">全部</option></select></label>
<button type="button" class="btn" id="qStart">開始</button><p class="small muted" id="fAvail" role="status"></p></div></div></div>
<div id="quizApp"></div><p class="sr" role="status" id="qStatus"></p></main>'''
    page('practice.html', '練習', main, f'{len(out)} 題 AIoT 情境練習題，涵蓋兩個科目 15 個主題，每題附解析。', '<script src="assets/questions.js"></script>\n')


ALIASES = {'dos': 'dos／ddos', 'ddos': 'dos／ddos', 'osi 七層': 'osi', 'osi 模型': 'osi'}
# Too generic to be worth a definition popup inside chapters.
NO_LINK = {'物聯網', '感測器', 'MAC', 'Agent', '網路層', '應用層'}


def build_terms():
    terms = {}
    for cid in SITE['reading']:
        for t in CH[cid]['terms']:
            key = ALIASES.get(t['term'].strip().lower(), t['term'].strip().lower())
            cur = terms.setdefault(key, {**t, 'key': key, 'where': []})
            if len(t['def']) > len(cur['def']):
                cur['def'] = t['def']
            if cid not in cur['where']:
                cur['where'].append(cid)
    return terms


TERMS = build_terms()


def term_regex(name):
    if re.search(r'[／（(]', name) or name in NO_LINK:
        return None
    if re.fullmatch(r'[\x20-\x7e]+', name):
        return r'(?<![A-Za-z0-9])' + re.escape(name) + r'(?![A-Za-z0-9])' if len(name) >= 2 else None
    return re.escape(name) if len(name) >= 3 else None


def linker(cid):
    # Wrap the first use of each term taught in another chapter, so readers can check it in place.
    names = {}
    for t in TERMS.values():
        if cid not in t['where'] and term_regex(t['term']):
            names[t['term']] = t['key']
    if not names:
        return (lambda html: html), {}
    rx = re.compile('|'.join(term_regex(n) for n in sorted(names, key=len, reverse=True)))
    used = {}

    def run(html):
        out, skip = [], 0
        for part in re.split(r'(<[^>]+>)', html):
            if part.startswith('<'):
                m = re.match(r'<(/?)(a|code)\b', part)
                if m:
                    skip += -1 if m[1] else 1
                out.append(part)
                continue
            if skip:
                out.append(part)
                continue

            def wrap(m):
                key = names[m[0]]
                if key in used:
                    return m[0]
                used[key] = TERMS[key]
                return f'<button type="button" class="gl" data-k="{e(key)}" aria-expanded="false" aria-controls="glpop">{m[0]}</button>'
            out.append(rx.sub(wrap, part))
        return ''.join(out)
    return run, used


def glossary_data(used):
    data = {k: {'t': t['term'], 'en': t.get('en', ''), 'd': t['def'], 'h': CH[t['where'][0]]['code'] + ' ' + CH[t['where'][0]]['title'], 'u': t['where'][0] + '.html'} for k, t in used.items()}
    return '<script type="application/json" id="gldata">' + json.dumps(data, ensure_ascii=False).replace('</', '<\\/') + '</script>' if data else ''


def chip(href, c):
    # Jump chips: the chapter code alone on narrow screens; from 1241px a side list with the chapter name, like the chapter sidebar.
    return f'<a href="#{href}" class="{c["subject"]}" title="{e(c["title"])}" aria-label="{e(c["code"] + " " + c["title"])}"><span class="c">{e(c["code"])}</span> <span class="n">{e(c["title"])}</span></a>'


# One picture at the top of some chapter groups, showing how that group's terms fit together: chapter -> section (and which of its figures).
# Only static figures with an upright phone drawing; a step figure is shown as its last step, the whole story at once.
# Eight pictures keep the page under its 120 KB budget with room to spare (each adds about 5 KB with its phone copy).
GLOSS_FIGS = {'s1-21': ('three-layers', 0), 's1-32': ('interfaces', 0), 's1-22': ('road-and-language', 0), 's1-25': ('symmetric-asymmetric', 0),
              's1-11': ('ai-in-aiot', 0), 's1-12': ('integrated-cycle', 0), 's2-11': ('edge-fog-cloud', 0), 's2-23': ('isa-95', 0)}


def last_step(svg, n):
    # Keep the parts shown at step n (and the parts always shown), drop the rest, and lose the step marks.
    svg = re.sub(r'<(\w+)[^<>]*\sdata-s="([^"]+)"[^<>]*?(?:/>|>[^<]*(?:<tspan[^<>]*>[^<]*</tspan>[^<]*)*</>)',
                 lambda m: m[0] if str(n) in m[2].split() else '', svg)
    return re.sub(r'\sdata-s="[^"]+"', '', svg)


def glossary():
    def item(t):
        # data-s lists the chapters that teach the term: the subject filter matches "s1"/"s2" in it, and the name view shows them as chapter codes.
        en = ' <span class="en">' + e(t['en']) + '</span>' if t.get('en') else ''
        return f'<div class="gitem" data-s="{" ".join(t["where"])}"><b>{e(t["term"])}</b>{en}<p>{e(t["def"])}</p></div>'

    def gfig(cid):
        if cid not in GLOSS_FIGS:
            return ''
        sid, i = GLOSS_FIGS[cid]
        sec = next(x for x in CH[cid]['sections'] if x['id'] == sid)
        f = ([sec] + sec.get('figs', []))[i]
        svg, svgm = f['svg'], f.get('svgm')
        if f.get('steps'):
            svg, svgm = last_step(svg, len(f['steps'])), svgm and last_step(svgm, len(f['steps']))
        if not svgm or f.get('loop'):
            problems.append(f'glossary figure {cid} {sid}: needs a phone drawing and no loop')
        return f'<div class="gfig">{figure(svg, f.get("caption"), f"glossary {cid}", svgm=svgm)}<p class="small"><a href="{cid}.html#{sid}">看詳解</a></p></div>'
    # Default view groups terms by the chapter that first teaches them, in reading order.
    groups, chips = '', ''
    for cid in SITE['reading']:
        mine = [t for t in TERMS.values() if t['where'][0] == cid]
        if not mine:
            continue
        c = CH[cid]
        chips += chip(f'g-{cid}', c)
        groups += f'<section class="gsec {c["subject"]}" id="g-{cid}" data-s="{c["subject"]}"><h2><a href="{cid}.html"><span class="tag">{e(c["code"])}</span> {e(c["title"])}</a><a class="small noprint gtop" href="#gq">搜尋</a></h2>{gfig(cid)}<div class="glist">{"".join(item(t) for t in mine)}</div></section>'
    conf = ''
    groups_c = CONF
    for g in groups_c:
        if g['chapter'] not in CH or (g.get('sec') and g['sec'] not in {s['id'] for s in CH[g['chapter']]['sections']}):
            problems.append(f'confusables: bad chapter or section in {g["title"]}')
            continue
        c = CH[g['chapter']]
        cells = ''.join(f'<div><b>{e(x["term"])}</b><span>{e(x["gist"])}</span></div>' for x in g['items'])
        tip = f'<p class="tip">{e(g["tip"])}</p>' if g.get('tip') else ''
        href = g['chapter'] + '.html' + ('#' + g['sec'] if g.get('sec') else '')
        conf += f'<div class="conf{" wide" if len(g["items"]) > 3 else ""}" id="conf-{g["cid"]}" data-s="{c["subject"]}"><h3>{e(g["title"])}</h3><div class="cg" style="--n:{len(g["items"])}">{cells}</div>{tip}<a class="small" href="{href}">{e(c["code"] + " " + c["title"])}</a></div>'
    opts = ''.join(f'<option value="{s}">{e(SUBJ[s]["short"])}</option>' for s in SUBJ)
    views = '<button type="button" data-v="ch" aria-pressed="true">依章節</button><button type="button" data-v="az" aria-pressed="false">依名稱</button>' + (f'<button type="button" id="conf" data-v="conf" aria-pressed="false">易混淆（{len(groups_c)} 組）</button>' if conf else '')
    main = f'''<main id="main" class="wrap page gloss"><h1>關鍵字</h1>
<div class="gside"><div class="gctl"><div class="formgrid"><label for="gq">搜尋<input id="gq" type="search" placeholder="MQTT、遲滯、OEE" aria-describedby="gcount"></label><label for="gs">科目<select id="gs"><option value="">兩科</option>{opts}</select></label><div class="seg gview jsonly" role="group" aria-label="呈現方式">{views}</div><span class="small muted" id="gcount" role="status"></span></div>
</div><nav class="gchips" aria-label="跳到章節">{chips}</nav></div>
<div class="gbody"><div id="gch">{groups}</div><div class="glist" id="gaz" hidden></div><div class="confs" id="gconf" hidden>{conf}</div></div></main>'''
    page('glossary.html', '關鍵字', main, f'{len(TERMS)} 個物聯網與 AIoT 關鍵字的白話解釋，依章節整理，並對照容易混淆的概念。')
    print('glossary terms:', len(TERMS), 'confusable groups:', len(groups_c))


def guide_diff(x):
    # Pitfalls where the official guide (指引 p.N) or some textbooks (考題可能採教材說法) say it differently.
    return '指引 p.' in x or '考題可能採教材說法' in x


# Static diagrams worth a second look before the exam, shown again on the review page: chapter -> section.
REF_FIGS = {'s1-21': 'osi-tcpip', 's1-25': 'symmetric-asymmetric'}


def reference():
    # Formula cards: chapter label before the name, one formula per line, the worked example under a quiet 「例」, the note last and muted.
    def lines(t):
        return [x.strip() for x in t.split('；') if x.strip()]
    def card(f):
        c = CH[f['chapter']]
        expr = ''.join(f'<p>{e(x)}</p>' for x in lines(f['expr']))
        eg = '<div class="feg"><span class="lb">例</span><div>' + ''.join(f'<p>{e(x)}</p>' for x in lines(f['eg'])) + '</div></div>' if f.get('eg') else ''
        note = f'<p class="fnote">{e(f["note"])}</p>' if f.get('note') else ''
        return f'<div class="fm"><h4><a class="tag" href="{f["chapter"]}.html" aria-label="{e(c["code"] + " " + c["title"])}">{e(c["code"])}</a> {e(f["name"])}</h4><div class="fx">{expr}</div>{eg}{note}</div>'
    # Formulas follow the reading order, split by subject like the chapter cards.
    fms = sorted(SITE['formulas'], key=lambda f: SITE['reading'].index(f['chapter']))
    fm = ''.join(f'<h3>{e(sub["name"])}</h3><div class="formula {s}">' + ''.join(card(f) for f in fms if CH[f['chapter']]['subject'] == s) + '</div>' for s, sub in SUBJ.items())
    diffs, blocks, chips = '', '', ''
    for s, sub in SUBJ.items():
        cards = ''
        # Chapters in the reading order, like the home page, the sidebar, the glossary and the practice list.
        for cid in SITE['reading']:
            c = CH[cid]
            if c['subject'] != s:
                continue
            chips += chip(f'r-{cid}', c)
            gd = [x for x in c['pitfalls'] if guide_diff(x)]
            rest = [x for x in c['pitfalls'] if not guide_diff(x)]
            diffs += ''.join(f'<li><a class="tag {s}" href="{cid}.html#keypoints" aria-label="{e(c["code"] + " " + c["title"])}">{e(c["code"])}</a> {clean(x, cid)}</li>' for x in gd)
            fig = ''
            if cid in REF_FIGS:
                sec = next(x for x in c['sections'] if x['id'] == REF_FIGS[cid])
                fig = figure(sec['svg'], sec.get('caption'), f'reference {cid}', svgm=sec.get('svgm')) + f'<p class="small"><a href="{cid}.html#{sec["id"]}">看詳解</a></p>'
            pits = f'<details class="more"><summary>易混淆（{len(rest)}）</summary><ul>' + ''.join(f'<li>{clean(x, cid)}</li>' for x in rest) + '</ul></details>' if rest else ''
            note = f'<p class="small muted">另 {len(gd)} 條見<a href="#guide">指引差異</a></p>' if gd else ''
            cards += f'<div class="panel {s}" id="r-{cid}"><h3><a href="{cid}.html"><span class="tag">{e(c["code"])}</span> {e(c["title"])}</a></h3><ul>' + ''.join(f'<li>{clean(x, cid)}</li>' for x in c['keypoints']) + f'</ul>{fig}{pits}{note}</div>'
        blocks += f'<h2>{e(sub["name"])}</h2><div class="refgrid">{cards}</div>'
    pages = '、'.join(f'{CH[x]["code"]} p.{CH[x]["guidePages"][0]}–{CH[x]["guidePages"][1]}（{CH[x]["guideQuiz"]}）' for x in ORDER if CH[x].get('guidePages'))
    guide = f'''<h2 id="guide">指引差異</h2><div class="pits gdiff"><p class="small muted noread">「指引 p.N」是官方指引 PDF 第 N 頁的寫法；作答依題目條件判斷。</p>
<ul>{diffs}</ul><details class="more noread"><summary>頁段對照</summary><p class="small">各章在指引的頁段，括號內是評量題開始的頁：{pages}。</p></details><p class="small muted">指引評量答案代號與解析不一致：p.154 第 7、8 題，以解析文字為準。</p></div>'''
    # One part at a time: site.js shows the part the tab or address points at. Without JS, and in print, all three parts follow one another.
    tabs = '<nav class="rtabs noprint" aria-label="速查內容"><a href="#formulas" data-part="formulas">公式</a><a href="#guide" data-part="guide">指引差異</a><a href="#chapters" data-part="chapters">各章重點</a></nav>'
    chips = f'<nav class="gchips" aria-label="跳到章節">{chips}</nav>'
    main = f'''<main id="main" class="wrap page ref"><h1>速查</h1><p class="intro">易混淆的概念對照見<a href="glossary.html#conf">關鍵字頁</a>。</p>{tabs}{chips}
<div class="rbody"><section class="rpart" data-part="formulas"><h2 id="formulas">公式</h2>{fm}</section><section class="rpart" data-part="guide">{guide}</section><section class="rpart" id="chapters" data-part="chapters">{blocks}</section></div></main>'''
    page('reference.html', '速查', main, 'AIoT 常用公式、官方指引寫法不同的地方、15 個主題的重點整理與容易混淆的地方。')


def exam():
    x = SITE['exam']
    rows = ''.join(f'<tr><th>{e(a)}</th><td>{e(b)}</td></tr>' for a, b in x['facts'])
    scope = ''
    # Subject and topic cells span their chapters, so the table stays short enough to keep as a table on phones.
    for s, sub in SUBJ.items():
        n_sub = sum(len(tp['chapters']) for tp in sub['topics'])
        for ti, tp in enumerate(sub['topics']):
            for ci, cid in enumerate(tp['chapters']):
                c = CH[cid]
                alias = '' if c['title'] == c['official'] else f'（本站：{e(c["title"])}）'
                head = f'<th scope="rowgroup" rowspan="{n_sub}" class="nw">{e(sub["short"])}</th>' if ti == 0 and ci == 0 else ''
                head += f'<td rowspan="{len(tp["chapters"])}">{e(tp["name"])}</td>' if ci == 0 else ''
                scope += f'<tr>{head}<td><a href="{cid}.html"><span class="tag {c["subject"]}">{e(c["code"])}</span> {e(c["official"])}</a>{alias}</td></tr>'
    links = ''.join(f'<li><a href="{u}" rel="noopener" target="_blank">{e(t)}</a></li>' for t, u in x['links'])
    tips = ''.join(f'<li>{e(t)}</li>' for t in x['tips'])
    main = f'''<main id="main" class="wrap page read"><h1>考試資訊</h1>{f'<p class="intro">{e(x["intro"])}</p>' if x["intro"] else ""}
<div class="tblwrap facts" tabindex="0" role="region" aria-label="表格，可左右捲動"><table><tbody>{rows}</tbody></table></div><p class="small muted">{e(x["checked"])}</p>
<h2 id="scope">考試範圍與本站章節</h2><div class="tblwrap facts" tabindex="0" role="region" aria-label="表格，可左右捲動"><table><thead><tr><th>科目</th><th>評鑑主題</th><th>評鑑內容</th></tr></thead><tbody>{scope}</tbody></table></div>
<h2>作答提醒</h2><ul>{tips}</ul>
<h2>官方資源</h2><ul>{links}</ul></main>'''
    page('exam.html', '考試資訊', main, 'iPAS AIoT 應用工程師初級兩個學科的考試形式、及格標準與範圍對照。')


def about():
    a = SITE['about']
    body = ''.join(f'<h2>{e(h)}</h2>' + ''.join(f'<p>{e(p)}</p>' for p in ps) for h, ps in a)
    page('about.html', '關於', f'<main id="main" class="wrap page read">{"<h1>關於</h1>"}{body}</main>', '這個網站是什麼、隱私與內容來源。')


def not_found():
    main = '<main id="main" class="wrap page"><h1>找不到這一頁</h1><p><a class="btn" href="index.html">回首頁</a></p></main>'
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
        for cid in SITE['reading']:
            if CH[cid]['subject'] == k:
                lines.append(f'- [{CH[cid]["code"]} {CH[cid]["title"]}]({SITE["url"]}{cid}.html)：{CH[cid]["summary"]}')
        lines.append('')
    lines += ['## 工具', f'- [練習題]({SITE["url"]}practice.html)', f'- [關鍵字查詢]({SITE["url"]}glossary.html)', f'- [公式、重點與容易混淆處速查]({SITE["url"]}reference.html)', f'- [考試資訊]({SITE["url"]}exam.html)', '']
    (DIST / 'llms.txt').write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    DIST.mkdir(exist_ok=True)
    for old in DIST.iterdir():
        shutil.rmtree(old) if old.is_dir() else old.unlink()
    shutil.copytree(STATIC, DIST, dirs_exist_ok=True)
    # The stylesheet's comments, indentation and the spaces around { } ; , are for editors; readers on a phone connection get it without them
    # (LF line ends on every system, so the size checked here is the size served).
    css = DIST / 'assets' / 'site.css'
    out = re.sub(r'\s*([{};,])\s*', r'\1', re.sub(r'\n\s+', '\n', re.sub(r'/\*.*?\*/', '', css.read_text(encoding='utf-8'), flags=re.S)))
    css.write_text(out, encoding='utf-8', newline='\n')
    home()
    for cid in ORDER:
        chapter(cid)
    practice(); glossary(); reference(); exam(); about(); not_found(); discovery()
    # every id in a chapter figure (markers included, phone copies too) must be unique across the site, and every internal link must resolve
    ids = re.findall(r'\sid="([^"]+)"', ''.join(x.get('svg', '') + x.get('svgm', '') for c in CH.values() for s in c['sections'] for x in [s] + s.get('figs', [])))
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        problems.append(f'duplicate svg ids within site: {sorted(dup)[:5]}')
    # Phone pictures make a page heavier for everyone: report the growth, at most 60 KB a page.
    for pg, n in sorted(PHONE_BYTES.items()):
        if n > 60 * 1024:
            problems.append(f'phone pictures add {n / 1024:.1f} KB to {pg}.html (at most 60 KB)')
    print('phone pictures:', '、'.join(f'{pg} +{n / 1024:.1f} KB' for pg, n in sorted(PHONE_BYTES.items())) or 'none')
    for f in DIST.glob('*.html'):
        for href in re.findall(r'href="([^"#:]+\.html)', f.read_text(encoding='utf-8')):
            if not (DIST / href).exists() and f.name != '404.html':
                problems.append(f'broken link {href} in {f.name}')
    print(f'built {len(list(DIST.glob("*.html")))} pages')
    print('PROBLEMS:' if problems else 'no problems')
    for p in problems:
        print(' ', p)
    # A release must not go out with known problems: CI and deploy stop on a non-zero exit.
    if problems:
        raise SystemExit(1)
