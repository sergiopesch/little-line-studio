#!/usr/bin/env python3
"""Build an offline, locale-bound plan from the completely reviewed French catalogue.

No credentials or provider calls. The account-wide generation runner must verify
its own budget, supported rate, language and canonical request identities.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
VOICE_ID = 'tKaoyJLW05zqV0tIH9FD'
SAMPLE = 'Bonjour, nous allons dessiner ensemble. Prends une feuille et tes crayons. Commençons par une petite ligne.'

def build_plan():
    result = subprocess.run(['node', 'scripts/export-reviewed-french.mjs'], cwd=ROOT,
                            check=True, capture_output=True, text=True)
    data = json.loads(result.stdout)
    if data.get('locale') != 'fr-FR' or data.get('reviewStatus') != 'assistant-reviewed-awaiting-native-human-review' or data.get('count') != 30:
        raise ValueError('The reviewed French source catalogue is not complete.')
    texts = {'sample': SAMPLE, **data['texts']}
    if len(texts) != 1461:
        raise ValueError('Expected the sample and exactly 1,460 instruction/hint keys.')
    spec = importlib.util.spec_from_file_location('elevenlabs_audio', ROOT / 'scripts/elevenlabs-audio.py')
    audio = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audio)
    args = argparse.Namespace(model_id='eleven_v4', voice_id=VOICE_ID, music_seconds=120,
                              sample_only=False, lessons=None, kind='speech', locale='fr-FR')
    base = audio.make_plan(args, texts)
    # Existing make_plan only adds an explicit language for Spanish. Binding
    # this payload to French also binds the canonical cache identity to it.
    id_map, requests = {}, {}
    for old_id, entry in base['requests'].items():
        entry = dict(entry)
        payload = dict(entry['payload']); payload['language_code'] = 'fr'
        entry['payload'] = payload
        canonical_spec = {k:v for k,v in entry.items() if k not in ('cacheKey','estimatedUsd')}
        identity = audio.sha(audio.canonical(canonical_spec))
        entry['cacheKey'] = identity
        id_map[old_id] = identity
        requests[identity] = entry
    base.update(locale='fr-FR', voiceId=VOICE_ID, reviewStatus=data['reviewStatus'],
                entries={k:id_map[v] for k,v in base['entries'].items()}, requests=requests,
                generationStatus='unprepared',
                localeContract='French fr-FR; dialogue payload language_code fr',
                humanReview={'nativeSpeaker':'pending','fullListening':'pending'})
    return base

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='Output plan path in ignored media/elevenlabs')
    args=parser.parse_args()
    parent=(ROOT / 'media/elevenlabs').resolve()
    output=args.output.resolve()
    if output.parent != parent or output.suffix != '.json':
        raise SystemExit('Output must be a JSON file directly in ignored media/elevenlabs.')
    plan=build_plan()
    parent.mkdir(parents=True,exist_ok=True)
    spec=importlib.util.spec_from_file_location('elevenlabs_audio', ROOT/'scripts/elevenlabs-audio.py')
    audio=importlib.util.module_from_spec(spec); spec.loader.exec_module(audio)
    audio.write_json(output,plan)
    print(json.dumps({'path':str(output),'locale':plan['locale'],'voiceId':plan['voiceId'],
        'keys':len(plan['entries']),'uniqueRequests':len(plan['requests']),
        'speechCharacters':plan['speechCharacters'],'creditCeilingAtOnePerCharacter':plan['speechCharacters']},indent=2))

if __name__ == '__main__':
    main()
