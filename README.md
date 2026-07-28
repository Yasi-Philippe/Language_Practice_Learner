# Language_Practice_Learner

A small, personal app for memorizing **Italian** vocabulary and expressions by translating them into **Spanish (Spain)**. It learns through trial and error — repetition, weighted toward the words you get wrong. Built for domestic use, not deployment, and highly customizable.

It does **not** teach the basics of Italian (grammar, rules, pronunciation) — you learn those elsewhere. This app is a **memorization sustain**: it drills you and keeps bringing back what you fail.

## Any language pair

This build was made with an **Italian → Spanish** connection in mind, but nothing in the app is tied to those two languages. The vocabulary is just categorized word lists in `docs/data/`, so an **LLM can regenerate the whole set for any language pair** (e.g. German → English, Japanese → French) in the same format — and the app runs unchanged.

---

## How it works (short version)

1. The app shows an Italian word or expression.
2. You type its meaning in Spanish. Checking is **forgiving** — multiple accepted answers, and case/accents/small typos are ignored.
3. If you're right, the Italian hides and you type it **back** from memory (a spelling drill) to advance.
4. Failed words come back more often. Categories are worked through in order, and every 3 categories a **review round** reinforces what you've missed.
5. **You can correct the app.** If a word is marked wrong but your answer was actually valid, accept it — the fail is removed and your answer is saved as a new accepted translation.
6. A **cumulative timer** tracks your total training time across every category, so you can see how many hours you've put in.

The full algorithm — categories, review rounds, recovery/reset rules, skip conditions, self-correction, and the training timer — lives in **[docs/app-concept.md](docs/app-concept.md)**.

---

## The vocabulary

- Organized into **categories** (colors, food, emotions…), ordered by **CEFR level** (A1 → A2 → B1 → B2+). Level order doubles as difficulty order.
- Each category holds ~30 items; categories over 30 split into subcategories.
- Target Spanish variety: **peninsular (Spain)** — `zumo`, `vaqueros`, `coche`, `fontanero`, etc.
- Category list: **[docs/categories.md](docs/categories.md)**.
- Per-category data files: **[docs/data/](docs/data/)** — one markdown table each (`Italian | Spanish (accepted) | Notes`).

### The dictionary (no duplicates)

**[docs/dictionary.md](docs/dictionary.md)** is an auto-generated, alphabetical master list of every Italian term, used to avoid adding the same word twice. It is built by a script and should **not** be edited by hand:

```bash
python3 scripts/build_dictionary.py
```

Re-run it after changing any category file. It rebuilds the dictionary and flags any duplicates at the top. Rule when a duplicate appears: keep the word in the older category, remove it from the new one, and swap in a fresh word.

---

## Project layout

```
Language_Practice_Learner/
├── README.md                 ← you are here
├── docs/
│   ├── app-concept.md        functionality & algorithm
│   ├── categories.md         master category list (by CEFR level)
│   ├── dictionary.md         auto-generated index of all Italian terms
│   └── data/                 per-category word files (a1-01-numbers.md, …)
└── scripts/
    └── build_dictionary.py   regenerates docs/dictionary.md
```

---

## Status

- **Data:** A1, A2 and B1 complete, B2 in progress — **50 categories, 1,500 terms** so far (0 duplicates). More B2+ themes still to add.
- **App:** not built yet. Current phase is gathering and curating the vocabulary.

## Planned stack

A **PWA** (installable, offline web app) — reuses web skills, runs on Android from the home screen, no server needed. Likely Vite + Svelte, with the vocabulary shipped as a local SQLite/JSON store. See [docs/app-concept.md](docs/app-concept.md) for the reasoning.
