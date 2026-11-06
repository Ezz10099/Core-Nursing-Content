# Medication role-question quality audit — 6 November 2026

## Verified system-wide issue
The published runtime contains **82 medication treatment-role questions**, one per medication. Their source compiler (`scripts/build_exams.py`, `core_questions()`) constructs three incorrect options from intentionally distant treatment categories rather than clinically adjacent alternative indications. Some are therefore answerable by superficial elimination, particularly after repeated exams across medications. Their presence is **not evidence of reliable drug-indication assessment**.

### Examples from actual runtime
- Alteplase: correct emergency thrombolysis, alternatives include glucose replacement, bronchospasm relief and bacterial protein synthesis.
- Vancomycin: serious Gram-positive infection contrasted with valve anticoagulation, ventricular ectopy and beta2 bronchodilation.
- Ondansetron: nausea/vomiting contrasted with ventricular ectopy, valve anticoagulation and glucose replacement.

## Action required
1. Review all 82 treatment-role items *individually* with choices hidden, then the stem hidden.
2. Replace unrelated distractors with plausible alternatives (for example, a relevant but wrong indication, timing, formulation, or treatment purpose). Confirm alternatives are clinically false for the specific medicine.
3. Ensure the question assesses the actual medicine and does not give the answer away through the drug name or other questions.
4. Check source labeling and local prescribing scope for time-sensitive indications. Use the taught material as the baseline.
5. Do not count a rewritten question as independently validated or empirically calibrated solely because automated tests pass.

The 80 drug-class and 82 principal-action questions also remain subject to independent item-level quality review. **No medicine is certified fully covered.**

## Related auditable results
- Runtime-vs-authored reconciliation: `exams/authoring/runtime-question-coverage-reconciliation-20261106.json` (82 medications; 672 originally authored medication points, 642 actually scored prior to the new staging additions; 30 explicit omissions not credited).
- Source-statement inventory: `exams/authoring/medication-full-source-audit-20261106.json` (1,068 mechanically segmented statement candidates; not yet classified as essential/excluded).
- Staged draft questions (not live): PR #32, 13 new source-linked questions for 10 medications.
- The staged test `tests/medication-runtime-coverage.py` checks structural reconciliation and equal three-stage forms; it does NOT certify clinical completeness.

## Status
**Partial targeted clinical review.** The full source-fact-to-actual-question audit, option quality review, and independent validation are still open. Preserve existing study data and signed update integrity.