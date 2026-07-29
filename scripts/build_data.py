#!/usr/bin/env python3
"""Build app/data.json from the per-category data files in docs/data/.

Each docs/data/<level>-<nn>-<slug>.md becomes one ordered category with a list
of items {id, it, es[list of accepted], note}. The app reads this single file.
Run:  python3 scripts/build_data.py
"""
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA_DIR = BASE / "docs" / "data"
OUT = BASE / "app" / "data.json"

NAME_RE = re.compile(r"^([ab][12])-(\d+)-")   # level + global order number


def title_of(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem


def rows(path: Path):
    for line in path.read_text(encoding="utf-8").splitlines():
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
        it = cells[0]
        es_raw = cells[1] if len(cells) > 1 else ""
        note = cells[2] if len(cells) > 2 else ""
        accepted = [a.strip() for a in es_raw.split(",") if a.strip()]
        yield it, accepted, note


def main():
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
    levels = sorted({c["level"] for c in cats}, key=lambda l: ("A", "B").index(l[0]) * 10 + int(l[1]))
    out = {"levels": levels, "categories": cats}

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    total_items = sum(len(c["items"]) for c in cats)
    print(f"Wrote {OUT}: {len(cats)} categories, {total_items} items, levels {levels}.")


if __name__ == "__main__":
    main()
