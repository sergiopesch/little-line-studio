import { createHash } from "node:crypto";
import type { AuthoredLesson } from "../../src/authoring/contracts.ts";
import { narrationKey } from "../../src/lesson-catalogue.js";
import { compileCatalogue, lessonFields, lessonTextInput, record, stepFields } from "./export.ts";
import type { NarrationCatalogueExport } from "./export.ts";

const fullFields = ["id", ...lessonFields] as const;
const fullStepFields = ["id", "kind", ...stepFields, "canSkip", "quietMs"] as const;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sourceText = (lesson: AuthoredLesson) => ({
  ...Object.fromEntries(lessonFields.filter(key => lesson[key] !== undefined).map(key => [key, lesson[key]])),
  pilotPhases: lesson.pilotPhases,
  steps: Object.fromEntries(lesson.steps.map(step => [step.id,
    Object.fromEntries(stepFields.filter(key => step[key] !== undefined).map(key => [key, step[key]]))])),
});
const fullSourceText = (lesson: AuthoredLesson) => ({
  ...Object.fromEntries(fullFields.map(key => [key, lesson[key]])),
  steps: lesson.steps.map(step => Object.fromEntries(fullStepFields.filter(key => step[key] !== undefined).map(key => [key, step[key]]))),
});

export function reviewedExport(locale: "es-419" | "fr-FR", sources: readonly AuthoredLesson[], levels: readonly string[],
  read: (lesson: AuthoredLesson) => unknown): NarrationCatalogueExport {
  const language = locale === "es-419" ? "Spanish" : "French";
  const reviewStatus = "assistant-reviewed-awaiting-native-human-review";
  const lessons: Record<string, unknown> = {};
  for (const lesson of sources) {
    const input = record(read(lesson), `${locale}/${lesson.id}`);
    if (input.locale !== locale || input.lessonId !== lesson.id) throw new TypeError(`Invalid ${language} lesson identity: ${lesson.id}`);
    if (locale === "fr-FR" && input.sourceLessonSha256 !== hash(lesson)) throw new TypeError(`English lesson or geometry changed: ${lesson.id}`);
    const wrapped = Boolean(input.lesson);
    const status = wrapped ? input.reviewStatus : input.status;
    if (status !== reviewStatus && !(locale === "es-419" && status === "reviewed-internally-pending-native-review"))
      throw new TypeError(`${language} lesson lacks its editorial review status: ${lesson.id}`);
    const entry = wrapped ? record(input.lesson, `${locale}/${lesson.id}/lesson`) : input;
    if ((wrapped ? entry.sourceSha256 : entry.sourceTextSha256) !== hash(wrapped ? sourceText(lesson) : fullSourceText(lesson)))
      throw new TypeError(`English source changed: ${lesson.id}`);
    lessons[lesson.id] = lessonTextInput(entry, wrapped ? "steps" : "stages");
  }
  const catalogue = compileCatalogue({ locale, reviewStatus, lessons }, locale, reviewStatus, sources);
  const texts: Record<string, string> = {};
  for (const source of sources) {
    const lesson = catalogue.lessons[source.id];
    if (!lesson) throw new TypeError(`Missing exported lesson: ${source.id}`);
    for (const [index, step] of source.steps.entries()) {
      const text = lesson.steps[step.id];
      if (!text) throw new TypeError(`Missing exported stage: ${source.id}/${step.id}`);
      const instruction = narrationKey(source, index), hint = narrationKey(source, index, "hint");
      if (!instruction || !hint) throw new TypeError(`Missing narration identity: ${source.id}/${step.id}`);
      texts[instruction] = text.spoken;
      texts[hint] = text.hint;
    }
  }
  return Object.freeze({ locale, reviewStatus, count: sources.length, levels: Object.freeze([...levels]),
    lessons: catalogue.lessons, texts: Object.freeze(texts) });
}
