#!/usr/bin/env python3
"""Build app/data.json from docs/data/, docs/grammar/, docs/theory/ and docs/books.md.

Each docs/data/<level>-<nn>-<slug>.md becomes one ordered vocabulary category with a
list of items {id, it, es[list of accepted], note}.
Each docs/grammar/<level>-<nn>-<slug>.md becomes one ordered grammar category with a
rule line and a list of items {id, q (sentence with ___), cue, a[list of accepted], es, note};
docs/theory/<same file name> adds its theory lesson {title, lead, html}.
docs/books.md becomes the reading list, grouped by level.
The app reads this single file.
Run:  python3 scripts/build_data.py
"""
import html
import json
import re
import sys
import unicodedata
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA_DIR = BASE / "docs" / "data"
GRAMMAR_DIR = BASE / "docs" / "grammar"
THEORY_DIR = BASE / "docs" / "theory"
BOOKS = BASE / "docs" / "books.md"
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


def slug(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def inline(s: str) -> str:
    """Inline markdown subset: **bold** and *italics*; everything else is escaped."""
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    return re.sub(r"\*(.+?)\*", r"<em>\1</em>", s)


def split_cells(line: str):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def md_blocks(lines):
    """Group lines into blocks: ('h2'|'h3', text) or ('p'|'ul'|'quote'|'table', [lines])."""
    blocks, last = [], None
    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            last = None
            continue
        if line.startswith(("## ", "### ")):
            level, text = line.split(" ", 1)
            blocks.append(("h2" if level == "##" else "h3", text.strip()))
            last = None
            continue
        if line.startswith("- "):
            kind, val = "ul", line[2:].strip()
        elif line.startswith("|"):
            kind, val = "table", line
        elif line.startswith("> "):
            kind, val = "quote", line[2:].strip()
        else:
            kind, val = "p", line.strip()
        if last is not None and last[0] == kind:
            last[1].append(val)
        else:
            last = (kind, [val])
            blocks.append(last)
    return blocks


def table_html(rows) -> str:
    cells = [split_cells(r) for r in rows]
    cells = [r for r in cells if not all(set(c) <= set("-: ") for c in r)]   # drop the separator row
    head, body = cells[0], cells[1:]
    out = '<div class="tw"><table><thead><tr>' + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
    for r in body:
        out += "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>"
    return out + "</tbody></table></div>"


def theory_of(path: Path):
    """A theory lesson: '# title', a '> ' lead, then '## ' sections (each becomes a styled card)."""
    lines = path.read_text(encoding="utf-8").splitlines()
    title = next((l[2:].strip() for l in lines if l.startswith("# ")), path.stem)
    blocks = md_blocks([l for l in lines if not l.startswith("# ")])
    lead = inline(" ".join(blocks.pop(0)[1])) if blocks and blocks[0][0] == "quote" else ""
    out, open_section = [], False
    for kind, val in blocks:
        if kind == "h2":
            if open_section:
                out.append("</section>")
            out.append(f'<section class="ts ts-{slug(val)}"><h3>{inline(val)}</h3>')
            open_section = True
        elif kind == "h3":
            out.append(f"<h4>{inline(val)}</h4>")
        elif kind == "p":
            out.append(f"<p>{inline(' '.join(val))}</p>")
        elif kind == "ul":
            out.append("<ul>" + "".join(f"<li>{inline(v)}</li>" for v in val) + "</ul>")
        elif kind == "quote":
            out.append(f"<blockquote>{inline(' '.join(val))}</blockquote>")
        elif kind == "table":
            out.append(table_html(val))
    if open_section:
        out.append("</section>")
    return {"title": title, "lead": lead, "html": "".join(out)}


def build_books():
    """docs/books.md: '## <level> · <blurb>' headings, each followed by a table
    Title | Author | Year | Why this level | Curiosity. A book's id is its slugged title."""
    if not BOOKS.exists():
        return []
    levels, cur = [], None
    for n, line in enumerate(BOOKS.read_text(encoding="utf-8").splitlines(), 1):
        if line.startswith("## "):
            level, _, blurb = line[3:].partition("·")
            cur = {"level": level.strip(), "blurb": blurb.strip(), "books": []}
            levels.append(cur)
            continue
        if not line.strip().startswith("|") or cur is None:
            continue
        cells = split_cells(line)
        if cells[0].lower() == "title" or set(cells[0]) <= set("-: "):
            continue
        cells += [""] * (5 - len(cells))
        title, author, year, why, fun = cells[:5]
        if not title or not author:
            sys.exit(f"docs/books.md:{n}: a book needs a title and an author")
        cur["books"].append({"id": slug(title), "title": title, "author": author, "year": year,
                             "why": inline(why), "fun": inline(fun)})
    ids = [b["id"] for lv in levels for b in lv["books"]]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        sys.exit(f"docs/books.md: two books share a title: {dupes}")
    return levels


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
        cat = {
            "id": cid,
            "num": num,
            "level": level,
            "title": title_of(path),
            "file": path.name,
            "rule": rule_of(path),
            "items": items,
        }
        theory = THEORY_DIR / path.name
        if theory.exists():
            cat["theory"] = theory_of(theory)
        cats.append(cat)
    cats.sort(key=lambda c: c["num"])
    for c in cats:
        del c["num"]
    return cats


def levels_of(cats):
    return sorted({c["level"] for c in cats}, key=level_key)


def main():
    cats = build_vocabulary()
    gcats = build_grammar()
    books = build_books()
    out = {
        "levels": levels_of(cats),
        "categories": cats,
        "grammar": {"levels": levels_of(gcats), "categories": gcats},
        "books": books,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    total_items = sum(len(c["items"]) for c in cats)
    total_g = sum(len(c["items"]) for c in gcats)
    with_theory = sum(1 for c in gcats if "theory" in c)
    total_books = sum(len(lv["books"]) for lv in books)
    print(f"Wrote {OUT}: {len(cats)} categories, {total_items} items, levels {out['levels']}; "
          f"grammar {len(gcats)} categories ({with_theory} with theory), {total_g} sentences, "
          f"levels {out['grammar']['levels']}; {total_books} books.")


if __name__ == "__main__":
    main()
