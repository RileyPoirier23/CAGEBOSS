"""Tiny DSL for authoring storylets in Python; writes JSON into data/storylets/."""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
_ALL = {}


def F(where='true', prefer=None, t='fighter'):
    r = {"type": t, "where": where}
    if prefer:
        r["prefer"] = prefer
    return r


def R(where='true', prefer=None):
    return F(where, prefer, 'reporter')


def RIV(where='true'):
    return F(where, None, 'rival')


def SP(where='true'):
    return F(where, None, 'sponsor')


def LEG(where='true', prefer=None):
    return F(where, prefer, 'legend')


def FA(where='true', prefer=None):
    return F(where, prefer, 'freeAgent')


def CH(where='true'):
    return F(where, None, 'champ')


def sc(type_, text, speaker=None, portrait=None, title=None):
    o = {"type": type_, "text": text}
    if speaker:
        o["speaker"] = speaker
    if portrait:
        o["portrait"] = portrait
    if title:
        o["title"] = title
    return o


def phone(text, speaker=None, portrait=None):
    return sc('phone', text, speaker, portrait)


def visit(text, speaker=None, portrait=None):
    return sc('visit', text, speaker, portrait)


def doc(text, title=None):
    return sc('doc', text, None, None, title)


def memo(text, title=None):
    return sc('memo', text, 'The Board', None, title)


def C(label, *effects, result=None, if_=None, tone=None, bot=0, ethics=0, default=False):
    o = {"label": label, "effects": list(effects)}
    if result:
        o["result"] = result
    if if_:
        o["if"] = if_
    if tone:
        o["tone"] = tone
    if bot:
        o["bot"] = bot
    if ethics:
        o["ethics"] = ethics
    if default:
        o["default"] = True
    return o


def S(file, id, title, cat, scenes, choices, roles=None, cond=None, weight=10, cd=26, once=False, acts=None, chain=None,
      fu=False, vars=None, tags=None):
    o = {"id": id, "title": title, "category": cat, "scenes": scenes, "choices": choices}
    if roles:
        o["roles"] = roles
    if cond:
        o["conditions"] = cond
    if weight != 10:
        o["weight"] = weight
    if cd != 26:
        o["cooldownWeeks"] = cd
    if once:
        o["oncePerCareer"] = True
    if acts:
        o["acts"] = acts
    if chain:
        o["chain"] = chain
    if fu:
        o["followupOnly"] = True
    if vars:
        o["vars"] = vars
    if tags:
        o["tags"] = tags
    if id in _ALL:
        raise SystemExit("duplicate storylet id: " + id)
    _ALL[id] = file
    _FILES.setdefault(file, []).append(o)
    return o


_FILES = {}


def write():
    out = os.path.join(ROOT, 'data', 'storylets')
    os.makedirs(out, exist_ok=True)
    total = 0
    for f, items in _FILES.items():
        json.dump(items, open(os.path.join(out, f + '.json'), 'w'), indent=1, ensure_ascii=False)
        total += len(items)
    chains = len({s.get('chain') for items in _FILES.values() for s in items if s.get('chain')})
    print(f"wrote {total} storylets in {len(_FILES)} files; {chains} chains")


# common money expressions (scale = business size multiplier)
def money(lo, hi):
    return f"rand({lo}, {hi}) * 1000 * scale"
