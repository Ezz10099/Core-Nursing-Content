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
