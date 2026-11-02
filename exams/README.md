# Core Nursing exam banks

The draft bank contains 99 materials and 799 mapped essential learning points. Every seven-day form now retests the complete mapped inventory for its material, with 799 scored questions across all seven-day forms. Suitable questions may repeat from standard or advanced exams. Question counts follow coverage rather than a fixed short sample or novelty quota.

Questions remain bound to taught source fields or sections. Each scored question tests a mapped point; mentioning a fact in an explanation does not count as testing it. The inventory is not certified to include every required source fact. Independent clinical review and empirical calibration remain pending. Draft and coverage limitations remain visible in the app.

`authoring/retention-questions.json` supplies optional alternative questions. The compiler also considers standard and advanced questions, preferring comparable option lengths when alternatives exist. This writing check is not a guarantee of question quality. Review plausible distractors, answer clues, and whether the stem can be answered with choices hidden before accepting future revisions.

Standard and advanced forms, scoring, timing and current stage scheduling are unchanged. Existing history, saved reading, active-attempt snapshots and due dates are preserved. Creating a bank does not record learner exposure or award passes. Markings are optional authoring input, never a prerequisite for baseline exams.

Rebuild with `python scripts/build_exams.py`, validate with `python scripts/build_exams.py --check` and `python tests/exam-banks.py`, and package with `python scripts/build_runtime_exam_data.py`. Publish matching verified signatures and content-addressed runtime files together.

For lasting project principles and decisions, follow [AGENTS.md](../AGENTS.md).
