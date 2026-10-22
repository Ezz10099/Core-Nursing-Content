# Standard and advanced exam banks

This directory contains **184 draft exam forms and 756 scored questions** for 74 medications and 18 clinical lessons/references. The administrative curriculum roadmap is excluded with a recorded reason. Counts vary with the authored material; there is no padded minimum question count.

The forms are generated from the complete current teaching-content input, independently of learner markings. They contain 741 single-best-answer MCQs, 11 numeric-entry questions, and 4 short-answer questions. Every MCQ choice has an explanation. Numeric and short-answer questions have predefined keys, units/normalization, and explanations.

These are **authoring drafts**. They are saved content, not an activated app exam feature. Creating the files does not award a pass, mark anything read, record learner exposure, schedule a later exam, or implement notifications. Independent clinical review, an exhaustive required-point inventory, and empirical difficulty calibration have not been completed. The designed standard/advanced distinction must not be presented as measured difficulty.

## Files

- [Generated catalogue](generated/catalog.json): item IDs, form IDs, question counts, source hash, and file hashes.
- `generated/banks-01.json` through `generated/banks-05.json`: exam questions, keys, explanations, source references, safety flags, and scoring/timing metadata.
- [Coverage map](generated/coverage.json): 670 authored learning points linked to actual scored questions. It explicitly distinguishes this map from exhaustive source coverage and from learner exposure.
- [Sources](sources.json): taught-content provenance, retrieved primary labels/guidelines, selected verification notes, and evidence limitations. Retrieving a label is not clinical approval of every question.
- [Exclusions and source issues](authoring/exclusions.json): administrative/background exclusions and the DCM classification ambiguity that was not used for a misleading key.
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

All questions carry one point. Passing metadata uses an unrounded standard score of at least 90%, and an advanced score strictly above 90%. Only advanced forms record the 90-second allowance per question. The timer enforcement is explicitly unimplemented. Correct unsure/guessed answers retain their score; predefined safety misses retain the original numerical score and require a separate check.

The app interface, progression and reading prerequisites, safety follow-up handling, due-exam scheduling, reminders, and later-exam banks must be implemented before presenting the new workflow as available. The current source, live runtime, saved progress, and signed update manifests are not changed by this content-only addition.
