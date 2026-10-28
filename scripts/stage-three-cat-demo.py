#!/usr/bin/env python3
"""Stage the exact three Cat audition bundles for a limited demo, offline.

All lesson clips and receipts are verified. Human listening and native-speaker
review remain pending. This script does not change the live app or use credits.
"""
import argparse
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

pilot = module('cat_demo_pilot', ROOT / 'scripts/three-language-cat-pilot.py')
spain = module('cat_demo_activation', ROOT / 'scripts/spain-narration.py')
activation = spain.activation

def stage(shared):
    sources = {s['locale']: s for s in json.loads(subprocess.check_output(
        ['node', 'scripts/three-language-cat-pilot.mjs'], cwd=ROOT, text=True, timeout=60))}
    plans = pilot.plans()
    root = ROOT / 'media/elevenlabs'
    activation.ROOT = ROOT
    activation.no_symlinks(root)
    root.mkdir(parents=True, exist_ok=True)
    destination = root / 'three-cat-demo'
    if destination.exists() or destination.is_symlink():
        raise activation.SafeError('Demo stage already exists; inspect it rather than overwriting.')
    with tempfile.TemporaryDirectory(prefix='.three-cat-demo-', dir=root) as temporary:
        temp = Path(temporary)
        for plan in plans:
            locale = plan['locale']
            source = sources[locale]
            language, voice = pilot.VOICES[locale]
            identity = pilot.audio.sha(pilot.audio.canonical(plan))
            activation.ROOT = shared
            bundle = activation.bundle_directory(shared / 'media/elevenlabs/bundles' / identity)
            if activation.read_json(bundle / 'plan.json') != plan:
                raise activation.SafeError('Pilot plan differs from the source-linked plan.')
            descriptor = activation.read_json(bundle / 'bundle.json')
            if descriptor.get('musicLevels') != [] or descriptor.get('musicLessons', []) != [] or (bundle / 'music-manifest.json').exists():
                raise activation.SafeError('A narration-only pilot cannot replace music.')

            def check_request(clip, spec, kind):
                payload = {'inputs': [{'text': clip.get('text'), 'voice_id': voice}],
                           'model_id': 'eleven_v4', 'language_code': language}
                if (kind != 'narration' or clip.get('voiceId') != voice or clip.get('model') != 'eleven_v4'
                        or spec.get('voiceId') != voice or spec.get('payload') != payload
                        or clip.get('generationSettings') != payload):
                    raise activation.SafeError('Pilot voice, text or generation settings do not match.')
                stripped = {k: v for k, v in payload.items() if k != 'language_code'}
                spain._base_request({**clip, 'generationSettings': stripped}, {**spec, 'payload': stripped}, kind)

            activation.checked_request, activation.checked_receipt = check_request, spain.checked_spain_receipt
            try:
                metadata, assets, music = activation.prepare_bundle(bundle, source['texts'])
                if music: raise activation.SafeError('Pilot unexpectedly contains music.')
                spain.decode_assets(assets)
            finally:
                activation.checked_request, activation.checked_receipt = spain._base_request, spain._base_receipt
            manifest = metadata['src/narration-manifest.json']
            manifest.pop('activatedAt', None)
            manifest.update(locale=locale, selectedVoiceId=voice, coveredLessons=['cat'], partialCatalogue=True,
                            reviewStatus='demo-native-and-listening-review-pending',
                            review={'operatorConfirmedReviewed': False, 'nativeSpeakerReview': 'pending',
                                    'fullHumanListeningReview': 'pending',
                                    'automatedChecks': ['source text and Cat coverage', 'voice and request identity',
                                                        'receipts, hashes, encoding and full MP3 decode']})
            clips = manifest['clips']
            files = {f'src/narration-index.{locale}.json': metadata['src/narration-index.json'],
                     f'src/narration-durations.{locale}.json': {k: math.floor(c['duration'] * 1000 + 0.5) for k, c in clips.items()},
                     f'src/narration-manifest.{locale}.json': manifest,
                     f'src/narration-availability.{locale}.json': {'schemaVersion': 1, 'locale': locale, 'lessons': ['cat']}}
            for path, content in files.items():
                path = temp / path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(activation.json_bytes(content))
            for src, asset in assets.items():
                path = temp / 'public' / src.lstrip('/')
                path.parent.mkdir(parents=True, exist_ok=True)
                if path.exists() and path.read_bytes() != asset['data']:
                    raise activation.SafeError('A duplicate demo asset has different bytes.')
                path.write_bytes(asset['data'])
            print(json.dumps({'locale': locale, 'keys': len(clips), 'assets': len(assets), 'planHash': identity}), flush=True)
        os.rename(temp, destination)
    print(json.dumps({'status': 'staged-review-pending', 'stage': str(destination)}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shared-root', type=Path, required=True)
    args = parser.parse_args()
    try: stage(args.shared_root.resolve())
    except (activation.SafeError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(f'Stopped safely: {error}', file=sys.stderr)
        sys.exit(1)
