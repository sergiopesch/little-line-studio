# Development and content

Use Node.js 24 and `npm ci`. `npm run dev` serves the lesson on localhost. `npm run check` builds and runs the tests; `npm run preview` serves the production output. Production builds require a valid tldraw key to enable the lesson, as explained in [deployment](deployment.md).

## Content workflow

Follow the [lesson template](../DRAWING_LESSON_TEMPLATE.md). Lesson geometry, instructions, demonstrations and prepared media must remain consistent. When drawing geometry changes, run `npm run update:previews`, review the catalogue against the native board, then run the full checks. Builds reject stale precomputed outlines.

Crayon patches are constructed inside authored contours with a safety margin from every edge. Changes to `src/crayon-regions.js` must preserve those boundaries and the resulting lesson geometry; `tests/crayon-regions.test.js` checks clearance and both contour directions, and the wider containment tests check the native ink envelopes.

Spanish reviewed text lives in `research/spanish-reviewed/`. `node scripts/export-reviewed-spanish.mjs --write-catalogue` verifies source fingerprints and updates the lazy runtime catalogue. This is an offline operation; it does not generate speech or activate another lesson. Draft and pilot material are retained for source comparisons and are not used as the runtime translation catalogue.

The release descriptor, narration index, durations and source manifest must agree. Build validation checks the precise texts, lesson coverage, content hashes and byte counts for every activated Spanish clip. Do not mark a locale or lesson ready merely because a translation file exists.

## Audio tooling

Normal builds and lessons use the committed MP3 library. Offline Python scripts in `scripts/` support prepared-media production and bounded credit accounting. Inspect each script's `--help` before running it. Generation requires separate authorization, explicit provider/model/voice choices, credentials held outside source control, and a declared budget. Do not run generation during a build or test.

Generated caches and provider receipts belong in ignored `media/`; provider credentials belong in an ignored local environment file with restricted permissions. Never prefix a provider key with `VITE_`. Public media provenance is recorded in the bundled notices and source manifests.

The complete Spain Spanish, German and Italian plans use `scripts/three-language-full.py`; Dutch uses `scripts/dutch-narration.py` with the source and review status described in [Dutch preparation](../research/dutch-draft/README.md). Both default to offline planning. Authorized runs require the existing shared checkout and exact credit cap. Dutch can record a twenty-lesson initial cohort, reconcile its proven billing, and then reuse those exact clips in the full plan.

Recording defaults to three concurrent requests. `--concurrency 8` uses eight only with the credit guard and a freshly verified Pro, Scale or Business tier. This stays below the documented Pro standard limit of ten ([provider concurrency reference](https://elevenlabs.io/docs/overview/models), checked 28 October 2026). The whole group is reserved before any POST; an unknown outcome blocks the next group and is never retried automatically. Concurrency does not change request identity, audio settings, the project cap or the protected credit reserve. To change recording mode, stop at the existing `.stop-after-batch` boundary, confirm the ledger is settled, then resume from the verified cache.

Closed-cohort reconciliation matches immutable receipts against authenticated request counts, input characters and billed credits over the entire recording interval, including across midnight. It retains evidence and the previous ledger, rejects duplicate reconciliation and preserves unmatched commitments. Technical validation and this accounting do not establish native-speaker or human listening review.

## Application boundaries

The child draws on paper. Preserve the read-only teaching board, local adult acknowledgement, deterministic sequence, quiet practice and open exploration. Keep Pause, Replay and More time available; do not catch up after interruptions. Media completion is a prerequisite for the trusted controller, not authority delegated to an AI model.

Retain the default-on music choice and adult Begin gesture, opt-out, mute, immediate safety-interruption silence, keyboard focus and reduced-motion handling. Help preserves the music position and ducks beneath spoken hints; pauses, leaving the lesson, other dialogs and hidden tabs silence playback. Do not add capture, uploads, accounts, tracking or stored child profiles as incidental implementation changes.

## README media

`docs/media/home.png` and `lesson.png` are browser screenshots of the production build. `lesson-demo.gif` is a silent recording excerpt of the same application. They demonstrate the actual interface, contain no child images or personal data, and can be refreshed after visible changes. Keep full recordings and browser logs in ignored `output/playwright/`.
