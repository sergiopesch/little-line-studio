import { useEffect, useReducer } from "react";
import { createLessonClock, lessonClockReducer } from "./lesson-progress.js";

// Active together-time is independent of the lesson scheduler. Pauses never
// consume this clock or create a catch-up delta after resuming.
export function useLessonClock({ enabled, session, stepIndex, playback, active }) {
  const [clock, send] = useReducer(
    lessonClockReducer,
    { session },
    createLessonClock,
  );
  const run = playback?.run ?? null;
  const stage = playback?.stage ?? null;
  const textOnly = playback?.textOnly === true;
  const ticking = Boolean(enabled && active && playback && !playback.interrupted);
  const current = { session, stepIndex, run, stage, textOnly, active: ticking };
  useEffect(() => {
    send({
      type: "SYNC",
      session,
      stepIndex,
      run,
      stage,
      textOnly,
      active: ticking,
    });
  }, [session, stepIndex, run, stage, textOnly, ticking]);
  useEffect(() => {
    if (!ticking) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const deltaMs = now - last;
      last = now;
      send({
        type: "TICK",
        session,
        stepIndex,
        run,
        stage,
        deltaMs,
        hidden: document.hidden,
      });
    }, 250);
    return () => clearInterval(timer);
  }, [ticking, session, stepIndex, run, stage]);
  // Derive the same synchronization before effects run so a step change or
  // resumed voice never paints a frame using its predecessor's stage clock.
  const display = lessonClockReducer(clock, { type: "SYNC", ...current });
  return { elapsedMs: display.elapsedMs, stageElapsedMs: display.stageElapsedMs };
}
