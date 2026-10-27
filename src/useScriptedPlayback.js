import { useEffect, useReducer, useRef } from "react";
import {
  createScriptedSession,
  getStepTiming,
  scriptedSessionReducer,
} from "./scripted-session.js";
import durations from "./narration-durations.json";
import { narrationKey } from "./lesson-catalogue.js";

function reduce(state, event) {
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
}) {
  const [state, send] = useReducer(reduce, null);
  const previous = useRef(null);
  previous.current = state;
  const loadedSession = useRef(null);
  const run = useRef(0);
  const callbacks = useRef({ narrate, onAdvance, onInterruption });
  callbacks.current = { narrate, onAdvance, onInterruption };
  const advanced = useRef(null);
  const interrupted = useRef(null);
  const matches =
    state?.lessonId === lesson.id &&
    state.stepIndex === stepIndex &&
    state.run === run.current;

  useEffect(() => {
    const timing = getStepTiming(lesson, stepIndex, {
      speed,
      still,
      voiceDurationMs: voiceOn
        ? narrationDurations[narrationKey(lesson, stepIndex)] || 0
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
    void callbacks.current.narrate(narrationKey(lesson, stepIndex), false, {
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
    if (!matches || !active || !boardReady || state.interrupted) return;
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
    if (!matches || !active) return;
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

  function action(type, extra = {}) {
    if (!matches || !active) return;
    send({
      type,
      lessonId: state.lessonId,
      stepIndex: state.stepIndex,
      run: state.run,
      ...extra,
    });
  }
  return {
    state: matches ? state : null,
    hold: () => action("HOLD"),
    continue: () => action("CONTINUE"),
    demoComplete: (renderedStep, renderedRun) => {
      if (renderedStep === stepIndex && renderedRun === state?.run)
        action("DEMO_DONE");
    },
  };
}
