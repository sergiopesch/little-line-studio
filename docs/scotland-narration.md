# Scottish English narration preparation

This offline pipeline prepares an independent Scottish English voice variant using the current English lesson text, without modifying shared language selection or lesson behaviour. Its application-specific identifier is `en-GB-x-scotland`; the approved provider voice is Claire - Warm and Measured, `M6KCOw7VXEJAZwuYFLuz`, with model `eleven_v4`. The provider labels the voice Scottish. Independent native-speaker review and complete human listening remain pending. Existing lesson music is reused.

## Offline plan

Run `python3 scripts/scotland-narration.py --plan`. The script exports the exact current thirty-lesson catalogue and produces ignored `media/elevenlabs/plan.en-GB-x-scotland.json`; it performs no provider requests. The source text hash, selected voice, locale, complete lesson set and every generator-compatible request and cache identity are bound into the canonical plan hash. If the English source changes, regenerate and review the new plan before generating or validating anything.

The shared account-wide runner is responsible for paid requests, serialization, durable accounting, preservation of prior unreported commitments, no overages and no automatic paid retries. This script does not authorize, reserve or spend credits. Preserve receipts and the shared runner's ledger; a pending or blocked request must be reconciled rather than bypassed.

The sample request is identical to the approved audition request, so a runner may reuse it only after validating the existing receipt, bytes, cache identity and ledger state. Quota estimates are conservative commitments, not a quote or actual charge.

## Verify and stage after generation

The completed bundle and its matching cache receipts must reside under this checkout's ignored `media/elevenlabs` tree in the locations expected by `scripts/activate-elevenlabs.py`. Use the shared runner's verified results; do not synthesize missing receipts. Run:

```sh
python3 scripts/scotland-narration.py --verify-bundle media/elevenlabs/bundles/PLAN_HASH
python3 scripts/scotland-narration.py --stage-release media/elevenlabs/bundles/PLAN_HASH
```

Both commands are offline. The verifier rejects a changed source plan, incorrect voice, locale or model, incomplete instruction/hint/sample coverage, generated music, inconsistent request identities, receipt discrepancies and invalid audio. Each unique verified audio byte sequence is also fully decoded with ffmpeg before staging; ffmpeg and ffprobe must be installed. Staging creates a separate ignored `media/elevenlabs/scotland-release-PLAN_HASH` tree containing content-addressed audio and locale-specific manifest, index, durations and availability files; it refuses to overwrite an existing stage. It does not activate files in `src` or `public`, update the UI, or deploy.

The manifest explicitly records native-speaker and full listening reviews as pending. Audio and provenance checks do not establish accent, pronunciation, educational suitability or perceptual quality. The integrator must preserve these limitations, independently test the runtime and decide how the reviewed staged metadata and assets enter the release. See the repository's existing child supervision, privacy, interruption, music and deterministic progression requirements.
