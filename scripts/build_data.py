#!/usr/bin/env python3
"""Build app/data.json from the per-category data files in docs/data/ and docs/grammar/.

Each docs/data/<level>-<nn>-<slug>.md becomes one ordered vocabulary category with a
list of items {id, it, es[list of accepted], note}.
Each docs/grammar/<level>-<nn>-<slug>.md becomes one ordered grammar category with a
rule line and a list of items {id, q (sentence with ___), cue, a[list of accepted], es, note}.
The app reads this single file.
Run:  python3 scripts/build_data.py
"""
import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA_DIR = BASE / "docs" / "data"
GRAMMAR_DIR = BASE / "docs" / "grammar"
OUT = BASE / "app" / "data.json"

NAME_RE = re.compile(r"^([abc][12])-(\d+)-")   # level + global order number
GAP = "___"


def level_key(level: str) -> int:
    return ("A", "B", "C").index(level[0]) * 10 + int(level[1])


def title_of(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem


def rule_of(path: Path) -> str:
    """The one-line rule reminder: the first '> ' line of a grammar file."""
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("> "):
            return line[2:].strip()
    return ""


def table_rows(path: Path):
    """Yield (line number, cells) for every data row of the markdown table."""
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if not cells or not cells[0]:
            continue
        if cells[0].lower() == "italian":                 # header row
            continue
        if set(cells[0]) <= set("-: "):                   # separator row
            continue
        yield n, cells


def rows(path: Path):
    for _, cells in table_rows(path):
        it = cells[0]
        es_raw = cells[1] if len(cells) > 1 else ""
        note = cells[2] if len(cells) > 2 else ""
        accepted = [a.strip() for a in es_raw.split(",") if a.strip()]
        yield it, accepted, note


def grammar_rows(path: Path):
    """Grammar table: Italian (one ___ gap) | Cue | Answer (accepted) | Spanish | Notes."""
    for n, cells in table_rows(path):
        cells += [""] * (5 - len(cells))
        q, cue, ans_raw, es, note = cells[:5]
        where = f"{path.relative_to(BASE)}:{n}"
        if q.count(GAP) != 1:
            sys.exit(f"{where}: the sentence needs exactly one {GAP} gap — {q!r}")
        accepted = [a.strip() for a in ans_raw.split(",") if a.strip()]
        if not accepted:
            sys.exit(f"{where}: no accepted answer — {q!r}")
        if not es:
            sys.exit(f"{where}: missing the Spanish translation — {q!r}")
        yield q, cue, accepted, es, note


def build_vocabulary():
    cats = []
    for path in sorted(DATA_DIR.glob("*.md")):
        m = NAME_RE.match(path.name)
        if not m:
            continue
        level, num = m.group(1).upper(), int(m.group(2))
        items = []
        for i, (it, accepted, note) in enumerate(rows(path)):
            items.append({
                "id": f"{num}-{i}",
                "it": it,
                "es": accepted,
                "note": note or "",
            })
        cats.append({
            "id": num,
            "level": level,
            "title": title_of(path),
            "file": path.name,
            "items": items,
        })
    cats.sort(key=lambda c: c["id"])
    return cats


def build_grammar():
    cats, seen = [], {}
    for path in sorted(GRAMMAR_DIR.glob("*.md")):
        m = NAME_RE.match(path.name)
        if not m:
            continue
        level, num = m.group(1).upper(), int(m.group(2))
        cid = f"g{num}"                                    # string ids never collide with vocabulary ones
        items = []
        for i, (q, cue, accepted, es, note) in enumerate(grammar_rows(path)):
            if q in seen:
                print(f"warning: duplicate sentence in {path.name} and {seen[q]}: {q!r}")
            seen[q] = path.name
            items.append({
                "id": f"{cid}-{i}",
                "q": q,
                "cue": cue,
                "a": accepted,
                "es": es,
                "note": note,
            })
        cats.append({
            "id": cid,
            "num": num,
            "level": level,
            "title": title_of(path),
            "file": path.name,
            "rule": rule_of(path),
            "items": items,
        })
    cats.sort(key=lambda c: c["num"])
    for c in cats:
        del c["num"]
    return cats


def levels_of(cats):
    return sorted({c["level"] for c in cats}, key=level_key)


def main():
    cats = build_vocabulary()
    gcats = build_grammar()
    out = {
        "levels": levels_of(cats),
        "categories": cats,
        "grammar": {"levels": levels_of(gcats), "categories": gcats},
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    total_items = sum(len(c["items"]) for c in cats)
    total_g = sum(len(c["items"]) for c in gcats)
    print(f"Wrote {OUT}: {len(cats)} categories, {total_items} items, levels {out['levels']}; "
          f"grammar {len(gcats)} categories, {total_g} sentences, levels {out['grammar']['levels']}.")


if __name__ == "__main__":
    main()
