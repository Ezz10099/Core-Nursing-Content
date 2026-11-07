#!/usr/bin/env python3
"""Package the authored banks and their exact teaching source for offline use."""
import copy
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'runtime/files/js/exam-data.js'
def build():
    content=json.loads((ROOT/'content.json').read_text())
    catalog=json.loads((ROOT/'exams/generated/catalog.json').read_text())
    source=json.loads((ROOT/'exams/sources.json').read_text())
    evidence={s['id']:s for s in source['sources']}
    materials={m['id']:m for m in content['medications']+content['targetedMedications']+content['lessons']}
    fields=[('drugclass','Drug class'),('mechanism','Mechanism of action'),('use','Main use'),('administration','Form & administration'),('monitor','Nursing considerations'),('why','Essential rationale'),('availability','Palestine availability')]
    profiles=json.loads((ROOT/'exams/authoring/medication-profiles.json').read_text())
    banks=[]
    edits=json.loads((ROOT/'exams/authoring/comprehensive-edits.json').read_text())
    revisions=json.loads((ROOT/'exams/authoring/medication-question-revisions.json').read_text())
    def cue_score(q):
        if q['format']!='single-best-answer':return 0
        key=next(c for c in q['choices'] if c['id']==q['answerKey'])
        wrong=[c for c in q['choices'] if c['id']!=q['answerKey']]
        lengths=sorted(len(c['text'].split()) for c in wrong)
        return max(0,len(key['text'].split())-lengths[1]-3)*2+sum(bool(re.search(r'\b(only|alone|regardless|always|harmless|no need)\b',c['text'],re.I)) for c in wrong)*3
    for path in sorted((ROOT/'exams/generated').glob('banks-*.json')):
        for bank in json.loads(path.read_text())['banks']:
            m=materials[bank['itemId']]
            bank['bankVersion']=catalog['bankVersion']+1
            bank['legacyBankVersion']=catalog['bankVersion']
            bank['sources']=[{k:evidence[sid][k] for k in ('id','title','url','filename') if k in evidence[sid]} for sid in bank.pop('evidenceIds')]
            if bank['itemType']=='medication':
                units=[{'field':key,'label':label,'text':m.get(key,'')} for key,label in fields]
                bank['sourceFields']={key:m.get(key,'') for key,_ in fields}
            else:
                units=[{'label':s['label'],'text':'\n\n'.join(str(s[k]) for k in ('prompt','text','leftTitle','leftText','rightTitle','rightText') if s.get(k))} for s in m['sections']]
                bank['sourceFields']={'sections':m['sections']}
            bank['readingSections']=[dict(u,id='section-'+str(i)+'-'+hashlib.sha256(u['text'].encode()).hexdigest()[:16]) for i,u in enumerate(units)]
            for exam in bank['exams']:
                for q in exam['questions']:
                    q.pop('sourceRefs',None)
                exam['timing']['timerEnforcement']='persisted total deadline: 90 seconds multiplied by question count'
            # Keep old forms available for exact historical review, never for new starts.
            bank['legacyExams']=copy.deepcopy(bank['exams'])
            base=copy.deepcopy(next(e for e in bank['exams'] if e['stage']=='7-day'))
            candidates={}
            for old in bank['legacyExams']:
                for q in old['questions']:candidates.setdefault(q['learningPointIds'][0],[]).append(q)
            base['questions']=[copy.deepcopy(min(candidates[q['learningPointIds'][0]],key=cue_score)) for q in base['questions']]
            bank['scoringExclusions']=[]
            revised=[]
            for q in base['questions']:
                review=revisions['items'].get(q['learningPointIds'][0]) if bank['itemType']=='medication' else None
                if review and review['action']=='omit':
                    bank['scoringExclusions'].append({'learningPointId':q['learningPointIds'][0],**review})
                    continue
                if review:
                    q={**copy.deepcopy(review['question']),'id':q['id'],'points':1,'learningPointIds':q['learningPointIds'],'revision':revisions['revision'],'sourceFields':review['sourceFields']}
                revised.append(q)
            base['questions']=revised
            base['questionCount']=len(revised)
            # Explicitly refresh only corrected saved forms at their next start.
            # New content alone must not silently replace a pinned spaced form.
            if bank['scoringExclusions'] or any(q.get('revision') for q in revised):
                base['correctionRevision']=revisions.get('correctionRevisions',{}).get(bank['itemId'],revisions['revision'])
                bank['bankVersion']+=1
            base['model']='comprehensive-v1'
            base['passRule']={'type':'error-count','allowedErrors':1 if len(base['questions'])<10 else 2}
            base['timing']={'timed':False,'secondsPerQuestion':None,'timerEnforcement':'untimed'}
            base['retestPolicy']='same comprehensive exam and questions at every stage'
            base['feedback']='incorrect, unanswered and unsure/guessed questions only after submission'
            for q in base['questions']:
                concept=q['learningPointIds'][0].split('::',1)[1]
                edit=edits.get(bank['itemId']+'::'+concept,edits.get(concept))
                if edit and not q.get('revision'):
                    if 'stem' in edit:q['stem']=edit['stem'].replace('{drug}',bank['title'])
                    if 'choices' in edit:
                        key=next(c for c in q['choices'] if c['id']==q['answerKey'])
                        key['text']=edit.get('correct',key['text']).replace('{drug}',bank['title'])
                        for choice,replacement in zip([c for c in q['choices'] if c['id']!=q['answerKey']],edit['choices']):
                            choice['text']=replacement[0]
                            choice['explanation']=replacement[1]
                if concept=='principal-action' and not q.get('revision'):
                    profile=profiles['items'][bank['itemId']];family=profile['family'];group=profiles['families'][family]['group']
                    peers={
                        'bp':['ace','arb','beta1','nitrate','tamsulosin'],
                        'vascular':['ace','arb','atropine','adenosine','nitrate','norepinephrine','dobutamine'],
                        'antithrombotic':['aspirin','clopidogrel','warfarin','alteplase','tranexamic'],
                        'antibiotic':['beta_lactam','aminoglycoside','fluoroquinolone','metronidazole','glycopeptide'],
                        'rhythm':['atropine','adenosine','digoxin','propafenone'],
                        'neuro':['gabapentin','benzodiazepine','ketamine','sodium_anticonvulsant','nsaid'],
                        'pain':['nsaid','gabapentin','benzodiazepine','ketamine'],
                        'renal':['loop','spironolactone','sglt2','insulin'],
                        'respiratory':['saba','ipratropium','steroid','metoclopramide'],
                        'gi':['ppi','metoclopramide','ondansetron','lactulose','antispasmodic'],
                        'electrolyte':['bicarbonate','dextrose','calcium','magnesium'],
                        'metabolic':['statin','vitamin_k','insulin','warfarin'],
                        'combination':['ace','beta1','nitrate','metoclopramide']
                    }[group]
                    # Do not present overlapping class actions as false alternatives.
                    equivalent=[{'beta_lactam','cefazolin','ceftazidime','meropenem'},{'linezolid','clindamycin'},{'ufh','lmwh'},{'propafenone','lidocaine'},{'beta1','nonselective_beta','alpha_beta'},{'hydralazine','dhp'},{'tramadol','opioid','tca'},{'paracetamol','metamizole','nsaid'}]
                    excluded={family}
                    for shared in equivalent:
                        if family in shared:excluded|=shared
                    wrong=[c for c in q['choices'] if c['id']!=q['answerKey']]
                    alternatives=[key for key in peers if key not in excluded]
                    for choice,key in zip(wrong,alternatives[:3]):
                        name,action=profiles['families'][key]['pair'].split(': ',1)
                        action={'saba':'selectively stimulates beta2 receptors','ipratropium':'blocks muscarinic receptors in the airways','beta1':'selectively blocks cardiac beta1 receptors','calcium':'supplies calcium for replacement or membrane stabilization'}.get(key,action)
                        choice['text']=action[0].upper()+action[1:]
                        choice['explanation']='This describes '+name+'. '+profiles['families'][family]['why']
                q['id']=bank['itemId']+'--comprehensive--'+q['learningPointIds'][0].split('::',1)[1]
            # Balance key positions once; every spaced stage copies the same form.
            mcqs=[q for q in base['questions'] if q['format']=='single-best-answer']
            for index,q in enumerate(sorted(mcqs,key=lambda q:hashlib.sha256(q['id'].encode()).hexdigest())):
                correct=next(c for c in q['choices'] if c['id']==q['answerKey'])
                other=[c for c in q['choices'] if c['id']!=q['answerKey']]
                position=index%4
                other.insert(position,correct)
                for letter,choice in zip('ABCD',other):choice['id']=letter
                q['choices']=other;q['answerKey']='ABCD'[position]
            bank['exams']=[]
            for stage in ('comprehensive','7-day','21-day'):
                form=copy.deepcopy(base)
                form['stage']=stage
                form['id']=bank['itemId']+'--'+stage
                bank['exams'].append(form)
            banks.append(bank)
    # Explicit mappings preserve old progress IDs; they do not migrate old quizzes into passes.
    aliases={
        'ccu-4':'ccu-isosorbide-mononitrate','ccu-7':'ccu-isosorbide-dinitrate','ccu-10':'ccu-nadroparin','ccu-13':'ccu-enoxaparin','heparin':'ccu-heparin-ufh','ccu-19':'ccu-aspirin','ccu-22':'ccu-clopidogrel','ccu-25':'ccu-bisoprolol','ccu-28':'ccu-metoprolol','ccu-31':'ccu-propranolol','ccu-34':'ccu-amlodipine','ccu-37':'ccu-verapamil','ccu-40':'ccu-enalapril','ccu-43':'ccu-atorvastatin','ccu-46':'ccu-furosemide','ccu-49':'ccu-dapagliflozin','ccu-52':'ccu-correction-insulin','norepinephrine':'ccu-norepinephrine','ccu-58':'ccu-dobutamine','ccu-61':'ccu-dopamine','atropine':'ccu-atropine','ccu-67':'ccu-pantoprazole','ccu-70':'ccu-omeprazole','ccu-72':'ccu-metronidazole','ccu-75':'ibd2-fortum-ceftazidime','ccu-78':'ccu-linezolid','ccu-81':'ibd2-levox-levofloxacin','ccu-84':'ccu-salbutamol','ccu-87':'ccu-nystatin','ccu-90':'ccu-betahistine','ccu-98':'ccu-propafenone','ccu-102':'ccu-valzadepine','ccu-106':'ccu-valzan-hct','ccu-110':'ccu-symbicort','ccu-115':'ccu-gentamicin','ccu-120':'ccu-ipratropium','ccu-124':'ccu-adenosine','ccu-128':'ccu-labetalol','ccu-132':'ccu-ketamine','ccu-137':'ccu-pethidine','ccu-141':'ccu-morphine','trolley-3':'trolley-spironolactone','trolley-6':'trolley-lidocaine','trolley-9':'trolley-sodium-bicarbonate','trolley-12':'ccu-labetalol','trolley-15':'trolley-hydralazine','trolley-17':'trolley-dextrose50','trolley-20':'trolley-hydrocortisone','trolley-23':'ccu-isosorbide-dinitrate','trolley-26':'trolley-diazepam','trolley-32':'trolley-amiodarone','trolley-35':'trolley-calcium-gluconate','trolley-38':'trolley-magnesium-sulfate','trolley-41':'ccu-adenosine','trolley-44':'trolley-digoxin','trolley-47':'trolley-aminophylline'}
    assert all(v in materials for v in aliases.values())
    compact=lambda value:json.dumps(value,ensure_ascii=False,separators=(',',':')).replace('\u2028','\\u2028').replace('\u2029','\\u2029')
    data={'schemaVersion':1,'sourceContentVersion':content['contentVersion'],'aliases':aliases,'banks':[]}
    header='/* Generated by scripts/build_runtime_exam_data.py; do not edit. */\n'
    outputs={OUT:header+'window.CoreNursingExamData='+compact(data)+';\n'}
    for i,start in enumerate(range(0,len(banks),20),1):
        outputs[OUT.with_name(f'exam-data-{i:02d}.js')]=header+'window.CoreNursingExamData.banks.push(...'+compact(banks[start:start+20])+');\n'
    return outputs

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args();outputs=build()
    if args.check:
        if any(not path.exists() or path.read_text()!=text for path,text in outputs.items()):raise SystemExit('Runtime exam data needs rebuilding.')
        print('Runtime exam data is reproducible.')
    else:
        for path,text in outputs.items():path.write_text(text)
        print(f'Packaged {sum(len(text.encode()) for text in outputs.values())} bytes of offline exam data in {len(outputs)} files.')
