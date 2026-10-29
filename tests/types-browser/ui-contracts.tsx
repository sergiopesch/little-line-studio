import { App, prepareInitialSelection } from "../../src/App.jsx";
import { Home } from "../../src/Home.jsx";
import { LanguagePicker } from "../../src/LanguagePicker.jsx";
import { Modal } from "../../src/Modal.jsx";
import { Onboarding } from "../../src/Onboarding.jsx";
import { Settings } from "../../src/Settings.jsx";
import DemonstrationBoard from "../../src/DemonstrationBoard.jsx";
import { useLocale } from "../../src/i18n.jsx";
import { prepareEntry } from "../../src/entry-loading.js";
import { StudioAudio } from "../../src/audio.js";
import type { ComponentProps } from "react";
import type { LevelView, InitialSelection } from "../../src/browser/ui-contracts.ts";

declare const onboarding: ComponentProps<typeof Onboarding>;
declare const settings: ComponentProps<typeof Settings>;
declare const board: ComponentProps<typeof DemonstrationBoard>;
declare const level: LevelView;
declare const selection: InitialSelection;

// Compatibility entries must retain the complete contracts at actual JSX call sites.
const valid = <App initialSelection={selection} />;
const pause = <Modal title="Pause"><p>Take your time.</p></Modal>;
// @ts-expect-error supervision is an explicit boolean, never truthy text
const invalidPresence = <Onboarding {...onboarding} supervised="false" />;
// @ts-expect-error the checkbox supplies a boolean, not a browser event or role assertion
const invalidPresenceCallback = <Onboarding {...onboarding} onSupervised={(event: Event) => { void event; }} />;
// @ts-expect-error a volume callback must accept the numeric slider value
const invalidVolume = <Settings {...settings} onVolume={(volume: string) => { void volume; }} />;
// @ts-expect-error pacing follows the shared engine vocabulary
const invalidPace = <Settings {...settings} speed="fast" />;
// @ts-expect-error setup cannot mount an incomplete language selection
const invalidSelection = <App initialSelection={{ languageId: "de-DE", level: "basic" }} />;
// @ts-expect-error a language choice supplies its identity, not a lesson command
const invalidLanguage = <LanguagePicker level={level} onClose={() => {}} onSelect={(command: { type: "NEXT" }) => { void command; }} />;
// @ts-expect-error Home reports drawing levels, not arbitrary numeric indices
const invalidLevel = <Home onExplore={(index: number) => { void index; }} onPrivacy={() => {}} onHow={() => {}} />;
// @ts-expect-error the renderer reports step/run identities, not progression commands
const invalidCompletion = <DemonstrationBoard {...board} onComplete={(command: { type: "NEXT" }) => { void command; }} />;
// @ts-expect-error a modal close callback does not receive permission or supervision state
const invalidClose = <Modal title="Help" onClose={(supervised: boolean) => { void supervised; }}><p>Help</p></Modal>;
// @ts-expect-error translation callers supply source text or a message ID
useLocale().t({ message: "Pause" });
// @ts-expect-error invalid levels cannot reach the lazy entry loader
void prepareEntry("es-ES", "advanced");
const prepared: InitialSelection = await prepareInitialSelection("es-ES", "basic");
// @ts-expect-error prepared selection preserves the locale's exact lesson view
const numericTitle: number = prepared.localizeLesson(onboarding.lesson, "es-ES").title;

// Finishing a lesson deliberately clears the current music selection.
new StudioAudio().selectMusic(null);
void [valid, pause, invalidPresence, invalidPresenceCallback, invalidVolume, invalidPace,
  invalidSelection, invalidLanguage, invalidLevel, invalidCompletion, invalidClose, numericTitle];
