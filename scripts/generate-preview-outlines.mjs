import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { b64Vecs, getStroke } from "tldraw";
import { LESSONS } from "../src/lesson-catalogue.js";
import { getOutlineMarks } from "../src/outline-marks.js";
import { getOutlineStyle, nativeAppearanceDisplayValues } from "../src/crayon-appearance.js";

// Build-time only. Using the SDK here keeps its large UI bundle out of the
// catalogue while retaining the pressure-shaped outline shown by the board.
// Review the SDK's draw settings and board pixels before changing this version.
const reviewedSdkVersion = "5.5.2";
const sdkEntry = createRequire(import.meta.url).resolve("tldraw");
const sdkPackage = JSON.parse(readFileSync(join(dirname(dirname(sdkEntry)), "package.json"), "utf8"));
if (sdkPackage.version !== reviewedSdkVersion) {
  console.error(`tldraw ${sdkPackage.version} needs a preview-rendering review before updating ${reviewedSdkVersion}.`);
  process.exit(1);
}
const outlines = {};
for (const lesson of LESSONS) {
  for (const mark of getOutlineMarks(lesson)) {
    const style = getOutlineStyle(lesson, { id: mark.sourceId });
    const { strokeWidth } = nativeAppearanceDisplayValues({
      meta: { littleLineAppearance: style },
    });
    if (strokeWidth === undefined || style.dash !== "draw") continue;

    // Match the board's encoded coordinates and tldraw 5.5 draw settings.
    const origin = mark.points[0];
    const points = b64Vecs.decodePoints(b64Vecs.encodePoints(mark.points.map((point) => ({
      x: point.x - origin.x, y: point.y - origin.y, z: point.z,
    }))));
    const size = strokeWidth + 1;
    const streamline = 0.64 + 0.1 * Math.max(0, Math.min(1, (size - 9) / 7));
    const polygon = getStroke(points, {
      size, thinning: 0.5, streamline, smoothing: 0.62,
      easing: (value) => Math.sin(value * Math.PI / 2),
      simulatePressure: true, last: true,
    });
    outlines[`${lesson.id}/${mark.id}`] = polygon.map((point) => [
      Math.round((point.x + origin.x) * 100) / 100,
      Math.round((point.y + origin.y) * 100) / 100,
    ]);
  }
}

const output = `${JSON.stringify({ sdkVersion: reviewedSdkVersion, outlines })}\n`;
const path = fileURLToPath(new URL("../src/preview-outline-paths.json", import.meta.url));
if (process.argv.includes("--write")) {
  writeFileSync(path, output);
  console.log(`Generated ${Object.keys(outlines).length} preview outlines.`);
} else if (process.argv.includes("--check")) {
  let existing = "";
  try { existing = readFileSync(path, "utf8"); } catch { /* Report a missing file as stale. */ }
  if (existing !== output) {
    console.error("Preview outlines are stale. Run npm run update:previews and review the result.");
    process.exit(1);
  }
  console.log(`Verified ${Object.keys(outlines).length} preview outlines.`);
} else {
  console.error("Use --check or --write.");
  process.exit(2);
}
// The SDK can leave background handles open in Node; all work above is synchronous.
process.exit(0);
