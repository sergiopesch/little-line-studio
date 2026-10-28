# Italian UI integration audit (baseline cceb5d6)

These are draft strings and an offline dynamic-label candidate, not a runtime localization or an accessibility sign-off. `dynamic.it-IT.mjs` exercises stage, board, and timeline labels without modifying shared application code. `ui.it-IT.json` covers every key in the baseline French static dictionary. `dynamic.it-IT.json` covers the French dynamic template names and parameters. Independent Italian language review remains pending.

The existing implementation has locale-specific branches outside the translation dictionary. The integration owner must wire Italian explicitly and test each path before enabling the language; adding a dictionary alone leaves English visible or spoken by assistive technology.

- `src/App.jsx`: document title, stage labels, lesson-unavailable and narration-loading/error paths; overlay controls, adult re-acknowledgement, finish and Help dialogs. Validate the current step label against authored phase and stroke identity.
- `src/Home.jsx`: level exploration accessible label; catalogue range, draw-button label and page count. Check interpolated level/title text and unavailable states.
- `src/Onboarding.jsx`: duration including minutes, paper and optional colours, supervision acknowledgement, voice and music states and errors.
- `src/LessonTimeline.jsx`: remaining-time estimate and elapsed-time label, including paused and More time states.
- `src/LessonPreview.jsx`, `src/demonstration-label.js`, and `src/DemonstrationBoard.jsx`: preview and board accessible names for blank, reference, colour and drawing-action states. Board names must reflect the actual localized lesson and action number.
- `src/DemonstrationErrorBoundary.js` and `src/main.jsx`: demonstration failure and top-level failure text, including retry and reload links.
- `src/LanguagePicker.jsx`, `src/languages.js` and `src/i18n.jsx`: accurate Italian region/availability label, language selection and banner controls, static dictionary, and proper document language. Keep Italian unavailable until release criteria are satisfied.
- `src/Settings.jsx`, `src/Privacy.jsx` and `src/Modal.jsx`: labels, privacy statements, narration and music controls, focus, modal names and return focus. Respect reduced motion and keyboard access.

Review all displayed and accessible text against current source, including content and images provided by tldraw, elapsed time formatting, plurals, long Italian strings at narrow widths, keyboard navigation and screen reader announcements. The French reference-key parity test and the literal translation-key scan are regression guards; it does not discover every hard-coded string or prove accessibility. An Italian runtime/browser walk-through has not been performed.
