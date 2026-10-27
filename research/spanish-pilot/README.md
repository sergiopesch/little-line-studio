# Spanish cat lesson pilot — work in progress

`cat.es-419.json` is a first editorial draft, not production content. It translates all 21 current Cat observation, drawing, crayon-colouring and exploration stages, including instructions, narration, hints and parent notes. The wording aims for broadly understood Latin American Spanish and familiar Venezuelan words (such as *rosado*); it still needs review by a Venezuelan/Latin American speaker, especially the spoken letter W and age-appropriate terminology. It preserves individual choice, optional details and an unhurried finish. Its source-step hash and `tests/spanish-pilot.test.js` flag English changes and missing stage content. The draft is not imported into the app, and Castellano remains unavailable.

## Voice discovery

On 26 October 2026, a read-only search of the ElevenLabs shared-voice catalogue found several matches for Carito, including these three explicitly labelled Venezuelan:

- Carito - Silly & Comical: `WtRYgQbAJ4i0AckgdVbq`, professional.
- Carito - Carefree & Expressive: `E6eu2tsixmhFtXdW2ZNc`, high quality.
- Carito - Happy & Expressive: `gBXbHGNePmWl9WrdHoCH`, high quality.

The connected account's 25 saved voices did not contain Carito. Available project research and earlier DrawingTeacher chat records did not identify which version the user previously liked. These are candidates, not a verified selection or an assessment of teaching suitability. Their library metadata is provider-supplied and can change. The [shared-voice API](https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared) was used read-only; no voice was added and no audio was generated.

## Work before enabling the locale

1. Identify the exact previously preferred Carito voice, check usage rights and availability, and audition it against these lesson scripts. Confirm pronunciation, warmth and patient pacing with fluent reviewers.
2. Review the pilot's translated teaching text and all child- and parent-facing UI, accessibility labels, help, privacy and sound settings. Translate every lesson that the picker exposes; never silently mix languages.
3. Extend the prepared-media pipeline with locale-qualified keys, separate duration manifests, immutable source/voice/model provenance and a bounded generation budget. Generate only reviewed text. Keep media local to the site; do not send child data to the provider.
4. Use actual Spanish clip durations in the controller and retain completion gates, protected practice, More time, pause, replay, no catch-up, and immediate interruption of audio. Verify no voice overlap and music ducking through complete real-browser runs.
5. Test desktop and mobile, keyboard and screen reader labels, text without sound, playback failures and the parent gate. Complete listening and native-speaker acceptance before changing `ready`.
