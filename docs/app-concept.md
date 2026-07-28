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
4. **Reverse spelling.** If the Spanish was correct, the Italian word is **hidden**. With only the typed Spanish visible, the user must type the **Italian** word back to advance — a quick spelling drill. Retry until it's right; this step **gates advancement but does not change the pass/fail score** (the score is set by the Spanish answer in step 2). Spelling matters here (case/accents may be forgiven, but the letters must be right).
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
  - **10** = **random** items from the whole pool (any fail count, including zero).
- Rules:
  - **No duplicates** — the 10 random items must not already appear in the 10 failed.
  - **Ties** in fail count → choose at random among the tied items.
  - If fewer than 10 never-failed items exist, fill from items with **0 current errors** (random among them).
  - Early on, if there aren't even 10 failed items yet, backfill the remainder from random.

**Recovery — clearing a word's fail history:**
- In a review round, if a word from the **most-failed** group is answered **correctly on the first attempt**, it earns a **recovery mark**.
- The **second** recovery mark (first-attempt-correct again in a *later* review round) **resets that word's fail count to 0** — the word is considered relearned and leaves the most-failed pool.

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

## 8. Correcting a wrong "fail" (user override)

We accept that our stored answers may be incomplete or wrong, so the user can fix them on the spot.

- After an item is marked **failed**, the user gets an option: **"I was right — accept my answer."**
- If they confirm, the app:
  1. **Removes the fail** (it no longer counts against the item), and
  2. **Adds the answer the user typed** to that item's list of **accepted answers**, permanently — so it will be accepted from then on.
- This is a **deliberate, explicit action** (a confirm), never automatic — that prevents accidentally saving a typo as a valid answer.
- Effect: the vocabulary data improves over time, shaped by the user. The user is the final authority on what counts as a correct translation.

---

## 9. Training timer

A single cumulative timer tracks total training time.

- Whenever the user is **inside a category** (actively drilling), the timer runs. It also runs during review rounds.
- The timer **never resets**: when the user opens the next category, it **continues from where it left off**. It is one ever-growing total across the whole life of the app — not per-session or per-category.
- Purpose: let the user see how long they've trained overall (e.g. *"I've trained vocabulary for 300 hours"*).

---

## 10. Out of scope

- Teaching grammar, rules, or pronunciation basics.
- Multiple choice — answers are always **typed**.
