#!/usr/bin/env python3
"""Verify a saved French plan against reviewed source without provider calls."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('french_plan', ROOT/'scripts/plan-french-narration.py')
planner=importlib.util.module_from_spec(spec); spec.loader.exec_module(planner)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('plan',type=Path)
args=parser.parse_args()
raw=args.plan.read_bytes(); saved=json.loads(raw)
expected=planner.build_plan()
if saved != expected:
    raise SystemExit('French plan differs from the current reviewed source or canonical request specs.')
if any(item['payload'].get('language_code') != 'fr' or item['payload'].get('model_id') != 'eleven_v4'
       or item['payload']['inputs'][0]['voice_id'] != planner.VOICE_ID
       for item in saved['requests'].values()):
    raise SystemExit('French plan has a mismatched language, model, or voice.')
print(json.dumps({'sha256':hashlib.sha256(raw).hexdigest(),'locale':saved['locale'],
                  'keys':len(saved['entries']),'requests':len(saved['requests']),
                  'speechCharacters':saved['speechCharacters'],'status':saved['reviewStatus']},indent=2))
