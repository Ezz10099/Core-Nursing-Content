"""Completion-evidence guards; do not certify clinical accuracy."""
import hashlib
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('readiness',ROOT/'scripts/build_material_readiness.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
config=json.loads((ROOT/'exams/authoring/material-readiness.json').read_text())
packaged=json.loads(m.build().split('window.CoreNursingReadinessData=',1)[1].rsplit(';',1)[0])
for item,row in packaged['items'].items():
 assert row['status']==config['items'].get(item,{}).get('status',config['defaultStatus']), 'Do not infer author completion from generated banks or learner progress.'
with TemporaryDirectory() as temp:
 root=Path(temp);folder=root/'exams/authoring';folder.mkdir(parents=True)
 material={'monitor':'Source','memoryUse':'','memoryDanger':''};bank={'itemType':'medication','sourceFields':{'monitor':'Source'},'exams':[{'questions':[{'id':'q','answerKey':'A','learningPointIds':['test::point']}]}]}
 review={'itemId':'test','certifiedFullCoverage':True,'authorQuestionReviewComplete':True,'facts':[{'coverageCredit':True,'sourceField':'monitor','sourceExcerpt':'Source','learningPointIds':['test::point']}],'reviewedSourceFieldSha256':{k:hashlib.sha256(v.encode()).hexdigest() for k,v in material.items()},'questionSetSha256':m.digest(bank['exams'][0]['questions'])}
 record={'reviewRecord':'exams/authoring/proof.json'};p=folder/'proof.json'
 def check_failure():
  p.write_text(json.dumps(review))
  try:m.complete_proof('test',record,material,bank)
  except ValueError:return
  raise AssertionError('Invalid completion proof accepted')
 with patch.object(m,'ROOT',root):
  p.write_text(json.dumps(review));assert m.complete_proof('test',record,material,bank)
  review['facts'][0]['coverageCredit']=False;check_failure();review['facts'][0]['coverageCredit']=True
  review['authorQuestionReviewComplete']=False;check_failure();review['authorQuestionReviewComplete']=True
  review['reviewedSourceFieldSha256']['monitor']='stale';check_failure();review['reviewedSourceFieldSha256']['monitor']=hashlib.sha256(b'Source').hexdigest()
  review['facts'][0]['learningPointIds']=['test::missing'];check_failure();review['facts'][0]['learningPointIds']=['test::point']
  review['questionSetSha256']='stale';check_failure()
print('PASS: completed status requires current source and question review, with no unresolved required facts; current partial work cannot be promoted.')
