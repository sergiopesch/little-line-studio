import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LESSONS } from "../src/lesson-catalogue.js";
import { localizeLesson } from "../src/spanish-lessons.js";

const researchIdentifier = /\bR\d+(?:\s*[–-]\s*R\d+)?\b/;

test("family Help notices do not expose internal research identifiers", () => {
  for (const locale of ["en-GB", "es-419"]) {
    for (const original of LESSONS) {
      const lesson = localizeLesson(original, locale);
      for (const step of lesson.steps) {
        assert.doesNotMatch(step.notice, researchIdentifier, `${locale}/${lesson.id}/${step.id}`);
      }
    }
  }
});

test("the source-linked Spanish draft reflects the citation-free parent notes", () => {
  const draft = JSON.parse(readFileSync(new URL("../research/spanish-draft/lessons.es-419.json", import.meta.url), "utf8"));
  for (const [id, lesson] of Object.entries(draft.lessons)) {
    assert.doesNotMatch(lesson.parentNote, researchIdentifier, `${id}/parentNote`);
    for (const [stepId, step] of Object.entries(lesson.steps)) {
      assert.doesNotMatch(step.notice, researchIdentifier, `${id}/${stepId}`);
    }
  }
});
