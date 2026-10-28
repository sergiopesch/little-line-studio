#!/usr/bin/env python3
"""Stage authored ElevenLabs audio; dry-run by default, never activate it.

Examples:
  python3 scripts/elevenlabs-audio.py
  python3 scripts/elevenlabs-audio.py --list-voices --env-file .env.elevenlabs.local
  python3 scripts/elevenlabs-audio.py --sample-only --voice-id SELECTED_ID --model-id eleven_multilingual_v2

Only --generate makes paid requests. It requires a selected voice/model for
speech and an explicit existing-credit or USD estimate ceiling.
The USD limit caps reserved estimates, not the provider's billing system.
Pending requests are never retried: reconcile them with the provider manually.
Assets remain under ignored media/elevenlabs for review. This generator never
activates assets; the separate activation command verifies complete coverage.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal, InvalidOperation, ROUND_UP
import fcntl
import hashlib
from http.client import HTTPException
import json
import os
from pathlib import Path
import re
import runpy
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from urllib import error, parse, request

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.elevenlabs.io"
CONTRACT_DATE = "2026-10-26"
SAMPLE = "Hello, little artist. We will draw one little part at a time, then add colours of your own. Ready when you are."
MODELS = {"eleven_multilingual_v2", "eleven_v3", "eleven_v4", "eleven_flash_v2_5"}
RATES = {"speechPerThousand": "0.08", "musicPerMinute": "0.15", "reserveMultiplier": "1.25"}
SOURCES = {
    "speech": "https://elevenlabs.io/docs/api-reference/text-to-speech/convert",
    "voices": "https://elevenlabs.io/docs/api-reference/voices/search",
    "music": "https://elevenlabs.io/docs/api-reference/music/compose",
    "pricing": "https://elevenlabs.io/pricing/api",
}
MUSIC_PROMPTS = {
    "basic": "Original gentle instrumental background music for a shared paper drawing activity. Sparse soft piano and warm sustained tones, unhurried and steady. Quiet, simple, understated arrangement. No vocals, speech, singing, choir, lyrics, dramatic changes, percussion hits, or sudden accents. A gentle beginning and ending.",
    "intermediate": "Original calm instrumental background music for a shared paper drawing activity. Soft marimba and warm acoustic plucked textures, spacious and unhurried. Quiet, simple, understated arrangement. No vocals, speech, singing, choir, lyrics, dramatic changes, percussion hits, or sudden accents. A gentle beginning and ending.",
    "expert": "Original calm instrumental background music for a shared paper drawing activity. Delicate soft piano and warm ambient strings with long quiet spaces. Quiet, simple, understated arrangement. No vocals, speech, singing, choir, lyrics, dramatic changes, percussion hits, or sudden accents. A gentle beginning and ending.",
}
ENCODING = {
    "speech": {"filter": "loudnorm=I=-20:TP=-2:LRA=7", "rate": 44100, "channels": 1, "bitrate": "128k", "maxSeconds": 35},
    "music": {"filter": "loudnorm=I=-20:TP=-2:LRA=7", "rate": 44100, "channels": 2, "bitrate": "128k", "maxSeconds": 302},
}


class SafeError(Exception):
    """Only authored, credential-free messages may leave this boundary."""


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def write_json(path, value):
    atomic(path, (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode())


def load_key(env_file=None):
    if env_file:
        path = Path(env_file).resolve()
        if path != ROOT / ".env.elevenlabs.local":
            raise SafeError("Only the explicitly selected project .env.elevenlabs.local file is accepted.")
        try:
            if path.stat().st_mode & 0o077:
                raise SafeError("The local credential file must be private (chmod 600 .env.elevenlabs.local).")
            lines = path.read_text().splitlines()
        except OSError:
            raise SafeError("The selected local env file could not be read.") from None
        matches = [re.fullmatch(r"\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*(.*?)\s*", line) for line in lines]
        values = [match.group(1) for match in matches if match]
        if len(values) != 1:
            raise SafeError("The selected env file needs exactly one ELEVENLABS_API_KEY assignment.")
        key = values[0]
        if len(key) >= 2 and key[0] == key[-1] and key[0] in "\"'":
            key = key[1:-1]
    else:
        key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not key or any(character.isspace() for character in key):
        raise SafeError("Set ELEVENLABS_API_KEY in the environment or explicitly select the ignored local env file.")
    return key


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward a credential or replay a paid request elsewhere.


class APIClient:
    def __init__(self, key):
        self.key = key
        self.opener = request.build_opener(NoRedirect())

    def call(self, path, payload=None):
        # Read-only quota/catalogue requests may recover from transient errors.
        # A generation POST is always attempted once, including on timeouts.
        for attempt in range(5 if payload is None else 1):
            try:
                return self._call_once(path, payload)
            except SafeError:
                if payload is not None or attempt == 4:
                    raise
                time.sleep(min(8, 2 ** attempt))

    def _call_once(self, path, payload=None):
        if not path.startswith("/") or path.startswith("//"):
            raise SafeError("Invalid fixed API path.")
        headers = {"xi-api-key": self.key, "Accept": "application/json" if payload is None else "audio/mpeg"}
        data = None if payload is None else canonical(payload)
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = request.Request(API + path, data=data, headers=headers, method="GET" if payload is None else "POST")
        try:
            with self.opener.open(req, timeout=180) as response:
                body = response.read(32 * 1024 * 1024 + 1)
                if len(body) > 32 * 1024 * 1024:
                    raise SafeError("API response exceeded the bounded audio size; reconcile the request before continuing.")
                if payload is None:
                    return json.loads(body)
                if not response.headers.get("Content-Type", "").lower().startswith("audio/"):
                    raise SafeError("Unexpected generation response; reconcile the request before continuing.")
                return body
        except SafeError:
            raise
        except error.HTTPError as exc:
            safe = SafeError(f"ElevenLabs request returned HTTP {exc.code}. Generation was not automatically retried.")
            safe.http_status = exc.code
            raise safe from None
        except (error.URLError, error.HTTPError, TimeoutError, OSError, ValueError, HTTPException):
            # No provider error body, URL, headers, request text or credential is logged.
            raise SafeError("API request failed or its result is unknown. No automatic retry was made; reconcile paid requests manually.") from None

    def voices(self, selected=None):
        voices, seen, token = [], set(), None
        while True:
            params = {"page_size": 100, "include_total_count": "false",
                      "include_custom_rates": "false", "include_live_moderated": "false"}
            if selected:
                params["voice_ids"] = selected
            if token:
                params["next_page_token"] = token
            page = self.call("/v2/voices?" + parse.urlencode(params))
            if not isinstance(page, dict) or not isinstance(page.get("voices"), list):
                raise SafeError("Unexpected voice catalogue response.")
            voices.extend(page["voices"])
            if not page.get("has_more"):
                return voices
            token = page.get("next_page_token")
            if not isinstance(token, str) or not token or token in seen or len(seen) >= 100:
                raise SafeError("Voice pagination did not terminate safely.")
            seen.add(token)


def spanish_sample():
    try:
        sample = (ROOT / "src/spanish-narration-sample.txt").read_text(encoding="utf8").strip()
    except (OSError, UnicodeError):
        raise SafeError("The reviewed Spanish sample could not be read.") from None
    if not sample or len(sample) > 2000:
        raise SafeError("The Spanish sample must contain bounded text.")
    return sample


def catalogue_texts(locale="en-GB"):
    if locale not in ("en-GB", "es-419"):
        raise SafeError("Choose a supported authored narration locale.")
    program = """
      import { LESSONS, LEVELS, narrationKey } from './src/lesson-catalogue.js';
      const texts = {};
      for (const lesson of LESSONS) {
        for (const [index, step] of lesson.steps.entries()) {
        texts[narrationKey(lesson,index)] = step.spoken;
        texts[narrationKey(lesson,index,'hint')] = step.hint;
        }
      }
      console.log(JSON.stringify({count:LESSONS.length,levels:LEVELS.map(l=>l.id),texts}));
    """
    try:
        command = (["node", "scripts/export-reviewed-spanish.mjs"] if locale == "es-419"
                   else ["node", "--input-type=module", "-e", program])
        data = json.loads(subprocess.check_output(command, cwd=ROOT, text=True, stderr=subprocess.PIPE))
    except (OSError, subprocess.CalledProcessError, ValueError):
        raise SafeError("The reviewed lesson catalogue could not be exported; no generation was attempted.") from None
    if data.get("count") != 30 or set(data.get("levels", [])) != set(MUSIC_PROMPTS):
        raise SafeError("Expected the complete thirty-lesson, three-level authored catalogue.")
    texts = {"sample": spanish_sample() if locale == "es-419" else SAMPLE, **data["texts"]}
    if any(not isinstance(text, str) or not text.strip() or len(text) > 2000 for text in texts.values()):
        raise SafeError("Authored speech must contain non-empty, bounded text.")
    return texts


def lesson_music_catalogue():
    try:
        return runpy.run_path(str(Path(__file__).with_name("authored-music.py")))["read_catalogue"](ROOT)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        raise SafeError("The authored lesson music registry does not match the current lesson assignments.") from None


def voice_settings(model):
    settings = {"stability": 0.65, "similarity_boost": 0.75}
    if model == "eleven_multilingual_v2":
        settings.update({"style": 0, "speed": 0.85, "use_speaker_boost": True})
    elif model == "eleven_flash_v2_5":
        settings["speed"] = 0.85
    elif model == "eleven_v3":
        settings["stability"] = 0.5  # Natural-mode setting for the v3 model.
    return settings


def speech_text(spec):
    payload = spec["payload"]
    return payload["inputs"][0]["text"] if "inputs" in payload else payload["text"]


def make_plan(args, texts):
    if args.model_id and args.model_id not in MODELS:
        raise SafeError("Choose a verified standard-rate speech model: eleven_multilingual_v2, eleven_v3, eleven_v4 or eleven_flash_v2_5.")
    if args.voice_id and not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", args.voice_id):
        raise SafeError("Select a voice ID returned by --list-voices.")
    if not 3 <= args.music_seconds <= 300:
        raise SafeError("Music duration must be between 3 and 300 seconds.")
    requests = {}
    entries = {}
    selected = {"sample": texts["sample"]} if args.sample_only else texts
    lesson_ids = getattr(args, "lessons", None)
    if lesson_ids and not args.sample_only:
        lesson_ids = set(lesson_ids.split(","))
        known = {name.split("/")[0] for name in texts if "/" in name}
        if not lesson_ids <= known or not lesson_ids:
            raise SafeError("Select known lesson IDs from the authored catalogue.")
        selected = {name: text for name, text in texts.items() if name == "sample" or name.split("/")[0] in lesson_ids}
    if args.kind in ("speech", "all"):
        for name, text in selected.items():
            payload = {"text": text, "model_id": args.model_id, "voice_settings": voice_settings(args.model_id)}
            path = "/v1/text-to-speech/" + (args.voice_id or "UNSELECTED") + "?output_format=mp3_44100_128"
            if args.model_id == "eleven_v4":
                # v4 uses the documented dialogue endpoint, even for one voice.
                # Omit optional settings rather than invent unsupported controls.
                payload = {"inputs": [{"text": text, "voice_id": args.voice_id}], "model_id": "eleven_v4"}
                if getattr(args, "locale", "en-GB") == "es-419":
                    payload["language_code"] = "es"
                path = "/v1/text-to-dialogue?output_format=mp3_44100_128"
            spec = {"kind": "speech", "path": path, "payload": payload, "voiceId": args.voice_id,
                    "apiContractDate": CONTRACT_DATE, "encoding": ENCODING["speech"]}
            identity = sha(canonical(spec))
            rate = Decimal("0.04") if args.model_id == "eleven_flash_v2_5" else Decimal(RATES["speechPerThousand"])
            amount = Decimal(len(text)) / 1000 * rate
            requests[identity] = {**spec, "cacheKey": identity, "estimatedUsd": str(amount)}
            entries[name] = identity
    if args.kind in ("music", "all") and not args.sample_only:
        for level, prompt in MUSIC_PROMPTS.items():
            spec = {"kind": "music", "path": "/v1/music?output_format=mp3_44100_128",
                    "payload": {"prompt": prompt, "model_id": "music_v2_5", "music_length_ms": args.music_seconds * 1000, "force_instrumental": True},
                    "apiContractDate": CONTRACT_DATE, "encoding": ENCODING["music"]}
            identity = sha(canonical(spec))
            amount = Decimal(args.music_seconds) / 60 * Decimal(RATES["musicPerMinute"])
            requests[identity] = {**spec, "cacheKey": identity, "estimatedUsd": str(amount)}
            entries[f"music/{level}"] = identity
        for music_id, music in lesson_music_catalogue().items():
            if lesson_ids and music_id not in lesson_ids:
                continue
            spec = {"kind": "music", "path": "/v1/music?output_format=mp3_44100_128",
                    "payload": {"prompt": music["prompt"], "model_id": "music_v2_5", "music_length_ms": music["seconds"] * 1000, "force_instrumental": True},
                    "apiContractDate": CONTRACT_DATE, "encoding": ENCODING["music"]}
            identity = sha(canonical(spec))
            amount = Decimal(music["seconds"]) / 60 * Decimal(RATES["musicPerMinute"])
            requests[identity] = {**spec, "cacheKey": identity, "estimatedUsd": str(amount)}
            entries[f"music/lesson/{music_id}"] = identity
    if not requests:
        raise SafeError("Choose a speech sample or a non-empty generation kind.")
    base = sum((Decimal(item["estimatedUsd"]) for item in requests.values()), Decimal(0))
    return {"schemaVersion": 1, "status": "planned-not-generated", "providerRequested": "ElevenLabs",
            "sources": SOURCES, "pricingChecked": CONTRACT_DATE, "rates": RATES,
            "estimateLimits": "Standard-rate models/voices only. Excludes taxes, subscription, currency conversion and price changes; reserve is planning headroom, not a provider-enforced billing cap. Confirm current account rights and pricing before --generate.",
            "speechCharacters": sum(len(speech_text(item)) for item in requests.values() if item["kind"] == "speech"),
            "baseEstimatedUsd": str(base.quantize(Decimal("0.0001"), rounding=ROUND_UP)),
            "reservedEstimatedUsd": str((base * Decimal(RATES["reserveMultiplier"])).quantize(Decimal("0.0001"), rounding=ROUND_UP)),
            "entries": entries, "requests": requests}


def normalize(raw, destination, spec):
    encoding = spec["encoding"]
    try:
        info = subprocess.check_output(["ffprobe", "-v", "error", "-f", "mp3", "-show_entries", "format=duration",
                                        "-of", "default=noprint_wrappers=1:nokey=1", str(raw)], stderr=subprocess.PIPE, text=True, timeout=15)
        duration = float(info)
        bound = encoding["maxSeconds"] if spec["kind"] == "speech" else spec["payload"]["music_length_ms"] / 1000 + 2
        minimum = 0 if spec["kind"] == "speech" else max(0, spec["payload"]["music_length_ms"] / 1000 - 2)
        if not minimum < duration < bound:
            raise SafeError("Received audio has an unexpected duration; raw audio is retained for review without another paid request.")
        fd, temporary = tempfile.mkstemp(suffix=".mp3", dir=destination.parent)
        os.close(fd)
        try:
            subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "mp3", "-i", str(raw),
                            "-vn", "-sn", "-af", encoding["filter"], "-ar", str(encoding["rate"]), "-ac", str(encoding["channels"]),
                            "-codec:a", "libmp3lame", "-b:a", encoding["bitrate"], "-map_metadata", "-1", temporary],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=90)
            output_info = subprocess.check_output(["ffprobe", "-v", "error", "-f", "mp3", "-show_entries", "format=duration",
                                                   "-of", "default=noprint_wrappers=1:nokey=1", temporary], stderr=subprocess.PIPE, text=True, timeout=15)
            duration = float(output_info)
            if not minimum < duration < bound:
                raise SafeError("Normalised audio duration is outside the reviewed bound; raw audio is retained.")
            atomic(destination, Path(temporary).read_bytes())
        finally:
            Path(temporary).unlink(missing_ok=True)
        return round(duration, 3)
    except SafeError:
        raise
    except (OSError, ValueError, subprocess.SubprocessError):
        raise SafeError("Audio normalisation failed. The received raw response is retained; no repeat POST is needed.") from None


def cached_record(directory, identity):
    folder = directory / "cache" / identity
    journal = folder / "receipt.json"
    if not journal.exists():
        return None
    try:
        record = json.loads(journal.read_text())
        if record.get("cacheKey") != identity or record.get("provider") != "ElevenLabs":
            raise SafeError("Cached receipt provenance failed; reconcile before regeneration.")
        if record.get("status") == "pending-unknown":
            raise SafeError("A previous paid request has an unresolved outcome. Reconcile it manually; do not delete its receipt and retry blindly.")
        if record.get("status") == "complete":
            data = (folder / "normalised.mp3").read_bytes()
            if record.get("cacheKey") != identity or record.get("provider") != "ElevenLabs" or sha(data) != record.get("sha256") or len(data) != record.get("bytes"):
                raise SafeError("Cached audio integrity failed; retain the receipt and reconcile before requesting replacement audio.")
        elif record.get("status") != "received":
            raise SafeError("Generation receipt is not in a recoverable state.")
        return record
    except SafeError:
        raise
    except (OSError, ValueError):
        raise SafeError("Generation cache is incomplete; reconcile its receipt before any new paid request.") from None


def generate_one(client, directory, spec):
    identity = spec["cacheKey"]
    folder = directory / "cache" / identity
    folder.mkdir(parents=True, exist_ok=True)
    record = cached_record(directory, identity)
    if record and record["status"] == "complete":
        return record
    if record is None:
        prepare = getattr(type(client), "prepare_generation", None)
        if callable(prepare):
            prepare(client, spec["path"], spec["payload"], identity)
        record = {"cacheKey": identity, "status": "pending-unknown", "provider": "ElevenLabs",
                  "apiPath": spec["path"], "model": spec["payload"]["model_id"],
                  "voiceId": spec.get("voiceId"), "reservedEstimatedUsd": str(Decimal(spec["estimatedUsd"]) * Decimal(RATES["reserveMultiplier"])),
                  "requestedAt": datetime.now(timezone.utc).isoformat()}
        write_json(folder / "receipt.json", record)
        data = client.call(spec["path"], spec["payload"])  # Exactly one POST; never automatically retried.
        if not isinstance(data, bytes) or not data:
            raise SafeError("Generation response was empty; reconcile the pending request before continuing.")
        atomic(folder / "raw.mp3", data)
        record.update({"status": "received", "rawSha256": sha(data)})
        write_json(folder / "receipt.json", record)
        settle = getattr(type(client), "settle_generation", None)
        if callable(settle):
            settle(client, identity)  # Raw survives even if quota reconciliation fails.
    try:
        if sha((folder / "raw.mp3").read_bytes()) != record["rawSha256"]:
            raise SafeError("Raw response integrity failed; reconcile before regeneration.")
    except (OSError, KeyError):
        raise SafeError("Raw response is missing; reconcile before regeneration.") from None
    duration = normalize(folder / "raw.mp3", folder / "normalised.mp3", spec)
    data = (folder / "normalised.mp3").read_bytes()
    record.update({"status": "complete", "sha256": sha(data), "bytes": len(data), "duration": duration})
    write_json(folder / "receipt.json", record)
    return record


def build_bundle(directory, plan, records):
    # Each plan has a separate review bundle; sample/full runs cannot mix assets.
    bundle = directory / "bundles" / sha(canonical(plan))
    speech, music, lesson_music = {}, {}, {}
    for name, identity in plan["entries"].items():
        spec, record = plan["requests"][identity], records[identity]
        kind = spec["kind"]
        prefix = "music" if kind == "music" else "narration"
        source = f"/{prefix}/clip-{record['sha256']}.mp3"
        atomic(bundle / "assets" / source.lstrip("/"), (directory / "cache" / identity / "normalised.mp3").read_bytes())
        item = {"src": source, "sha256": record["sha256"], "bytes": record["bytes"], "duration": record["duration"],
                "provider": "ElevenLabs", "provenance": "verified-api-response", "model": spec["payload"]["model_id"], "cacheKey": identity,
                "encoding": spec["encoding"], "generationSettings": spec["payload"]}
        if kind == "speech":
            speech[name] = {**item, "text": speech_text(spec), "voiceId": spec["voiceId"]}
        elif name.startswith("music/lesson/") and len(name.split("/")) == 3:
            lesson_music[name.split("/")[2]] = {**item, "prompt": spec["payload"]["prompt"], "instrumentalRequested": True}
        elif name.startswith("music/") and len(name.split("/")) == 2:
            music[name.split("/")[1]] = {**item, "prompt": spec["payload"]["prompt"], "instrumentalRequested": True}
        else:
            raise SafeError("Music bundle entries must use exact authored level or lesson identities.")
    header = {"schemaVersion": 1, "reviewStatus": "unreviewed-staged-only", "provider": "ElevenLabs"}
    if plan.get("locale") == "es-419":
        header.update(locale="es-419", voiceId=plan.get("voiceId"))
    if speech:
        write_json(bundle / "narration-manifest.json", {**header, "clips": speech})
        write_json(bundle / "narration-index.json", {key: clip["src"] for key, clip in speech.items()})
    if music or lesson_music:
        write_json(bundle / "music-manifest.json", {**header, "levels": music, "lessons": lesson_music})
    write_json(bundle / "bundle.json", {**header, "planHash": sha(canonical(plan)), "speechKeys": len(speech), "musicLevels": list(music), "musicLessons": list(lesson_music)})
    write_json(bundle / "plan.json", plan)
    return bundle / "bundle.json"


def received_audio(directory, identity):
    try:
        record = cached_record(directory, identity)
    except SafeError:
        return False
    if not record or record["status"] not in ("received", "complete"):
        return False
    raw = directory / "cache" / identity / "raw.mp3"
    return raw.is_file() and sha(raw.read_bytes()) == record.get("rawSha256")


def generate_batch(factory, directory, specs, budget=None, *, reservation=None, defer_settlement=False, concurrency_limit=3):
    # Reserve the entire small group before any worker sends a POST. One durable
    # pending group blocks later groups until every response is known and saved.
    if (type(concurrency_limit) is not int or not 1 <= concurrency_limit <= 8
            or not specs or len(specs) > concurrency_limit or (concurrency_limit > 3 and not budget)):
        raise SafeError("Generation needs bounded concurrency; larger groups require the credit guard.")
    for spec in specs:
        # A cached identity also binds every field used to dispatch and encode
        # the request. Never reuse a cheap reservation with a changed payload.
        identity_spec = {key: value for key, value in spec.items() if key not in ("cacheKey", "estimatedUsd")}
        if spec.get("cacheKey") != sha(canonical(identity_spec)):
            raise SafeError("A generation request does not match its canonical cache identity.")
    if defer_settlement and not budget:
        raise SafeError("Deferred settlement requires the durable existing-credit guard.")
    if reservation is not None:
        if not budget:
            raise SafeError("An existing reservation requires its credit guard.")
        identities = [spec["cacheKey"] for spec in specs]
        if reservation.get("requestIds") != identities:
            raise SafeError("The generation group does not match its durable reservation.")
        reservation = budget.verify_batch_reservation(reservation.get("requestId"), [
            (spec["path"], spec["payload"], spec["cacheKey"]) for spec in specs
        ])
    else:
        reservation = budget.before_batch([(spec["path"], spec["payload"], spec["cacheKey"]) for spec in specs]) if budget else None
    records, failures = {}, []
    with ThreadPoolExecutor(max_workers=len(specs)) as pool:
        jobs = {pool.submit(generate_one, factory(), directory, spec): spec["cacheKey"] for spec in specs}
        for job in as_completed(jobs):
            try:
                records[jobs[job]] = job.result()
            except Exception as exc:
                failures.append(exc)
    if budget and all(received_audio(directory, spec["cacheKey"]) for spec in specs):
        if not defer_settlement or failures:
            budget.after(request_id=reservation["requestId"])
    elif budget:
        raise SafeError("A generation group has an unknown response. Known audio is saved; reconcile pending members before continuing.")
    if failures:
        raise failures[0]
    return records


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--generate", action="store_true")
    mode.add_argument("--list-voices", action="store_true")
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--voice-id")
    parser.add_argument("--model-id")
    parser.add_argument("--locale", choices=["en-GB", "es-419"], default="en-GB", help="Use a separate authored language catalogue; Spanish bundles remain staged until independently activated.")
    parser.add_argument("--reviewed-spanish", action="store_true", help="Assert the Spanish text selected for generation has been reviewed; does not activate any assets.")
    parser.add_argument("--max-usd")
    parser.add_argument("--existing-credits-only", action="store_true", help="Require live bounded subscription quota and forbid overages.")
    parser.add_argument("--max-credits", type=int)
    parser.add_argument("--credit-ledger", default="credit-ledger.json", help="Named audit ledger inside the ignored generation directory.")
    parser.add_argument("--speech-credit-ceiling", choices=["0.5", "1"], help="Conservative per-character reservation ceiling, verified with an account sample.")
    parser.add_argument("--kind", choices=["speech", "music", "all"], default="all")
    parser.add_argument("--sample-only", action="store_true")
    parser.add_argument("--lessons", help="Comma-separated authored lesson IDs for a complete pilot bundle.")
    parser.add_argument("--music-seconds", type=int, default=120)
    parser.add_argument("--workers", type=int, choices=[1, 2, 3], default=1, help="Bounded preparation concurrency; existing-credit mode required above one.")
    args = parser.parse_args(argv)
    if args.list_voices:
        client = APIClient(load_key(args.env_file))
        result = [{key: voice.get(key) for key in ("voice_id", "name", "category", "labels", "preview_url")} for voice in client.voices()]
        print(json.dumps(result, indent=2).replace(client.key, "[redacted]"))
        return
    directory = ROOT / "media" / "elevenlabs"
    if args.locale == "es-419" and args.kind != "speech":
        raise SafeError("Spanish preparation is speech-only; reuse the existing reviewed music.")
    if args.generate and args.locale == "es-419" and not args.reviewed_spanish:
        raise SafeError("Review the selected Spanish scripts before asserting --reviewed-spanish and generating audio.")
    # A short reviewed audition is independent of the full Spanish catalogue,
    # which deliberately remains unavailable until every lesson is reviewed.
    texts = ({"sample": spanish_sample()} if args.locale == "es-419" and args.sample_only
             else catalogue_texts(args.locale))
    plan = make_plan(args, texts)
    if args.locale == "es-419":
        plan.update(locale="es-419", voiceId=args.voice_id)
    directory.mkdir(parents=True, exist_ok=True)
    plan_path = directory / ("plan-es-419.json" if args.locale == "es-419" else "plan.json")
    write_json(plan_path, plan)
    if not args.generate:
        print(json.dumps({"mode": "dry-run-no-network", "locale": args.locale, "plan": str(plan_path),
                          "uniqueRequests": len(plan["requests"]), "speechCharacters": plan["speechCharacters"],
                          "baseEstimatedUsd": plan["baseEstimatedUsd"], "reservedEstimatedUsd": plan["reservedEstimatedUsd"],
                          "note": plan["estimateLimits"]}, indent=2))
        return
    try:
        limit = Decimal(args.max_usd or (plan["reservedEstimatedUsd"] if args.existing_credits_only else "NaN"))
        if not limit.is_finite() or limit <= 0:
            raise InvalidOperation
    except InvalidOperation:
        raise SafeError("--generate requires a positive finite --max-usd estimate ceiling.") from None
    if args.kind != "music" and (not args.voice_id or not args.model_id):
        raise SafeError("--generate speech requires an explicitly selected --voice-id and --model-id.")
    if args.workers > 1 and not args.existing_credits_only:
        raise SafeError("Parallel preparation requires the aggregate existing-credit guard.")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SafeError("Install ffmpeg/ffprobe before making any paid request.")
    with (directory / ".generation.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        existing = {key: cached_record(directory, key) for key in plan["requests"]}
        reserved = sum((Decimal(spec["estimatedUsd"]) * Decimal(RATES["reserveMultiplier"])
                        for key, spec in plan["requests"].items() if existing[key] is None), Decimal(0))
        if reserved > limit:
            raise SafeError("Estimated uncached generation plus reserve exceeds --max-usd; no request was made.")
        key = load_key(args.env_file)
        client = APIClient(key)
        if args.kind != "music":
            voices = client.voices(args.voice_id)
            if not any(voice.get("voice_id") == args.voice_id for voice in voices):
                raise SafeError("Selected voice is not in the standard-rate, non-live-moderated account catalogue.")
            models = client.call("/v1/models")
            if not isinstance(models, list) or not any(model.get("model_id") == args.model_id and model.get("can_do_text_to_speech") is True for model in models):
                raise SafeError("Selected speech model is not available for text to speech.")
        budget = None
        if args.existing_credits_only:
            from elevenlabs_credit_budget import CreditBudget, CreditBudgetError
            if not args.max_credits or args.max_credits <= 0:
                raise SafeError("Existing-credit generation requires a positive --max-credits cap.")
            selected_model = next((model for model in models if model["model_id"] == args.model_id), {}) if args.kind != "music" else {}
            rate = Decimal(args.speech_credit_ceiling or str(selected_model.get("model_rates", {}).get("character_cost_multiplier", 1)))
            if not re.fullmatch(r"[a-z0-9-]+\.json", args.credit_ledger):
                raise SafeError("Credit ledger must be a simple named JSON file.")
            budget = CreditBudget(client, directory / args.credit_ledger, max_credits=args.max_credits, speech_rate=rate)
            # A confirmed saved response can settle a failed quota-read without
            # resending the paid generation. Unknown outcomes remain blocked.
            state = budget.inspect()
            pending_ids = state.get("pendingRequestIds", [])
            if pending_ids and all(identity in existing and received_audio(directory, identity) for identity in pending_ids):
                budget.after(request_id=state["pendingRequestId"])
            if any(spec["kind"] == "music" and spec["payload"]["music_length_ms"] not in (60000, 90000, 120000) for spec in plan["requests"].values()):
                raise SafeError("Existing-credit music generation accepts only 60, 90 or 120 seconds per level.")
            required = sum(int(((Decimal(len(speech_text(spec))) * rate) if spec["kind"] == "speech" else
                                Decimal(spec["payload"]["music_length_ms"]) * Decimal("900") / 60000).to_integral_value(rounding=ROUND_UP))
                           for identity, spec in plan["requests"].items() if existing[identity] is None)
            budget.preflight(required)
            account_tier = budget._read()["starting"]["tier"]
            if args.workers > (2 if account_tier == "free" else 3):
                raise SafeError("Preparation concurrency exceeds the verified account tier limit.")
        records = {}
        missing = []
        for identity, spec in plan["requests"].items():
            if existing[identity] is None:
                missing.append(spec)
            else:
                records[identity] = generate_one(client, directory, spec)  # Verified cached/raw audio; no POST.
        last_report = len(records) // 10
        offset = 0
        pending_reservation, pending_specs = None, None
        while offset < len(missing):
            # A local operator stop never interrupts a paid request. Settle the
            # completed group before returning; resume reuses its saved audio.
            if (directory / ".stop-after-batch").exists():
                if pending_reservation:
                    if not all(received_audio(directory, spec["cacheKey"]) for spec in pending_specs):
                        raise SafeError("Unknown group responses block a graceful pause.")
                    budget.after(request_id=pending_reservation["requestId"])
                print(json.dumps({"mode": "safely-paused-after-batch", "prepared": len(records), "total": len(plan["requests"])}), flush=True)
                return
            # The account permits three standard speech or two music requests.
            size = min(args.workers, 2 if missing[offset]["kind"] == "music" else 3)
            group = missing[offset:offset + size]
            if any(spec["kind"] == "music" for spec in group): group = group[:2]
            reservation = None
            if budget:
                requests = [(spec["path"], spec["payload"], spec["cacheKey"]) for spec in group]
                if pending_reservation:
                    confirmed = [spec["cacheKey"] for spec in pending_specs if received_audio(directory, spec["cacheKey"])]
                    if len(confirmed) != len(pending_specs):
                        raise SafeError("Unknown group responses block further generation.")
                    transition = budget.after_and_before_batch(pending_reservation["requestId"], requests,
                        received_request_ids=confirmed)
                    reservation = transition["reservation"]
                else:
                    reservation = budget.before_batch(requests)
            records.update(generate_batch(lambda: APIClient(key), directory, group, budget,
                reservation=reservation, defer_settlement=bool(budget)))
            pending_reservation, pending_specs = reservation, group
            offset += len(group)
            if len(records) // 10 > last_report or offset == len(missing):
                last_report = len(records) // 10
                print(json.dumps({"prepared": len(records), "total": len(plan["requests"]),
                                  "credits": budget.snapshot() if budget else None,
                                  "quotaSnapshot": "last-verified-for-logging" if budget else None}), flush=True)
        if pending_reservation:
            budget.after(request_id=pending_reservation["requestId"])
        bundle_path = build_bundle(directory, plan, records)
        print(json.dumps({"mode": "staged-unreviewed", "bundle": str(bundle_path), "uniqueAudio": len(records)}, indent=2))


if __name__ == "__main__":
    from elevenlabs_credit_budget import CreditBudgetError
    try:
        main()
    except (SafeError, CreditBudgetError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Error: local generation could not complete. Active audio is unchanged; inspect staged files without retrying unresolved paid requests.", file=sys.stderr)
        sys.exit(1)
