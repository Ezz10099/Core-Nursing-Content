# Standard, advanced and 7-day exam banks

This directory contains **276 draft exam forms and 1,209 scored questions** for 74 medications and 18 clinical lessons/references. The administrative curriculum roadmap is excluded with a recorded reason. Counts vary with the authored material; there is no padded minimum question count.

The forms are generated from the complete current teaching-content input, independently of learner markings. They contain 1,194 single-best-answer MCQs, 11 numeric-entry questions, and 4 short-answer questions. Every MCQ choice has an explanation. Numeric and short-answer questions have predefined keys, units/normalization, and explanations.

These remain **draft question banks**. The app provides standard/advanced exam screens, grading, safety follow-up checks, reading prerequisites, saved attempts, and a persistent advanced timer. The build itself does not award passes or record learner exposure. Those records are created only by actual app use. Independent clinical review, an exhaustive required-point inventory, and empirical difficulty calibration have not been completed. The designed standard/advanced distinction must not be presented as measured difficulty.

## Files

- [Generated catalogue](generated/catalog.json): item IDs, form IDs, question counts, source hash, and file hashes.
- `generated/banks-01.json` through `generated/banks-05.json`: exam questions, keys, explanations, source references, safety flags, and scoring/timing metadata.
- [Coverage map](generated/coverage.json): 826 authored learning points linked to actual scored questions. It explicitly distinguishes this map from exhaustive source coverage and from learner exposure.
- [Sources](sources.json): taught-content provenance, retrieved primary labels/guidelines, selected verification notes, and evidence limitations. Retrieving a label is not clinical approval of every question.
- [Exclusions and source issues](authoring/exclusions.json): administrative/background exclusions and the DCM classification ambiguity that was not used for a misleading key.
- [Partial source review](authoring/coverage-review.json): 21 additional required points identified in seven medication entries, bound to exact source hashes and scored questions. No material is certified fully reviewed; stale source bindings or missing questions fail the build.
- `authoring/*.json`: the authoritative editable profiles, concepts, and lesson questions. There are no hidden learner-mark inputs.

For lasting project principles and user decisions, follow the canonical-record pointer in [AGENTS.md](../AGENTS.md).

## Rebuild and validate

```sh
python scripts/build_exams.py
python scripts/build_exams.py --check
python tests/exam-banks.py
```

The build uses only Python's standard library. Output is deterministic: MCQ choices are shuffled reproducibly and keys are balanced within each form. Rebuilding against changed source content requires rechecking the relevant authoring and coverage; it is not automatic clinical validation. The runtime validation workflow checks reproducibility and the bank contract.

## Integration contract

Use the existing material ID as `itemId`; do not replace saved reading or historical quiz records. Each form contains its own stable ID, question IDs, answer key, learning-point links, and source-unit hashes. A client must keep answer keys/explanations hidden until submission. These offline authoring JSON files include keys and are not secure server-side examinations.

All questions carry one point. Passing metadata uses an unrounded standard score of at least 90%, and an advanced score strictly above 90%. Only advanced forms record the 90-second allowance per question. The advanced timer uses a persisted total deadline of 90 seconds multiplied by the question count. Correct unsure/guessed answers retain their score; predefined safety misses retain the original numerical score and require a separate check.

An advanced pass schedules the 7-day due date; later-stage date/retry logic is covered by engine tests. All 92 materials now have separately authored, untimed 7-day forms (360 questions total). A score strictly above 90% passes. A failed attempt repeats this stage after seven days; a pass schedules the 21-day stage 21 days after actual completion. The 21-day sets are not yet available. Due reminders appear in Home and My Progress when the app is opened; this release does not promise background notifications. Standard/advanced exams use no marked passages. Existing practice answers and reading records are preserved and are never converted into new exam passes.


## Seven-day retests

The editable baseline is `authoring/retention-questions.json`. It binds questions to existing taught medication concepts and lesson sections. Standard and advanced forms, IDs and scoring are preserved. The baseline does not wait for markings. Later shared passages can inform revisions to the relevant retest; the complete material remains its source. No private local markings were retrieved or published.

These forms test delayed recall, distinctions, recognition, first actions and reassessment using different stems and examples. They are not a higher difficulty tier than advanced exams. Counts range from two to eight with material length and selected points. With fewer than ten questions, the agreed above-90% rule requires all answers correct. A short retest does not test every source point, and a finite form can repeat on later attempts.

For later revisions, review the source and current primary evidence, retain IDs for unchanged points, rebuild bank/runtime data, increment bank/runtime versions, then publish a verified signed release. Active attempts retain their saved question snapshot. Updating a form does not recalculate history, reading records, pass dates or due dates.

The selected current clinical checks and retrieval limitations are recorded in `retention-evidence-review.json`. Draft status, pending exhaustive coverage review and lack of empirical difficulty calibration continue to apply.
