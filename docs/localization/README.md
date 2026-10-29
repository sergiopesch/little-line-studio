# Localizing Little Line Studio

Preserve the teaching intention and family controls while authoring natural wording for each locale. These guides record project editorial choices drawn from the current Cat lesson; they are assistant-authored working guidance, not native-speaker approval.

## Workflow

1. Read the relevant locale guide below, the [lesson template](../../DRAWING_LESSON_TEMPLATE.md), and the [message context](message-context.json) for controls being edited. Identify the audience before choosing a form of address.
2. Write complete local sentences. Adapt word order, sentence length, idioms and examples that do not change the drawing. Keep left/right, shape relationships, optionality, safety, adult acknowledgement and unlimited practice intact. Keep the screen caption, spoken instruction, requested hint and adult note separate.
3. Check the full sequence, including skipped optional marks. Later instructions must not depend on marks the child may omit. Keep colour choices and permission to stop or continue explicit.
4. For UI changes, use a contextual ID when the purpose differs. `setup.stopVoicePreview` and `settings.stopVoicePreview` currently share English wording but have independent local entries. Edit the locale dictionary and its source-linked editorial copy together. Review the visible label and its accessible name together; when a control name is spoken in a hint, keep that reference consistent too. The source map provides a readable English fallback; tests reject missing contextual entries in supported translated locales. Legacy English-keyed labels remain supported during incremental migration.
5. For lesson changes, update the source-linked editorial record and use the existing exporter. Changed spoken instructions or hints require matching recordings and renewed media validation before publication. Caption-only changes still need consistency review against the recording and drawing. Paid generation is a separate, bounded operation.
6. Run `npm run review:localization` to create complete Cat packets in ignored `output/localization-review/`. Each contains all source/local fields, actual instruction/hint recording links, durations, voice identities, editorial notes and the eight control contexts. This is offline extraction of existing assets, without speech generation or contacting reviewers.
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
