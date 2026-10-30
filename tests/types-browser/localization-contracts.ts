import { createLessonLocalizer } from "../../src/localized-catalogue.js";
import { createLocaleRegistry, getLocale } from "../../src/locale-registry.js";
import { loadLocaleLanguage } from "../../src/language-loading.js";
import { stageLabel } from "../../src/german-dynamic.js";
import type { AuthoredLesson } from "../../src/authoring/contracts.ts";
import type { LanguageText, LocaleRegistration, LocalizedCatalogue, LocalizedLessonText, LocalizedStepText } from "../../src/localization/contracts.ts";

declare const lesson: AuthoredLesson;
declare const catalogue: LocalizedCatalogue;
declare const translated: LocalizedLessonText;
declare const step: LocalizedStepText;
declare const entry: LocaleRegistration;
const localizer: LanguageText = createLessonLocalizer(catalogue, "de-DE");
const result: AuthoredLesson = localizer.localizeLesson(lesson, "de-DE");
createLocaleRegistry([entry]);
const locale = getLocale("de-DE");
if (locale) {
  const text: LanguageText = await locale.loadText();
  const title: string | null = text.localizedLessonTitle(lesson, locale.id);
  void title;
}
void result;

// @ts-expect-error child-facing text is a string, never executable behavior
const executableText: LocalizedStepText = { ...step, spoken: () => "Draw." };
// @ts-expect-error every localized teaching stage needs a requested hint
const missingHint: LocalizedStepText = { title: "Look", instruction: "Look.", spoken: "Look.", notice: "Together." };
// @ts-expect-error captions cannot be numeric
const invalidCaption: LocalizedStepText = { ...step, instruction: 3 };
// @ts-expect-error localized lesson text has no music authority
const musicOverride: LocalizedLessonText = { ...translated, musicId: "other" };
// @ts-expect-error localized teaching text has no timing authority
const timingOverride: LocalizedStepText = { ...step, quietMs: 0 };
// @ts-expect-error translated phase identities retain the authored vocabulary
const invalidPhase: LocalizedLessonText = { ...translated, pilotPhases: [{ id: "assessment", label: "Score" }] };
// @ts-expect-error pending editorial metadata cannot claim approval implicitly
const unreviewedApproval: LocalizedCatalogue = { ...catalogue, reviewStatus: "approved" };
// @ts-expect-error the parser also requires an explicit supported provenance rule
createLessonLocalizer(catalogue, "de-DE", "approved");
// @ts-expect-error a lazy text loader must return complete authored lessons
createLocaleRegistry([{ ...entry, loadText: async () => ({ localizeLesson: () => ({ id: "cat" }), localizedLessonTitle: () => "Cat" }) }]);
// @ts-expect-error measured narration durations are numeric
createLocaleRegistry([{ ...entry, loadNarration: async () => ({ index: {}, durations: { sample: "slow" } }) }]);
// @ts-expect-error regional formatter inputs retain numeric step indexes
stageLabel(lesson, "2");
// @ts-expect-error injected language loaders retain the same title contract
void loadLocaleLanguage("de-DE", [lesson], { loadText: async () => ({ ...localizer, localizedLessonTitle: () => 4 }) });
// @ts-expect-error unknown locale lookups must be handled explicitly
getLocale("unknown").loadText();
void [executableText, missingHint, invalidCaption, musicOverride, timingOverride, invalidPhase, unreviewedApproval];
