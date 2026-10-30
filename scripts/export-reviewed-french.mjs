// @ts-check
// Offline source-linked export. Pending review provenance is never promoted.
import { pathToFileURL } from "node:url";
import { LESSONS, LEVELS } from "../src/lesson-catalogue.js";
import { readRecord } from "./localization/export.ts";
import { reviewedExport } from "./localization/reviewed.ts";
import { writeExportFiles } from "./localization/write.ts";

export function exportReviewedFrench() {
  return reviewedExport("fr-FR", LESSONS, LEVELS.map(({ id }) => id), lesson =>
    readRecord(new URL(`../research/french-reviewed/${lesson.level}/${lesson.id}.fr-FR.json`, import.meta.url)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--write-catalogue"))
    throw new Error("Use no arguments for a read-only export or --write-catalogue for the local runtime copy.");
  const result = exportReviewedFrench();
  if (!args.length) console.log(JSON.stringify(result));
  else {
    const { locale, reviewStatus, lessons } = result;
    writeExportFiles([{ destination: new URL("../src/french-lessons.fr-FR.json", import.meta.url),
      contents: `${JSON.stringify({ locale, reviewStatus, lessons }, null, 2)}\n` }]);
    console.log(JSON.stringify({ locale, reviewStatus, lessons: result.count, written: "src/french-lessons.fr-FR.json" }));
  }
}
