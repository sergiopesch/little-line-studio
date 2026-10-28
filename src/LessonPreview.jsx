import { useLocale } from "./i18n.jsx";
import { useEffect, useRef } from "react";
import { getColourMarks, getOutlineStyle, previewCrayonMark, previewOutlineWidth } from "./crayon-appearance.js";
import { getOutlineMarks } from "./outline-marks.js";
import previewOutlines from "./preview-outline-paths.json" with { type: "json" };
import { FRENCH_DYNAMIC } from "./french-dynamic.fr-FR.js";

// A diagram of the exact authored lesson paths, not a separate illustrative
// asset. The teaching board itself remains the genuine read-only tldraw SDK.
export default function LessonPreview({
  lesson,
  className = "",
  labelled = true,
}) {
  const { locale } = useLocale();
  const canvasRef = useRef(null);
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
      context.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
      if (stroke.closed) context.closePath();
      if (style.fill !== "none") {
        context.fillStyle = style.ink || "#1d1d1d";
        context.fill();
      }
      const outline = previewOutlines.outlines[`${lesson.id}/${stroke.id}`];
      if (outline?.length >= 3) {
        context.beginPath();
        context.moveTo(outline[0][0], outline[0][1]);
        for (const [x, y] of outline.slice(1)) context.lineTo(x, y);
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
          ? locale === "fr-FR" ? FRENCH_DYNAMIC.preview(lesson.title) : locale === "es-419" ? `${lesson.title}. Ejemplo completo de la maestra; dibuja tu propia versión en papel.` : `${lesson.title}. Full teacher example; draw your own version on paper.`
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
