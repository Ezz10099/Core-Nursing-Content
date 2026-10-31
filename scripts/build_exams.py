#!/usr/bin/env python3
"""Build source-bound standard/advanced authoring banks, without learner marks.

This is a content compiler. It neither awards app passes nor schedules exams.
Only Python's standard library is required. --check never modifies output.
"""
import argparse
import copy
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUTHORING = ROOT / 'exams' / 'authoring'
OUT = ROOT / 'exams' / 'generated'
MED_FIELDS = ('drugclass', 'use', 'administration', 'monitor', 'why', 'mechanism', 'memoryUse', 'memoryDanger')


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def encoded(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def load(path):
    return json.loads(path.read_text())


def mcq(stem, choices):
    return {'format': 'single-best-answer', 'stem': stem, 'correct': 0,
            'choices': [{'text': text, 'explanation': why} for text, why in choices]}


def field_refs(item, fields):
    return [{'file': 'content.json', 'collection': 'medications' if item['id'] in MED_IDS else 'targetedMedications',
             'itemId': item['id'], 'field': field, 'textSha256': digest(item[field])}
            for field in fields if item.get(field)]


def rank(seed, values):
    return sorted(values, key=lambda value: digest(seed + str(value)))


def core_questions(item, profile, families):
    family = families[profile['family']]
    action = lambda f: f['pair'].split(': ', 1)[1]
    class_name = lambda f: f['pair'].split(':', 1)[0]
    # A class label inside a choice must not let the displayed drug name supply
    # the answer. Ask about action without those labels. Avoid nearby classes
    # whose overlapping physiological actions could also be defensible.
    excluded_groups = {family['group']}
    if family['group'] in {'bp', 'rhythm', 'vascular'}:
        excluded_groups |= {'bp', 'rhythm', 'vascular'}
    others = [key for key in families if families[key]['group'] not in excluded_groups]
    candidates = rank(item['id'] + ':action', others)
    sentence = lambda t: t[0].upper() + t[1:]
    choices = [(sentence(action(family)), family['why'])]
    used_actions = {action(family).casefold()}
    used_groups = set()
    for key in candidates:
        alternative = families[key]
        if action(alternative).casefold() in used_actions or alternative['group'] in used_groups:
            continue
        choices.append((sentence(action(alternative)), f"This is a different pharmacological action. The drug’s action is: {family['why']}"))
        used_actions.add(action(alternative).casefold())
        used_groups.add(alternative['group'])
        if len(choices) == 4:
            break
    mechanism = mcq(f"What is the principal mechanism of action of {item['name']}?", choices)
    mechanism.update(concept='principal-action', point='Identify the principal pharmacological action taught for this medicine.',
                     sourceRefs=field_refs(item, ['drugclass', 'mechanism', 'why']), criticalForSafety=False)
    core = [mechanism]
    if not re.search(r'\b' + re.escape(class_name(family)) + r'\b', item['name'], re.I):
        unique = {}
        for key in rank(item['id'] + ':class', list(families)):
            other = families[key]
            name = class_name(other)
            if name != class_name(family):
                unique.setdefault(name, other)
        names = sorted(unique, key=lambda n: (unique[n]['group'] != family['group'], digest(item['id'] + n)))[:3]
        cls = mcq(f"Which drug class does {item['name']} belong to?",
                  [(class_name(family), item['drugclass'])] + [(n, f"The medicine is classified as: {item['drugclass']}") for n in names])
        cls.update(concept='drug-class', point='Identify the drug class taught for this medicine.',
                   sourceRefs=field_refs(item, ['drugclass']), criticalForSafety=False)
        core.append(cls)
    # Alternatives are broad roles from other domains; do not use another true
    # indication of the same class as an allegedly wrong answer.
    roles = {
        'bp': ['Acute reversal of opioid respiratory toxicity', 'Replacement of circulating glucose in severe hypoglycemia', 'Treatment of susceptible bacterial infection'],
        'combination': ['Therapeutic anticoagulation for a mechanical valve', 'Acute replacement of low serum calcium', 'Treatment of susceptible bacterial infection'],
        'pain': ['Treatment of susceptible bacterial infection', 'Prevention of valve-related thromboembolism', 'Replacement therapy for an adrenal crisis'],
        'neuro': ['Inhibition of platelet aggregation after coronary stenting', 'Treatment of a susceptible bacterial infection', 'Rapid IV replacement of circulating glucose'],
        'antibiotic': ['Suppression of ventricular ectopy by cardiac sodium-channel blockade', 'Prevention of valve-related thromboembolism', 'Relief of bronchospasm by beta2 stimulation'],
        'antithrombotic': ['Relief of bronchospasm through airway receptor stimulation', 'Replacement of glucose during severe hypoglycemia', 'Suppression of bacterial protein synthesis'],
        'vascular': ['Treatment of oral fungal lesions', 'Suppression of gastric acid secretion', 'Replacement of glucose during severe hypoglycemia'],
        'rhythm': ['Treatment of a susceptible bacterial infection', 'Correction of a nutritional micronutrient deficiency', 'Suppression of gastric acid secretion'],
        'renal': ['Treatment of oral fungal lesions', 'Suppression of bacterial cell-wall synthesis', 'Reversal of vitamin-K-antagonist activity'],
        'gi': ['Suppression of ventricular ectopy by cardiac sodium-channel blockade', 'Prevention of valve-related thromboembolism', 'Replacement of glucose during severe hypoglycemia'],
        'respiratory': ['Inhibition of platelet aggregation after coronary stenting', 'Treatment of oral fungal lesions', 'Reversal of vitamin-K-antagonist activity'],
        'electrolyte': ['Inhibition of platelet aggregation after coronary stenting', 'Treatment of a susceptible bacterial infection', 'Long-term suppression of gastric acid secretion'],
        'metabolic': ['Reversal of opioid respiratory toxicity', 'Treatment of a susceptible bacterial infection', 'Immediate electrical treatment of ventricular fibrillation'],
    }
    choices = [(profile['use'], f"This is a clinical use of the medicine: {item.get('use', item.get('memoryUse', ''))}")]
    choices += [(role, 'This is a different treatment role.') for role in roles[family['group']]]
    use = mcq(f"Which is a clinical use of {item['name']}?", choices)
    use.update(concept='treatment-role', point='Identify the main treatment role taught for this medicine.',
               sourceRefs=field_refs(item, ['use', 'memoryUse']), criticalForSafety=False)
    return core + [use]


def render_question(spec, item_id, stage, concept, index):
    result = copy.deepcopy(spec)
    result.pop('stage', None)
    result.pop('sections', None)
    result['id'] = f'{item_id}--{stage}--{concept}'
    result['points'] = 1
    result['learningPointIds'] = [f'{item_id}::{concept}']
    result.pop('concept', None)
    return result


def arrange_answers(exam):
    questions = [q for q in exam['questions'] if q['format'] == 'single-best-answer']
    ordered = rank(exam['id'], [q['id'] for q in questions])
    positions = rank(exam['id'] + ':positions', list(range(4)))
    targets = {key: positions[i % 4] for i, key in enumerate(ordered)}
    for question in questions:
        original = question.pop('correct')
        correct = question['choices'][original]
        wrong = [value for i, value in enumerate(question['choices']) if i != original]
        wrong = sorted(wrong, key=lambda value: digest(question['id'] + value['text']))
        target = targets[question['id']]
        wrong.insert(target, correct)
        question['choices'] = [dict(id=letter, **value) for letter, value in zip('ABCD', wrong)]
        question['answerKey'] = 'ABCD'[target]


def make_exam(item, kind, stage, questions):
    exam = {'id': f"{item['id']}--{stage}", 'itemId': item['id'], 'itemType': kind,
            'title': item.get('name', item.get('title')), 'stage': stage,
            'reviewStatus': 'authoring draft', 'passRule': {'operator': '>=' if stage == 'standard' else '>', 'percent': 90, 'roundBeforeComparison': False},
            'timing': {'timed': stage == 'advanced', 'secondsPerQuestion': 90 if stage == 'advanced' else None,
                       'timerEnforcement': 'persisted total deadline: 90 seconds multiplied by question count'},
            'scoring': {'correct': 1, 'incorrect': 0, 'unanswered': 0, 'partialCredit': False,
                        'unsureOrGuessed': 'review flag only', 'criticalSafetyMiss': 'separate follow-up required; original numeric score unchanged'},
            'feedback': 'show keys and all option explanations after submission',
            'retestPolicy': 'same standard form after required reading' if stage == 'standard' else 'different from standard',
            'questions': questions}
    arrange_answers(exam)
    exam['questionCount'] = len(questions)
    return exam


def build():
    global MED_IDS
    content_bytes = (ROOT / 'content.json').read_bytes()
    content = json.loads(content_bytes)
    MED_IDS = {item['id'] for item in content['medications']}
    medications = content['medications'] + content['targetedMedications']
    profiles = load(AUTHORING / 'medication-profiles.json')
    concepts = load(AUTHORING / 'medication-concepts.json')
    lessons = load(AUTHORING / 'lesson-questions.json')
    evidence = load(ROOT / 'exams' / 'sources.json')
    exclusions = load(AUTHORING / 'exclusions.json')
    review = load(AUTHORING / 'coverage-review.json')
    retention = load(AUTHORING / 'retention-questions.json')
    assert set(profiles['items']) == {item['id'] for item in medications}, 'Medication inventory changed; review profiles.'
    assert set(lessons) | {x['itemId'] for x in exclusions['items']} == {item['id'] for item in content['lessons']}, 'Lesson inventory changed.'
    assert not set(lessons) & {x['itemId'] for x in exclusions['items']}
    banks = []
    points = {}
    source_map = []
    for item in medications:
        profile = profiles['items'][item['id']]
        by_stage = {'standard': core_questions(item, profile, profiles['families']), 'advanced': [], '7-day': []}
        for key in profile['concepts']:
            concept = concepts[key]
            fields = [field for field in MED_FIELDS if re.search(concept['anchor'], item.get(field, ''), re.I)]
            assert fields, f"No taught source anchor: {item['id']} / {key}"
            for stage in by_stage:
                retained = retention['medicationConcepts'].get(key) if stage == '7-day' else None
                if stage == '7-day' and key in retention.get('medicationRestrictions', {}) and item['id'] not in retention['medicationRestrictions'][key]:
                    continue
                if not (retained or concept.get(stage)):
                    continue
                question = copy.deepcopy(retained or concept[stage])
                # Replace literal placeholders only; mathematical braces must survive.
                for name in ('stem',):
                    question[name] = question[name].replace('{drug}', item['name'])
                for choice in question.get('choices', []):
                    for name in ('text', 'explanation'):
                        choice[name] = choice[name].replace('{drug}', item['name'])
                question.update(concept=key, point=concept['point'], sourceRefs=field_refs(item, fields),
                                criticalForSafety=concept['criticalForSafety'])
                by_stage[stage].append(question)
        forms = []
        for stage, specs in by_stage.items():
            questions = [render_question(spec, item['id'], stage, spec['concept'], index) for index, spec in enumerate(specs)]
            assert questions, f"Empty {stage} form: {item['id']}"
            forms.append(make_exam(item, 'medication', stage, questions))
        bank = {'itemId': item['id'], 'title': item['name'], 'itemType': 'medication',
                'capabilityRequirement': item.get('requiresCapability'), 'evidenceIds': evidence['itemEvidence'][item['id']], 'exams': forms}
        banks.append(bank)
    for item in content['lessons']:
        if item['id'] not in lessons:
            continue
        by_stage = {'standard': [], 'advanced': [], '7-day': []}
        assert item['id'] in retention['lessonQuestions'], 'Missing 7-day lesson: ' + item['id']
        for spec in lessons[item['id']] + retention['lessonQuestions'][item['id']]:
            refs = []
            for index in spec['sections']:
                section = item['sections'][index]
                refs.append({'file': 'content.json', 'collection': 'lessons', 'itemId': item['id'], 'sectionIndex': index,
                             'label': section['label'], 'textSha256': digest(encoded(section))})
            question = copy.deepcopy(spec)
            question['sourceRefs'] = refs
            concept = 'point-' + digest(spec['point'])[:12]
            by_stage[spec['stage']].append(render_question(question, item['id'], spec['stage'], concept, len(by_stage[spec['stage']])))
        assert all(by_stage.values()), f"Missing lesson form: {item['id']}"
        banks.append({'itemId': item['id'], 'title': item['title'], 'itemType': 'lesson', 'evidenceIds': evidence['lessonEvidence'][item['id']],
                      'exams': [make_exam(item, 'lesson', stage, questions) for stage, questions in by_stage.items()]})

    counts = Counter()
    for bank in banks:
        for exam in bank['exams']:
            counts['exams'] += 1
            for question in exam['questions']:
                counts['questions'] += 1
                counts[question['format']] += 1
                for key in question['learningPointIds']:
                    point = points.setdefault(key, {'id': key, 'itemId': bank['itemId'], 'point': question['point'], 'questionIds': [], 'stages': []})
                    point['questionIds'].append(question['id'])
                    if exam['stage'] not in point['stages']:
                        point['stages'].append(exam['stage'])
        refs = {}
        for exam in bank['exams']:
            for question in exam['questions']:
                for ref in question['sourceRefs']:
                    key = ref.get('field', str(ref.get('sectionIndex')))
                    refs.setdefault(key, []).append(question['id'])
        source_map.append({'itemId': bank['itemId'], 'referencedSourceUnits': refs,
                           'interpretation': 'Source references locate support. They do not claim that every fact in a referenced paragraph is tested.'})

    # Validate identified gaps against both the exact source and actual scored
    # questions. This partial review never upgrades a material to fully covered.
    question_index = {q['id']: q for b in banks for e in b['exams'] for q in e['questions']}
    reviewed_points = []
    med_index = {m['id']: m for m in medications}
    for entry in review['items']:
        material = med_index[entry['itemId']]
        assert entry['reviewStatus'] == 'partial'
        for field, source_hash in entry['sourceFieldSha256'].items():
            assert digest(material.get(field, '')) == source_hash, f"Stale coverage review: {entry['itemId']} / {field}"
        for point in entry['identifiedRequiredPoints']:
            assert point['itemId'] == entry['itemId']
            assert point['id'] == entry['itemId'] + '::' + point['concept']
            assert re.search(point['sourceAnchor'], material[point['sourceField']], re.I), point['id']
            mapped = copy.deepcopy(point)
            mapped['questionIds'] = []
            for stage in point['questionStages']:
                qid = f"{entry['itemId']}--{stage}--{point['concept']}"
                assert qid in question_index, f"Required point has no scored question: {point['id']} / {stage}"
                assert point['id'] in question_index[qid]['learningPointIds']
                assert point['point'] == question_index[qid]['point']
                mapped['questionIds'].append(qid)
            assert mapped['questionIds'], point['id']
            reviewed_points.append(mapped)

    outputs = {}
    entries = []
    for index, start in enumerate(range(0, len(banks), 20), 1):
        filename = f'banks-{index:02d}.json'
        shard = banks[start:start + 20]
        outputs[filename] = encoded({'schemaVersion': 1, 'banks': shard})
        for bank in shard:
            entries.append({'itemId': bank['itemId'], 'title': bank['title'], 'itemType': bank['itemType'], 'file': filename,
                            'forms': [{'id': exam['id'], 'stage': exam['stage'], 'questionCount': exam['questionCount']} for exam in bank['exams']]})
    outputs['coverage.json'] = encoded({'schemaVersion': 1, 'status': 'mapped authored points; exhaustive source audit pending',
        'learnerExposure': 'not recorded here; no exam has been taken by creating this bank',
        'requiredAuthoredPoints': list(points.values()), 'sourceReferenceMap': source_map, 'exclusions': exclusions,
        'sourceReview': {'status': review['status'], 'scope': review['scope'],
                        'partiallyReviewedItemIds': [e['itemId'] for e in review['items']],
                        'identifiedRequiredPoints': reviewed_points,
                        'fullyReviewedItemIds': []},
        'questionDesignExclusions': [{'itemId': m['id'], 'detail': 'A separate class-recall question is omitted because the full class label is already supplied by the displayed medication name. Its principal action and clinical information remain tested separately.'}
                                     for m in medications if m['id'] + '::drug-class' not in points],
        'limitations': ['Each listed point has a scored question. The inventory is not yet certified to include every required source fact.',
                        'A point appearing in a distractor, stem, or explanation does not receive additional coverage credit.',
                        'No learner exposure or pass is inferred from bank generation.']})
    outputs['catalog.json'] = encoded({'schemaVersion': 1, 'bankVersion': 3, 'status': 'authoring draft',
        'sourceContentVersion': content['contentVersion'], 'sourceContentSha256': hashlib.sha256(content_bytes).hexdigest(),
        'generationInputs': ['content.json', 'exams/authoring/medication-profiles.json', 'exams/authoring/medication-concepts.json', 'exams/authoring/lesson-questions.json', 'exams/authoring/retention-questions.json', 'exams/authoring/exclusions.json', 'exams/authoring/coverage-review.json', 'exams/sources.json'],
        'counts': dict(counts, materials=len(banks), medications=len(medications), lessons=len(lessons), mappedLearningPoints=len(points)),
        'difficulty': {'standard': 'recognition, recall, and core interpretation', 'advanced': 'application, interactions, competing explanations, and calculation',
                       '7-day': 'delayed recall, distinctions and clinical application using separately authored questions on taught material',
                       'calibration': 'not empirically calibrated'},
        'appIntegration': 'Packaged for the draft standard/advanced and 7-day exam interface. The 21-day sets are not yet generated.',
        'retentionPolicy': retention['selectionPolicy'],
        'entries': entries,
        'files': [{'path': name, 'sha256': digest(data)} for name, data in outputs.items()]})
    return outputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='fail if committed outputs differ')
    args = parser.parse_args()
    outputs = build()
    if args.check:
        actual = {p.name for p in OUT.glob('*.json')}
        failures = [name for name, data in outputs.items() if not (OUT / name).exists() or (OUT / name).read_text() != data]
        failures += list(actual - set(outputs))
        if failures:
            raise SystemExit('Exam outputs need rebuilding: ' + ', '.join(sorted(failures)))
        print('Exam banks are reproducible.')
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        for path in OUT.glob('*.json'):
            if path.name not in outputs:
                path.unlink()
        for name, data in outputs.items():
            (OUT / name).write_text(data)
        catalog = json.loads(outputs['catalog.json'])
        print(json.dumps(catalog['counts']))


if __name__ == '__main__':
    main()

