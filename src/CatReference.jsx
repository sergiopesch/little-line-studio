import { CAT_STROKES } from "./drawing-paths.js";

const REFERENCE_LINES = CAT_STROKES.map((stroke) => ({
  id: stroke.id,
  points: stroke.points
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" "),
}));

export function CatReference({ className = "", labelled = true }) {
  return (
    <svg
      viewBox="80 70 440 380"
      className={className}
      role={labelled ? "img" : undefined}
      aria-label={
        labelled
          ? "One possible cat: a round head, two ears, eyes, a nose, a smile and whiskers."
          : undefined
      }
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {REFERENCE_LINES.map((stroke) => (
          <polyline key={stroke.id} points={stroke.points} />
        ))}
      </g>
    </svg>
  );
}
