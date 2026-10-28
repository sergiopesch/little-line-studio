#!/usr/bin/env python3
"""Stage every fully cached lesson for a selected locale, without provider calls.

The current source-linked catalogue fixes voice, text and request identity.
Incomplete lessons are omitted. Native-speaker and human listening review are
recorded as pending; staging does not make either assertion or publish a site.
"""
import argparse
from decimal import Decimal
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

full = module('ready_full', ROOT / 'scripts/three-language-full.py')
dutch = module('ready_dutch', ROOT / 'scripts/dutch-narration.py')
spain = module('ready_activation', ROOT / 'scripts/spain-narration.py')
audio, activation = full.audio, spain.activation
VOICES = {**full.pilot.VOICES, **dutch.VOICES}

def completed_plan(plan, records):
    if records.get(plan['entries']['sample'], {}).get('status') != 'complete':
        raise activation.SafeError('The locale sample has not completed.')
    lessons = sorted({key.split('/')[0] for key in plan['entries'] if key != 'sample'})
    complete = [lesson for lesson in lessons if all(
        records.get(identity, {}).get('status') == 'complete'
        for key, identity in plan['entries'].items() if key.startswith(lesson + '/'))]
    if not complete:
        raise activation.SafeError('No complete lessons are available.')
    entries = {key: identity for key, identity in plan['entries'].items()
               if key == 'sample' or key.split('/')[0] in complete}
    requests = {identity: plan['requests'][identity] for identity in sorted(set(entries.values()))}
    estimate = sum((Decimal(r['estimatedUsd']) for r in requests.values()), Decimal(0))
    return {**plan, 'entries': entries, 'requests': requests, 'coveredLessons': complete,
            'partialCatalogue': len(complete) != len(lessons),
            'sourceCataloguePlanHash': audio.sha(audio.canonical(plan)),
            'releasePurpose': 'completed-lesson-demo',
            'speechCharacters': sum(len(audio.speech_text(r)) for r in requests.values()),
            'baseEstimatedUsd': str(estimate.quantize(Decimal('.0001'))),
            'reservedEstimatedUsd': str((estimate * Decimal(audio.RATES['reserveMultiplier'])).quantize(Decimal('.0001')))}

def request_validator(locale):
    language, voice = VOICES[locale]
    def check(clip, spec, kind):
        payload = {'inputs': [{'text': clip.get('text'), 'voice_id': voice}],
                   'model_id': 'eleven_v4', 'language_code': language}
        if (kind != 'narration' or clip.get('voiceId') != voice or clip.get('model') != 'eleven_v4'
                or spec.get('voiceId') != voice or spec.get('payload') != payload
                or clip.get('generationSettings') != payload):
            raise activation.SafeError('Locale voice, text or request settings differ from the source.')
        stripped = {key: value for key, value in payload.items() if key != 'language_code'}
        spain._base_request({**clip, 'generationSettings': stripped}, {**spec, 'payload': stripped}, kind)
    return check

def prepare(plan, shared):
    directory = shared / 'media/elevenlabs'
    records = {}
    # Read only immutable completed receipts. In-flight records belong to the
    # recording job and never authorize a partially prepared lesson here.
    activation.ROOT = shared
    for identity in plan['requests']:
        folder = directory / 'cache' / identity
        activation.no_symlinks(folder)
        if not (folder / 'receipt.json').exists():
            continue
        receipt = activation.read_json(folder / 'receipt.json')
        if receipt.get('status') == 'complete':
            records[identity] = audio.cached_record(directory, identity)
    selected = completed_plan(plan, records)
    descriptor = audio.build_bundle(directory, selected, records)
    bundle = activation.bundle_directory(descriptor.parent)
    if activation.read_json(bundle / 'plan.json') != selected:
        raise activation.SafeError('The prepared plan changed during staging.')
    texts = {key: audio.speech_text(selected['requests'][identity]) for key, identity in selected['entries'].items()}
    activation.checked_request = request_validator(plan['locale'])
    activation.checked_receipt = spain.checked_spain_receipt
    try:
        metadata, assets, music = activation.prepare_bundle(bundle, texts)
        if music: raise activation.SafeError('A narration release cannot change music.')
        spain.decode_assets(assets)
    finally:
        activation.checked_request, activation.checked_receipt = spain._base_request, spain._base_receipt
    locale, lessons = plan['locale'], selected['coveredLessons']
    manifest = metadata['src/narration-manifest.json']
    manifest.pop('activatedAt', None)
    manifest.update(locale=locale, selectedVoiceId=VOICES[locale][1], coveredLessons=lessons,
                    partialCatalogue=selected['partialCatalogue'], reviewStatus='demo-native-and-listening-review-pending',
                    review={'operatorConfirmedReviewed': False, 'nativeSpeakerReview': 'pending',
                            'fullHumanListeningReview': 'pending',
                            'automatedChecks': ['source text and complete lesson coverage', 'voice and request identity',
                                                'receipts, hashes, encoding and full MP3 decode']})
    clips = manifest['clips']
    files = {f'src/narration-index.{locale}.json': metadata['src/narration-index.json'],
             f'src/narration-durations.{locale}.json': {key: math.floor(c['duration'] * 1000 + .5) for key, c in clips.items()},
             f'src/narration-manifest.{locale}.json': manifest,
             f'src/narration-availability.{locale}.json': {'schemaVersion': 1, 'locale': locale, 'lessons': lessons}}
    return selected, bundle, files, assets

def stage(plan, shared):
    selected, bundle, files, assets = prepare(plan, shared)
    identity = audio.sha(audio.canonical(selected))
    activation.ROOT = ROOT
    directory = ROOT / 'media/elevenlabs'
    activation.no_symlinks(directory)
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / ('ready-release-' + identity)
    if destination.exists() or destination.is_symlink():
        raise activation.SafeError('This exact staged release already exists; inspect it rather than overwrite it.')
    with tempfile.TemporaryDirectory(prefix='.ready-release-', dir=directory) as temporary:
        temp = Path(temporary)
        for relative, content in files.items():
            activation.atomic_write(temp / relative, activation.json_bytes(content))
        for src, asset in assets.items():
            activation.atomic_write(temp / 'public' / src.lstrip('/'), asset['data'])
        os.rename(temp, destination)
    return {'locale': plan['locale'], 'lessons': len(selected['coveredLessons']),
            'coveredLessons': selected['coveredLessons'], 'keys': len(selected['entries']), 'assets': len(assets),
            'stage': str(destination), 'bundle': str(bundle), 'planHash': identity}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shared-root', type=Path, required=True)
    parser.add_argument('--locale', choices=tuple(VOICES), required=True)
    args = parser.parse_args()
    try:
        plan = dutch.full_plan() if args.locale == 'nl-NL' else next(p for p in full.full_plans() if p['locale'] == args.locale)
        print(json.dumps(stage(plan, args.shared_root.resolve()), ensure_ascii=False))
    except (activation.SafeError, audio.SafeError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(f'Stopped safely: {error}', file=sys.stderr)
        sys.exit(1)
