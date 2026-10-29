import { line, quad, mark, pointsAtProgress } from "../../src/lesson-geometry.js";
import { getOutlineMarks } from "../../src/outline-marks.js";
import { crayonGesture, getColourMarks, defineCrayonAppearance } from "../../src/crayon-appearance.js";
import { CrayonDrawShapeUtil } from "../../src/CrayonDrawShapeUtil.jsx";
import type { CrayonAppearance, OutlineMark } from "../../src/drawing/contracts.ts";
import type { LessonView } from "../../src/browser/ui-contracts.ts";
import type { Editor, SvgExportContext, TLDrawShape } from "tldraw";

declare const lesson: LessonView;
declare const contour: OutlineMark;
declare const appearance: CrayonAppearance;
declare const editor: Editor;
declare const shape: TLDrawShape;
declare const svg: SvgExportContext;

const points = line([0, 0], [20, 10]);
mark("outline", points);
crayonGesture("colour", points, "gold");
getOutlineMarks(lesson);
getColourMarks(lesson);
pointsAtProgress(contour, 0.5);
new CrayonDrawShapeUtil(editor).toSvg(shape, svg);

// @ts-expect-error each authored coordinate has exactly two numeric values
line([0]);
// @ts-expect-error control points are coordinates, not loose numbers
quad([0, 0], 5, [10, 10]);
// @ts-expect-error marks require structured points with both coordinates
mark("invalid", [{ x: 2 }]);
// @ts-expect-error separated contours must never be sampled as a connecting stroke
pointsAtProgress({ points, parts: [points, points] }, 0.5);
// @ts-expect-error renderer input includes geometry, not only lesson timing
getOutlineMarks({ strokes: [{ id: "invalid", step: 1, durationMs: 5000 }] });
// @ts-expect-error widths cannot be supplied as CSS strings
crayonGesture("invalid", points, "gold", { width: "12px" });
// @ts-expect-error native colours follow the installed SDK vocabulary
defineCrayonAppearance({ ...appearance, palette: { gold: { sdkColor: "gold", ink: "#ffaa00", grain: "#ffeeaa" } } });
// @ts-expect-error immutable authored pressure must not change during animation
getColourMarks(lesson)[0]?.points.push({ x: 1, y: 2, z: 0.5 });
// @ts-expect-error SVG export accepts a native draw record, not a lesson command
new CrayonDrawShapeUtil(editor).toSvg({ type: "NEXT" }, svg);
