# Language Practice Learner — App Concept

This document captures **how the app works** — its functionality, algorithm, and logic.
It does **not** contain the vocabulary data (see `categories.md` and the per-category data files).

---

## 1. Purpose

A personal drill app to memorize **Italian** vocabulary and expressions by translating them into **Spanish**.

It does **not** teach the basics of Italian (grammar, rules, pronunciation) — the user learns those elsewhere. This app is a **memorization sustain**, built on retrieval practice + repetition, weighted toward the things you get wrong.

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

---

## 11. Out of scope

- Teaching grammar, rules, or pronunciation basics.
- Multiple choice — answers are always **typed**.
