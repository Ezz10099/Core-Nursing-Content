# Core Nursing exam banks

The draft bank contains 106 materials and 849 mapped essential learning points. Every seven-day form now retests the complete mapped inventory for its material, with 849 scored questions across all seven-day forms. Suitable questions may repeat from standard or advanced exams. Question counts follow coverage rather than a fixed short sample or novelty quota.

Questions remain bound to taught source fields or sections. Each scored question tests a mapped point; mentioning a fact in an explanation does not count as testing it. The inventory is not certified to include every required source fact. Independent clinical review and empirical calibration remain pending. Draft and coverage limitations remain visible in the app.

`authoring/retention-questions.json` supplies optional alternative questions. The compiler also considers standard and advanced questions, preferring comparable option lengths when alternatives exist. This writing check is not a guarantee of question quality. Review plausible distractors, answer clues, and whether the stem can be answered with choices hidden before accepting future revisions.

Standard and advanced forms, scoring, timing and current stage scheduling are unchanged. Existing history, saved reading, active-attempt snapshots and due dates are preserved. Creating a bank does not record learner exposure or award passes. Markings are optional authoring input, never a prerequisite for baseline exams.

Rebuild with `python scripts/build_exams.py`, validate with `python scripts/build_exams.py --check` and `python tests/exam-banks.py`, and package with `python scripts/build_runtime_exam_data.py`. Publish matching verified signatures and content-addressed runtime files together.

For lasting project principles and decisions, follow [AGENTS.md](../AGENTS.md).

## Emergency Department shelf additions (2 Nov 2026)

A photographed shelf collection now tags 28 medication entries as ED-related without changing their existing stable IDs: 21 existing medications are reused and seven new generic-drug study entries were authored. Five photographs support shelf-label presence, not a complete or audited drug inventory. 'Andset' and the exact ingredient of the local Cordil 5 mg package remain explicitly unconfirmed. The new entry for ondansetron is therefore labeled educational/provisional rather than claiming the photographed ampoule has been identified.

Generated exams for the seven new medication entries are authoring drafts and should be independently checked for question-quality cues and clinical accuracy before being treated as validated competence assessments. The in-app ED filter requires runtime v36; users retain their existing reading and exam histories.
