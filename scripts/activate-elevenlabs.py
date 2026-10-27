#!/usr/bin/env python3
"""Activate a complete, explicitly reviewed, local ElevenLabs media bundle.

Usage: python3 scripts/activate-elevenlabs.py --bundle media/elevenlabs/bundles/PLAN_HASH --reviewed

This command never reads credentials or calls a provider. --reviewed is the
operator's review assertion; the tool does not listen or assess pronunciation.
Only full narration libraries are accepted. Music is optional, but all three
level fallbacks and authored lesson overrides must be present together.
--loop-music prepares verified local derivatives of the ninety-second sources
before activation, without provider calls.
Existing notices are never overwritten.
"""
import argparse
import array
import ast
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import runpy
import shutil
import statistics
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parent.parent
LEVELS = ("basic", "intermediate", "expert")
HASH = re.compile(r"[a-f0-9]{64}")
MAX_ASSET_BYTES = 32 * 1024 * 1024
NORMALIZATION = "loudnorm=I=-20:TP=-2:LRA=7"
ENCODING = {
    "narration": {"filter": NORMALIZATION, "rate": 44100, "channels": 1, "bitrate": "128k", "maxSeconds": 35},
    "music": {"filter": NORMALIZATION, "rate": 44100, "channels": 2, "bitrate": "128k", "maxSeconds": 302},
}
LOOP_RECIPE = {
    "version": 1, "sourceStartSeconds": 4, "sourceEndSeconds": 80,
    "crossfadeSeconds": 4, "curve": "qsin", "durationSeconds": 72,
    "normalization": NORMALIZATION, "normalizationMode": "measured-linear",
    "decodedTruePeakMaximumDb": -2, "decodedLoudnessToleranceLufs": 0.5,
    "continuityWindowSeconds": 2, "minimumSeamDbRelativeToInteriorMedian": -10,
    "maximumJoinDifferenceDb": 9,
    "sampleRate": 44100, "channels": 2, "codec": "libmp3lame", "bitrate": "128k",
}
LOOP_GRAPH = (
    "[0:a]atrim=start=4:end=80,asetpts=PTS-STARTPTS,asplit=3[head][middle][tail];"
    "[head]atrim=start=0:end=4,asetpts=PTS-STARTPTS[h];"
    "[middle]atrim=start=4:end=72,asetpts=PTS-STARTPTS[m];"
    "[tail]atrim=start=72:end=76,asetpts=PTS-STARTPTS[t];"
    "[t][h]acrossfade=d=4:c1=qsin:c2=qsin[seam];"
    "[m][seam]concat=n=2:v=0:a=1"
)
# Reviewed source windows pass the unchanged continuity and comfort guards.
# Exact source bytes, rather than a lesson name or runtime search, select them.
REVIEWED_MUSIC_CROPS = {
    "37a3fc86b68564eeed6584ebc51d015c1a61628570b1f6a80fddeeb763ff6411": 8,
    "1917db0daa74bd560dcb2d934eefa5ba9194fce525bfd164a7e25e622e08b096": 10,
}
# Ladybird needs dynamic loudness control to meet the same LRA=7 target.
# Its decoded range is additionally bounded; no other source inherits this mode.
REVIEWED_DYNAMIC_MUSIC_SOURCES = frozenset({
    "f9aa89a07a8c2b31106f72ebb97b3db418d4c77f616557ec8256faaf8a06c196",
})


class SafeError(Exception):
    """Messages contain no provider responses, credentials or untrusted data."""


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()


def atomic_write(path, data, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".activation-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def no_symlinks(path):
    try:
        parts = path.absolute().relative_to(ROOT).parts
    except ValueError:
        raise SafeError("A file is outside the project boundary.") from None
    current = ROOT
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise SafeError("Symlinked activation inputs or destinations are not accepted.")


def read_bytes(path, limit):
    no_symlinks(path)
    try:
        if not path.is_file() or path.stat().st_size > limit:
            raise SafeError("An activation input is missing, not a regular file, or too large.")
        with path.open("rb") as handle:
            data = handle.read(limit + 1)
        if len(data) > limit:
            raise SafeError("An activation input exceeded its size bound.")
        return data
    except OSError:
        raise SafeError("An activation input could not be read.") from None


def unique_object(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise SafeError("Duplicate JSON metadata keys are not accepted.")
        result[name] = value
    return result


def read_json(path):
    try:
        value = json.loads(read_bytes(path, 12 * 1024 * 1024), object_pairs_hook=unique_object)
        if not isinstance(value, dict):
            raise SafeError("Activation metadata must contain an object.")
        return value
    except (ValueError, UnicodeError):
        raise SafeError("Activation metadata is invalid JSON.") from None


def catalogue_texts():
    # Read the generator's one authored sample literal without importing its API code.
    try:
        tree = ast.parse((ROOT / "scripts/elevenlabs-audio.py").read_text())
        samples = [ast.literal_eval(node.value) for node in tree.body
                   if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "SAMPLE" for target in node.targets)]
        if len(samples) != 1 or not isinstance(samples[0], str):
            raise ValueError
        program = """
          import { LESSONS, LEVELS, narrationKey } from './src/lesson-catalogue.js';
          const texts = {};
          for (const lesson of LESSONS) for (const [index, step] of lesson.steps.entries()) {
            texts[narrationKey(lesson,index)] = step.spoken;
            texts[narrationKey(lesson,index,'hint')] = step.hint;
          }
          console.log(JSON.stringify({count:LESSONS.length,levels:LEVELS.map(l=>l.id),texts}));
        """
        data = json.loads(subprocess.check_output(
            ["node", "--input-type=module", "-e", program], cwd=ROOT,
            text=True, stderr=subprocess.PIPE, timeout=30))
        if data.get("count") != 30 or set(data.get("levels", [])) != set(LEVELS):
            raise ValueError
        texts = {"sample": samples[0], **data["texts"]}
        if any(not isinstance(text, str) or not text.strip() or len(text) > 2000 for text in texts.values()):
            raise ValueError
        return texts
    except (OSError, ValueError, SyntaxError, TypeError, KeyError, subprocess.SubprocessError):
        raise SafeError("The complete current authored catalogue could not be verified.") from None


def lesson_music_catalogue():
    try:
        return runpy.run_path(str(Path(__file__).with_name("authored-music.py")))["read_catalogue"](ROOT)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        raise SafeError("The authored lesson music registry does not match the current lesson assignments.") from None


def bundle_directory(selected):
    candidate = Path(selected)
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    if ".." in candidate.parts:
        raise SafeError("Bundle traversal paths are not accepted.")
    no_symlinks(candidate)
    if candidate.name == "bundle.json":
        candidate = candidate.parent
    base = ROOT / "media/elevenlabs/bundles"
    if candidate.parent != base or not HASH.fullmatch(candidate.name) or not candidate.is_dir():
        raise SafeError("Select a staged plan bundle directly inside ignored media/elevenlabs/bundles.")
    try:
        ignored = (ROOT / ".gitignore").read_text().splitlines()
    except OSError:
        raise SafeError("The generation directory's ignore rule could not be verified.") from None
    if "/media/elevenlabs/" not in ignored:
        raise SafeError("The generation and recovery directory must remain ignored.")
    return candidate


def staged_header(value):
    if (value.get("schemaVersion") != 1 or value.get("provider") != "ElevenLabs"
            or value.get("reviewStatus") != "unreviewed-staged-only"):
        raise SafeError("Expected an unmodified staged ElevenLabs bundle header.")


def probe_mp3(path, kind):
    try:
        result = subprocess.check_output([
            "ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe",
            "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,sample_rate,channels",
            "-of", "json", str(path)], stderr=subprocess.PIPE, timeout=20)
        value = json.loads(result)
        streams = value.get("streams", [])
        duration = float(value["format"]["duration"])
        expected_rate, expected_channels, maximum = (44100, 1, 35) if kind == "narration" else (44100, 2, 302)
        if (value["format"].get("format_name") != "mp3" or len(streams) != 1
                or streams[0].get("codec_type") != "audio" or streams[0].get("codec_name") != "mp3"
                or int(streams[0].get("sample_rate", 0)) != expected_rate
                or streams[0].get("channels") != expected_channels
                or not math.isfinite(duration) or not 0 < duration < maximum):
            raise ValueError
        return duration
    except (OSError, ValueError, TypeError, KeyError, subprocess.SubprocessError):
        raise SafeError("A staged asset is not a bounded, correctly encoded MP3.") from None


def checked_request(clip, spec, kind):
    if not isinstance(spec, dict) or spec.get("kind") != ("speech" if kind == "narration" else "music"):
        raise SafeError("The staged generation request kind does not match its clip.")
    if (clip.get("encoding") != ENCODING[kind] or spec.get("encoding") != ENCODING[kind]
            or clip.get("generationSettings") != spec.get("payload")):
        raise SafeError("The staged encoding or generation settings disagree with their reviewed plan.")
    settings = spec.get("payload")
    if not isinstance(settings, dict) or settings.get("model_id") != clip.get("model"):
        raise SafeError("A staged clip model disagrees with its generation request.")
    if kind == "narration":
        voice = clip.get("voiceId")
        if spec.get("voiceId") != voice or clip.get("model") not in {
                "eleven_multilingual_v2", "eleven_flash_v2_5", "eleven_v3", "eleven_v4"}:
            raise SafeError("A staged narration model or voice does not match its reviewed request.")
        if clip["model"] == "eleven_v4":
            expected = {"inputs": [{"text": clip.get("text"), "voice_id": voice}], "model_id": "eleven_v4"}
            if settings != expected or spec.get("path") != "/v1/text-to-dialogue?output_format=mp3_44100_128":
                raise SafeError("A v4 clip needs the exact reviewed single-voice dialogue request.")
        else:
            if (set(settings) != {"text", "model_id", "voice_settings"} or settings["text"] != clip.get("text")
                    or spec.get("path") != f"/v1/text-to-speech/{voice}?output_format=mp3_44100_128"):
                raise SafeError("A narration clip does not match its reviewed speech request.")
            options = settings["voice_settings"]
            if not isinstance(options, dict) or not {"stability", "similarity_boost"} <= set(options) or not set(options) <= {
                    "stability", "similarity_boost", "style", "speed", "use_speaker_boost"}:
                raise SafeError("Speech settings contain unknown or missing controls.")
            for name, value in options.items():
                if name == "use_speaker_boost":
                    valid = type(value) is bool
                else:
                    valid = (type(value) in (float, int) and math.isfinite(value)
                             and (0.5 <= value <= 2 if name == "speed" else 0 <= value <= 1))
                if not valid:
                    raise SafeError("Speech settings are outside their reviewed bounds.")
    elif (set(settings) != {"prompt", "model_id", "music_length_ms", "force_instrumental"}
          or settings.get("prompt") != clip.get("prompt") or settings.get("model_id") != "music_v2_5"
          or settings.get("force_instrumental") is not True or type(settings.get("music_length_ms")) is not int
          or not 3000 <= settings["music_length_ms"] <= 300000
          or spec.get("path") != "/v1/music?output_format=mp3_44100_128"):
        raise SafeError("A music bed does not match its reviewed instrumental request.")


def checked_receipt(clip, spec, data):
    folder = ROOT / "media/elevenlabs/cache" / clip["cacheKey"]
    receipt = read_json(folder / "receipt.json")
    duration = receipt.get("duration")
    if (receipt.get("status") != "complete" or receipt.get("provider") != "ElevenLabs"
            or any(receipt.get(name) != clip.get(name) for name in ("cacheKey", "sha256", "bytes", "model"))
            or receipt.get("voiceId") != spec.get("voiceId") or receipt.get("apiPath") != spec.get("path")
            or type(duration) not in (float, int) or not math.isfinite(duration)
            or abs(duration - clip["duration"]) > 0.001
            or read_bytes(folder / "normalised.mp3", MAX_ASSET_BYTES) != data):
        raise SafeError("The staged clip does not match its complete local generation receipt and cached audio.")


def checked_clip(bundle, clip, kind, assets, spec):
    if not isinstance(clip, dict):
        raise SafeError("A staged clip record is malformed.")
    digest = clip.get("sha256")
    if not isinstance(digest, str) or not HASH.fullmatch(digest):
        raise SafeError("A staged clip is missing its content digest.")
    source = f"/{kind}/clip-{digest}.mp3"
    duration = clip.get("duration")
    length = clip.get("bytes")
    model, cache_key = clip.get("model"), clip.get("cacheKey")
    if (clip.get("src") != source or clip.get("provider") != "ElevenLabs"
            or clip.get("provenance") != "verified-api-response"
            or not isinstance(cache_key, str) or not HASH.fullmatch(cache_key)
            or not isinstance(model, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", model)
            or type(length) is not int or not 1000 < length <= MAX_ASSET_BYTES
            or type(duration) not in (float, int) or not math.isfinite(duration)
            or not 0 < duration < (35 if kind == "narration" else 302)):
        raise SafeError("A staged clip failed provenance, path or duration validation.")
    if kind == "narration" and (not isinstance(clip.get("voiceId"), str)
                                or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", clip["voiceId"])):
        raise SafeError("A staged narration clip needs its selected voice provenance.")
    checked_request(clip, spec, kind)
    path = bundle / "assets" / source.lstrip("/")
    if source not in assets:
        data = read_bytes(path, MAX_ASSET_BYTES)
        if sha(data) != digest or len(data) != length:
            raise SafeError("A staged audio digest or size does not match its bytes.")
        actual = probe_mp3(path, kind)
        if abs(actual - duration) > 0.05 or read_bytes(path, MAX_ASSET_BYTES) != data:
            raise SafeError("A staged audio duration changed or does not match its metadata.")
        assets[source] = {"data": data, "duration": actual}
    elif len(assets[source]["data"]) != length or abs(assets[source]["duration"] - duration) > 0.05:
        raise SafeError("Duplicate references disagree about the same audio asset.")
    checked_receipt(clip, spec, assets[source]["data"])
    result = {name: clip[name] for name in ("src", "sha256", "bytes", "duration", "provider", "provenance", "model", "cacheKey", "encoding", "generationSettings")}
    if kind == "narration":
        result.update(text=clip["text"], voiceId=clip["voiceId"])
    else:
        if clip.get("instrumentalRequested") is not True or not isinstance(clip.get("prompt"), str) or not clip["prompt"].strip() or len(clip["prompt"]) > 4000:
            raise SafeError("A staged music bed needs bounded instrumental-request provenance.")
        result.update(prompt=clip["prompt"], instrumentalRequested=True)
        requested = spec["payload"]["music_length_ms"] / 1000
        if not max(0, requested - 2) < duration < requested + 2:
            raise SafeError("A music bed's duration differs from its reviewed generation request.")
    return result


def prepare_bundle(bundle, expected_texts):
    descriptor = read_json(bundle / "bundle.json")
    staged_header(descriptor)
    if descriptor.get("planHash") != bundle.name:
        raise SafeError("The staged bundle plan identity does not match its directory.")
    plan = read_json(bundle / "plan.json")
    try:
        if sha(canonical(plan)) != bundle.name:
            raise SafeError("The staged plan bytes do not match the bundle identity.")
    except ValueError:
        raise SafeError("The staged plan contains non-finite JSON values.") from None
    entries, requests = plan.get("entries"), plan.get("requests")
    if (plan.get("schemaVersion") != 1 or plan.get("providerRequested") != "ElevenLabs"
            or not isinstance(entries, dict) or not isinstance(requests, dict)
            or not all(isinstance(value, str) and HASH.fullmatch(value) for value in entries.values())
            or set(requests) != set(entries.values())):
        raise SafeError("The staged generation plan has invalid request coverage or provenance.")
    for identity, spec in requests.items():
        if not isinstance(spec, dict) or spec.get("cacheKey") != identity:
            raise SafeError("The staged request identity is missing or inconsistent.")
        try:
            if sha(canonical({key: value for key, value in spec.items() if key not in ("cacheKey", "estimatedUsd")})) != identity:
                raise SafeError("A staged request's settings do not match its cache identity.")
        except ValueError:
            raise SafeError("A staged request contains non-finite settings.") from None
    narration = read_json(bundle / "narration-manifest.json")
    staged_header(narration)
    clips = narration.get("clips")
    if not isinstance(clips, dict) or set(clips) != set(expected_texts) or descriptor.get("speechKeys") != len(clips):
        raise SafeError("Activation requires the complete current narration catalogue; partial libraries are rejected.")
    assets, checked = {}, {}
    for key, text in expected_texts.items():
        clip = clips[key]
        if not isinstance(clip, dict) or clip.get("text") != text:
            raise SafeError("A staged transcript differs from the current authored lesson.")
        if entries.get(key) != clip.get("cacheKey") or entries.get(key) not in requests:
            raise SafeError("A staged narration key does not match its reviewed request identity.")
        checked[key] = checked_clip(bundle, clip, "narration", assets, requests[entries[key]])
    index = {key: clip["src"] for key, clip in checked.items()}
    if read_json(bundle / "narration-index.json") != index:
        raise SafeError("The staged narration index disagrees with its manifest.")
    review = {
        "operatorConfirmedReviewed": True,
        "assertion": "Operator supplied --reviewed; this tool did not listen or assess pronunciation, teaching quality or musical suitability.",
    }
    header = {"schemaVersion": 3, "provider": "ElevenLabs", "provenance": "verified-api-response",
              "sourcePlanHash": descriptor["planHash"], "activatedAt": datetime.now(timezone.utc).isoformat(),
              "reviewStatus": "operator-reviewed-for-activation", "review": review}
    metadata = {
        "src/narration-manifest.json": {**header, "voice": "ElevenLabs pre-generated authored narration",
            "audioSettings": {"normalization": NORMALIZATION, "sampleRate": 44100, "channels": 1, "codec": "mp3", "bitrate": "128k"}, "clips": checked},
        "src/narration-index.json": index,
        "src/narration-durations.json": {key: math.floor(clip["duration"] * 1000 + 0.5) for key, clip in checked.items() if key.endswith("/instruction")},
    }
    music_path = bundle / "music-manifest.json"
    music_levels = []
    music_lessons = []
    if music_path.exists():
        music = read_json(music_path)
        staged_header(music)
        entries = music.get("levels")
        if not isinstance(entries, dict) or set(entries) != set(LEVELS):
            raise SafeError("Music activation requires exactly the three known levels.")
        beds = {}
        for level in LEVELS:
            item = entries[level]
            identity = plan["entries"].get(f"music/{level}")
            if not isinstance(item, dict) or item.get("cacheKey") != identity or identity not in requests:
                raise SafeError("A staged music level does not match its reviewed request identity.")
            beds[level] = checked_clip(bundle, item, "music", assets, requests[identity])
        authored_lessons = lesson_music_catalogue()
        lesson_entries = music.get("lessons", {})
        if not isinstance(lesson_entries, dict) or set(lesson_entries) != set(authored_lessons):
            raise SafeError("Music activation requires exactly the authored lesson music overrides.")
        lesson_beds = {}
        for music_id, specification in authored_lessons.items():
            item = lesson_entries[music_id]
            identity = plan["entries"].get(f"music/lesson/{music_id}")
            if not isinstance(item, dict) or item.get("cacheKey") != identity or identity not in requests:
                raise SafeError("A staged lesson music identity does not match its reviewed request.")
            lesson_beds[music_id] = checked_clip(bundle, item, "music", assets, requests[identity])
            if (lesson_beds[music_id]["prompt"] != specification["prompt"]
                    or lesson_beds[music_id]["generationSettings"]["music_length_ms"] != specification["seconds"] * 1000):
                raise SafeError("A staged lesson music request differs from its exact authored specification.")
        metadata["src/music-manifest.json"] = {**header, "audioSettings": {
            "normalization": NORMALIZATION, "sampleRate": 44100, "channels": 2, "codec": "mp3", "bitrate": "128k"}, "levels": beds, "lessons": lesson_beds}
        metadata["src/music-index.json"] = {level: bed["src"] for level, bed in beds.items()}
        metadata["src/lesson-music-index.json"] = {music_id: bed["src"] for music_id, bed in lesson_beds.items()}
        music_levels = list(LEVELS)
        music_lessons = list(authored_lessons)
    if (not isinstance(descriptor.get("musicLevels"), list)
            or not all(isinstance(level, str) for level in descriptor["musicLevels"])
            or sorted(descriptor["musicLevels"]) != sorted(music_levels)):
        raise SafeError("The staged music descriptor disagrees with its complete manifest.")
    described_lessons = descriptor.get("musicLessons", [])
    if (not isinstance(described_lessons, list) or not all(isinstance(name, str) for name in described_lessons)
            or sorted(described_lessons) != sorted(music_lessons)):
        raise SafeError("The staged music descriptor disagrees with its lesson override coverage.")
    if set(plan["entries"]) != set(expected_texts) | {f"music/{level}" for level in music_levels} | {f"music/lesson/{name}" for name in music_lessons}:
        raise SafeError("The staged plan contains missing or extra narration/music keys.")
    return metadata, assets, music_levels


def loudness_report(output):
    reports = re.findall(r'\{\s*"input_i"\s*:.*?\}', output, re.S)
    try:
        value = json.loads(reports[-1])
        for name in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset", "output_i", "output_tp"):
            if not math.isfinite(float(value[name])):
                raise ValueError
        return value
    except (IndexError, KeyError, TypeError, ValueError):
        raise SafeError("The local loop loudness report could not be verified.") from None


def loop_continuity(path):
    try:
        raw = subprocess.check_output(["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe",
            "-i", str(path), "-ar", "16000", "-ac", "1", "-f", "s16le", "-"], stderr=subprocess.PIPE, timeout=30)
    except (OSError, subprocess.SubprocessError):
        raise SafeError("The decoded loop continuity check could not run.") from None
    if not 71.9 * 16000 * 2 < len(raw) < 72.2 * 16000 * 2 or len(raw) % 2:
        raise SafeError("The decoded loop has an unexpected sample length.")
    samples = array.array("h", raw)
    if sys.byteorder != "little":
        samples.byteswap()
    def level(start, end):
        part = samples[start * 16000:end * 16000]
        rms = math.sqrt(sum(value * value for value in part) / len(part)) / 32768
        return 20 * math.log10(max(1e-12, rms))
    windows = [level(start, start + 2) for start in range(0, 72, 2)]
    interior = statistics.median(windows[:-2])
    first, last = level(0, 1), level(71, 72)
    if min(windows[-2:]) < interior - 10 or abs(first - last) > 9:
        raise SafeError("The prepared music has a technical level trough or mismatch around its loop join; review the source before activation.")
    return {"sampleRate": 16000, "channels": 1, "windowSeconds": 2,
            "interiorMedianDbfs": round(interior, 3), "seamWindowsDbfs": [round(value, 3) for value in windows[-2:]],
            "firstSecondDbfs": round(first, 3), "lastSecondDbfs": round(last, 3),
            "joinDifferenceDb": round(abs(first - last), 3)}


def music_loop_configuration(source_sha256):
    """Select an exact-source reviewed recipe; never search at runtime."""
    if not isinstance(source_sha256, str) or not HASH.fullmatch(source_sha256):
        raise SafeError("A reviewed loop configuration needs its exact source digest.")
    start = REVIEWED_MUSIC_CROPS.get(source_sha256, LOOP_RECIPE["sourceStartSeconds"])
    if type(start) is not int or not 0 <= start <= 14:
        raise SafeError("A reviewed source window must remain inside the ninety-second source.")
    recipe = dict(LOOP_RECIPE)
    if source_sha256 in REVIEWED_DYNAMIC_MUSIC_SOURCES:
        recipe.update(normalizationMode="measured-dynamic", decodedLraMaximumLu=7.5)
    if start == LOOP_RECIPE["sourceStartSeconds"]:
        return recipe, LOOP_GRAPH
    extent = LOOP_RECIPE["sourceEndSeconds"] - LOOP_RECIPE["sourceStartSeconds"]
    recipe.update(sourceStartSeconds=start, sourceEndSeconds=start + extent)
    original = f'[0:a]atrim=start={LOOP_RECIPE["sourceStartSeconds"]}:end={LOOP_RECIPE["sourceEndSeconds"]}'
    if not LOOP_GRAPH.startswith(original + ","):
        raise SafeError("The reviewed loop graph does not match its default source window.")
    graph = LOOP_GRAPH.replace(original, f"[0:a]atrim=start={start}:end={start + extent}", 1)
    return recipe, graph


def derive_music_loop(source, source_data, tool_version):
    """Derive only from an already checked generation source and receipt."""
    if not 88 < source["duration"] < 92 or source["generationSettings"]["music_length_ms"] != 90000:
        raise SafeError("The loop recipe accepts only the reviewed ninety-second music sources.")
    if sha(source_data) != source["sha256"] or len(source_data) != source["bytes"]:
        raise SafeError("The loop source bytes disagree with the verified generation record.")
    recipe, loop_graph = music_loop_configuration(source["sha256"])
    specification = {"schemaVersion": 1, "sourceSha256": source["sha256"],
                     "recipe": recipe, "filterGraph": loop_graph, "ffmpegVersion": tool_version}
    identity = sha(canonical(specification))
    folder = ROOT / "media/elevenlabs/loops" / identity
    no_symlinks(folder)
    folder.mkdir(parents=True, exist_ok=True)
    output, receipt_path = folder / "loop.mp3", folder / "receipt.json"
    no_symlinks(output)
    no_symlinks(receipt_path)
    with tempfile.TemporaryDirectory(prefix=".prepare-", dir=folder) as temporary:
        raw = Path(temporary) / "source.mp3"
        raw.write_bytes(source_data)
        prefix = ["ffmpeg", "-nostdin", "-hide_banner", "-protocol_whitelist", "file,pipe", "-i", str(raw)]
        try:
            measured = subprocess.run(prefix + ["-filter_complex", loop_graph + "," + NORMALIZATION + ":print_format=json[out]",
                "-map", "[out]", "-f", "null", "-"], capture_output=True, text=True, check=True, timeout=90)
            analysis = loudness_report(measured.stderr)
            controls = ":".join(f"{name}={analysis[field]}" for name, field in (
                ("measured_I", "input_i"), ("measured_TP", "input_tp"),
                ("measured_LRA", "input_lra"), ("measured_thresh", "input_thresh"), ("offset", "target_offset")))
            mode = "dynamic" if recipe["normalizationMode"] == "measured-dynamic" else "linear"
            linear = "false" if mode == "dynamic" else "true"
            graph = loop_graph + "," + NORMALIZATION + ":" + controls + f":linear={linear}:print_format=json[out]"
            rendered = Path(temporary) / "loop.mp3"
            result = subprocess.run(prefix + ["-filter_complex", graph, "-map", "[out]", "-vn", "-sn",
                "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", str(rendered)],
                capture_output=True, text=True, check=True, timeout=90)
            normalized = loudness_report(result.stderr)
            if normalized.get("normalization_type") != mode or abs(float(normalized["output_i"]) + 20) > 0.3 or float(normalized["output_tp"]) > -1.9:
                raise SafeError("A prepared loop did not meet its declared measured loudness bounds.")
            duration = probe_mp3(rendered, "music")
            data = read_bytes(rendered, MAX_ASSET_BYTES)
            verification = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-protocol_whitelist", "file,pipe",
                "-i", str(rendered), "-af", NORMALIZATION + ":print_format=json", "-f", "null", "-"],
                capture_output=True, text=True, check=True, timeout=90)
            decoded = loudness_report(verification.stderr)
            if abs(float(decoded["input_i"]) + 20) > 0.5 or float(decoded["input_tp"]) > -2:
                raise SafeError("The encoded loop did not meet decoded loudness and true-peak bounds.")
            if "decodedLraMaximumLu" in recipe and float(decoded["input_lra"]) > recipe["decodedLraMaximumLu"]:
                raise SafeError("The encoded loop exceeded its reviewed decoded loudness range.")
            continuity = loop_continuity(rendered)
        except (OSError, subprocess.SubprocessError):
            raise SafeError("Offline music loop rendering failed; no active media were changed.") from None
    receipt = {"schemaVersion": 1, "status": "complete", "processingKey": identity,
               "specification": specification, "filterGraph": graph,
               "sourceRecordSha256": sha(canonical(source)), "source": source,
               "sha256": sha(data), "bytes": len(data), "duration": round(duration, 3),
               "loudnessAnalysis": analysis, "loudnessResult": normalized, "decodedVerification": decoded,
               "continuityVerification": continuity}
    # Re-render from the verified source even when cached. This proves that a
    # self-consistent but altered local receipt cannot authorize different audio.
    if receipt_path.exists():
        if read_json(receipt_path) != receipt or read_bytes(output, MAX_ASSET_BYTES) != data:
            raise SafeError("The cached loop differs from its deterministically verified source derivation.")
    else:
        atomic_write(output, data, 0o600)
        atomic_write(receipt_path, json_bytes(receipt), 0o600)
    data = read_bytes(output, MAX_ASSET_BYTES)
    duration = probe_mp3(output, "music")
    digest = sha(data)
    if (receipt.get("schemaVersion") != 1 or receipt.get("status") != "complete"
            or receipt.get("processingKey") != identity or receipt.get("specification") != specification
            or receipt.get("sourceRecordSha256") != sha(canonical(source)) or receipt.get("source") != source
            or receipt.get("sha256") != digest or receipt.get("bytes") != len(data)
            or type(receipt.get("duration")) not in (int, float) or abs(receipt["duration"] - duration) > 0.001
            or not 71.9 < duration < 72.2):
        raise SafeError("A local music loop receipt, source identity, encoding or output hash failed verification.")
    prepared = {**source, "src": f"/music/clip-{digest}.mp3", "sha256": digest,
                "bytes": len(data), "duration": round(duration, 3), "provenance": "verified-local-derivative",
                "encoding": {**source["encoding"], "filter": receipt["filterGraph"]},
                "source": source, "processing": {"processingKey": identity, "recipe": recipe,
                    "filterGraph": receipt["filterGraph"], "ffmpegVersion": tool_version,
                    "receiptSha256": sha(read_bytes(receipt_path, 12 * 1024 * 1024)),
                    "loudnessResult": receipt["loudnessResult"], "decodedVerification": receipt["decodedVerification"],
                    "continuityVerification": receipt["continuityVerification"]}}
    return prepared, {"data": data, "duration": duration}


def prepare_music_loops(metadata, assets, music_levels):
    if music_levels != list(LEVELS) or not shutil.which("ffmpeg"):
        raise SafeError("Loop preparation requires ffmpeg and all three verified source music beds.")
    try:
        version = subprocess.check_output(["ffmpeg", "-version"], text=True, stderr=subprocess.PIPE, timeout=10).splitlines()[0]
        if not version.startswith("ffmpeg version ") or len(version) > 300:
            raise ValueError
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        raise SafeError("The local music loop encoder version could not be verified.") from None
    manifest = metadata["src/music-manifest.json"]
    prepared = {}
    for collection in ("levels", "lessons"):
        prepared[collection] = {}
        for name, source in manifest.get(collection, {}).items():
            bed, asset = derive_music_loop(source, assets[source["src"]]["data"], version)
            prepared[collection][name] = bed
            assets[bed["src"]] = asset
    for source in {bed["src"] for collection in ("levels", "lessons") for bed in manifest.get(collection, {}).values()}:
        del assets[source]
    reviewed_crops = {
        bed["source"]["sha256"]: {key: bed["processing"]["recipe"][key]
                                  for key in ("sourceStartSeconds", "sourceEndSeconds")}
        for collection in ("levels", "lessons") for bed in prepared[collection].values()
        if bed["processing"]["recipe"].get("sourceStartSeconds") != LOOP_RECIPE["sourceStartSeconds"]
    }
    reviewed_normalizations = {
        bed["source"]["sha256"]: {key: bed["processing"]["recipe"][key]
                                  for key in ("normalizationMode", "decodedLraMaximumLu")}
        for collection in ("levels", "lessons") for bed in prepared[collection].values()
        if bed["processing"]["recipe"].get("normalizationMode") != LOOP_RECIPE["normalizationMode"]
    }
    preparation = {**LOOP_RECIPE, **({"reviewedSourceCrops": reviewed_crops} if reviewed_crops else {}),
                   **({"reviewedSourceNormalizations": reviewed_normalizations} if reviewed_normalizations else {})}
    metadata["src/music-manifest.json"] = {**manifest, "provenance": "verified-api-sources-with-local-loop-processing",
                                         "loopPreparation": preparation, **prepared}
    metadata["src/music-index.json"] = {level: bed["src"] for level, bed in prepared["levels"].items()}
    metadata["src/lesson-music-index.json"] = {name: bed["src"] for name, bed in prepared["lessons"].items()}


@contextmanager
def activation_lock():
    directory = ROOT / "media/elevenlabs"
    no_symlinks(directory)
    directory.mkdir(parents=True, exist_ok=True)
    no_symlinks(directory / ".activation.lock")
    no_symlinks(directory / ".generation.lock")
    with (directory / ".activation.lock").open("a") as activation, (directory / ".generation.lock").open("a") as generation:
        try:
            fcntl.flock(activation, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(generation, fcntl.LOCK_SH | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SafeError("Generation or another activation is still running; wait for it to finish.") from None
        yield


def activate(selected, reviewed=False, loop_music=False):
    if reviewed is not True:
        raise SafeError("Activation requires the operator's explicit --reviewed assertion.")
    if not shutil.which("ffprobe"):
        raise SafeError("ffprobe is required to verify the actual staged MP3 files.")
    bundle = bundle_directory(selected)
    with activation_lock():
        metadata, assets, music_levels = prepare_bundle(bundle, catalogue_texts())
        if loop_music:
            prepare_music_loops(metadata, assets, music_levels)
        snapshots = {}
        for relative in metadata:
            destination = ROOT / relative
            no_symlinks(destination)
            snapshots[relative] = destination.read_bytes() if destination.exists() else None
        for source, asset in assets.items():
            destination = ROOT / "public" / source.lstrip("/")
            no_symlinks(destination)
            if destination.exists() and read_bytes(destination, MAX_ASSET_BYTES) != asset["data"]:
                raise SafeError("An existing content-addressed public asset contains different bytes.")
        prefixes = ["narration"] + (["music"] if music_levels else [])
        retired = []
        for prefix in prefixes:
            directory = ROOT / "public" / prefix
            no_symlinks(directory)
            for path in directory.glob("clip-*.mp3"):
                no_symlinks(path)
                if re.fullmatch(r"clip-[a-f0-9]{64}\.mp3", path.name) and f"/{prefix}/{path.name}" not in assets:
                    if not path.is_file():
                        raise SafeError("An old public audio path is not a regular file.")
                    retired.append(path.relative_to(ROOT).as_posix())
        identifier = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:12]
        backup = ROOT / "media/elevenlabs/activation-backups" / identifier
        no_symlinks(backup)
        backup.mkdir(parents=True, mode=0o700)
        record = {"schemaVersion": 1, "status": "prepared", "sourcePlanHash": bundle.name,
                  "operatorConfirmedReviewed": True, "metadata": {}, "newAssets": [], "retiredAssets": retired}
        for relative, data in snapshots.items():
            record["metadata"][relative] = {"existed": data is not None, "sha256": sha(data) if data is not None else None}
            if data is not None:
                atomic_write(backup / "metadata" / relative, data, 0o600)
        atomic_write(backup / "activation.json", json_bytes(record), 0o600)
        created, moved = [], []
        try:
            # Asset names are immutable hashes. Old files stay available until all
            # replacement metadata commits, and retired files remain recoverable.
            for source, asset in assets.items():
                destination = ROOT / "public" / source.lstrip("/")
                if not destination.exists():
                    created.append(destination)
                    atomic_write(destination, asset["data"])
            record["newAssets"] = [path.relative_to(ROOT).as_posix() for path in created]
            atomic_write(backup / "activation.json", json_bytes(record), 0o600)
            for relative, value in metadata.items():
                atomic_write(ROOT / relative, json_bytes(value))
            record["status"] = "metadata-committed"
            atomic_write(backup / "activation.json", json_bytes(record), 0o600)
            for relative in retired:
                destination = backup / "retired" / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                os.replace(ROOT / relative, destination)
                moved.append(relative)
            record["status"] = "complete"
            atomic_write(backup / "activation.json", json_bytes(record), 0o600)
        except Exception:
            recovered = True
            for relative in reversed(moved):
                try:
                    os.replace(backup / "retired" / relative, ROOT / relative)
                except OSError:
                    recovered = False
            for relative, data in snapshots.items():
                try:
                    if data is None:
                        (ROOT / relative).unlink(missing_ok=True)
                    else:
                        atomic_write(ROOT / relative, data)
                except OSError:
                    recovered = False
            for destination in created:
                try:
                    destination.unlink(missing_ok=True)
                except OSError:
                    recovered = False
            record["status"] = "rolled-back" if recovered else "recovery-required"
            try:
                atomic_write(backup / "activation.json", json_bytes(record), 0o600)
            except OSError:
                pass
            raise SafeError("Activation failed; previous state was restored and recovery copies retained." if recovered
                            else "Activation failed and recovery is incomplete; use the retained activation backup before publishing.") from None
        return {"status": "activated", "provider": "ElevenLabs", "narrationKeys": len(metadata["src/narration-index.json"]),
                "uniqueAssets": len(assets), "musicLevels": music_levels,
                "musicLessons": list(metadata.get("src/lesson-music-index.json", {})),
                "retiredAssets": len(retired), "backup": backup.relative_to(ROOT).as_posix(),
                "review": "Operator asserted --reviewed; automated validation did not listen to audio."}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--reviewed", action="store_true")
    parser.add_argument("--loop-music", action="store_true", help="Prepare verified local loops from the original ninety-second music receipts.")
    args = parser.parse_args(argv)
    print(json.dumps(activate(args.bundle, args.reviewed, args.loop_music), indent=2))


if __name__ == "__main__":
    try:
        main()
    except SafeError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
    except (OSError, ValueError):
        print("Activation could not finish; inspect the retained local recovery data before publishing.", file=sys.stderr)
        raise SystemExit(1)
