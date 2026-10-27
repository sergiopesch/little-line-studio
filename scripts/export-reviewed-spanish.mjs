// Offline export of source-linked editorial drafts. No provider calls and no
// release assertion: independent language and listening review remain pending.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { LESSONS, LEVELS, narrationKey } from "../src/lesson-catalogue.js";

const lessonFields = ["title", "invitation", "objective", "parentNote", "simplify", "transfer", "colouringLabel"];
const stepFields = ["title", "instruction", "spoken", "hint", "notice"];
const fullFields = ["id", ...lessonFields];
const fullStepFields = ["id", "kind", ...stepFields, "canSkip", "quietMs"];
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sourceText = (lesson) => ({
  ...Object.fromEntries(lessonFields.filter((key) => lesson[key] !== undefined).map((key) => [key, lesson[key]])),
  pilotPhases: lesson.pilotPhases,
  steps: Object.fromEntries(lesson.steps.map((step) => [step.id,
    Object.fromEntries(stepFields.filter((key) => step[key] !== undefined).map((key) => [key, step[key]]))])),
});
const fullSourceText = (lesson) => ({
  ...Object.fromEntries(fullFields.map((key) => [key, lesson[key]])),
  steps: lesson.steps.map((step) => Object.fromEntries(fullStepFields.filter((key) => step[key] !== undefined).map((key) => [key, step[key]]))),
});
const fail = (message) => { throw new Error(message); };

const texts = {}, translatedLessons = {};
for (const lesson of LESSONS) {
  const url = new URL(`../research/spanish-reviewed/${lesson.level}/${lesson.id}.es-419.json`, import.meta.url);
  const record = JSON.parse(readFileSync(url, "utf8"));
  if (record.locale !== "es-419" || record.lessonId !== lesson.id)
    fail(`Invalid Spanish lesson identity: ${lesson.id}`);
  const wrapped = Boolean(record.lesson);
  if (!["assistant-reviewed-awaiting-native-human-review", "reviewed-internally-pending-native-review"]
      .includes(wrapped ? record.reviewStatus : record.status))
    fail(`Spanish lesson lacks its editorial review status: ${lesson.id}`);
  const entry = wrapped ? record.lesson : record;
  if ((wrapped ? entry.sourceSha256 : entry.sourceTextSha256) !== hash(wrapped ? sourceText(lesson) : fullSourceText(lesson)))
    fail(`English source changed: ${lesson.id}`);
  const stages = wrapped ? entry.steps : entry.stages;
  if (!stages || JSON.stringify(Object.keys(stages)) !== JSON.stringify(lesson.steps.map((step) => step.id)))
    fail(`Spanish stages do not match: ${lesson.id}`);
  if (!Array.isArray(entry.pilotPhases) || JSON.stringify(entry.pilotPhases.map(({ id }) => id)) !== JSON.stringify(lesson.pilotPhases.map(({ id }) => id)) ||
      entry.pilotPhases.some(({ label }) => typeof label !== "string" || !label.trim()))
    fail(`Spanish phases do not match: ${lesson.id}`);
  const text = Object.fromEntries(lessonFields.map((key) => [key, entry[key] ?? ""]));
  for (const field of lessonFields) if (lesson[field] && (typeof text[field] !== "string" || !text[field].trim()))
    fail(`Missing Spanish lesson field: ${lesson.id}/${field}`);
  const steps = {};
  for (const [index, step] of lesson.steps.entries()) {
    const translated = stages[step.id];
    if (!translated || JSON.stringify(Object.keys(translated).sort()) !== JSON.stringify([...stepFields].sort()) ||
        stepFields.some((key) => typeof translated[key] !== "string" || !translated[key].trim()))
      fail(`Incomplete Spanish stage: ${lesson.id}/${step.id}`);
    steps[step.id] = translated;
    texts[narrationKey(lesson, index)] = translated.spoken;
    texts[narrationKey(lesson, index, "hint")] = translated.hint;
  }
  translatedLessons[lesson.id] = { ...text, pilotPhases: entry.pilotPhases, steps };
}
const reviewStatus = "assistant-reviewed-awaiting-native-human-review";
if (process.argv.slice(2).length === 0) {
  console.log(JSON.stringify({ locale: "es-419", reviewStatus,
    count: LESSONS.length, levels: LEVELS.map(({ id }) => id), lessons: translatedLessons, texts }));
} else if (process.argv.slice(2).length === 1 && process.argv[2] === "--write-catalogue") {
  const destination = new URL("../src/spanish-lessons.es-419.json", import.meta.url);
  const temporary = new URL(`../src/.spanish-catalogue-${randomUUID()}.tmp`, import.meta.url);
  try {
    writeFileSync(temporary, `${JSON.stringify({ locale: "es-419", reviewStatus, lessons: translatedLessons }, null, 2)}\n`, { flag: "wx" });
    renameSync(temporary, destination);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  console.log(JSON.stringify({ locale: "es-419", reviewStatus, lessons: LESSONS.length, written: "src/spanish-lessons.es-419.json" }));
} else {
  fail("Use no arguments for a read-only export or --write-catalogue for the local runtime copy.");
}
