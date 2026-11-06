"""Traceability/reproducibility checks, not independent clinical validation."""
import hashlib
import json
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
load=lambda p:json.loads((ROOT/p).read_text())
content=load('content.json');materials={m['id']:m for m in content['medications']+content['targetedMedications']}
banks={}
for p in sorted((ROOT/'runtime/files/js').glob('exam-data-*.js')):
    for b in json.loads(p.read_text().split('banks.push(...',1)[1].rsplit(');',1)[0]):banks[b['itemId']]=b
fingerprint=lambda q:hashlib.sha256(json.dumps(q,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
tested={'directly_tested','directly_tested_staged'}
reports=[]
for name in ['ufh','ondansetron','verapamil','furosemide']:
    d=load(f'exams/authoring/{name}-fact-by-fact-audit-20261106.json');reports.append(d)
    item=d['medicationId'];m=materials[item];qs={q['learningPointIds'][0]:q for q in banks[item]['exams'][0]['questions']}
    assert d['certifiedFullCoverage'] is False and d['independentClinicalValidation'] is False
    assert d['empiricallyCalibratedDifficulty'] is False and d['exposureOrMasteryInferred'] is False
    assert d['factsReviewed']==len(d['facts'])
    assert d['summary']==dict(Counter(f['assessment'] for f in d['facts']))
    for field,sha in d['reviewedSourceFieldSha256'].items():
        assert hashlib.sha256(m.get(field,'').encode()).hexdigest()==sha,('Source changed after review',item,field)
    for f in d['facts']:
        assert f['sourceExcerpt'] in m[f['sourceField']],('Unsupported source excerpt',item,f['fact'])
        assert f['coverageCredit']==(f['assessment'] in tested),('Unresolved fact credited',item,f['fact'])
        if f['coverageCredit']:assert f['learningPointIds'] and f['rationale']
        assert {e['learningPointId'] for e in f['observedQuestionEvidence']}==set(f['learningPointIds'])
        for e in f['observedQuestionEvidence']:
            q=qs[e['learningPointId']]
            assert q['id']==e['questionId'] and fingerprint(q)==e['sha256'],('Question changed after review',item,f['fact'])
review=load('exams/authoring/fact-coverage-batch-20261106-r2.json')
for row in review['newQuestions']+review['revisedQuestions']:
    b=banks[row['itemId']];point=row['itemId']+'::'+row['concept']
    q=next(q for q in b['exams'][0]['questions'] if q['learningPointIds']==[point])
    assert b['exams'][0]['correctionRevision']==review['revision']
    assert all(e['questions']==b['exams'][0]['questions'] for e in b['exams'])
    if 'sourceExcerpt' in row:assert row['sourceExcerpt'] in materials[row['itemId']][row['sourceField']]
# Regression: the original time question used to give away the separately
# tested ECG/BP answer. Also prevent the copied drug name from reappearing.
q=next(q for q in banks['ccu-verapamil']['exams'][0]['questions'] if q['learningPointIds']==['ccu-verapamil::slow_iv'])
assert 'ECG' not in q['stem'] and 'BP' not in q['stem']
q=next(q for q in banks['ed-captopril-tablets']['exams'][0]['questions'] if q['learningPointIds']==['ed-captopril-tablets::ace_history'])
assert 'captopril' in q['stem'] and 'enalapril' not in q['stem']
print('PASS: four source-fact records match source hashes and exact scored-question fingerprints; unresolved facts uncredited, same-form stages and targeted wording regressions preserved.')
