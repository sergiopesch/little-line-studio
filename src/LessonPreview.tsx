import type { LessonView } from "./browser/ui-contracts.ts";
import { useLocale } from "./i18n.jsx";
import { useEffect, useRef } from "react";
import { getColourMarks, getOutlineStyle, previewCrayonMark, previewOutlineWidth } from "./crayon-appearance.js";
import { getOutlineMarks } from "./outline-marks.js";
import previewOutlines from "./preview-outline-paths.json" with { type: "json" };
import { dynamicLocale } from "./locale-dynamic.js";

const outlines: Readonly<Record<string, readonly (readonly number[])[]>> = previewOutlines.outlines;
function coordinates(point: readonly number[]): [number, number] {
  const [x, y] = point;
  if (x === undefined || y === undefined) throw new TypeError("An authored outline point requires two coordinates.");
  return [x, y];
}

// A diagram of the exact authored lesson paths, not a separate illustrative
// asset. The teaching board itself remains the genuine read-only tldraw SDK.
export default function LessonPreview({
  lesson,
  className = "",
  labelled = true,
}: { lesson: LessonView; className?: string; labelled?: boolean }) {
  const { locale } = useLocale();
  const dynamic = dynamicLocale(locale)?.copy;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    canvas.width = 600 * ratio;
    canvas.height = 480 * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, 600, 480);
    const { x, y, w, h } = lesson.viewFrame;
    const scale = Math.min(600 / w, 480 / h);
    context.translate((600 - w * scale) / 2, (480 - h * scale) / 2);
    context.scale(scale, scale);
    context.translate(-x, -y);
    context.strokeStyle = "#172a43";
    context.lineWidth = 6.5 / scale;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const mark of getColourMarks(lesson)) previewCrayonMark(context, mark);
    for (const stroke of getOutlineMarks(lesson)) {
      const style = getOutlineStyle(lesson, { id: stroke.sourceId });
      if (lesson.appearance) {
        context.strokeStyle = style.ink || "#1d1d1d";
        context.lineWidth = previewOutlineWidth(style, scale);
      }
      context.beginPath();
      const origin = stroke.points[0];
      if (!origin) throw new TypeError("An outline preview needs an authored origin.");
      context.moveTo(origin.x, origin.y);
      for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
      if (stroke.closed) context.closePath();
      if (style.fill !== "none") {
        context.fillStyle = style.ink || "#1d1d1d";
        context.fill();
      }
      const outline = outlines[`${lesson.id}/${stroke.id}`];
      if (outline && outline.length >= 3 && outline[0]) {
        context.beginPath();
        context.moveTo(...coordinates(outline[0]));
        for (const point of outline.slice(1)) context.lineTo(...coordinates(point));
        context.closePath();
        context.fillStyle = style.ink || "#1d1d1d";
        context.fill();
      } else {
        context.stroke();
      }
    }
  }, [lesson]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={480}
      className={className}
      role={labelled ? "img" : "presentation"}
      aria-label={
        labelled
          ? dynamic ? dynamic.preview(lesson.title) : locale === "es-419" ? `${lesson.title}. Ejemplo completo de la maestra; dibuja tu propia versión en papel.` : `${lesson.title}. Full teacher example; draw your own version on paper.`
          : undefined
      }
      aria-hidden={labelled ? undefined : true}
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        aspectRatio: "5 / 4",
      }}
    />
  );
}

export { LessonPreview };
