import { createLessonEngine } from "./lesson-engine.ts";
import { createScriptedSession, getStepTiming, MAX_ACTIVE_TICK_MS, scriptedSessionReducer } from "./scripted-session.ts";
import type { ScriptedSession, TimingLesson, Speed } from "./contracts.ts";

export interface RehearsalOptions {
  readonly speed: Speed;
  readonly still: boolean;
  readonly voice: boolean;
}

/** Dry run of authored completion gates, never a claim that media actually played. */
export function rehearseLesson(lesson: TimingLesson, durations: Readonly<Record<string, number>>, options: RehearsalOptions) {
  const engine = createLessonEngine([lesson]);
  let selection = engine.reduce(engine.initialState, { type: "OPEN_CATALOGUE", level: lesson.level });
  selection = engine.reduce(selection, { type: "SELECT_LESSON", lessonId: lesson.id });
  // This state is local to this function, never connected to a family session.
  selection = engine.reduce(selection, { type: "START", supervised: true });
  const steps = [];
  for (const [stepIndex, step] of lesson.steps.entries()) {
    if (selection.phase !== "drawing" || selection.step !== stepIndex)
      throw new Error("Rehearsal progression diverged from the authored lesson.");
    const timing = getStepTiming(lesson, stepIndex, {
      speed: options.speed, still: options.still,
      voiceDurationMs: options.voice ? durations[`${lesson.id}/${step.id}/instruction`] ?? 0 : 0,
    });
    let playback = createScriptedSession({ lessonId: lesson.id, stepIndex, timing, textOnly: !options.voice });
    const identity = { lessonId: lesson.id, stepIndex, run: playback.run };
    const stages = [playback.stage];
    function send(event: { type: string; elapsedMs?: number }) {
      playback = scriptedSessionReducer(playback, { ...event, ...identity });
      if (stages.at(-1) !== playback.stage) stages.push(playback.stage);
    }
    function tickUntil(done: (state: ScriptedSession) => boolean) {
      // Authored values must complete in a bounded rehearsal, even if future content is malformed.
      for (let ticks = 0; !done(playback); ticks++) {
        if (ticks >= 14400) throw new Error("An authored rehearsal stage exceeded one hour.");
        send({ type: "TICK", elapsedMs: MAX_ACTIVE_TICK_MS });
      }
    }
    if (options.voice) send({ type: "VOICE_DONE" });
    else tickUntil(state => state.stage !== "instruction");
    if (timing.hasDemonstration) send({ type: "DEMO_DONE" });
    if (timing.holdOpen) {
      send({ type: "TICK", elapsedMs: MAX_ACTIVE_TICK_MS });
      if (playback.stage !== "practice" || playback.remainingMs !== null)
        throw new Error("Open exploration must remain open.");
    } else tickUntil(state => state.stage === "ready");
    steps.push({ id: step.id, index: stepIndex, kind: step.kind, timing, stages, outcome: playback.stage });
    if (!timing.holdOpen) selection = engine.reduce(selection, { type: "NEXT" });
  }
  return {
    mode: "rehearsal" as const,
    supervision: "simulated" as const,
    mediaPlayback: false as const,
    lessonId: lesson.id,
    options: { speed: options.speed, still: options.still, voice: options.voice },
    steps,
    finalSelection: selection,
  };
}
