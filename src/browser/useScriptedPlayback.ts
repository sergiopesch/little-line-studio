import { useEffect, useReducer, useRef } from "react";
import {
  createScriptedSession,
  getStepTiming,
  scriptedSessionReducer,
} from "../scripted-session.js";
import durations from "../narration-durations.json" with { type: "json" };
import { narrationKey } from "../lesson-catalogue.js";

import type { PlaybackCommand, ScriptedSession, Speed, TimingLesson } from "../core/contracts.ts";

export interface ScriptedPlaybackOptions {
  readonly lesson: TimingLesson;
  readonly stepIndex: number;
  readonly session: number;
  readonly replayKey: number;
  readonly active: boolean;
  readonly boardReady: boolean;
  readonly boardUnavailable?: boolean;
  readonly voiceOn: boolean;
  readonly narrationDurations?: Readonly<Record<string, number>>;
  readonly speed: Speed;
  readonly still: boolean;
  readonly narrate: (key: string, force: boolean, callbacks: {
    readonly onEnd: () => void;
    readonly onUnavailable: () => void;
  }) => Promise<void>;
  readonly onAdvance: () => void;
  readonly onInterruption: (message: string) => void;
}

type BrowserPlaybackEvent = PlaybackCommand | { readonly type: "LOAD"; readonly state: ScriptedSession };
function instructionKey(lesson: TimingLesson, stepIndex: number): string {
  const key = narrationKey(lesson, stepIndex);
  if (key === null) throw new TypeError("A known authored instruction is required.");
  return key;
}

function reduce(state: ScriptedSession | null, event: BrowserPlaybackEvent): ScriptedSession | null {
  if (event.type === "LOAD") return event.state;
  return state ? scriptedSessionReducer(state, event) : state;
}

// This is a local, authored clock. Provider audio cannot emit lesson commands.
export function useScriptedPlayback({
  lesson,
  stepIndex,
  session,
  replayKey,
  active,
  boardReady,
  boardUnavailable = false,
  voiceOn,
  narrationDurations = durations,
  speed,
  still,
  narrate,
  onAdvance,
  onInterruption,
}: ScriptedPlaybackOptions) {
  const [state, send] = useReducer(reduce, null);
  const previous = useRef<ScriptedSession | null>(null);
  previous.current = state;
  const loadedSession = useRef<number | null>(null);
  const run = useRef(0);
  const callbacks = useRef({ narrate, onAdvance, onInterruption });
  callbacks.current = { narrate, onAdvance, onInterruption };
  const advanced = useRef<number | null>(null);
  const interrupted = useRef<number | null>(null);
  const matches =
    state?.lessonId === lesson.id &&
    state.stepIndex === stepIndex &&
    state.run === run.current;

  useEffect(() => {
    const timing = getStepTiming(lesson, stepIndex, {
      speed,
      still,
      voiceDurationMs: voiceOn
        ? narrationDurations[instructionKey(lesson, stepIndex)] || 0
        : 0,
    });
    const prior = previous.current;
    const hold =
      prior?.lessonId === lesson.id &&
      prior.stepIndex === stepIndex &&
      loadedSession.current === session &&
      prior.hold;
    const next = createScriptedSession({
      lessonId: lesson.id,
      stepIndex,
      run: ++run.current,
      timing: {
        ...timing,
        hasDemonstration: timing.hasDemonstration && !boardUnavailable,
      },
      textOnly: !voiceOn,
    });
    loadedSession.current = session;
    send({ type: "LOAD", state: { ...next, hold: Boolean(hold) } });
  }, [
    lesson,
    stepIndex,
    session,
    replayKey,
    voiceOn,
    narrationDurations,
    speed,
    still,
    boardUnavailable,
  ]);

  useEffect(() => {
    if (
      !state ||
      !matches ||
      !active ||
      !boardReady ||
      !voiceOn ||
      state.stage !== "instruction" ||
      state.interrupted
    )
      return;
    let cancelled = false;
    const identity = {
      lessonId: state.lessonId,
      stepIndex: state.stepIndex,
      run: state.run,
    };
    void callbacks.current.narrate(instructionKey(lesson, stepIndex), false, {
      onEnd: () => {
        if (!cancelled) send({ type: "VOICE_DONE", ...identity });
      },
      onUnavailable: () => {
        if (!cancelled)
          callbacks.current.onInterruption(
            "The instruction couldn’t play. Read together or try the voice again.",
          );
      },
    });
    return () => {
      cancelled = true;
    };
  }, [
    matches,
    active,
    boardReady,
    voiceOn,
    state?.run,
    state?.stage,
    state?.interrupted,
    lesson,
    stepIndex,
  ]);

  useEffect(() => {
    if (!state || !matches || !active || !boardReady || state.interrupted) return;
    let last = performance.now();
    const identity = {
      lessonId: state.lessonId,
      stepIndex: state.stepIndex,
      run: state.run,
    };
    const timer = setInterval(() => {
      const now = performance.now();
      send({ type: "TICK", ...identity, elapsedMs: now - last, active: true });
      last = now;
    }, 250);
    return () => clearInterval(timer);
  }, [matches, active, boardReady, state?.run, state?.interrupted]);

  useEffect(() => {
    if (!state || !matches || !active) return;
    if (state.interrupted && interrupted.current !== state.run) {
      interrupted.current = state.run;
      callbacks.current.onInterruption(
        "We paused because playback was interrupted. Nothing has moved ahead.",
      );
    } else if (state.stage === "ready" && advanced.current !== state.run) {
      advanced.current = state.run;
      callbacks.current.onAdvance();
    }
  }, [matches, active, state]);

  function action(type: "HOLD" | "CONTINUE" | "DEMO_DONE") {
    if (!state || !matches || !active) return;
    send({
      type,
      lessonId: state.lessonId,
      stepIndex: state.stepIndex,
      run: state.run,
    });
  }
  return {
    state: matches ? state : null,
    hold: () => action("HOLD"),
    continue: () => action("CONTINUE"),
    demoComplete: (renderedStep: number, renderedRun: number) => {
      if (renderedStep === stepIndex && renderedRun === state?.run)
        action("DEMO_DONE");
    },
  };
}
