"""Validate the actual release banks and their links to the complete source.

These are structural/content-contract checks, not independent clinical review
or empirical evidence of exam difficulty.
"""
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
import unittest
from unittest.mock import patch
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'exams' / 'generated'
CONTENT = json.loads((ROOT / 'content.json').read_text())
CATALOG = json.loads((OUT / 'catalog.json').read_text())
BANKS = []
for path in sorted(OUT.glob('banks-*.json')):
    BANKS += json.loads(path.read_text())['banks']
QUESTIONS = [question for bank in BANKS for exam in bank['exams'] for question in exam['questions']]


class ExamBanks(unittest.TestCase):
    def test_inventory_and_forms(self):
        expected = {m['id'] for m in CONTENT['medications'] + CONTENT['targetedMedications']}
        expected |= {l['id'] for l in CONTENT['lessons'] if l['id'] != 'ibd2-quick-curriculum-map'}
        self.assertEqual({b['itemId'] for b in BANKS}, expected)
        self.assertEqual(len(BANKS), len(expected))
        for bank in BANKS:
            self.assertEqual([e['stage'] for e in bank['exams']], ['standard', 'advanced'])
            for exam in bank['exams']:
                self.assertGreater(exam['questionCount'], 0)
                self.assertEqual(exam['questionCount'], len(exam['questions']))
                self.assertEqual(exam['reviewStatus'], 'authoring draft')

    def test_no_mark_dependency_and_stable_source(self):
        self.assertEqual(CATALOG['sourceContentSha256'], hashlib.sha256((ROOT / 'content.json').read_bytes()).hexdigest())
        for path in CATALOG['generationInputs']:
            self.assertNotIn('mark', path.lower())
        for path in CATALOG['generationInputs']:
            self.assertTrue((ROOT / path).is_file())
        self.assertIn('draft standard/advanced', CATALOG['appIntegration'])

    def test_source_references(self):
        for question in QUESTIONS:
            self.assertTrue(question['sourceRefs'], question['id'])
            for ref in question['sourceRefs']:
                values = CONTENT[ref['collection']]
                item = next(x for x in values if x['id'] == ref['itemId'])
                if 'field' in ref:
                    text = item[ref['field']]
                else:
                    text = json.dumps(item['sections'][ref['sectionIndex']], ensure_ascii=False, indent=2) + '\n'
                self.assertEqual(ref['textSha256'], hashlib.sha256(text.encode()).hexdigest(), question['id'])

    def test_keys_explanations_and_objective_formats(self):
        self.assertEqual(len({q['id'] for q in QUESTIONS}), len(QUESTIONS))
        for q in QUESTIONS:
            self.assertTrue(q['point'])
            self.assertEqual(q['points'], 1)
            self.assertNotIn('{drug}', json.dumps(q))
            if q['format'] == 'single-best-answer':
                self.assertEqual([c['id'] for c in q['choices']], list('ABCD'))
                self.assertIn(q['answerKey'], 'ABCD')
                texts = [c['text'].casefold().strip() for c in q['choices']]
                self.assertEqual(len(set(texts)), 4, q['id'])
                self.assertTrue(all(c['explanation'].strip() for c in q['choices']), q['id'])
                self.assertNotIn('correct', q)
            elif q['format'] == 'numeric-entry':
                self.assertIsInstance(q['answer'], (int, float))
                self.assertEqual(q['tolerance'], 0)
                self.assertTrue(q['unit'])
                self.assertTrue(q['explanation'])
            elif q['format'] == 'short-answer':
                self.assertTrue(q['acceptedAnswers'])
                self.assertEqual(q['normalization'], 'trim-casefold-collapse-whitespace')
                self.assertTrue(q['explanation'])
            else:
                self.fail('Unknown format: ' + q['format'])

    def test_answer_position_balance_and_different_forms(self):
        for bank in BANKS:
            standard, advanced = bank['exams']
            std_stems = {q['stem'] for q in standard['questions']}
            self.assertFalse(std_stems & {q['stem'] for q in advanced['questions']}, bank['itemId'])
            for exam in bank['exams']:
                count = Counter(q['answerKey'] for q in exam['questions'] if q['format'] == 'single-best-answer')
                self.assertLessEqual(max([count[x] for x in 'ABCD']) - min([count[x] for x in 'ABCD']), 1)

    def test_agreed_metadata_without_implied_implementation(self):
        for bank in BANKS:
            for exam in bank['exams']:
                advanced = exam['stage'] == 'advanced'
                self.assertEqual(exam['passRule'], {'operator': '>' if advanced else '>=', 'percent': 90, 'roundBeforeComparison': False})
                self.assertEqual(exam['timing']['secondsPerQuestion'], 90 if advanced else None)
                self.assertEqual(exam['timing']['timed'], advanced)
                self.assertEqual(exam['timing']['timerEnforcement'], 'persisted total deadline: 90 seconds multiplied by question count')
                self.assertIn('unchanged', exam['scoring']['criticalSafetyMiss'])
                self.assertEqual(exam['scoring']['unsureOrGuessed'], 'review flag only')

    def test_coverage_is_real_questions_and_does_not_claim_learner_exposure(self):
        coverage = json.loads((OUT / 'coverage.json').read_text())
        by_id = {q['id']: q for q in QUESTIONS}
        for point in coverage['requiredAuthoredPoints']:
            self.assertTrue(point['questionIds'])
            for qid in point['questionIds']:
                self.assertIn(point['id'], by_id[qid]['learningPointIds'])
        self.assertIn('audit pending', coverage['status'])
        self.assertIn('not recorded', coverage['learnerExposure'])

    def test_files_match_catalog_checksums(self):
        for file in CATALOG['files']:
            self.assertEqual(hashlib.sha256((OUT / file['path']).read_bytes()).hexdigest(), file['sha256'])

    def test_partial_review_never_claims_full_coverage(self):
        coverage = json.loads((OUT / 'coverage.json').read_text())['sourceReview']
        self.assertEqual(coverage['fullyReviewedItemIds'], [])
        self.assertIn('partial', coverage['status'])
        by_id = {q['id']: q for q in QUESTIONS}
        for point in coverage['identifiedRequiredPoints']:
            self.assertTrue(point['questionIds'])
            for qid in point['questionIds']:
                self.assertIn(point['id'], by_id[qid]['learningPointIds'])
                self.assertEqual(point['point'], by_id[qid]['point'])

    def test_review_rejects_changed_source_or_missing_scored_question(self):
        spec = importlib.util.spec_from_file_location('exam_builder', ROOT / 'scripts/build_exams.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        original_load = builder.load
        review_path = ROOT / 'exams/authoring/coverage-review.json'
        review = original_load(review_path)
        import copy
        stale = copy.deepcopy(review)
        stale['items'][0]['sourceFieldSha256']['monitor'] = 'not-the-source-hash'
        with patch.object(builder, 'load', side_effect=lambda p: stale if p == review_path else original_load(p)):
            with self.assertRaisesRegex(AssertionError, 'Stale coverage review'):
                builder.build()
        missing = copy.deepcopy(review)
        point = missing['items'][0]['identifiedRequiredPoints'][0]
        point['questionStages'] = ['advanced' if point['questionStages'] == ['standard'] else 'standard']
        with patch.object(builder, 'load', side_effect=lambda p: missing if p == review_path else original_load(p)):
            with self.assertRaisesRegex(AssertionError, 'Required point has no scored question'):
                builder.build()

    def test_class_questions_do_not_copy_the_answer_from_the_displayed_name(self):
        for bank in BANKS:
            for exam in bank['exams']:
                for q in exam['questions']:
                    if q['id'].endswith('--drug-class'):
                        key = next(c['text'] for c in q['choices'] if c['id'] == q['answerKey'])
                        self.assertIsNone(re.search(r'\b' + re.escape(key) + r'\b', bank['title'], re.I), q['id'])

    def test_reproducibility(self):
        subprocess.run([sys.executable, str(ROOT / 'scripts/build_exams.py'), '--check'], cwd=ROOT, check=True, stdout=subprocess.PIPE)


if __name__ == '__main__':
    unittest.main()
