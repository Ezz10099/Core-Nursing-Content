#!/usr/bin/env python3
"""Guard the difference between authored coverage and actual scored runtime coverage.

Does not assess clinical accuracy, distractor quality, empirical difficulty,
or whether the authored points exhaust the educational source.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
load = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))
content = load("content.json")
coverage = load("exams/generated/coverage.json")
revisions = load("exams/authoring/medication-question-revisions.json")
medication_ids = {m["id"] for m in content["medications"] + content["targetedMedications"]}
authored = {p["id"] for p in coverage["requiredAuthoredPoints"] if p["itemId"] in medication_ids}
banks = []
for path in sorted((ROOT / "runtime/files/js").glob("exam-data-[0-9][0-9].js")):
    text = path.read_text(encoding="utf-8")
    marker = "window.CoreNursingExamData.banks.push(..."
    assert marker in text and text.rstrip().endswith(");"), f"Unrecognized runtime shard: {path}"
    banks += json.loads(text.split(marker, 1)[1].rsplit(");", 1)[0])
meds = [bank for bank in banks if bank["itemType"] == "medication"]
assert {bank["itemId"] for bank in meds} == medication_ids, "Medication bank mismatch"
assert len(meds) == len(medication_ids), "Duplicate medication bank"
realized = set()
excluded = set()
critical = 0
for bank in meds:
    item_id = bank["itemId"]
    forms = {exam["stage"]: exam for exam in bank["exams"]}
    assert set(forms) == {"comprehensive", "7-day", "21-day"}, item_id
    questions = forms["comprehensive"]["questions"]
    assert questions, item_id
    for stage in ("7-day", "21-day"):
        assert forms[stage]["questions"] == questions, f"Spaced form diverged: {item_id} / {stage}"
    point_ids = [q["learningPointIds"][0] for q in questions]
    assert len(set(point_ids)) == len(point_ids), f"Duplicate scoring point: {item_id}"
    for q in questions:
        assert len(q.get("learningPointIds", [])) == 1, q["id"]
        assert q["learningPointIds"][0].startswith(item_id + "::"), q["id"]
        if q["format"] == "single-best-answer":
            assert len(q["choices"]) == 4, q["id"]
            assert q["answerKey"] in {choice["id"] for choice in q["choices"]}, q["id"]
            assert all(choice.get("explanation") for choice in q["choices"]), q["id"]
        elif q["format"] == "numeric-entry":
            assert isinstance(q["answer"], (int, float)), q["id"]
        elif q["format"] == "short-answer":
            assert q.get("acceptedAnswers") or q.get("answer"), q["id"]
        else:
            raise AssertionError(f"Unrecognized question format: {q['id']}")
        critical += bool(q.get("criticalForSafety"))
    realized.update(point_ids)
    exclusions = {e["learningPointId"] for e in bank.get("scoringExclusions", [])}
    assert not exclusions.intersection(point_ids), f"Excluded point still scored: {item_id}"
    excluded.update(exclusions)
    old_points = {p for p in authored if p.startswith(item_id + "::")}
    missing = old_points.difference(point_ids)
    assert missing == exclusions, f"Source coverage falsely credited: {item_id}: {sorted(missing ^ exclusions)}"
    for point in exclusions:
        assert revisions["items"].get(point, {}).get("action") == "omit", point
assert realized.issubset(authored), "Runtime point absent from authored inventory"
assert authored == realized | excluded, "Unexplained authored point without scored question"
assert coverage["sourceReview"]["fullyReviewedItemIds"] == [], "Do not promote incomplete audit"
print(f"Runtime medication audit: {len(meds)} medicines, {len(realized)} scored points, "
      f"{len(excluded)} explicit uncredited exclusions, {critical} safety-critical questions.")
print("PASS only for structural/runtime reconciliation. Source completeness and clinical validity remain unverified.")

# Verify every explicitly revised medication-use question against its staged
# review record, without treating this structural match as clinical validation.
role_index = {}
for report_path in (
    "exams/authoring/medication-role-review-batch1-20261106.json",
    "exams/authoring/medication-role-review-batch2-20261106.json",
):
    report = load(report_path)
    for row in report["items"]:
        role_index[row["itemId"]] = row
assert len(role_index) == 29, f"Expected 29 distinct reviewed treatment-role items, got {len(role_index)}"
for bank in meds:
    row = role_index.get(bank["itemId"])
    if not row:
        continue
    role_questions = [
        q for q in bank["exams"][0]["questions"]
        if q["learningPointIds"] == [bank["itemId"] + "::treatment-role"]
    ]
    assert len(role_questions) == 1, bank["itemId"]
    q = role_questions[0]
    assert q["stem"] == row["stem"], f"Wrong stem: {bank['itemId']}"
    assert q.get("revision"), f"Unversioned role correction: {bank['itemId']}"
    correct = next(choice["text"] for choice in q["choices"] if choice["id"] == q["answerKey"])
    assert correct == row.get("key", row.get("correct")), f"Wrong answer key: {bank['itemId']}"
    distractors = [choice["text"] for choice in q["choices"] if choice["id"] != q["answerKey"]]
    assert len(distractors) == 3 and set(distractors) == set(row["alternatives"]), (
        f"Wrong distractor set: {bank['itemId']}"
    )
print(f"Reviewed role-question reconciliation: {len(role_index)} matching source-recorded items.")
