#!/usr/bin/env python3
"""Validate and stage an already generated French bundle offline.

No provider calls, credentials, retries or runtime activation. The bundle and
cache must be in this checkout's ignored media/elevenlabs directory.
"""
import argparse
import importlib.util
import json
import math
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
LOCALE = 'fr-FR'
VOICE = 'tKaoyJLW05zqV0tIH9FD'
MODEL = 'eleven_v4'


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


generator = load_module('french_generator', ROOT / 'scripts/elevenlabs-audio.py')
activation = load_module('french_activation', ROOT / 'scripts/activate-elevenlabs.py')
planner = load_module('french_planner', ROOT / 'scripts/plan-french-narration.py')
SafeError = activation.SafeError
_base_request = activation.checked_request
_base_receipt = activation.checked_receipt


def checked_french_request(clip, spec, kind):
    if not isinstance(clip, dict) or not isinstance(spec, dict) or kind != 'narration':
        raise SafeError('French bundle supports narration only.')
    payload = spec.get('payload')
    expected = {'inputs': [{'text': clip.get('text'), 'voice_id': VOICE}],
                'model_id': MODEL, 'language_code': 'fr'}
    if (clip.get('voiceId') != VOICE or clip.get('model') != MODEL or spec.get('voiceId') != VOICE
            or payload != expected or clip.get('generationSettings') != expected):
        raise SafeError('French speech must use the exact approved voice, model, text and French language code.')
    # Reuse every base request and encoding check without changing the bound
    # original; the base validator predates the optional language code.
    base_payload = {key: value for key, value in expected.items() if key != 'language_code'}
    _base_request({**clip, 'generationSettings': base_payload}, {**spec, 'payload': base_payload}, kind)


def checked_french_receipt(clip, spec, data):
    _base_receipt(clip, spec, data)
    folder = ROOT / 'media/elevenlabs/cache' / clip['cacheKey']
    receipt = activation.read_json(folder / 'receipt.json')
    raw = activation.read_bytes(folder / 'raw.mp3', activation.MAX_ASSET_BYTES)
    if not isinstance(receipt.get('rawSha256'), str) or generator.sha(raw) != receipt['rawSha256']:
        raise SafeError('The French raw response does not match its recorded hash.')


def frozen_source():
    try:
        output = subprocess.check_output(['node', 'scripts/export-reviewed-french.mjs'], cwd=ROOT,
                                         text=True, stderr=subprocess.PIPE, timeout=40)
        data = json.loads(output)
        if (data.get('locale') != LOCALE or data.get('count') != 30
                or data.get('reviewStatus') != 'assistant-reviewed-awaiting-native-human-review'):
            raise ValueError
        texts = {'sample': planner.SAMPLE, **data['texts']}
        lessons = sorted(data['lessons'])
        if len(texts) != 1461 or len(lessons) != 30 or len(set(lessons)) != 30:
            raise ValueError
        return texts, lessons
    except (OSError, KeyError, ValueError, TypeError, subprocess.SubprocessError):
        raise SafeError('The complete reviewed French source cannot be verified.') from None


def decode_assets(bundle, assets):
    for source in assets:
        # Decode exactly the verified bytes that will be staged, not a path
        # that could change between validation and copying.
        try:
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'pipe',
                            '-i', 'pipe:0', '-f', 'null', '-'], check=True, input=assets[source]['data'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=90)
        except (OSError, subprocess.SubprocessError):
            raise SafeError('A French staged MP3 failed full decode.') from None


def check_bundle(selected, approved_plan_hash):
    texts, lessons = frozen_source()
    plan = planner.build_plan()
    bundle = activation.bundle_directory(selected)
    canonical_hash = generator.sha(generator.canonical(plan))
    if (not isinstance(approved_plan_hash, str) or not re.fullmatch(r'[0-9a-f]{64}', approved_plan_hash)
            or canonical_hash != approved_plan_hash or bundle.name != canonical_hash
            or activation.read_json(bundle / 'plan.json') != plan):
        raise SafeError('Bundle does not match the exact current frozen French plan.')
    descriptor = activation.read_json(bundle / 'bundle.json')
    staged = activation.read_json(bundle / 'narration-manifest.json')
    for item in (descriptor, staged):
        if item.get('locale') != LOCALE or item.get('voiceId') != VOICE:
            raise SafeError('Bundle descriptor locale or voice differs from French approval.')
    if (descriptor.get('musicLevels') != [] or descriptor.get('musicLessons', []) != []
            or (bundle / 'music-manifest.json').exists()):
        raise SafeError('The French bundle must not contain music.')
    activation.checked_request = checked_french_request
    activation.checked_receipt = checked_french_receipt
    metadata, assets, levels = activation.prepare_bundle(bundle, texts)
    if levels:
        raise SafeError('The French bundle must not replace music.')
    decode_assets(bundle, assets)
    manifest = metadata['src/narration-manifest.json']
    clips = manifest['clips']
    manifest.pop('activatedAt', None)
    manifest.update(locale=LOCALE, selectedVoiceId=VOICE, coveredLessons=lessons,
                    partialCatalogue=False, reviewStatus='full-catalogue-review-pending',
                    review={'operatorConfirmedReviewed': False,
                            'nativeSpeakerReview': 'pending', 'fullHumanListeningReview': 'pending',
                            'automatedChecks': ['exact reviewed French source and lesson coverage',
                                'locale, voice, model, request and raw and normalized receipt identities',
                                'audio hashes, encoding, durations and full decode']})
    release = {
        'src/narration-index.fr-FR.json': metadata['src/narration-index.json'],
        'src/narration-durations.fr-FR.json': {key: math.floor(clip['duration'] * 1000 + 0.5)
                                               for key, clip in clips.items()},
        'src/narration-manifest.fr-FR.json': manifest,
        'src/narration-availability.fr-FR.json': {'schemaVersion': 1, 'locale': LOCALE, 'lessons': lessons},
    }
    return plan, lessons, release, assets


def stage_release(selected, approved_plan_hash):
    plan, lessons, metadata, assets = check_bundle(selected, approved_plan_hash)
    directory = ROOT / 'media/elevenlabs'
    identity = generator.sha(generator.canonical(plan))
    destination = directory / ('french-release-' + identity)
    activation.no_symlinks(directory)
    if destination.exists() or destination.is_symlink():
        raise SafeError('Staged French release already exists; inspect it rather than overwrite it.')
    temporary = Path(tempfile.mkdtemp(prefix='.french-release-', dir=directory))
    try:
        for source, asset in assets.items():
            activation.atomic_write(temporary / 'public' / source.lstrip('/'), asset['data'])
        for name, data in metadata.items():
            activation.atomic_write(temporary / name, activation.json_bytes(data))
        os.rename(temporary, destination)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return {'status': 'staged-review-pending', 'locale': LOCALE, 'bundlePlanHash': identity,
            'lessons': len(lessons), 'narrationKeys': len(metadata['src/narration-index.fr-FR.json']),
            'uniqueAssets': len(assets), 'stage': str(destination)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--verify-bundle', metavar='BUNDLE')
    group.add_argument('--stage-release', metavar='BUNDLE')
    parser.add_argument('--plan-hash', required=True, help='Approved canonical SHA-256 of the frozen plan.')
    args = parser.parse_args()
    if args.stage_release:
        result = stage_release(args.stage_release, args.plan_hash)
    else:
        plan, lessons, metadata, assets = check_bundle(args.verify_bundle, args.plan_hash)
        result = {'status': 'verified-review-pending', 'locale': LOCALE,
                  'bundlePlanHash': generator.sha(generator.canonical(plan)),
                  'lessons': len(lessons), 'narrationKeys': len(metadata['src/narration-index.fr-FR.json']),
                  'uniqueAssets': len(assets)}
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (SafeError, generator.SafeError, OSError, ValueError) as error:
        print(f'Error: {error}', file=sys.stderr)
        raise SystemExit(1)
