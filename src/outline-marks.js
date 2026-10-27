const cache = new WeakMap();
const LIFT_MS = 180;

// tldraw joins a draw shape's free segments. Separate shape records preserve
// genuine pen-up gaps without a white mask or a false connecting line.
export function getOutlineMarks(lesson) {
  if (cache.has(lesson)) return cache.get(lesson);
  const marks = lesson.strokes.flatMap((stroke, sourceIndex) => {
    const { parts, ...source } = stroke;
    if (!parts) return [Object.freeze({ ...source, sourceId: stroke.id, sourceIndex, startMs: 0, endMs: stroke.durationMs })];
    const budget = stroke.durationMs - (parts.length - 1) * LIFT_MS;
    if (budget < parts.length * 300)
      throw new TypeError(`${stroke.id}: its contours need more demonstration time.`);
    const weights = parts.map((part) => part.length - 1);
    const total = weights.reduce((sum, value) => sum + value, 0);
    let elapsed = 0, cumulativeWeight = 0, allocatedExtra = 0;
    return parts.map((points, partIndex) => {
      cumulativeWeight += weights[partIndex];
      const nextExtra = Math.round((budget - parts.length * 300) * cumulativeWeight / total);
      const duration = 300 + nextExtra - allocatedExtra;
      allocatedExtra = nextExtra;
      if (duration < 300) throw new TypeError(`${stroke.id}: a visible contour needs time for a deliberate movement.`);
      const startMs = elapsed, endMs = startMs + duration;
      elapsed = endMs + LIFT_MS;
      return Object.freeze({ ...source, id: `${stroke.id}-part-${partIndex}`, sourceId: stroke.id, sourceIndex,
        points, closed: false, startMs, endMs });
    });
  });
  const frozen = Object.freeze(marks);
  cache.set(lesson, frozen);
  return frozen;
}

export function outlineState(mark, state) {
  const elapsed = state.progress * mark.durationMs;
  return {
    visible: state.visible && elapsed >= mark.startMs,
    current: state.current,
    progress: Math.max(0, Math.min(1, (elapsed - mark.startMs) / (mark.endMs - mark.startMs))),
  };
}
