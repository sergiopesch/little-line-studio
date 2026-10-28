#!/usr/bin/env python3
"""Verify, stage or activate a complete Spain Spanish audio bundle offline.

No provider requests. Validation uses exact source text, request and receipt
identities, and fully decodes the verified audio bytes. Local activation has a
recovery journal and explicitly records native and human review as pending.
"""
import argparse
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
LOCALE = 'es-ES'
VOICE = 'BkOojM1ZhtSAHgsAkMx2'
MODEL = 'eleven_v4'

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result

generator = module('spain_generator', ROOT / 'scripts/elevenlabs-audio.py')
activation = module('spain_activation', ROOT / 'scripts/activate-elevenlabs.py')
planner = module('spain_planner', ROOT / 'scripts/three-language-full.py')
SafeError = activation.SafeError
_base_request = activation.checked_request
_base_receipt = activation.checked_receipt

def checked_spain_request(clip, spec, kind):
    if not isinstance(clip, dict) or not isinstance(spec, dict) or kind != 'narration':
        raise SafeError('Spain bundle supports narration only.')
    payload = {'inputs': [{'text': clip.get('text'), 'voice_id': VOICE}],
               'model_id': MODEL, 'language_code': 'es'}
    if (clip.get('voiceId') != VOICE or clip.get('model') != MODEL or spec.get('voiceId') != VOICE
            or spec.get('payload') != payload or clip.get('generationSettings') != payload):
        raise SafeError('Spain speech does not match the selected voice, model, text and language.')
    stripped = {key: value for key, value in payload.items() if key != 'language_code'}
    _base_request({**clip, 'generationSettings': stripped}, {**spec, 'payload': stripped}, kind)

def checked_spain_receipt(clip, spec, data):
    _base_receipt(clip, spec, data)
    folder = activation.ROOT / 'media/elevenlabs/cache' / clip['cacheKey']
    receipt = activation.read_json(folder / 'receipt.json')
    raw = activation.read_bytes(folder / 'raw.mp3', activation.MAX_ASSET_BYTES)
    if not isinstance(receipt.get('rawSha256'), str) or generator.sha(raw) != receipt['rawSha256']:
        raise SafeError('The raw response does not match its recorded hash.')

def frozen_source():
    try:
        output = subprocess.check_output(['node', 'scripts/three-language-full-texts.mjs'], cwd=ROOT,
                                         text=True, stderr=subprocess.PIPE, timeout=60)
        source = next(item for item in json.loads(output) if item['locale'] == LOCALE)
        data = subprocess.check_output(['node', 'scripts/export-spain-lessons.mjs'], cwd=ROOT,
                                       text=True, stderr=subprocess.PIPE, timeout=60)
        lessons = sorted(json.loads(data)['lessons'])
        if len(source['texts']) != 1461 or len(lessons) != 30 or source['voice'] != VOICE:
            raise ValueError
        return source['texts'], lessons
    except (OSError, KeyError, ValueError, StopIteration, TypeError, subprocess.SubprocessError):
        raise SafeError('The complete source-linked Spain Spanish catalogue cannot be verified.') from None

def decode_assets(assets):
    for asset in assets.values():
        try:
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'pipe',
                            '-i', 'pipe:0', '-f', 'null', '-'], check=True, input=asset['data'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=90)
        except (OSError, subprocess.SubprocessError):
            raise SafeError('A Spain Spanish MP3 failed full decode.') from None

def check_bundle(shared_root, selected, expected_hash):
    texts, lessons = frozen_source()
    plan = next(p for p in planner.full_plans() if p['locale'] == LOCALE)
    shared_root = Path(shared_root).resolve()
    activation.ROOT = shared_root
    bundle = activation.bundle_directory(selected)
    identity = generator.sha(generator.canonical(plan))
    if (not isinstance(expected_hash, str) or not re.fullmatch(r'[0-9a-f]{64}', expected_hash)
            or identity != expected_hash or bundle.name != identity or activation.read_json(bundle / 'plan.json') != plan):
        raise SafeError('Bundle does not match the exact current source-linked plan.')
    descriptor = activation.read_json(bundle / 'bundle.json')
    if descriptor.get('musicLevels') != [] or descriptor.get('musicLessons', []) != [] or (bundle / 'music-manifest.json').exists():
        raise SafeError('The Spain Spanish bundle must not replace music.')
    activation.checked_request, activation.checked_receipt = checked_spain_request, checked_spain_receipt
    try:
        metadata, assets, levels = activation.prepare_bundle(bundle, texts)
        if levels: raise SafeError('The bundle must not replace music.')
        decode_assets(assets)
    finally:
        activation.checked_request, activation.checked_receipt = _base_request, _base_receipt
    manifest = metadata['src/narration-manifest.json']; clips = manifest['clips']
    manifest.pop('activatedAt', None)
    manifest.update(locale=LOCALE, selectedVoiceId=VOICE, coveredLessons=lessons, partialCatalogue=False,
                    reviewStatus='full-catalogue-review-pending',
                    review={'operatorConfirmedReviewed': False, 'nativeSpeakerReview': 'pending',
                            'fullHumanListeningReview': 'pending',
                            'automatedChecks': ['source text and catalogue coverage', 'locale, voice and request identity',
                                                'receipts, raw and normalized hashes, MP3 encoding and full decode']})
    release = {
        'src/narration-index.es-ES.json': metadata['src/narration-index.json'],
        'src/narration-durations.es-ES.json': {key: math.floor(clip['duration'] * 1000 + 0.5) for key, clip in clips.items()},
        'src/narration-manifest.es-ES.json': manifest,
        'src/narration-availability.es-ES.json': {'schemaVersion': 1, 'locale': LOCALE, 'lessons': lessons},
    }
    return identity, lessons, release, assets

def stage_release(shared_root, selected, expected_hash):
    identity, lessons, metadata, assets = check_bundle(shared_root, selected, expected_hash)
    directory = ROOT / 'media/elevenlabs'; activation.ROOT = ROOT
    activation.no_symlinks(directory)
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / ('spain-release-' + identity)
    if destination.exists() or destination.is_symlink(): raise SafeError('Staged release already exists; inspect it instead of overwriting.')
    temporary = Path(tempfile.mkdtemp(prefix='.spain-release-', dir=directory))
    try:
        for source, asset in assets.items(): activation.atomic_write(temporary / 'public' / source.lstrip('/'), asset['data'])
        for name, data in metadata.items(): activation.atomic_write(temporary / name, activation.json_bytes(data))
        os.rename(temporary, destination)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return {'status': 'staged-review-pending', 'locale': LOCALE, 'planHash': identity,
            'lessons': len(lessons), 'narrationKeys': len(metadata['src/narration-index.es-ES.json']),
            'uniqueAssets': len(assets), 'stage': str(destination)}

def activate_release(shared_root, selected, expected_hash):
    identity, lessons, metadata, assets = check_bundle(shared_root, selected, expected_hash)
    activation.ROOT = ROOT
    backups = ROOT / 'media/elevenlabs/spain-activation-backups'
    activation.no_symlinks(backups)
    with activation.activation_lock():
        if backups.exists():
            for previous in backups.iterdir():
                activation.no_symlinks(previous)
                if not previous.is_dir() or activation.read_json(previous / 'activation.json').get('status') not in ('complete', 'rolled-back'):
                    raise SafeError('A previous Spain activation requires recovery before continuing.')
        snapshots = {}
        for relative in metadata:
            path = ROOT / relative; activation.no_symlinks(path)
            snapshots[relative] = activation.read_bytes(path, 12 * 1024 * 1024) if path.exists() else None
        for source, asset in assets.items():
            path = ROOT / 'public' / source.lstrip('/'); activation.no_symlinks(path)
            if path.exists() and activation.read_bytes(path, activation.MAX_ASSET_BYTES) != asset['data']:
                raise SafeError('An existing content-addressed asset contains different bytes.')
        backup = backups / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:12])
        activation.no_symlinks(backup); backup.mkdir(parents=True, mode=0o700)
        record = {'schemaVersion': 1, 'status': 'preparing', 'locale': LOCALE, 'sourcePlanHash': identity,
                  'voiceId': VOICE, 'coveredLessons': lessons, 'nativeSpeakerReview': 'pending',
                  'fullHumanListeningReview': 'pending', 'metadata': {}, 'newAssets': []}
        for relative, data in snapshots.items():
            record['metadata'][relative] = {'existed': data is not None, 'sha256': activation.sha(data) if data is not None else None}
        try:
            activation.atomic_write(backup / 'activation.json', activation.json_bytes(record), 0o600)
            for relative, data in snapshots.items():
                if data is not None: activation.atomic_write(backup / 'metadata' / relative, data, 0o600)
            record['status'] = 'prepared'; activation.atomic_write(backup / 'activation.json', activation.json_bytes(record), 0o600)
        except Exception:
            raise SafeError('Activation preparation failed; inspect the retained journal before continuing.') from None
        created = []
        try:
            for source, asset in assets.items():
                destination = ROOT / 'public' / source.lstrip('/')
                if not destination.exists():
                    created.append(destination)
                    record['newAssets'] = [path.relative_to(ROOT).as_posix() for path in created]
                    activation.atomic_write(backup / 'activation.json', activation.json_bytes(record), 0o600)
                    activation.atomic_write(destination, asset['data'])
            # The availability descriptor is written last.
            for relative, value in metadata.items(): activation.atomic_write(ROOT / relative, activation.json_bytes(value))
            record['status'] = 'complete'; activation.atomic_write(backup / 'activation.json', activation.json_bytes(record), 0o600)
        except Exception:
            restored = True
            for relative, data in snapshots.items():
                try:
                    path = ROOT / relative
                    if data is None: path.unlink(missing_ok=True)
                    else: activation.atomic_write(path, data)
                except OSError: restored = False
            if restored:
                for path in created:
                    try: path.unlink(missing_ok=True)
                    except OSError: restored = False
            record['status'] = 'rolled-back' if restored else 'recovery-required'
            try: activation.atomic_write(backup / 'activation.json', activation.json_bytes(record), 0o600)
            except OSError: pass
            raise SafeError('Activation failed; previous state was restored.' if restored else 'Activation requires recovery from its retained journal.') from None
    return {'status': 'activated-review-pending', 'locale': LOCALE, 'planHash': identity,
            'lessons': len(lessons), 'narrationKeys': len(metadata['src/narration-index.es-ES.json']),
            'uniqueAssets': len(assets), 'backup': str(backup)}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--verify-bundle', metavar='BUNDLE')
    group.add_argument('--stage-release', metavar='BUNDLE')
    group.add_argument('--activate', metavar='BUNDLE', help='Activate locally with native and full listening review still pending.')
    parser.add_argument('--shared-root', type=Path, required=True)
    parser.add_argument('--plan-hash', required=True)
    args = parser.parse_args()
    if args.stage_release: result = stage_release(args.shared_root, args.stage_release, args.plan_hash)
    elif args.activate: result = activate_release(args.shared_root, args.activate, args.plan_hash)
    else:
        identity, lessons, metadata, assets = check_bundle(args.shared_root, args.verify_bundle, args.plan_hash)
        result = {'status': 'verified-review-pending', 'locale': LOCALE, 'planHash': identity,
                  'lessons': len(lessons), 'narrationKeys': len(metadata['src/narration-index.es-ES.json']), 'uniqueAssets': len(assets)}
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    try: main()
    except (SafeError, generator.SafeError, OSError, ValueError) as error:
        print(f'Error: {error}', file=sys.stderr); sys.exit(1)
