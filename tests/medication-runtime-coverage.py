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

# Regression guard for the repeated formulation-substitution template that gave
# away the answer across multiple medication exams. This checks scored runtime
# output, not clinical/psychometric validity.
generic_formulation_phrase = "supplied product differ in release type or route"
generic_formulation_key = "Product-specific interchangeability and an authorized order"
for bank in meds:
    questions = bank["exams"][0]["questions"]
    assert not any(generic_formulation_phrase in q.get("stem", "") for q in questions), (
        f"Generic formulation template still scored: {bank['itemId']}"
    )
    assert not any(
        choice.get("text") == generic_formulation_key
        for q in questions if q.get("format") == "single-best-answer"
        for choice in q["choices"]
    ), f"Generic formulation answer still scored: {bank['itemId']}"
formulation_review = {
    point: spec for point, spec in revisions["items"].items()
    if point.endswith("::formulation") and spec.get("action") in {"omit", "replace"}
}
assert len(formulation_review) >= 18, "Expected review of all 18 recurring formulation questions"
for point, decision in formulation_review.items():
    item = point.split("::", 1)[0]
    b = next(b for b in meds if b["itemId"] == item)
    qs = [q for q in b["exams"][0]["questions"] if q["learningPointIds"] == [point]]
    if decision["action"] == "omit":
        assert not qs and point in excluded, f"Uncredited omission reappeared: {point}"
        assert "reason" in decision and "unresolvedCoverage" in decision, point
    else:
        assert len(qs) == 1 and qs[0].get("revision"), f"Unversioned formulation revision: {point}"
        assert qs[0]["stem"] == decision["question"]["stem"], f"Wrong formulation question: {point}"
        assert all(c.get("explanation") for c in qs[0].get("choices", [])), point
for point in (
    "ed-vitamin-k-phytonadione::vitk_inr_followup",
    "ed-hexakapron-tranexamic::txa_pph_source_control",
    "ccu-norepinephrine::norepi_extravasation_action",
):
    assert point in realized, f"Safety learning point missing from scored form: {point}"
print(f"Formulation-template regression: {len(formulation_review)} review decisions; no generic scored repeats.")
print(f"Runtime medication audit: {len(meds)} medicines, {len(realized)} scored points, "
      f"{len(excluded)} explicit uncredited exclusions, {critical} safety-critical questions.")
print("PASS only for structural/runtime reconciliation. Source completeness and clinical validity remain unverified.")

# Verify every explicitly revised medication-use question against its staged
# review record, without treating this structural match as clinical validation.
role_index = {}
review_paths = sorted((ROOT / "exams/authoring").glob("medication-role-review-batch*-20261106.json"))
assert len(review_paths) == 4, f"Expected all four review batches, got {len(review_paths)}"
review_counts = {}
for path in review_paths:
    report = json.loads(path.read_text(encoding="utf-8"))
    review_counts[path.name] = len(report["items"])
    for row in report["items"]:
        role_index[row["itemId"]] = row
assert len(role_index) == len(meds), (
    f"Expected all {len(meds)} treatment-role items, got {len(role_index)} distinct medication items"
)
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
    assert len(set(choice["text"].strip().casefold() for choice in q["choices"])) == 4, (
        f"Duplicate role choices: {bank['itemId']}"
    )
    assert q["point"] == "Identify the main treatment role taught for this medicine.", bank["itemId"]
print(f"Reviewed role-question reconciliation: {len(role_index)} matching source-recorded items; batches={review_counts}.")

# Output a non-gating list of length cues. Source completeness, clinical
# accuracy and empirical item difficulty cannot be certified by this heuristic.
length_cues = []
for bank in meds:
    role = next(q for q in bank["exams"][0]["questions"]
                if q["learningPointIds"] == [bank["itemId"] + "::treatment-role"])
    correct = next(c for c in role["choices"] if c["id"] == role["answerKey"])
    wrong_lengths = sorted(len(c["text"].split()) for c in role["choices"]
                           if c["id"] != role["answerKey"])
    if len(correct["text"].split()) - wrong_lengths[1] >= 5:
        length_cues.append(bank["itemId"])
print(f"Non-gating answer-length cue candidates: {len(length_cues)}: {length_cues}")

