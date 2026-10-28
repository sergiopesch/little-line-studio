#!/usr/bin/env python3
"""Stage offline loudness corrections for quiet, short narration clips.

Paid request identities and generation caches remain immutable. This creates
auditable local derivatives from the verified original provider responses.
"""
import argparse
import array
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
LOCALES = ('en-GB', 'en-IE', 'en-GB-x-scotland', 'es-419', 'fr-FR', 'es-ES', 'de-DE', 'it-IT', 'nl-NL')
SOURCE = re.compile(r'^/narration/clip-([a-f0-9]{64})\.mp3$')
HASH = re.compile(r'^[a-f0-9]{64}$')
RECIPE = {'version': 1, 'name': 'short-speech-loudness', 'maximumSeconds': 3,
          'correctionBelowLufs': -23, 'targetLufs': -20, 'maximumDecodedTruePeakDbtp': -2,
          'paddingSeconds': 4, 'maximumPasses': 3, 'loudnessToleranceLu': 0.5,
          'preserveDecodedSampleCount': True}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def run(args):
    return subprocess.run(args, check=True, capture_output=True, timeout=45)


def measure(path):
    result = run(['ffmpeg', '-nostdin', '-hide_banner', '-protocol_whitelist', 'file,pipe',
                  '-i', str(path), '-af', 'loudnorm=I=-20:TP=-2:LRA=7:print_format=json', '-f', 'null', '-'])
    text = result.stderr.decode()
    data, _ = json.JSONDecoder().raw_decode(text[text.rfind('{'):])
    values = {'integratedLufs': float(data['input_i']), 'truePeakDbtp': float(data['input_tp'])}
    if not all(math.isfinite(v) for v in values.values()):
        raise ValueError('Silent or non-finite audio cannot be mastered automatically.')
    return values


def pcm(path):
    result = run(['ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe',
                  '-i', str(path), '-f', 'f32le', '-ar', '44100', '-ac', '1', 'pipe:1'])
    samples = array.array('f', result.stdout)
    if not samples or not all(math.isfinite(v) for v in samples):
        raise ValueError('Audio must decode to finite samples.')
    return samples


def verified_bytes(path, digest, size=None):
    if path.is_symlink() or not path.is_file():
        raise ValueError('A required regular audio file is missing.')
    data = path.read_bytes()
    if sha(data) != digest or (size is not None and len(data) != size):
        raise ValueError('Audio integrity does not match its provenance.')
    return data


def original_response(shared, source):
    identity = source.get('cacheKey', '')
    if not HASH.fullmatch(identity):
        raise ValueError('Invalid original generation identity.')
    folder = shared / 'media/elevenlabs/cache' / identity
    if folder.is_symlink() or (folder / 'receipt.json').is_symlink():
        raise ValueError('Generation provenance must not be redirected.')
    receipt = json.loads((folder / 'receipt.json').read_text())
    for key, expected in [('status', 'complete'), ('provider', 'ElevenLabs'), ('cacheKey', identity),
                          ('voiceId', source['voiceId']), ('model', source['model']),
                          ('sha256', source['sha256']), ('bytes', source['bytes'])]:
        if receipt.get(key) != expected:
            raise ValueError('The original generation receipt differs from the released source.')
    verified_bytes(folder / 'normalised.mp3', source['sha256'], source['bytes'])
    digest = receipt.get('rawSha256', '')
    if not HASH.fullmatch(digest):
        raise ValueError('The original response digest is missing.')
    return verified_bytes(folder / 'raw.mp3', digest), digest


def derive(raw_data, source, before, directory):
    """Use look-ahead padding for loudnorm, then remove exactly that padding."""
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='short-speech-', dir=directory) as temp:
        raw = Path(temp) / 'source.mp3'; raw.write_bytes(raw_data)
        source_samples = pcm(raw)
        if not 0 < len(source_samples) < RECIPE['maximumSeconds'] * 44100:
            raise ValueError('Only verified short speech is accepted by this recipe.')
        target = RECIPE['targetLufs']; passes = []
        for attempt in range(RECIPE['maximumPasses']):
            graph = (f'apad=whole_dur=4,loudnorm=I={target:.3f}:TP=-2.5:LRA=7,'
                     f'aresample=44100,atrim=end_sample={len(source_samples)}')
            output = Path(temp) / f'mastered-{attempt}.mp3'
            run(['ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe',
                 '-i', str(raw), '-af', graph, '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame',
                 '-b:a', '128k', '-map_metadata', '-1', str(output)])
            after = measure(output); passes.append({'targetLufs': round(target, 3), **after})
            if abs(after['integratedLufs'] - RECIPE['targetLufs']) <= RECIPE['loudnessToleranceLu']:
                break
            # Measure after removing look-ahead padding, then render from the
            # original response again. Never repeatedly encode a derivative.
            target += RECIPE['targetLufs'] - after['integratedLufs']
            if abs(target - RECIPE['targetLufs']) > 3:
                raise ValueError('Short-speech correction exceeded its bounded adjustment.')
        if abs(after['integratedLufs'] - RECIPE['targetLufs']) > RECIPE['loudnessToleranceLu'] or after['truePeakDbtp'] > -2:
            raise ValueError('The encoded derivative missed its loudness or true-peak bound.')
        if len(pcm(output)) != len(source_samples):
            raise ValueError('The derivative changed the decoded speech duration.')
        duration = len(source_samples) / 44100
        if abs(duration - source['duration']) > 0.03:
            raise ValueError('The original response duration differs from the released clip.')
        data = output.read_bytes()
    version = run(['ffmpeg', '-version']).stdout.decode().splitlines()[0]
    specification = {'recipe': RECIPE, 'sourceSha256': source['sha256'], 'rawSourceSha256': sha(raw_data),
                     'filterGraph': graph, 'ffmpegVersion': version}
    processing = {**specification, 'processingKey': sha(canonical(specification)),
                  'before': before, 'decodedVerification': after, 'decodedSamples': len(source_samples), 'passes': passes}
    digest = sha(data)
    clip = {**source, 'src': f'/narration/clip-{digest}.mp3', 'sha256': digest, 'bytes': len(data),
            'duration': round(duration, 3), 'provenance': 'verified-local-derivative',
            'encoding': {**source['encoding'], 'filter': graph}, 'source': source, 'processing': processing}
    return clip, data


def stage(root, shared, locale, output):
    suffix = '' if locale == 'en-GB' else '.' + locale
    names = {part: f'narration-{part}{suffix}.json' for part in ('manifest', 'index', 'durations')}
    metadata = {part: json.loads((root / 'src' / name).read_text()) for part, name in names.items()}
    manifest = metadata['manifest']; originals = copy.deepcopy(metadata); corrected = {}; checked = set(); report = []
    if output.exists():
        raise ValueError('Use a fresh output directory to preserve earlier staging evidence.')
    output.mkdir(parents=True)
    for key, source in manifest['clips'].items():
        if source['duration'] >= 3 or source.get('provenance') == 'verified-local-derivative':
            continue
        match = SOURCE.fullmatch(source['src'])
        if not match or match[1] != source['sha256']:
            raise ValueError('Invalid released audio identity.')
        path = root / 'public' / source['src'].lstrip('/')
        verified_bytes(path, source['sha256'], source['bytes'])
        if source['src'] in checked:
            continue
        checked.add(source['src']); before = measure(path)
        if before['integratedLufs'] >= RECIPE['correctionBelowLufs']:
            continue
        raw, _ = original_response(shared, source)
        prepared, data = derive(raw, source, before, output / 'work')
        destination = output / 'public' / prepared['src'].lstrip('/')
        destination.parent.mkdir(parents=True, exist_ok=True); destination.write_bytes(data)
        corrected[source['src']] = prepared
        report.append({'key': key, 'source': source['src'], 'result': prepared['src'],
                       'before': before, 'after': prepared['processing']['decodedVerification']})
    for key, source in list(manifest['clips'].items()):
        if source['src'] not in corrected:
            continue
        prepared = corrected[source['src']]
        if source != prepared['source']:
            raise ValueError('Shared audio keys disagree about their original provenance.')
        manifest['clips'][key] = prepared
        metadata['index'][key] = prepared['src']
        # British timing metadata contains instructions only.
        if key in metadata['durations']:
            metadata['durations'][key] = math.floor(prepared['duration'] * 1000 + 0.5)
    if corrected:
        manifest['localProcessing'] = {'recipe': RECIPE, 'correctedAssets': len(corrected),
                                       'review': 'automated loudness, true-peak and sample-count verification; human listening pending'}
        (output / 'src').mkdir()
        for part, name in names.items():
            (output / 'src' / name).write_text(json.dumps(metadata[part], ensure_ascii=False, indent=2) + '\n')
    summary = {'locale': locale, 'shortAssetsChecked': len(checked), 'correctedAssets': len(corrected), 'corrections': report,
               'inputMetadataHashes': {part: sha(canonical(value)) for part, value in originals.items()}}
    (output / 'report.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--locale', choices=LOCALES, required=True)
    parser.add_argument('--shared-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = stage(ROOT, args.shared_root.resolve(), args.locale, args.output.resolve())
    print(json.dumps({k: v for k, v in report.items() if k != 'corrections'}))


if __name__ == '__main__':
    main()
