import { StudioAudio } from "../../src/audio.js";
import { loadLocaleLanguage, createLatestLanguageRequest } from "../../src/language-loading.js";
import { useScriptedPlayback } from "../../src/useScriptedPlayback.js";
import { useLessonClock } from "../../src/useLessonClock.js";
import type { AuthoredLesson } from "../../src/authoring/contracts.ts";
import { createLessonClock, lessonClockReducer } from "../../src/core/lesson-clock.ts";

declare const lesson: AuthoredLesson;
declare const media: HTMLAudioElement;
const audio = new StudioAudio();
audio.attachNarration(media);
void audio.playClip(undefined);
// @ts-expect-error a media binding requires a real media element
audio.attachMusic({ src: "/music/untrusted.mp3" });
// @ts-expect-error safety blocking accepts an explicit boolean, never a truthy string
audio.setBlocked("false");
// @ts-expect-error clip callbacks must handle cancellation, failure and unavailable playback
void audio.playClip("authored", (reason: "ended") => { void reason; });

const language = await loadLocaleLanguage("es-419", [lesson]);
const localizedTitle: string = language.localizeLesson(lesson, "es-419").title;
// @ts-expect-error measured durations are numbers rather than labels
const invalidDuration: string = language.narration.durations.sample;
// @ts-expect-error dynamic catalogue loaders must provide both measured data and the authored index
void loadLocaleLanguage("es-419", [lesson], { loadNarration: async () => ({ index: {} }) });
const request = createLatestLanguageRequest();
void request.run(async () => language, {
  onStart() {},
  onSuccess(value) {
    const title: string | null = value.localizedTitle(lesson, "es-419");
    // @ts-expect-error a generic request preserves the loaded result's exact type
    const wrong: number = value.narration.index.sample;
    void [title, wrong];
  },
  onError(error) {
    // @ts-expect-error thrown values are unknown and need a runtime check
    const message: string = error.message;
    void message;
  },
});

const options: Parameters<typeof useScriptedPlayback>[0] = {
  lesson, stepIndex: 0, session: 1, replayKey: 0, active: true,
  boardReady: true, voiceOn: true, speed: "slow", still: false,
  narrate: async (_key, _force, callbacks) => { callbacks.onEnd(); },
  onAdvance() {}, onInterruption(_message) {},
};
// @ts-expect-error playback takes authored speed values
useScriptedPlayback({ ...options, speed: "fast" });
// @ts-expect-error voice completion cannot be substituted with a lesson command
useScriptedPlayback({ ...options, narrate: async (_key, _force, callbacks) => { callbacks.onEnd({ type: "NEXT" }); } });
// @ts-expect-error clock state comes from the shared reducer, not a partial UI guess
useLessonClock({ enabled: true, session: 1, stepIndex: 0, active: true, playback: { stage: "practice" } });
// @ts-expect-error every clock tick requires its complete session, step, run and stage identity
lessonClockReducer(createLessonClock(), { type: "TICK", deltaMs: 250, hidden: false });
void [localizedTitle, invalidDuration];
