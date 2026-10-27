# Language Practice Learner — App Concept

This document captures **how the app works** — its functionality, algorithm, and logic.
It does **not** contain the vocabulary data (see `categories.md` and the per-category data files).

---

## 1. Purpose

A personal drill app to memorize **Italian** vocabulary and expressions by translating them into **Spanish** — and, on a second path, to make Italian **grammar** automatic with gap-fill sentences (§12), each grammar category opening with a short **theory** lesson (§13). A **reading list** by level (§14) points to real Italian books.

Memory stays the primary goal: the app is a **memorization sustain**, built on retrieval practice + repetition, weighted toward the things you get wrong. The theory is there so the drilling has something to stick to — short, comparative (Italian vs Spanish), never a textbook. Pronunciation and deeper study live elsewhere ([learning-roadmap.md](learning-roadmap.md)).

---

## 2. Core loop

1. The app shows an Italian **word or expression**.
2. The user types its meaning in **Spanish**.
3. The app checks the answer (forgiving — see §6) and records it pass / fail.
4. **Reverse spelling.** If the Spanish was correct, the Italian word is **hidden**. With only the typed Spanish visible, the user must type the **Italian** word back to advance — a quick spelling drill. Retry until it's right; this step **gates advancement but does not change the pass/fail score** (the score is set by the Spanish answer in step 2). Spelling matters here — **only capitalization is ignored; accents and everything else must be typed exactly** (accents are part of Italian spelling).
5. The next item appears. **Failed items are more likely to come back.**

Direction for scoring is always **Italian → Spanish** (see the Italian, recall the meaning); the reverse-spelling step only reinforces how the Italian word is written.

---

## 3. Content units

- **Words** — the majority.
- **Expressions** — occasional (idioms, fixed phrases). Mixed in from time to time.
- Everything is grouped into **categories** (themes: colors, food, emotions…), ordered by **CEFR level** (A1 → A2 → B1 → B2+). See `categories.md`.
- Each category holds **~30 items**.
- If a category has **more than 30** items, it splits into **subcategories** (no strict logic to the split).

---

## 4. Progression

- The user works through categories **in order**.
- To **complete** a category, the user must correctly answer **all ~30 items**.
- **On any failure within a category, the whole category refills** — every item, including ones already answered correctly. This is deliberate over-learning through repetition.
- Throughout, the app records **fails per item**.

---

## 5. Checkpoint (review round)

After every **3 completed categories**, a review round runs. It reinforces earlier material.

**Skip condition:** if the user currently has **no failed words** (nothing with a fail count above 0), the review round is **skipped entirely** — there's nothing to reinforce, so a clean run is rewarded by skipping it.

- It contains **20 items**:
  - **10** = the **most-failed** items so far (across all past categories).
  - **10** = **random** items **from words already seen** (past/completed categories only — never future ones), any fail count including zero.
- Rules:
  - **No duplicates** — the 10 random items must not already appear in the 10 failed.
  - **Ties** in fail count → choose at random among the tied items.
  - If fewer than 10 never-failed items exist, fill from items with **0 current errors** (random among them).
  - Early on, if there aren't even 10 failed items yet, backfill the remainder from random.

**Recovery — clearing a word's fail history:**
- In a review round, if a word from the **most-failed** group is answered **correctly on the first attempt**, it earns a **recovery mark**.
- The **second** recovery mark (first-attempt-correct again in a *later* review round) **resets that word's fail count to 0** — the word is considered relearned and leaves the most-failed pool.

**Reverse round (second checkpoint round):** immediately after each review round, a second **reverse** round runs — **20 random already-seen words** (fail count ignored), shown in **Spanish** for the user to type in **Italian**, checked **strictly** (only capitalization forgiven). It records nothing — pure production practice — and runs even if the normal review was skipped.

**Both review rounds behave like categories:** any miss **refills the whole 20-word set**, and you repeat until you clear it in one clean pass. (The normal round still records fails and awards recovery marks on first-attempt-correct — first pass only; the reverse round records nothing, so the refill alone drives the repetition.)

---

## 6. Answer checking (forgiving)

- Each item stores **multiple accepted Spanish answers** (synonyms and variants).
- Checking **ignores case, accents, and small typos**.
- Goal: **never fail a correct answer** — a false "fail" pollutes the fail data that drives everything else.

---

## 7. What counts as a "fail" (working definition)

- An item is **failed** if the **first** answer given for it in a round is not accepted.
- Fail counts are **cumulative across all time**, and drive both:
  - reappearance probability within a category, and
  - the most-failed ranking used by the checkpoint.

*(Open to revision.)*

---

## 8. Overrides — "I don't know" and "I had it right"

Two buttons let the user steer a fail:

- **"I don't know"** (before checking) — the user skips typing; the item is marked **failed**. Cleaner than typing a wrong guess on purpose.
- **"I had it right"** (after a wrong verdict) — the user overrides the miss. It **does not change the vocabulary data** (nothing is added to the accepted answers — the earlier "edit the data" idea was dropped). It only:
  1. counts the item as **correct for this round** (so it won't trigger a refill), and
  2. **cancels the fail** that would otherwise be recorded (prior history is kept; no new fail is added).
  It doubles as an escape hatch when our stored answer is too strict, and as a way to move past a word when tired of repeating it.
  - Available in categories and both review rounds (**including the reverse round** — there it just passes the word, since that round records no fails). Not offered in extra categories.

---

## 9. Training timer

A single cumulative timer tracks total training time.

- Whenever the user is **inside a category** (actively drilling), the timer runs. It also runs during review rounds.
- The timer **never resets**: when the user opens the next category, it **continues from where it left off**. It is one ever-growing total across the whole life of the app — not per-session or per-category.
- Purpose: let the user see how long they've trained overall (e.g. *"I've trained vocabulary for 300 hours"*).
- **AFK cap:** time is measured per screen and capped at **30 seconds** per item. If more than 30s pass on one word (user stepped away), only 30s is counted.

---

## 10. Extra categories

Optional practice sets **off the main path** (reached via the **Extra** button on home, or from Stats). Doable anytime, any order.

- Their words **do not** count toward level, progress %, the fail list, or review rounds.
- Their **time does** count (the timer is universal) and appears in Stats like any category.
- Stats keeps a short **history** per set (attempts, and best **first-pass** score).
- Missed words in extra sets are tracked in a **separate tricky-words list** (Stats → *Extra · tricky words*), **fully independent** of the main fail list and review rounds.
- **Completion — whittle-down:** go through all items once; the ones you miss come back as the next pass (only those), then only *their* misses, and so on until every one is right. Not a full refill like categories — only the misses carry forward. (E.g. 100 → miss 20 → miss 6 → … → 0.)
- Sets: **Numbers 0–100** (digits → Italian), **Days of the week**, and **Months & seasons** (both Spanish → Italian). All typed in Italian, strict (only capitalization forgiven).
- Grammar sets (listed under their own heading, recorded with the grammar progress): **Prepositions + articles** (*di + il → del* … the full 35-form grid) and **Irregular past participles** (*fare → fatto*, 40 verbs).

---

## 11. Personal categories ("My words")

The user's **own** categories, reached via the **Mine** button on home — for words met day to day.

- **Create** a named category; **add words** fast (Italian + Spanish meaning, comma = synonyms); a category can always take more words later.
- **Revise:** drills like the normal loop (Italian → type Spanish → retype Italian), with the **I had it right** override available.
- **Soft or Hard, chosen per category** (toggle on the category): *Soft* = only the words you miss come back (whittle-down); *Hard* = any miss redoes the whole set (like a main category).
- **Local & separate:** they do **not** affect level, progress %, the main fail list, or the review rounds. Training time still counts toward the total. Stored on the device and included in Export/Import.

---

## 12. Grammar track

A second path next to vocabulary — a **Vocabulary | Grammar** switch on home (and on Stats) picks which one you see. Same ideas, applied to structure instead of words.

- **Item = one Italian sentence with a gap**, a **cue** for what goes in it (*andare · io*, *su + il*, *mio*… — sometimes none), and the **Spanish** meaning of the whole sentence. Type the missing form in Italian.
  - e.g. *Ieri Giulia ___ al mare.* · cue *andare* · *Ayer Giulia fue a la playa.* → **è andata**
- **Checking: strict like Italian spelling** — accents count (*è* ≠ *e*, *parlò* ≠ *parlo*). Forgiven: capitals, curly vs straight apostrophes, extra spaces, stray end punctuation. Each item can list several accepted answers. A miss that only gets the accents wrong says so.
- **After every answer** the sentence is shown complete, with a short note on the rule (no retype step — the answer was already typed in Italian).
- **Categories** follow the roadmap by CEFR level (list: [grammar-categories.md](grammar-categories.md)), ~20 sentences each. Each shows a **one-line rule reminder** on its card, and opens with its **theory lesson** the first time (§13).
- **Progression, refill, fails, recovery marks, overrides and the timer work exactly as in vocabulary** (§4–§9): in order; any miss refills the whole category; *I don't know* / *I had it right*; checkpoints every 3 categories.
- **Checkpoint rounds:** the **review** round is the same (10 most-missed + 10 random seen sentences, records fails, awards recovery marks; skipped if there are no grammar fails). The second round is **no hints** instead of reverse: 20 random seen sentences with the **cue hidden** — only the Spanish to go on. Records nothing; repeats until a clean pass.
- **Separate progress:** grammar has its own completed list, fails, level, %, review rounds, time per category and extra-set history. Vocabulary is never touched by grammar and vice versa. The **timer is shared** — one total of training time.
- In review rounds each sentence is labelled with its topic (*Passato prossimo with essere*…).

---

## 13. Grammar theory

Every grammar category has a short lesson (~300 words, `docs/theory/`), written for a Spanish speaker. Not a textbook: the point is to give the drill a hook to hang on.

- **Theory first.** The first time a category becomes current, its card says **Start with the theory**; the lesson ends with **Start drilling**. Afterwards the card offers **Start drilling** plus a **Theory** button, and every completed grammar step keeps a **Theory** button on the path.
- **Same six sections, always in this order** — each a colored card:
  1. **La regola** — the rule, usually as a compact table;
  2. **Come in spagnolo** — what transfers straight from Spanish;
  3. **Diverso dallo spagnolo** — what doesn't;
  4. **Occhio!** — the traps a Spanish speaker falls into;
  5. **Curiosità** — a real story behind the rule (history, etymology, literature);
  6. **Il trucco** — one memory trick.
- **During a drill** a book button opens the theory of the sentence on screen; **Back to the drill** returns to the exact same question and verdict.
- Reading counts as training time for that category. Scrolling shows you're still there: up to 90 s are counted between scrolls (vs 30 s per item in drills), so an open lesson left alone doesn't inflate the clock.

---

## 14. Books

A reading list by level, **A1 → C2**, of books originally written in Italian (`docs/books.md`), in the recommended order within each level: comics and nursery rhymes at A1, Rodari's short stories at A2, first novels (Calvino, Baricco, Ammaniti) at B1, up to Manzoni, Dante and Gadda at C2.

- Each book shows its author and year, **why it suits that level**, and a curiosity.
- Tap to cycle a book's status: *to read → reading → read*. The shelf matching your **vocabulary working level** is marked **You are here**.
- Off the path like Extra: no effect on levels or the fail list. Stored with the rest of the progress and included in backups.

---

## 15. Screens

- A floating bar at the bottom reaches the five main screens: **Path** (vocabulary or grammar, by the switch), **Extra**, **Mine**, **Books**, **Stats**. Drills and theory hide it, to keep the focus.
- **Path:** a hero card with the progress %, the level and the hours trained; completed steps fold into one line ("11 steps completed · show") so the current step sits right below it, followed by the steps still locked, grouped by level.
- Each area has its own accent color: vocabulary terracotta, grammar *azzurro*, books olive. Light and dark themes (the button top-right cycles light / dark / system); the phone's status bar follows the page color.

---

## 16. Your data & backups

- Everything is one JSON object in the browser (`localStorage`, key `lpl-state-v1`); **Export backup** saves exactly that object.
- **Vocabulary progress stays at the root** of that object, in the same fields it always had. Every later addition is a new field next to it: **`grammar`** (same shape as the root, plus `theoryRead`, which lessons have been opened) and **`books`** (reading status per book). So:
  - Updating the app on the same device keeps all progress — nothing is migrated or renamed.
  - **Older backups import as they are.** Whatever a backup predates stays as it is on the device: a pre-grammar backup restores the vocabulary and keeps this device's grammar (adding its training time to the restored total), its theory flags and its reading list; a backup from the grammar release keeps this device's theory flags and reading list.
  - A newer backup imported into an older version of the app still shows the progress that version knows, and keeps the newer fields untouched when it saves.
- Item ids are **positional** — `<category>-<row>` (vocabulary) and `g<category>-<row>` (grammar) — and the fail counts are stored under them. **Never insert, delete or reorder rows** in a shipped category file; fix typos in place and add new items at the end. Books are stored under their **title** — don't rename a title once marked.

---

## 17. Out of scope

- Pronunciation, and grammar beyond what the short theory lessons cover — the roadmap lists what to study elsewhere.
- Multiple choice — answers are always **typed**.
