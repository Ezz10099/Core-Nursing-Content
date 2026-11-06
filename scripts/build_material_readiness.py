#!/usr/bin/env python3
"""Package editorial readiness separately from learner progress.

No partial audit, passing score, or generated question count grants completion.
"""
import argparse
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'runtime/files/js/readiness-data.js'
def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def complete_proof(item,record,material,bank):
    path=(ROOT/record.get('reviewRecord','')).resolve()
    if not path.is_relative_to(ROOT/'exams/authoring') or not path.is_file():
        raise ValueError('Completed material needs a source-fact review record: '+item)
    review=json.loads(path.read_text())
    if review.get('medicationId',review.get('itemId'))!=item:raise ValueError('Review item mismatch: '+item)
    if review.get('certifiedFullCoverage') is not True or review.get('authorQuestionReviewComplete') is not True:
        raise ValueError('Incomplete author review cannot be marked complete: '+item)
    if not review.get('facts'):raise ValueError('Missing fact inventory: '+item)
    points={p for q in bank['exams'][0]['questions'] for p in q.get('learningPointIds',[])}
    for fact in review['facts']:
        if fact.get('requiredForCoverage',True) and fact.get('coverageCredit') is not True:
            raise ValueError('Unresolved required fact: '+item)
        if fact.get('requiredForCoverage',True):
            links=fact.get('learningPointIds',[])
            if not links or not set(links).issubset(points):raise ValueError('Fact has no scored question: '+item)
            field=material.get(fact.get('sourceField'))
            def strings(value):
                if isinstance(value,str):return value
                if isinstance(value,list):return '\n'.join(strings(v) for v in value)
                if isinstance(value,dict):return '\n'.join(strings(v) for v in value.values())
                return ''
            if not fact.get('sourceExcerpt') or fact['sourceExcerpt'] not in strings(field):raise ValueError('Unsupported fact: '+item)
        if not fact.get('requiredForCoverage',True) and not fact.get('rationale'):
            raise ValueError('Unjustified exclusion: '+item)
    hashes=review.get('reviewedSourceFieldSha256',{})
    fields=set(bank['sourceFields'])|({'memoryUse','memoryDanger'} if bank['itemType']=='medication' else set())
    for field in fields:
        value=material.get(field,'')
        raw=value if isinstance(value,str) else json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':'))
        if hashes.get(field)!=hashlib.sha256(raw.encode()).hexdigest():raise ValueError('Stale source review: '+item)
    if review.get('questionSetSha256')!=digest(bank['exams'][0]['questions']):raise ValueError('Stale question review: '+item)
    return True

def build():
    config=json.loads((ROOT/'exams/authoring/material-readiness.json').read_text())
    content=json.loads((ROOT/'content.json').read_text())
    materials={m['id']:m for m in content['medications']+content['targetedMedications']+content['lessons']}
    banks=[]
    for path in sorted((ROOT/'runtime/files/js').glob('exam-data-[0-9][0-9].js')):
        banks+=json.loads(path.read_text().split('banks.push(...',1)[1].rsplit(');',1)[0])
    items={}
    for bank in banks:
        item=bank['itemId'];record=config['items'].get(item,{});status=record.get('status',config['defaultStatus'])
        if status not in ('complete','in_review','not_reviewed'):raise ValueError('Unknown readiness status: '+item)
        if status=='complete':complete_proof(item,record,materials[item],bank)
        items[item]={'status':status,'bankVersion':bank['bankVersion'],'correctionRevision':bank['exams'][0].get('correctionRevision',''),'readingSectionIds':[s['id'] for s in bank['readingSections']]}
    unknown=set(config['items'])-set(items)
    if unknown:raise ValueError('Unknown material IDs: '+str(sorted(unknown)))
    data={'schemaVersion':1,'items':items}
    return '/* Generated editorial readiness; independent of learner progress. */\nwindow.CoreNursingReadinessData='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n'
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args();value=build()
    if args.check:
        if not OUT.exists() or OUT.read_text()!=value:raise SystemExit('Editorial readiness needs rebuilding.')
        print('Editorial readiness is reproducible; completion requires explicit current review evidence.')
    else:OUT.write_text(value);print('Packaged editorial readiness.')
