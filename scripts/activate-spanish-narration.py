#!/usr/bin/env python3
"""Activate verified Spanish speech offline, with explicit release provenance.

This command does not contact a provider, create speech, select a voice, or
review translations/audio. It requires an explicitly selected voice ID and
one of --reviewed, --partial-release-approved, or
--full-catalogue-review-pending. Staged metadata must declare locale es-419
and that voice ID.
The reviewed mode requires the complete catalogue. A user-approved partial
mode requires an explicit proper subset of complete lessons and does not
assert native-speaker or full human listening review. The full-catalogue
review-pending mode requires every lesson and records the same review limits.
Audio is content-addressed
and added only; English metadata and assets are never replaced or retired.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import math
import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

spec = importlib.util.spec_from_file_location("english_activation", Path(__file__).with_name("activate-elevenlabs.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
SafeError = base.SafeError
LOCALE = "es-419"
INDEX = "src/narration-index.es-419.json"
DURATIONS = "src/narration-durations.es-419.json"
MANIFEST = "src/narration-manifest.es-419.json"
AVAILABILITY = "src/narration-availability.es-419.json"
VOICE = re.compile(r"[A-Za-z0-9_-]{1,100}")
LESSON_KEY = re.compile(r"([a-z0-9]+(?:-[a-z0-9]+)*)/([a-z0-9]+(?:-[a-z0-9]+)*)/(instruction|hint)")
ASSET = re.compile(r"/narration/clip-([a-f0-9]{64})\.mp3")


def checked_spanish_request(clip, request_spec, kind):
    """Accept the exact Spanish v4 field without changing English validation."""
    if kind != "narration" or clip.get("model") != "eleven_v4":
        return checked_english_request(clip, request_spec, kind)
    settings = clip.get("generationSettings")
    payload = request_spec.get("payload") if isinstance(request_spec, dict) else None
    if (not isinstance(settings, dict) or not isinstance(payload, dict) or
            settings.get("language_code") != "es" or payload.get("language_code") != "es"):
        raise SafeError("Spanish v4 narration requires the exact Spanish language setting.")
    # The upstream validator remains responsible for every other field. The
    # original payload stays in the hash, receipt checks, and saved manifest.
    checked_english_request(
        {**clip, "generationSettings": {key: value for key, value in settings.items() if key != "language_code"}},
        {**request_spec, "payload": {key: value for key, value in payload.items() if key != "language_code"}},
        kind,
    )


# This private module instance is used only by the Spanish activator; the
# English activator's source and validation behaviour remain unchanged.
checked_english_request = base.checked_request
base.checked_request = checked_spanish_request


def catalogue_texts():
    """Compare every runtime translation with the source-linked export."""
    try:
        sample_path = base.ROOT / "src/spanish-narration-sample.txt"
        sample = base.read_bytes(sample_path, 8192).decode("utf8").strip()
        program = """
          import { LESSONS, narrationKey } from './src/lesson-catalogue.js';
          import { localizeLesson } from './src/spanish-lessons.js';
          const lessonFields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
          const stepFields = ['title', 'instruction', 'spoken', 'hint', 'notice'];
          const texts = {};
          const lessons = {};
          for (const original of LESSONS) {
            const lesson = localizeLesson(original, 'es-419');
            const steps = {};
            for (const [index, step] of lesson.steps.entries()) {
              steps[step.id] = Object.fromEntries(stepFields.map((field) => [field, step[field]]));
              for (const [kind, value] of [['instruction', step.spoken], ['hint', step.hint]]) {
                const key = narrationKey(lesson, index, kind);
                if (Object.hasOwn(texts, key)) throw Error('duplicate narration key');
                texts[key] = value;
              }
            }
            lessons[lesson.id] = { ...Object.fromEntries(lessonFields.map((field) => [field, lesson[field] ?? ''])),
              pilotPhases: lesson.pilotPhases, steps };
          }
          console.log(JSON.stringify({count: LESSONS.length, lessons, texts}));
        """
        data = json.loads(subprocess.check_output(
            ["node", "--input-type=module", "-e", program], cwd=base.ROOT,
            text=True, stderr=subprocess.PIPE, timeout=30))
        exported = json.loads(subprocess.check_output(
            ["node", "scripts/export-reviewed-spanish.mjs"], cwd=base.ROOT,
            text=True, stderr=subprocess.PIPE, timeout=30))
        texts = {"sample": sample, **data["texts"]}
        if (not isinstance(data, dict) or not isinstance(exported, dict) or
                data.get("count") != 30 or exported.get("count") != 30 or
                exported.get("locale") != LOCALE or
                exported.get("reviewStatus") != "assistant-reviewed-awaiting-native-human-review" or
                exported.get("lessons") != data.get("lessons") or exported.get("texts") != data.get("texts") or
                not sample or not texts or
                any(not isinstance(text, str) or not text.strip() or len(text) > 2000 for text in texts.values())):
            raise ValueError
        return texts
    except (OSError, UnicodeError, ValueError, TypeError, KeyError, subprocess.SubprocessError):
        raise SafeError("The complete current Spanish catalogue could not be verified.") from None


def lesson_keys(texts):
    """Group a complete set of paired instruction/hint keys by lesson."""
    if not isinstance(texts, dict) or not isinstance(texts.get("sample"), str) or not texts["sample"].strip():
        raise SafeError("The Spanish sample and paired lesson keys are required.")
    groups, stages = {}, {}
    for key, value in texts.items():
        if key == "sample":
            continue
        match = LESSON_KEY.fullmatch(key) if isinstance(key, str) else None
        if not match or not isinstance(value, str) or not value.strip():
            raise SafeError("A Spanish lesson key or its value is malformed.")
        lesson, stage, kind = match.groups()
        groups.setdefault(lesson, set()).add(key)
        stages.setdefault((lesson, stage), set()).add(kind)
    if not groups or any(kinds != {"instruction", "hint"} for kinds in stages.values()):
        raise SafeError("Every selected stage needs both instruction and hint keys.")
    return groups


def select_lessons(texts, lesson_ids, partial):
    groups = lesson_keys(texts)
    if not partial:
        if lesson_ids is not None:
            raise SafeError("Full reviewed activation does not accept a partial lesson list.")
        return texts, sorted(groups)
    if (not isinstance(lesson_ids, list) or not lesson_ids or
            any(not isinstance(item, str) or item not in groups for item in lesson_ids) or
            len(set(lesson_ids)) != len(lesson_ids) or len(lesson_ids) >= len(groups)):
        raise SafeError("Select a unique, nonempty proper subset of current lesson IDs.")
    selected = set(lesson_ids)
    return {key: value for key, value in texts.items()
            if key == "sample" or key.split("/", 1)[0] in selected}, sorted(selected)


def prepare_bundle(bundle, expected_texts, voice_id):
    if not isinstance(voice_id, str) or not VOICE.fullmatch(voice_id):
        raise SafeError("Supply the explicitly selected Spanish voice ID.")
    descriptor = base.read_json(bundle / "bundle.json")
    plan = base.read_json(bundle / "plan.json")
    staged = base.read_json(bundle / "narration-manifest.json")
    if any(value.get("locale") != LOCALE or value.get("voiceId") != voice_id
           for value in (descriptor, plan, staged)):
        raise SafeError("The Spanish bundle locale or selected voice does not match.")
    # The English validator rejects partial/extra keys, music, incorrect plan
    # identities, transcript changes, request/receipt/cache discrepancies,
    # changed bytes, malformed paths, encodings and actual MP3 durations.
    metadata, assets, levels = base.prepare_bundle(bundle, expected_texts)
    clips = metadata["src/narration-manifest.json"]["clips"]
    if levels or any(clip["voiceId"] != voice_id for clip in clips.values()):
        raise SafeError("Every Spanish clip must use the one selected voice and no music.")
    manifest = metadata["src/narration-manifest.json"]
    manifest.update(locale=LOCALE, selectedVoiceId=voice_id)
    # Spanish availability checks every instruction, hint, and sample. Keep
    # their verified timings rather than the English installer's instruction-only map.
    durations = {key: math.floor(clip["duration"] * 1000 + 0.5) for key, clip in clips.items()}
    return {INDEX: metadata["src/narration-index.json"],
            DURATIONS: durations, MANIFEST: manifest}, assets


def prepare_release_metadata(bundle, expected_texts, voice_id, coverage, partial, review_pending=False):
    """Build verified release metadata in memory; this does not activate it."""
    if not isinstance(coverage, list) or coverage != sorted(lesson_keys(expected_texts)):
        raise SafeError("Release coverage must match the complete selected lesson keys.")
    metadata, assets = prepare_bundle(bundle, expected_texts, voice_id)
    manifest = metadata[MANIFEST]
    manifest.update(coveredLessons=coverage, partialCatalogue=partial is True)
    if partial is True:
        automated_checks = ["source-linked runtime translation agreement", "exact lesson and sample key coverage",
                            "plan, request and cache receipt identities", "audio hashes, encoding and durations"]
        manifest.update(reviewStatus="user-approved-partial-release-review-pending", review={
            "operatorConfirmedReviewed": False,
            "userApprovedPartialRelease": True,
            "nativeSpeakerReview": "pending",
            "fullHumanListeningReview": "pending",
            "automatedChecks": automated_checks,
            "assertion": "The user approved releasing these completed lessons while independent language and full listening review remain pending.",
        })
    elif review_pending:
        manifest.update(reviewStatus="full-catalogue-review-pending", review={
            "operatorConfirmedReviewed": False,
            "nativeSpeakerReview": "pending",
            "fullHumanListeningReview": "pending",
            "automatedChecks": ["source-linked runtime translation agreement", "exact lesson and sample key coverage",
                                "plan, request and cache receipt identities", "audio hashes, encoding and durations"],
        })
    # The descriptor is inserted last so activation writes it last.
    metadata[AVAILABILITY] = {"schemaVersion": 1, "locale": LOCALE, "lessons": coverage}
    return metadata, assets


def existing_release(all_texts):
    """Fail closed on inconsistent prior Spanish metadata and return its keys."""
    for relative in (INDEX, DURATIONS, MANIFEST, AVAILABILITY):
        base.no_symlinks(base.ROOT / relative)
    descriptor = base.read_json(base.ROOT / AVAILABILITY)
    index = base.read_json(base.ROOT / INDEX)
    durations = base.read_json(base.ROOT / DURATIONS)
    lessons = descriptor.get("lessons")
    current_groups = lesson_keys(all_texts)
    if (set(descriptor) != {"schemaVersion", "locale", "lessons"} or
            type(descriptor.get("schemaVersion")) is not int or descriptor["schemaVersion"] != 1 or
            descriptor.get("locale") != LOCALE or not isinstance(lessons, list) or
            any(not isinstance(item, str) for item in lessons) or
            lessons != sorted(set(lessons)) or not set(lessons) <= set(current_groups)):
        raise SafeError("The current Spanish availability descriptor is invalid.")
    manifest_path = base.ROOT / MANIFEST
    if not lessons:
        if index or durations or manifest_path.exists():
            raise SafeError("Empty Spanish availability disagrees with existing metadata.")
        return set()
    manifest = base.read_json(manifest_path)
    clips = manifest.get("clips")
    source_plan = manifest.get("sourcePlanHash")
    required_keys = {"sample"} | set().union(*(current_groups[item] for item in lessons))
    if (type(manifest.get("schemaVersion")) is not int or manifest["schemaVersion"] != 3 or manifest.get("locale") != LOCALE or
            manifest.get("provider") != "ElevenLabs" or manifest.get("provenance") != "verified-api-response" or
            not isinstance(source_plan, str) or not base.HASH.fullmatch(source_plan) or
            manifest.get("partialCatalogue") is not (len(lessons) < len(current_groups)) or
            manifest.get("coveredLessons") != lessons or not isinstance(clips, dict) or
            set(index) != set(durations) or set(index) != set(clips) or
            set(index) != required_keys or
            sorted(lesson_keys(index)) != lessons):
        raise SafeError("Existing Spanish metadata is incomplete or inconsistent.")
    voice = manifest.get("selectedVoiceId")
    if not isinstance(voice, str) or not VOICE.fullmatch(voice):
        raise SafeError("Existing Spanish metadata has an invalid voice identity.")
    checked = {}
    for key, source in index.items():
        match = ASSET.fullmatch(source) if isinstance(source, str) else None
        clip = clips[key]
        duration = clip.get("duration") if isinstance(clip, dict) else None
        if (not match or not isinstance(clip, dict) or clip.get("src") != source or
                clip.get("sha256") != match.group(1) or clip.get("voiceId") != voice or
                not isinstance(clip.get("text"), str) or not clip["text"].strip() or
                type(duration) not in (int, float) or not math.isfinite(duration) or not 0 < duration < 35 or
                type(durations[key]) is not int or durations[key] != math.floor(duration * 1000 + 0.5)):
            raise SafeError("Existing Spanish metadata has an invalid clip or duration.")
        if source not in checked:
            data = base.read_bytes(base.ROOT / "public" / source.lstrip("/"), base.MAX_ASSET_BYTES)
            if base.sha(data) != match.group(1) or type(clip.get("bytes")) is not int or len(data) != clip["bytes"]:
                raise SafeError("Existing Spanish audio does not match its metadata.")
            checked[source] = len(data)
        elif type(clip.get("bytes")) is not int or clip["bytes"] != checked[source]:
            raise SafeError("Existing Spanish audio has an inconsistent byte count.")
    return set(index)


def require_clean_journals():
    """Do not build another release over an interrupted activation."""
    directory = base.ROOT / "media/elevenlabs/spanish-activation-backups"
    base.no_symlinks(directory)
    if not directory.exists():
        return
    if not directory.is_dir():
        raise SafeError("The Spanish recovery directory is not a directory.")
    for entry in directory.iterdir():
        base.no_symlinks(entry)
        if not entry.is_dir():
            raise SafeError("The Spanish recovery directory contains an unexpected entry.")
        journal_path = entry / "activation.json"
        base.no_symlinks(journal_path)
        if not journal_path.exists():
            raise SafeError("A Spanish backup has no journal; inspect it before another activation.")
        journal = base.read_json(journal_path)
        if journal.get("status") not in ("complete", "rolled-back"):
            raise SafeError("A previous Spanish activation requires recovery before another activation.")


def activate(selected, voice_id, reviewed=False, *, partial_release_approved=False, lesson_ids=None,
             full_catalogue_review_pending=False):
    if sum(value is True for value in (reviewed, partial_release_approved, full_catalogue_review_pending)) != 1:
        raise SafeError("Choose exactly one activation review mode.")
    if not isinstance(voice_id, str) or not VOICE.fullmatch(voice_id):
        raise SafeError("Supply the explicitly selected Spanish voice ID.")
    if not shutil.which("ffprobe"):
        raise SafeError("ffprobe is required to verify the actual staged MP3 files.")
    bundle = base.bundle_directory(selected)
    with base.activation_lock():
        require_clean_journals()
        all_texts = catalogue_texts()
        expected_texts, coverage = select_lessons(all_texts, lesson_ids, partial_release_approved is True)
        previous_keys = existing_release(all_texts)
        if not previous_keys <= set(expected_texts):
            raise SafeError("Activation cannot withdraw previously available Spanish narration keys.")
        metadata, assets = prepare_release_metadata(bundle, expected_texts, voice_id, coverage, partial_release_approved,
                                                    full_catalogue_review_pending)
        snapshots = {}
        for relative in metadata:
            path = base.ROOT / relative
            base.no_symlinks(path)
            snapshots[relative] = base.read_bytes(path, 12 * 1024 * 1024) if path.exists() else None
        for source, asset in assets.items():
            path = base.ROOT / "public" / source.lstrip("/")
            base.no_symlinks(path)
            if path.exists() and base.read_bytes(path, base.MAX_ASSET_BYTES) != asset["data"]:
                raise SafeError("An existing content-addressed public asset contains different bytes.")
        identifier = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:12]
        backup = base.ROOT / "media/elevenlabs/spanish-activation-backups" / identifier
        base.no_symlinks(backup)
        backup.mkdir(parents=True, mode=0o700)
        record = {"schemaVersion": 1, "status": "preparing", "locale": LOCALE,
                  "sourcePlanHash": bundle.name, "voiceId": voice_id,
                  "coveredLessons": coverage, "partialCatalogue": partial_release_approved is True,
                  "operatorConfirmedReviewed": reviewed is True,
                  "userApprovedPartialRelease": partial_release_approved is True,
                  "metadata": {}, "newAssets": []}
        if partial_release_approved is True:
            record.update(nativeSpeakerReview="pending", fullHumanListeningReview="pending",
                          automatedChecks=metadata[MANIFEST]["review"]["automatedChecks"])
        if full_catalogue_review_pending is True:
            record.update(fullCatalogueReviewPending=True, nativeSpeakerReview="pending", fullHumanListeningReview="pending",
                          automatedChecks=metadata[MANIFEST]["review"]["automatedChecks"])
        for relative, data in snapshots.items():
            record["metadata"][relative] = {"existed": data is not None, "sha256": base.sha(data) if data is not None else None}
        try:
            # No public asset or live metadata is written until all snapshots
            # and the prepared journal have been written.
            base.atomic_write(backup / "activation.json", base.json_bytes(record), 0o600)
            for relative, data in snapshots.items():
                if data is not None:
                    base.atomic_write(backup / "metadata" / relative, data, 0o600)
            record["status"] = "prepared"
            base.atomic_write(backup / "activation.json", base.json_bytes(record), 0o600)
        except Exception:
            try:
                shutil.rmtree(backup)
            except OSError:
                raise SafeError("Spanish activation preparation failed before public or metadata writes; inspect the retained backup before retrying.") from None
            raise SafeError("Spanish activation preparation failed before public or metadata writes; previous state is unchanged.") from None
        created = []
        try:
            for source, asset in assets.items():
                destination = base.ROOT / "public" / source.lstrip("/")
                if not destination.exists():
                    created.append(destination)
                    # Journal the destination before creating it for crash recovery.
                    record["newAssets"] = [path.relative_to(base.ROOT).as_posix() for path in created]
                    base.atomic_write(backup / "activation.json", base.json_bytes(record), 0o600)
                    base.atomic_write(destination, asset["data"])
            # Write the availability descriptor last. Recovery copies survive
            # process interruption; caught errors restore prior files.
            for relative, value in metadata.items():
                base.atomic_write(base.ROOT / relative, base.json_bytes(value))
            record["status"] = "complete"
            base.atomic_write(backup / "activation.json", base.json_bytes(record), 0o600)
        except Exception:
            recovered = True
            for relative, data in snapshots.items():
                try:
                    path = base.ROOT / relative
                    if data is None:
                        path.unlink(missing_ok=True)
                    else:
                        base.atomic_write(path, data)
                except OSError:
                    recovered = False
            if recovered:
                for destination in created:
                    try:
                        destination.unlink(missing_ok=True)
                    except OSError:
                        recovered = False
            record["status"] = "rolled-back" if recovered else "recovery-required"
            try:
                base.atomic_write(backup / "activation.json", base.json_bytes(record), 0o600)
            except OSError:
                pass
            raise SafeError("Spanish activation failed; previous state was restored and recovery copies retained." if recovered
                            else "Spanish activation failed and recovery is incomplete; use the retained backup before publishing.") from None
        return {"status": "activated", "locale": LOCALE, "narrationKeys": len(metadata[INDEX]),
                "coveredLessons": coverage, "partialCatalogue": partial_release_approved is True,
                "uniqueAssets": len(assets), "backup": backup.relative_to(base.ROOT).as_posix(),
                "review": ("The user approved this partial release; native-speaker and full human listening review remain pending."
                           if partial_release_approved is True else
                           "Full catalogue prepared; native-speaker and full human listening review remain pending."
                           if full_catalogue_review_pending is True else
                           "Operator asserted --reviewed; automated validation did not listen to audio or review translations.")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--voice-id", required=True, help="The explicitly reviewed selected voice ID.")
    approval = parser.add_mutually_exclusive_group(required=True)
    approval.add_argument("--reviewed", action="store_true")
    approval.add_argument("--partial-release-approved", action="store_true")
    approval.add_argument("--full-catalogue-review-pending", action="store_true")
    parser.add_argument("--lessons", help="Explicit comma-separated complete lesson IDs for an approved partial release.")
    args = parser.parse_args()
    lesson_ids = args.lessons.split(",") if args.lessons is not None else None
    options = {"partial_release_approved": args.partial_release_approved, "lesson_ids": lesson_ids}
    if args.full_catalogue_review_pending:
        options["full_catalogue_review_pending"] = True
    print(json.dumps(activate(args.bundle, args.voice_id, args.reviewed, **options), indent=2))


if __name__ == "__main__":
    try:
        main()
    except SafeError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
    except (OSError, ValueError):
        print("Spanish activation could not finish; inspect retained recovery data before publishing.", file=sys.stderr)
        raise SystemExit(1)
