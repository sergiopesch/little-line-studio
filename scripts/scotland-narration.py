#!/usr/bin/env python3
"""Plan and validate Scottish narration offline. Never calls a provider.

The prepared plan is consumed by the separately coordinated credit-guarded
runner. A staged release is review-pending and does not activate anything.
"""
import argparse
import importlib.util
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent.parent
LOCALE = 'en-GB-x-scotland'
VOICE = 'M6KCOw7VXEJAZwuYFLuz'
MODEL = 'eleven_v4'

def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

gen = load_module('scotland_generator', ROOT / 'scripts/elevenlabs-audio.py')
activation = load_module('scotland_activation', ROOT / 'scripts/activate-elevenlabs.py')
SafeError = activation.SafeError


def catalogue():
    """Export exact current English speech and reject duplicate or missing keys."""
    program = '''
import { LESSONS, LEVELS, narrationKey } from './src/lesson-catalogue.js';
const texts = {}, lessons = [];
for (const lesson of LESSONS) {
  if (!lesson.id || lessons.includes(lesson.id) || !lesson.steps?.length) throw Error('invalid lesson');
  lessons.push(lesson.id);
  for (const [i, step] of lesson.steps.entries()) {
    for (const [kind, text] of [['instruction', step.spoken], ['hint', step.hint]]) {
      const key = narrationKey(lesson, i, kind);
      if (!key || Object.hasOwn(texts, key) || typeof text !== 'string' || !text.trim()) throw Error('invalid narration');
      texts[key] = text;
    }
  }
}
console.log(JSON.stringify({lessons, levels: LEVELS.map(x => x.id), texts}));
'''
    try:
        data = json.loads(gen.subprocess.check_output(
            ['node', '--input-type=module', '-e', program], cwd=ROOT,
            text=True, stderr=gen.subprocess.PIPE, timeout=30))
        lessons, texts = data['lessons'], data['texts']
        if (len(lessons) != 30 or len(set(lessons)) != 30 or
            set(data['levels']) != {'basic', 'intermediate', 'expert'} or
            not isinstance(texts, dict) or not texts or
            any(not isinstance(v, str) or not v.strip() or len(v) > 2000 for v in texts.values())):
            raise ValueError('invalid catalogue')
        return {'sample': gen.SAMPLE, **texts}, sorted(lessons)
    except (OSError, ValueError, TypeError, KeyError, gen.subprocess.SubprocessError):
        raise SafeError('The complete current English lesson catalogue could not be verified.') from None


def make_plan():
    texts, lessons = catalogue()
    options = SimpleNamespace(model_id=MODEL, voice_id=VOICE, music_seconds=120,
                              sample_only=False, lessons=None, kind='speech', locale=LOCALE)
    plan = gen.make_plan(options, texts)
    plan.update(locale=LOCALE, voiceId=VOICE, coveredLessons=lessons,
                sourceTextSha256=gen.sha(gen.canonical(texts)))
    return plan, texts, lessons


def decode_assets(assets):
    """Fully decode the verified bytes that will be staged, once per unique asset."""
    for asset in assets.values():
        try:
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-xerror',
                            '-protocol_whitelist', 'pipe', '-i', 'pipe:0', '-f', 'null', '-'],
                           check=True, input=asset['data'], stdout=subprocess.DEVNULL,
                           stderr=subprocess.PIPE, timeout=90)
        except (OSError, subprocess.SubprocessError):
            raise SafeError('A Scottish staged MP3 failed full decode.') from None


def check_bundle(selected):
    plan, texts, lessons = make_plan()
    bundle = activation.bundle_directory(selected)
    actual = activation.read_json(bundle / 'plan.json')
    if actual != plan or bundle.name != gen.sha(gen.canonical(plan)):
        raise SafeError('Bundle plan differs from the exact current Scottish source plan.')
    descriptor = activation.read_json(bundle / 'bundle.json')
    staged = activation.read_json(bundle / 'narration-manifest.json')
    for value in (descriptor, staged):
        if value.get('locale', LOCALE) != LOCALE or value.get('voiceId', VOICE) != VOICE:
            raise SafeError('Bundle locale or selected voice does not match Scotland.')
    if (descriptor.get('musicLevels') != [] or descriptor.get('musicLessons', []) != [] or
        (bundle / 'music-manifest.json').exists()):
        raise SafeError('Scottish narration must not generate or replace music.')
    metadata, assets, levels = activation.prepare_bundle(bundle, texts)
    clips = metadata['src/narration-manifest.json']['clips']
    if levels or any(clip.get('voiceId') != VOICE or clip.get('model') != MODEL for clip in clips.values()):
        raise SafeError('Every clip must match the approved Scottish voice and model.')
    decode_assets(assets)
    manifest = metadata['src/narration-manifest.json']
    manifest.pop('activatedAt', None)
    manifest.update(locale=LOCALE, selectedVoiceId=VOICE, coveredLessons=lessons,
                    partialCatalogue=False, reviewStatus='full-catalogue-review-pending',
                    review={'operatorConfirmedReviewed': False,
                            'nativeSpeakerReview': 'pending', 'fullHumanListeningReview': 'pending',
                            'automatedChecks': ['exact current authored source and lesson coverage',
                                                'plan, request and cache receipt identities',
                                                'audio hashes, encoding, durations and full decode']})
    return plan, lessons, {
        f'src/narration-index.{LOCALE}.json': metadata['src/narration-index.json'],
        f'src/narration-durations.{LOCALE}.json': {
            key: math.floor(clip['duration'] * 1000 + 0.5) for key, clip in clips.items()},
        f'src/narration-manifest.{LOCALE}.json': manifest,
        f'src/narration-availability.{LOCALE}.json': {'schemaVersion': 1, 'locale': LOCALE, 'lessons': lessons},
    }, assets


def stage_release(selected):
    """Create a separate review tree; never mutate runtime metadata or public assets."""
    plan, lessons, metadata, assets = check_bundle(selected)
    directory = ROOT / 'media/elevenlabs'
    identity = gen.sha(gen.canonical(plan))
    dest = directory / ('scotland-release-' + identity)
    activation.no_symlinks(directory)
    if dest.exists() or dest.is_symlink():
        raise SafeError('Staged release already exists; retain it for inspection rather than overwriting.')
    temp = Path(tempfile.mkdtemp(prefix='.scotland-release-', dir=directory))
    try:
        for source, asset in assets.items():
            activation.atomic_write(temp / 'public' / source.lstrip('/'), asset['data'])
        for name, data in metadata.items():
            activation.atomic_write(temp / name, activation.json_bytes(data))
        os.rename(temp, dest)
    except Exception:
        shutil.rmtree(temp, ignore_errors=True)
        raise
    return {'status': 'staged-review-pending', 'locale': LOCALE, 'bundlePlanHash': identity,
            'lessons': len(lessons), 'narrationKeys': len(metadata[f'src/narration-index.{LOCALE}.json']),
            'uniqueAssets': len(assets), 'stage': str(dest)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--plan', action='store_true', help='Write deterministic offline generation plan under ignored media.')
    group.add_argument('--verify-bundle', metavar='BUNDLE', help='Verify complete bundle and receipts without writing release files.')
    group.add_argument('--stage-release', metavar='BUNDLE', help='Verify and stage separate review-pending metadata and audio.')
    args = parser.parse_args()
    if args.plan:
        plan, texts, lessons = make_plan()
        path = ROOT / 'media/elevenlabs/plan.en-GB-x-scotland.json'
        gen.write_json(path, plan)
        result = {'status': 'offline-plan', 'locale': LOCALE, 'voiceId': VOICE,
                  'model': MODEL, 'lessons': len(lessons), 'keys': len(texts),
                  'requests': len(plan['requests']), 'characters': plan['speechCharacters'],
                  'conservativeCreditsAtOnePerCharacter': plan['speechCharacters'],
                  'planHash': gen.sha(gen.canonical(plan)), 'plan': str(path)}
    elif args.verify_bundle:
        plan, lessons, metadata, assets = check_bundle(args.verify_bundle)
        result = {'status': 'verified-review-pending', 'locale': LOCALE,
                  'planHash': gen.sha(gen.canonical(plan)), 'lessons': len(lessons),
                  'keys': len(metadata[f'src/narration-index.{LOCALE}.json']), 'assets': len(assets)}
    else:
        result = stage_release(args.stage_release)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except SafeError as error:
        print(f'Error: {error}', file=sys.stderr)
        sys.exit(1)
