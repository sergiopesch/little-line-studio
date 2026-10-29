# Development and content

Use Node.js 24 and `npm ci`. `npm run dev` serves the lesson on localhost. `npm run check` builds and runs the tests; `npm run preview` serves the production output. Production builds require a valid tldraw key to enable the lesson, as explained in [deployment](deployment.md).

## Regression checks

Run `npm run check` for the production build and Node tests. Install Python 3 and FFmpeg 8.x to run the audio fixture tests rather than skip them. The offline loop checks are qualified with FFmpeg 8.x: FFmpeg 6.1 produces different normalization and decoded-length results and fails the existing guards. CI uses the explicit [Ubuntu 26.04 runner](https://github.com/actions/runner-images/blob/main/README.md) and checks the FFmpeg major version; it does not relax loudness or continuity limits to accommodate another encoder. With no tldraw key, this command verifies the deliberately restricted licence-review build; it does not prove that the licensed lesson bundle renders.

Run the browser suite separately:

```bash
npx playwright install chromium  # once; use --with-deps on a clean Linux machine
npm run test:browser
```

Playwright is a pinned development dependency, absent from the application bundle. The suite launches this checkout on port 5186 with `--strictPort` and refuses to reuse another server. It exercises the full localhost lesson in desktop Chromium and a small touch viewport with reduced motion. It checks all nine language catalogues and real sample playback; adult setup, pause/resume, More time, Replay, settings, keyboard focus and Help music continuity; failed board/language/narration downloads; and the document visibility interruption handler. Each test uses a fresh browser context. No provider generation credentials are used.

Screenshots, failure traces and the HTML report stay in ignored `output/playwright/`. Open the report with `npx playwright show-report output/playwright/report`. `.github/workflows/check.yml` runs both suites on pull requests and main, with read-only repository permission and no application secrets, and retains browser evidence for seven days. A passing check is evidence, not an enforced merge requirement unless branch protection is configured separately.

These Chromium checks do not establish Safari/iOS audio balance, physical-device interruption behavior, native-speaker approval or perceived recording quality. Before changing the audio backend, validate those properties on real devices. The current tldraw evaluation licence also still needs replacement before its documented expiry; neither test mode nor these changes bypass licence enforcement.

Board imports remain deferred until lesson selection. A failed import is retained by the current attempt so the error boundary can pause safely; selecting or restarting a lesson explicitly requests a fresh promise. Written instructions remain available after the adult confirms. Starting the next attempt does not automatically resume playback.

Catalogue counts come from lesson data, and teaching-pack registration rejects duplicate/mismatched identities instead of enforcing a fixed total. The synthetic growth test checks an eleventh Basic drawing and empty collections without adding unpublished lessons to the real catalogue. Localized dynamic labels must still match their source files in `research/`; count changes do not waive content, narration or release validation for future lessons.

## Content workflow

For new locales or changes to regional wording, forms of address, control labels, captions or narration, follow the [localization workflow and locale guides](localization/README.md). `npm run review:localization` extracts complete Cat review packets from current text and recordings without provider requests.

Static interface copy is registered once in `src/ui-translations.js`. React components use its `translate` function through `src/i18n.jsx`; the board failure screen uses the same pure function directly. English voice variants explicitly share source copy. Unknown locales and missing keys retain the English source text. Dictionaries are read-only, and the registry test requires an entry for every selectable language.

Latin American Spanish copy lives in `src/spanish-ui.es-419.json`, including board recovery messages. Editorial checks import this data directly, and the Spain Spanish draft records its source checksum. Keep that source linkage current when changing the dictionary. When adding a locale, register its static copy here and verify normal, accessible and error labels; lesson loading, dynamic copy and narration release validation still have their own contracts.

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

If a process interruption loses a response, ordinary generation remains blocked. Manual recovery must preserve the original receipt and request, match provider attempt counts and characters against the recorded requests, and retain the original full reservation before explicitly recording a replacement within the existing cap. Such events are retained in the ignored recovery archive and the ledger's `lostResponses` entries. Reconciliation checks their provenance and keeps their original reservations on top of the matched provider charges; it never presents missing audio as a completed receipt or retries an unknown outcome automatically.

## Application boundaries

The child draws on paper. Preserve the read-only teaching board, local adult acknowledgement, deterministic sequence, quiet practice and open exploration. Keep Pause, Replay and More time available; do not catch up after interruptions. Media completion is a prerequisite for the trusted controller, not authority delegated to an AI model.

Retain the default-on music choice and adult Begin gesture, opt-out, mute, immediate safety-interruption silence, keyboard focus and reduced-motion handling. Help preserves the music position and ducks beneath spoken hints; pauses, leaving the lesson, other dialogs and hidden tabs silence playback. Do not add capture, uploads, accounts, tracking or stored child profiles as incidental implementation changes.

## README media

`docs/media/home.png` and `lesson.png` are browser screenshots of the production build. `lesson-demo.gif` is a silent recording excerpt of the same application. They demonstrate the actual interface, contain no child images or personal data, and can be refreshed after visible changes. Keep full recordings and browser logs in ignored `output/playwright/`.

## Short speech consistency

See [short narration mastering](audio-mastering.md) for the offline correction used when a brief, peaky recording falls below the catalogue loudness threshold. Generation caches remain immutable; releases retain the verified source and a separately measured local derivative.
