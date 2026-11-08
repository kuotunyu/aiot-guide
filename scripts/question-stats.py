"""Question bank health: how often the longest option is the answer, per chapter.

Run: python scripts/question-stats.py [chapter-id ...]
A well-balanced bank should not reward "pick the longest option"; aim for 35% or less.
"""
import json, re, sys
from pathlib import Path

CONTENT = Path(__file__).resolve().parent.parent / 'content'


def merged():
    bank = json.loads((CONTENT / 'questions-base.json').read_text(encoding='utf-8'))
    edits, drops = {}, set()
    for f in CONTENT.glob('questions-s*.json'):
        d = json.loads(f.read_text(encoding='utf-8'))
        drops |= set(d.get('drop', []))
        edits.update(d.get('edits', {}))
        bank += d.get('add', [])
    return [{**q, **edits.get(q['id'], {})} for q in bank if q['id'] not in drops]


def longest_hit(q, skip_only=False):
    opts = list(enumerate(q['o']))
    if skip_only:
        opts = [(k, o) for k, o in opts if not re.match(r'^(只|僅)', o)] or opts
    n = max(len(o) for _, o in opts)
    top = [k for k, o in opts if len(o) == n]
    return len(top) == 1 and top[0] == q['a']


qs = merged()
want = sys.argv[1:]
by = {}
for q in qs:
    if want and q['lesson'] not in want:
        continue
    by.setdefault(q['lesson'], []).append(q)
tot = hit = hit2 = 0
for ch in sorted(by):
    xs = by[ch]
    h = sum(longest_hit(q) for q in xs)
    h2 = sum(longest_hit(q, True) for q in xs)
    tot += len(xs); hit += h; hit2 += h2
    print(f'{ch}: {len(xs):3d} 題  最長即正解 {h / len(xs):5.0%}  排除只／僅後 {h2 / len(xs):5.0%}  沒有小節連結 {sum(1 for q in xs if not q.get("sec"))}')
if tot:
    print(f'合計 {tot} 題  最長即正解 {hit / tot:.0%}  排除只／僅後 {hit2 / tot:.0%}')
    xs = [q for v in by.values() for q in v]
    print(f'有選項短評 w {sum(1 for q in xs if q.get("w"))} 題  有解題線索 tip {sum(1 for q in xs if q.get("tip"))} 題')
