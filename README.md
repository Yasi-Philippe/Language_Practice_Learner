# Language_Practice_Learner

A small, personal app for memorizing **Italian** vocabulary and expressions by translating them into **Spanish (Spain)** — and for drilling Italian **grammar** with gap-fill sentences. It learns through trial and error — repetition, weighted toward what you get wrong. Built for domestic use, not deployment, and highly customizable.

It does **not** teach the basics of Italian (grammar rules, pronunciation) — you learn those elsewhere ([the roadmap](docs/learning-roadmap.md) says what, level by level). This app is a **memorization sustain**: it drills you and keeps bringing back what you fail.

## A look at it

| Your path | A word to translate | Your stats |
| :---: | :---: | :---: |
| ![Home screen showing the category path, progress and level](pictures/home.png) | ![Drill screen: an Italian word to translate into Spanish](pictures/drill.png) | ![Stats screen: time per category and tricky words](pictures/stats.png) |

---

## Any language pair

This build was made with an **Italian → Spanish** connection in mind, but nothing in the app is tied to those two languages. The vocabulary is just categorized word lists in `docs/data/`, so an **LLM can regenerate the whole set for any language pair** (e.g. German → English, Japanese → French) in the same format — and the app runs unchanged.

---

## How it works (short version)

1. The app shows an Italian word or expression.
2. You type its meaning in Spanish. Checking is **forgiving** — multiple accepted answers, and case/accents/small typos are ignored.
3. If you're right, the Italian hides and you type it **back** from memory (a spelling drill) to advance.
4. Failed words come back more often. You go through categories in order; every 3 categories, two **review rounds** reinforce older words — a normal one (most-missed + random) and a **reverse** one (Spanish → Italian, strict). Review rounds repeat until you clear them in one clean pass, just like categories.
5. **Overrides.** Don't know a word? *I don't know* marks it missed. Sure you were right? *I had it right* cancels that fail and passes the word — without changing the stored answers.
6. A **cumulative timer** tracks your total training time, capped at 30 s per word so idle time never inflates it.
7. **Extra** practice sets sit off the main path (first one: Numbers 0–100), and a **Stats** page shows time per category, tries-to-pass, and your tricky words.
8. **Grammar** is a second path (the **Vocabulary | Grammar** switch on home): an Italian sentence with a gap, a cue and the Spanish meaning — type the missing form (*Ieri Giulia ___ al mare* · *andare* → **è andata**). Checked strictly (accents count), same refill / review / override rules, its own progress; the second checkpoint round hides the cue (**no hints**).

The full algorithm — categories, both review rounds, recovery/reset, skip conditions, overrides, the AFK-capped timer, extra categories and the grammar track — lives in **[docs/app-concept.md](docs/app-concept.md)**.

---

## Your data

Everything you do is stored **only in your browser on that device** (`localStorage`) — no server, no account, nothing uploaded or shared. Each person who opens the link gets their own independent progress.

- **Stats → Export backup / Import backup** saves your progress to a JSON file and restores it (e.g. on a new phone) — fully manual.
- **Backups from before grammar still import.** They restore your vocabulary progress and leave any grammar progress on the device as it is. Updating the app keeps your progress too: vocabulary stays where it always was, grammar is stored alongside it.
- The app requests **persistent storage** so the browser won't auto-evict your data.
- Clearing the browser's site data or uninstalling still wipes it, so export a copy now and then.

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

> **Item ids are positional** (category number + row), and your fail counts are stored under them. Once a category file has shipped, **don't insert, delete or reorder its rows** — fix typos in place and add new words at the end — or the stored progress lands on the wrong words.

---

## The grammar

- **Categories** follow [docs/learning-roadmap.md](docs/learning-roadmap.md) by CEFR level — **A1 and A2 so far: 30 categories, 600 sentences**. List: **[docs/grammar-categories.md](docs/grammar-categories.md)**.
- Per-category files: **[docs/grammar/](docs/grammar/)** — a one-line rule reminder (`> ` line) plus a table `Italian (one ___ gap) | Cue | Answer (accepted) | Spanish | Notes`.
- The Spanish translation is written so that, even with the cue hidden, it settles which form goes in the gap.
- Same id rule as vocabulary: don't insert, delete or reorder rows in a shipped file.

---

## Project layout

```
Language_Practice_Learner/
├── README.md                 ← you are here
├── app/                      the PWA (serve this folder)
│   ├── index.html
│   ├── styles.css
│   ├── app.js                UI + drill logic
│   ├── data.json             generated vocabulary + grammar (from docs/data, docs/grammar)
│   ├── manifest.webmanifest
│   ├── sw.js                 offline service worker
│   └── icon-192.png, icon-512.png   home-screen icons
├── docs/
│   ├── app-concept.md        functionality & algorithm
│   ├── categories.md         master category list (by CEFR level)
│   ├── grammar-categories.md master grammar category list
│   ├── learning-roadmap.md   grammar concepts per CEFR level
│   ├── dictionary.md         auto-generated index of all Italian terms
│   ├── data/                 per-category word files (a1-01-numbers.md, …)
│   └── grammar/              per-category sentence files (a1-01-definite-articles.md, …)
└── scripts/
    ├── build_dictionary.py   regenerates docs/dictionary.md
    └── build_data.py         regenerates app/data.json (vocabulary + grammar, validates the grammar tables)
```

---

## Status

- **Data:** A1, A2 and B1 complete, B2 in progress — **50 categories, 1,500 terms** so far (0 duplicates). More B2+ themes still to add.
- **App:** **built** — a no-build PWA in [app/](app/): category trail (sequential unlock), progress %, level badge, AFK-capped timer, the drill loop with forgiving checking + reverse-spelling, **review rounds** every 3 categories *plus a reverse round* (Spanish→Italian, strict), recovery/reset, **I don't know** / **I had it right** overrides, **Extra categories** (off-path practice; first: Numbers 0–100), and a **Stats** page (time per category, attempts-to-pass, tricky words). Theme toggle on every screen. All saved locally.
- **Grammar:** a second path in the app — **A1 and A2 complete (30 categories, 600 gap-fill sentences)**, plus two grammar Extra sets (prepositions + articles, irregular participles). B1+ next. [docs/learning-roadmap.md](docs/learning-roadmap.md) lists the concepts to study per CEFR level.

## Running it

It's a static PWA — regenerate the data, then serve the `app/` folder:

```bash
python3 scripts/build_data.py                 # rebuild app/data.json after editing vocabulary or grammar
python3 -m http.server 8137 --directory app   # then open http://localhost:8137
```

On Android, host `app/` (e.g. GitHub Pages) and use **Add to Home Screen** to install it offline.

## Stack

A **PWA** (installable, offline) — runs on Android from the home screen, no server needed. Built as a **no-build PWA** (plain HTML/CSS/JS, zero toolchain) with the vocabulary shipped as a local `data.json`. See [docs/app-concept.md](docs/app-concept.md) for the reasoning.
