import type { AuthoredLesson } from "../../src/authoring/contracts.ts";
import type { CatalogueReviewStatus, LocalizedCatalogue, LocalizedLessonText } from "../../src/localization/contracts.ts";
import { createLessonLocalizer } from "../../src/localized-catalogue.js";
import { readFileSync } from "node:fs";

export const lessonFields = ["title", "invitation", "objective", "parentNote", "simplify", "transfer", "colouringLabel"] as const;
export const stepFields = ["title", "instruction", "spoken", "hint", "notice"] as const;
export interface RegionalCatalogueExport extends LocalizedCatalogue {
  readonly count: number;
  readonly strings: Readonly<Record<string, string>>;
  readonly sample: string;
}
export interface NarrationCatalogueExport extends LocalizedCatalogue {
  readonly count: number;
  readonly levels: readonly string[];
  readonly texts: Readonly<Record<string, string>>;
}

function requireRecord(value: unknown, context: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${context}: expected an object`);
}
export function record(value: unknown, context: string): Record<string, unknown> {
  requireRecord(value, context);
  return value;
}
export function readRecord(url: URL): Record<string, unknown> {
  const input: unknown = JSON.parse(readFileSync(url, "utf8"));
  return record(input, url.pathname);
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[], context: string, ordered = false) {
  const actual = Object.keys(value);
  if (JSON.stringify(ordered ? actual : actual.sort()) !== JSON.stringify(ordered ? expected : [...expected].sort()))
    throw new TypeError(`${context}: fields or order do not match the source`);
}

// Editorial provenance stays outside the runtime text. Values remain unknown
// until the complete catalogue passes the same parser used by the family UI.
export function lessonTextInput(input: unknown, steps: "steps" | "stages" = "steps") {
  const value = record(input, "Editorial lesson");
  return { ...Object.fromEntries(lessonFields.map(key => [key, value[key] ?? ""])),
    pilotPhases: value.pilotPhases, steps: value[steps] };
}

export function compileCatalogue(input: unknown, locale: string, reviewStatus: CatalogueReviewStatus,
  sources: readonly AuthoredLesson[]): LocalizedCatalogue {
  if (!["assistant-draft-awaiting-native-human-review", "assistant-reviewed-awaiting-native-human-review"].includes(reviewStatus))
    throw new TypeError("An export must retain a supported pending review status");
  const sourceIds = sources.map(lesson => lesson.id);
  if (!sources.length || new Set(sourceIds).size !== sources.length) throw new TypeError("An export needs unique source lessons");
  const data = record(input, locale);
  exactKeys(data, ["locale", "reviewStatus", "lessons"], locale);
  const lessons = record(data.lessons, `${locale}/lessons`);
  exactKeys(lessons, sourceIds, `${locale}/lessons`, true);
  for (const source of sources) {
    const context = `${locale}/${source.id}`;
    const lesson = record(lessons[source.id], context);
    exactKeys(lesson, [...lessonFields, "pilotPhases", "steps"], context);
    const steps = record(lesson.steps, `${context}/steps`);
    exactKeys(steps, source.steps.map(step => step.id), `${context}/steps`, true);
    for (const [id, step] of Object.entries(steps)) exactKeys(record(step, `${context}/${id}`), stepFields, `${context}/${id}`);
    if (!Array.isArray(lesson.pilotPhases)) throw new TypeError(`${context}: missing phases`);
    for (const phase of lesson.pilotPhases) exactKeys(record(phase, `${context}/phase`), ["id", "label"], `${context}/phase`);
  }
  const localizer = createLessonLocalizer(data, locale, reviewStatus);
  const compiled = sources.map((source): readonly [string, LocalizedLessonText] => {
    const lesson = localizer.localizeLesson(source, locale);
    if (!lesson.pilotPhases) throw new TypeError(`${locale}/${source.id}: missing source phases`);
    const text: LocalizedLessonText = Object.freeze({
      title: lesson.title, invitation: lesson.invitation, objective: lesson.objective, parentNote: lesson.parentNote,
      simplify: lesson.simplify, transfer: lesson.transfer, colouringLabel: lesson.colouringLabel ?? "",
      pilotPhases: Object.freeze(lesson.pilotPhases.map(({ id, label }) => Object.freeze({ id, label }))),
      steps: Object.freeze(Object.fromEntries(lesson.steps.map(({ id, title, instruction, spoken, hint, notice }) =>
        [id, Object.freeze({ title, instruction, spoken, hint, notice })]))),
    });
    return [source.id, text];
  });
  return Object.freeze({ locale, reviewStatus, lessons: Object.freeze(Object.fromEntries(compiled)) });
}

export function regionalExport(catalogue: LocalizedCatalogue, input: unknown): RegionalCatalogueExport {
  const context = `${catalogue.locale}/UI`;
  const value = record(input, context), strings = record(value.strings, context);
  if (!Object.keys(strings).length) throw new TypeError(`${context}: missing strings`);
  const entries = Object.entries(strings).map(([key, text]): readonly [string, string] => {
    if (typeof text !== "string" || !text.trim()) throw new TypeError(`${context}/${key}: missing text`);
    return [key, text];
  });
  if (typeof value.sample !== "string" || !value.sample.trim()) throw new TypeError(`${catalogue.locale}/sample: missing text`);
  return Object.freeze({ locale: catalogue.locale, reviewStatus: catalogue.reviewStatus, count: Object.keys(catalogue.lessons).length,
    lessons: catalogue.lessons, strings: Object.freeze(Object.fromEntries(entries)), sample: value.sample });
}
