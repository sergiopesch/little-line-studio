#!/usr/bin/env python3
"""Generate reviewed catalogue speech offline with Piper and ffmpeg.

Identical text shares audio. Cache identity includes text, model/config hashes,
tool versions and encoding settings. The previous manifest survives a failed
generation. Only manifest-referenced MP3s remain in public/narration.
"""
import argparse
import fcntl
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import tempfile
import wave

import onnxruntime

onnxruntime.disable_telemetry_events()
from piper import PiperVoice, SynthesisConfig
from piper.config import PiperConfig

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = "Hello, little artist. We will draw one little part at a time, then add colours of your own. Ready when you are."
MAX_CLIP_SECONDS = 35  # Leave a startup margin below the player's 45-second watchdog.
SETTINGS = {
    "lengthScale": 1.2, "noiseScale": 0.55, "noiseWScale": 0.7,
    "normalization": "loudnorm=I=-20:TP=-2:LRA=7",
    "sampleRate": 22050, "channels": 1, "codec": "libmp3lame", "bitrate": "48k",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}-", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as target:
            target.write(data)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def encode_clip(voice, text, config, directory):
    wav_path, mp3_path = directory / "clip.wav", directory / "clip.mp3"
    with wave.open(str(wav_path), "wb") as destination:
        voice.synthesize_wav(text, destination, syn_config=config)
    subprocess.run([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(wav_path), "-map_metadata", "-1", "-af", SETTINGS["normalization"],
        "-ar", str(SETTINGS["sampleRate"]), "-ac", str(SETTINGS["channels"]),
        "-codec:a", SETTINGS["codec"], "-b:a", SETTINGS["bitrate"], str(mp3_path),
    ], check=True)
    data = mp3_path.read_bytes()
    duration = float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(mp3_path),
    ], text=True))
    if not data or not 0 < duration < MAX_CLIP_SECONDS:
        raise ValueError(f"Unexpected clip duration: {duration}")
    return data, round(duration, 3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--cache-dir", type=Path,
                        default=Path(tempfile.gettempdir()) / "drawingteacher-narration-cache")
    args = parser.parse_args()
    model_path = args.model.resolve()
    model_config_path = Path(f"{model_path}.json")
    provenance = {
        "voice": "Piper Alba en_GB medium",
        "generator": f"piper-tts {importlib.metadata.version('piper-tts')}",
        "modelSha256": digest(model_path.read_bytes()),
        "modelConfigSha256": digest(model_config_path.read_bytes()),
        "ffmpeg": subprocess.check_output(["ffmpeg", "-version"], text=True).splitlines()[0],
        "audioSettings": SETTINGS,
    }
    export = """
      import { LESSONS, narrationKey } from './src/lesson-catalogue.js';
      const clips = {};
      for (const lesson of LESSONS) for (const [index, step] of lesson.steps.entries()) {
        clips[narrationKey(lesson, index)] = step.spoken;
        clips[narrationKey(lesson, index, 'hint')] = step.hint;
      }
      console.log(JSON.stringify({ lessons: LESSONS.length, clips }));
    """
    catalogue = json.loads(subprocess.check_output([
        "node", "--input-type=module", "-e", export,
    ], cwd=ROOT, text=True))
    if catalogue["lessons"] != 30:
        raise ValueError("Expected the complete thirty-lesson catalogue")
    scripts = {"sample": SAMPLE, **catalogue["clips"]}
    if any(not isinstance(text, str) or not text.strip() for text in scripts.values()):
        raise ValueError("Every narration entry needs a non-empty authored transcript")
    output = ROOT / "public" / "narration"
    output.mkdir(parents=True, exist_ok=True)
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    lock_path = args.cache_dir / f"{digest(str(ROOT).encode())}.lock"
    with lock_path.open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        build(scripts, provenance, model_path, model_config_path, args.cache_dir, output)


def build(scripts, provenance, model_path, model_config_path, cache_dir, output):
    manifest = {**provenance, "schemaVersion": 2, "clips": {}}
    voice = None
    config = SynthesisConfig(length_scale=SETTINGS["lengthScale"],
                             noise_scale=SETTINGS["noiseScale"], noise_w_scale=SETTINGS["noiseWScale"])
    seen = {}
    generated = cached = 0
    created = []
    committed = False
    with tempfile.TemporaryDirectory(prefix="drawingteacher-narration-") as temporary:
        temporary = Path(temporary)
        try:
            for index, (name, text) in enumerate(scripts.items(), 1):
                key = digest(json.dumps({"text": text, **provenance}, sort_keys=True,
                                        ensure_ascii=False).encode())
                if key not in seen:
                    cache_audio, cache_metadata = cache_dir / f"{key}.mp3", cache_dir / f"{key}.json"
                    metadata = None
                    try:
                        candidate = json.loads(cache_metadata.read_text())
                        data = cache_audio.read_bytes()
                        if (candidate["cacheKey"] == key and candidate["sha256"] == digest(data)
                                and candidate["bytes"] == len(data)
                                and 0 < candidate["duration"] < MAX_CLIP_SECONDS):
                            metadata = candidate
                    except (OSError, ValueError, KeyError, TypeError):
                        pass
                    if metadata is None:
                        if voice is None:
                            options = onnxruntime.SessionOptions()
                            options.intra_op_num_threads = 2
                            options.inter_op_num_threads = 1
                            voice = PiperVoice(
                                config=PiperConfig.from_dict(json.loads(model_config_path.read_text())),
                                session=onnxruntime.InferenceSession(str(model_path), sess_options=options,
                                                                    providers=["CPUExecutionProvider"]),
                            )
                        data, duration = encode_clip(voice, text, config, temporary)
                        metadata = {"cacheKey": key, "sha256": digest(data),
                                    "bytes": len(data), "duration": duration}
                        atomic_write(cache_audio, data)
                        atomic_write(cache_metadata, json.dumps(metadata, sort_keys=True).encode())
                        generated += 1
                    else:
                        cached += 1
                    filename = f"clip-{metadata['sha256']}.mp3"
                    destination = output / filename
                    if not destination.exists() or digest(destination.read_bytes()) != metadata["sha256"]:
                        if not destination.exists():
                            created.append(destination)
                        atomic_write(destination, data)
                    seen[key] = {
                        "src": f"/narration/{filename}", "text": text,
                        "cacheKey": key, "sha256": metadata["sha256"],
                        "bytes": metadata["bytes"], "duration": metadata["duration"],
                    }
                manifest["clips"][name] = seen[key]
                if index % 25 == 0 or index == len(scripts):
                    print(f"Prepared {index}/{len(scripts)} entries; {generated} generated, {cached} cached", flush=True)
            atomic_write(ROOT / "src" / "narration-manifest.json",
                         (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode())
            index = {key: clip["src"] for key, clip in manifest["clips"].items()}
            atomic_write(ROOT / "src" / "narration-index.json",
                         (json.dumps(index, indent=2, ensure_ascii=False) + "\n").encode())
            durations = {key: round(clip["duration"] * 1000) for key, clip in manifest["clips"].items()
                         if key.endswith("/instruction")}
            atomic_write(ROOT / "src" / "narration-durations.json",
                         (json.dumps(durations, indent=2, ensure_ascii=False) + "\n").encode())
            committed = True
            referenced = {Path(clip["src"]).name for clip in manifest["clips"].values()}
            for obsolete in output.glob("*.mp3"):
                if obsolete.name not in referenced:
                    obsolete.unlink()
        finally:
            if not committed:
                for path in created:
                    path.unlink(missing_ok=True)
    unique = {clip["src"]: clip for clip in manifest["clips"].values()}
    print(json.dumps({"entries": len(scripts), "uniqueClips": len(unique), "generated": generated,
                      "cached": cached, "bytes": sum(c["bytes"] for c in unique.values()),
                      "seconds": round(sum(c["duration"] for c in unique.values()), 3)}), flush=True)


if __name__ == "__main__":
    main()
