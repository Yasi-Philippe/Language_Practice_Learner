#!/usr/bin/env python3
"""Build docs/dictionary.md from the per-category data files in docs/data/.

Lists every Italian term alphabetically with the category it came from, and
flags duplicates so we don't add the same word twice.
Re-run after changing any category file:  python3 scripts/build_dictionary.py
"""
import unicodedata
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent          # project root
DATA_DIR = BASE / "docs" / "data"
OUT = BASE / "docs" / "dictionary.md"


def strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def norm(s: str) -> str:
    """Normalized key for sorting / duplicate detection."""
    return strip_accents(s.strip().lower())


def category_of(path: Path) -> str:
    for line in path.read_text(encoding='utf-8').splitlines():
        if line.startswith('# '):
            return line[2:].strip()
    return path.stem


def italian_terms(path: Path):
    terms = []
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line.startswith('|'):
            continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        first = cells[0] if cells else ''
        if not first:
            continue
        if first.lower() == 'italian':          # header row
            continue
        if set(first) <= set('-: '):            # separator row
            continue
        terms.append(first)
    return terms


def main():
    entries = []                                 # (term, category)
    for path in sorted(DATA_DIR.glob('*.md')):
        cat = category_of(path)
        for term in italian_terms(path):
            entries.append((term, cat))

    seen, dups = {}, {}
    for term, cat in entries:
        key = norm(term)
        if key in seen:
            dups.setdefault(key, [seen[key]]).append((term, cat))
        else:
            seen[key] = (term, cat)

    entries.sort(key=lambda e: norm(e[0]))

    out = []
    out.append('# Dictionary — all Italian terms')
    out.append('')
    out.append('Auto-generated from `docs/data/*.md` by `scripts/build_dictionary.py`. '
               '**Do not edit by hand** — re-run the script after changing categories.')
    out.append('')
    out.append(f'Total terms: **{len(entries)}** · unique: **{len(seen)}**')
    out.append('')
    if dups:
        out.append('## ⚠️ Duplicates (same word in more than one place)')
        out.append('')
        for key in sorted(dups):
            out.append('- ' + '; '.join(f'{t} ({c})' for t, c in dups[key]))
        out.append('')
    out.append('## All terms (A–Z)')
    letter = None
    for term, cat in entries:
        this = (norm(term)[:1] or '#').upper()
        if this != letter:
            letter = this
            out.append('')
            out.append(f'**{letter}**')
            out.append('')
        out.append(f'- {term} — {cat}')
    OUT.write_text('\n'.join(out) + '\n', encoding='utf-8')
    print(f'Wrote {OUT}: {len(entries)} terms, {len(dups)} duplicate group(s).')


if __name__ == '__main__':
    main()
