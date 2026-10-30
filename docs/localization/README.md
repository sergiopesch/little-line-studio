# Localizing Trazolino

Preserve the teaching intention and family controls while authoring natural wording for each locale. These guides record project editorial choices drawn from the current Cat lesson; they are assistant-authored working guidance, not native-speaker approval.

## Workflow

1. Read the relevant locale guide below, the [lesson template](../../DRAWING_LESSON_TEMPLATE.md), and the [message context](message-context.json) for controls being edited. Identify the audience before choosing a form of address.
2. Write complete local sentences. Adapt word order, sentence length, idioms and examples that do not change the drawing. Keep left/right, shape relationships, optionality, safety, adult acknowledgement and unlimited practice intact. Keep the screen caption, spoken instruction, requested hint and adult note separate.
3. Check the full sequence, including skipped optional marks. Later instructions must not depend on marks the child may omit. Keep colour choices and permission to stop or continue explicit.
4. For UI changes, use a contextual ID when the purpose differs. `setup.stopVoicePreview` and `settings.stopVoicePreview` currently share English wording but have independent local entries. Edit the locale dictionary and its source-linked editorial copy together. Review the visible label and its accessible name together; when a control name is spoken in a hint, keep that reference consistent too. The source map provides a readable English fallback; tests reject missing contextual entries in supported translated locales. Legacy English-keyed labels remain supported during incremental migration.
5. For lesson changes, update the source-linked editorial record and use the existing exporter. Changed spoken instructions or hints require matching recordings and renewed media validation before publication. Caption-only changes still need consistency review against the recording and drawing. Paid generation is a separate, bounded operation.
6. Run `npm run review:localization` to create packets for every released lesson and locale in a new `output/localization-review/catalogue-*/` directory. Use `-- --output /absolute/directory` to choose another parent. Each packet contains all source/local fields, instruction/hint recording links, durations, voice identities, the exact music track, existing editorial notes and the eight control contexts. This is offline extraction of existing assets, without speech generation or contacting reviewers.
7. Read/listen in the actual lesson context. Record feedback by locale, stage/message ID, exact text and recording hash. Identify native/fluent review, device listening and automated checks separately. Run the full checks and browser flows before release.

## Locale guides

| Locale | Guide |
| --- | --- |
| British English | [en-GB](en-GB.md) |
| Irish English | [en-IE](en-IE.md) |
| Scottish English voice | [en-GB-x-scotland](en-GB-x-scotland.md) |
| Latin American Spanish | [es-419](es-419.md) |
| Spain Spanish | [es-ES](es-ES.md) |
| France French | [fr-FR](fr-FR.md) |
| Germany German | [de-DE](de-DE.md) |
| Italy Italian | [it-IT](it-IT.md) |
| Netherlands Dutch | [nl-NL](nl-NL.md) |

## Cat pilot evidence

The [pilot record](../../research/localization-pilot/cat.json) binds the assistant text assessment to all 21 stages in each of the nine voice/language options. Hashes cover the source lesson, localized lesson, 42 instruction/hint recording identities and eight contextual UI labels per locale. Tests and the packet command reject stale evidence when those inputs change. Update fingerprints only after inspecting the changed material; there is no command that automatically marks a new version reviewed.

The assistant assessment checked captions, spoken scripts, hints, adult notes and stage sequence. Native-speaker review and perceptual listening remain pending. Follow-ups are proposals with affected stages and rationale; they do not silently alter the published script or claim approval. The packets do not certify audio quality, comfortable timing or pronunciation. Use the actual app for voice/music balance, Help transitions and quiet-practice listening.

## Complete catalogue review

The current release produces 270 packets (30 lessons × nine voice/language options), with 13,140 instruction/hint references. Samples remain part of the catalogue/browser checks. The generated `README.md` links each packet and its `.review.json` worksheet; `catalogue.json` indexes coverage, identities, review status and existing Cat follow-ups. CI retains these packets for 14 days. Download a run before annotating it and retain completed evidence separately; generating a new run never overwrites previous reviewer work.

All audio references are checked against current text, selected voice, measured duration, content hash and bytes. Lesson music is checked by hash too. Non-Cat packets explicitly say that this workflow records no new assistant assessment; existing source editorial provenance remains intact. Extraction does not promote any pending review to approved.

Each worksheet separates editorial, native-language, physical-device audio, accessibility and family review. Record the reviewer, date, device/setup, observations and issues against exact stage/message IDs. Do not collect identifying child data. `verifyReviewIdentity(packet, form)` checks that the wording, recordings, music and control labels still match; it does not verify a reviewer's identity or certify the review. Changed content requires renewed review. Keep annotations outside generated source and media manifests until they have been considered for a deliberate content change.

Follow [the acceptance checklist](acceptance-checklist.md) for physical-device listening and human review. These checks stay pending until someone actually completes them.

## Registering another locale

`src/locale-registry.js` re-exports the strict `src/locale-registry.ts` implementation, which owns the selectable identity, regional display labels, shared source language, UI dictionary, dynamic formatter, availability descriptor, approved voice, sample source and lazy text/audio loaders. The picker, translation resolver, runtime loading, narration authorization, review packets and build validation derive their registrations from it. English voice variants explicitly share English text but retain separate recordings. No registry entry alone makes an incomplete narration catalogue playable.

Keep translated content and source-linked exporters in their existing per-locale files. Dynamic label functions retain their regional grammar. A new locale still needs its editorial sources, guide, recordings, release validation and review evidence; the registry removes duplicated wiring, not those quality requirements. Source-specific exporter checks and the English/Spanish legacy media contracts remain explicit in the build. The checked offline exporter layer validates the complete output through the shared text contract before writing; see [offline export contracts](../development.md#offline-export-contracts) for commands, error handling and verification.

## Checked implementation

`src/localization/contracts.ts` defines the structure shared by the lesson localizer, registry, regional formatters and browser loader. Each locale continues to author natural sentences in its own files; these contracts impose no word-for-word translation, common sentence length or shared grammar.

All six translated lesson modules use `createLessonLocalizer` through the existing `src/localized-catalogue.js` entry. Raw catalogue JSON is validated when the lazy module loads. The adapter owns a frozen copy of the permitted lesson/stage text and phase labels, checks source stage/phase alignment when applying a lesson, and preserves authored geometry, timing, optionality, music and identity. Regional dynamic-copy modules use checked JavaScript and explicit formatter contracts. Add new entry files to `tsconfig.browser.json` and run `npm run typecheck` during authoring.

The configured review status records existing provenance only: Spanish Latin America and French retain `assistant-reviewed-awaiting-native-human-review`; the other translated catalogues retain `assistant-draft-awaiting-native-human-review`. Parsing never upgrades either status or constitutes native-speaker approval. Keep editorial exporters, recording fingerprints and the review workflow above as separate release checks.

For source-linked regional formatter code, update its draft and runtime implementation together. The packaging guard uses the existing esbuild parser to compare their executable JavaScript while ignoring type comments and formatting. Wording inside strings and formatter logic remain part of that comparison; the Italian template dictionary retains its separate exact-data check.
