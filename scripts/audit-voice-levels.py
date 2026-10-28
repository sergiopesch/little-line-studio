#!/usr/bin/env python3
"""Offline sample-peak and average-level screening for a staged voice bundle.

This reports candidates for human review; sample peak and average level do
not establish true peak, pronunciation, naturalness or perceived mix quality.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys

SOURCE = re.compile(r'^/narration/clip-([a-f0-9]{64})\.mp3$')
LEVEL = re.compile(r'(mean_volume|max_volume):\s*(-?(?:\d+(?:\.\d+)?|inf)) dB')

def measure(path):
    try:
        result = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-protocol_whitelist', 'file,pipe',
                                 '-i', str(path), '-af', 'volumedetect', '-f', 'null', '-'],
                                capture_output=True, text=True, check=True, timeout=60)
        values = dict(LEVEL.findall(result.stderr))
        mean, peak = float(values['mean_volume']), float(values['max_volume'])
        if math.isnan(mean) or math.isnan(peak): raise ValueError
        return mean, peak
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        raise ValueError('An audio asset could not be decoded and measured.') from None

def audit(bundle):
    bundle = bundle.resolve()
    try:
        data = json.loads((bundle / 'narration-manifest.json').read_text())
        clips = data['clips']
        if not isinstance(clips, dict) or not clips: raise ValueError
        assets = {}
        for key, clip in clips.items():
            match = SOURCE.fullmatch(clip['src'])
            if not match or match.group(1) != clip['sha256'] or not isinstance(key, str): raise ValueError
            path = bundle / 'assets' / clip['src'].lstrip('/')
            if path.is_symlink() or not path.is_file() or path.stat().st_size != clip['bytes']: raise ValueError
            if clip['src'] not in assets:
                raw = path.read_bytes()
                if hashlib.sha256(raw).hexdigest() != clip['sha256']: raise ValueError
                assets[clip['src']] = {'path': path, 'keys': []}
            assets[clip['src']]['keys'].append(key)
        with ThreadPoolExecutor(max_workers=4) as executor:
            measured = list(executor.map(measure, [asset['path'] for asset in assets.values()]))
        results = []
        for (source, asset), (mean, peak) in zip(assets.items(), measured):
            results.append({'source': source, 'keys': asset['keys'],
                            'meanDbfs': mean if math.isfinite(mean) else None,
                            'samplePeakDbfs': peak if math.isfinite(peak) else None,
                            'possibleSilence': mean <= -45,
                            'sampleAtOrAboveFullScale': peak >= 0})
        return {'assets': len(results), 'narrationKeys': len(clips),
                'possibleSilence': [item for item in results if item['possibleSilence']],
                'sampleAtOrAboveFullScale': [item for item in results if item['sampleAtOrAboveFullScale']],
                'meanRangeDbfs': [min((v['meanDbfs'] for v in results if v['meanDbfs'] is not None), default=None),
                                  max((v['meanDbfs'] for v in results if v['meanDbfs'] is not None), default=None)],
                'samplePeakRangeDbfs': [min((v['samplePeakDbfs'] for v in results if v['samplePeakDbfs'] is not None), default=None),
                                        max((v['samplePeakDbfs'] for v in results if v['samplePeakDbfs'] is not None), default=None)]}
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise ValueError('Bundle metadata or audio integrity could not be verified.') from None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    args = parser.parse_args()
    print(json.dumps(audit(args.bundle), ensure_ascii=False, indent=2))

if __name__ == '__main__':
    try: main()
    except ValueError as error:
        print(f'Audit stopped: {error}', file=sys.stderr); sys.exit(1)
