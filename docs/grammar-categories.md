# Grammar categories

The master list of **grammar** categories, ordered by **CEFR level** and following [learning-roadmap.md](learning-roadmap.md).
Each one is a set of **gap-fill sentences** (~20) drilled on the app's Grammar path — same rules as vocabulary: in order, any miss refills the set, a checkpoint every 3 categories.

- One data file per category under `docs/grammar/` (`a1-01-definite-articles.md`, …).
- Each file has a one-line **rule reminder** (the `> ` line under the title), shown on the category card before you start.
- Each category has a **theory lesson** with the same file name under `docs/theory/` — read before the first drill, reachable any time after. Format: a `# title`, a `> ` lead, then six `##` sections in this order: **La regola**, **Come in spagnolo**, **Diverso dallo spagnolo**, **Occhio!**, **Curiosità**, **Il trucco**. Keep it ~300 words, written for a Spanish speaker; curiosities must be true (check them).
- Table columns: `Italian (one ___ gap) | Cue | Answer (accepted) | Spanish | Notes`.
  - **Cue** — what to put in the gap (the verb, *su + il*, *mio*…); may be empty when the sentence says enough. Hidden in the *no hints* checkpoint round.
  - **Answer** — comma-separated; the first is shown as the answer, the others are also accepted.
  - **Spanish** — the meaning of the whole sentence. Write it so that, even without the cue, it settles the tense, person and gender.

---

## A1 — foundations

1. Definite articles
2. Indefinite articles
3. Noun plurals
4. Adjective agreement
5. Present: essere & avere
6. Present: regular verbs
7. Present: irregular verbs
8. Present: potere, volere, dovere, sapere
9. Simple prepositions
10. Articulated prepositions
11. Possessives
12. Demonstratives: questo & quello
13. Questions, negation, c'è / ci sono
14. Piacere (mi piace / mi piacciono)

## A2 — everyday past & future

15. Passato prossimo with avere
16. Irregular past participles
17. Passato prossimo with essere
18. Imperfetto
19. Passato prossimo vs imperfetto
20. Future: regular verbs
21. Future: irregular verbs
22. Reflexive verbs
23. Direct object pronouns
24. Indirect object pronouns
25. Ne & ci (incl. *volerci*, *metterci*)
26. Informal imperative
27. Comparatives & superlatives
28. Stare + gerund (and *stare per*)
29. bello, buono, grande, santo
30. Time markers & connectors

## B1 — moods & hypotheticals

31. Conditional: present
32. Conditional: past
33. Trapassato prossimo
34. Futuro anteriore
35. Subjunctive: present forms
36. Subjunctive or indicative?
37. Subjunctive: past
38. Combined pronouns
39. Relative pronouns
40. Imperative with pronouns & the polite Lei
41. Impersonal and passive si
42. If-clauses: the real ones
43. Gerund and participle clauses
44. Connectors: however, so, although

## B2 — nuance, register, complex syntax

45. Subjunctive: imperfect
46. Subjunctive: pluperfect
47. If-clauses: unreal present and past
48. Sequence of tenses
49. Passato remoto
50. The passive: essere, venire, andare
51. Causative fare and lasciare
52. Reported speech
53. Pronominal verbs: farcela, andarsene…
54. Connectors & register

## C1 — mastery

55. The subjunctive in every corner
56. Mixed and hidden hypotheticals
57. Literary tenses: trapassato remoto & narration
58. Infinitive and participle constructions
59. Discourse markers & spoken Italian

---

> **Extra (off the path):** *Prepositions + articles* (the full 35-form grid) and *Irregular past participles* (40 verbs) — defined in `app/app.js`, not in these files.

> **Never insert, delete or reorder rows** in a category file once it ships: item ids are positional (`g<category>-<row>`), and your fail counts are stored under them. Fix typos in place; add new sentences at the end of the table.
