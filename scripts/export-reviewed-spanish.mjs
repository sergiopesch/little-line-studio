// @ts-check
// Offline source-linked export. Pending review provenance is never promoted.
import { pathToFileURL } from "node:url";
import { LESSONS, LEVELS } from "../src/lesson-catalogue.js";
import { readRecord } from "./localization/export.ts";
import { reviewedExport } from "./localization/reviewed.ts";
import { writeExportFiles } from "./localization/write.ts";

export function exportReviewedSpanish() {
  return reviewedExport("es-419", LESSONS, LEVELS.map(({ id }) => id), lesson =>
    readRecord(new URL(`../research/spanish-reviewed/${lesson.level}/${lesson.id}.es-419.json`, import.meta.url)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--write-catalogue"))
    throw new Error("Use no arguments for a read-only export or --write-catalogue for the local runtime copy.");
  const result = exportReviewedSpanish();
  if (!args.length) console.log(JSON.stringify(result));
  else {
    const { locale, reviewStatus, lessons } = result;
    writeExportFiles([{ destination: new URL("../src/spanish-lessons.es-419.json", import.meta.url),
      contents: `${JSON.stringify({ locale, reviewStatus, lessons }, null, 2)}\n` }]);
    console.log(JSON.stringify({ locale, reviewStatus, lessons: result.count, written: "src/spanish-lessons.es-419.json" }));
  }
}
