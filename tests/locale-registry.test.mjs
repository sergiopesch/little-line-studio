import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOCALES, getLocale, createLocaleRegistry } from "../src/locale-registry.js";
import { LANGUAGES } from "../src/languages.js";
import { LESSONS } from "../src/lesson-catalogue.js";
import { UI_DICTIONARIES } from "../src/ui-translations.js";
import { dynamicLocale } from "../src/locale-dynamic.js";
import { hasCompleteNarration } from "../src/narration-locales.js";

test("registered locales retain every text, voice and interface identity", async () => {
  assert.deepEqual(LANGUAGES.map(l => l.id), LOCALES.map(l => l.id));
  for (const locale of LOCALES) {
    const { localizeLesson } = await locale.loadText();
    const { index, durations } = await locale.loadNarration();
    const manifest = JSON.parse(readFileSync(new URL(`../src/narration-manifest${locale.assetSuffix}.json`, import.meta.url)));
    assert.equal(UI_DICTIONARIES[locale.id], locale.ui);
    assert.equal(dynamicLocale(locale.id), locale.dynamic);
    assert.ok(LOCALES.includes(getLocale(locale.id)));
    for (const lesson of LESSONS) {
      const local = localizeLesson(lesson, locale.id);
      assert.equal(local.strokes, lesson.strokes, `${locale.id}: geometry stays shared`);
      assert.deepEqual(local.steps.map(s => s.id), lesson.steps.map(s => s.id));
      if (locale.textLocale === "en-GB") assert.equal(local, lesson);
      else assert.notEqual(local.steps[0].spoken, lesson.steps[0].spoken);
      for (const step of local.steps) for (const kind of ["instruction", "hint"]) {
        const key = `${lesson.id}/${step.id}/${kind}`;
        assert.equal(index[key], manifest.clips[key].src);
        assert.equal(manifest.clips[key].voiceId, locale.voiceId);
        assert.equal(manifest.clips[key].text, kind === "instruction" ? step.spoken : step.hint);
      }
    }
    // English's legacy duration file stores instructions only; its dedicated
    // build/content tests retain that contract. Other locales include hints.
    if (locale.id !== "en-GB") assert.ok(hasCompleteNarration(LESSONS, index, durations));
  }
});

test("a new registration is lazy and rejects incomplete or duplicate identities", () => {
  let loads = 0;
  const entry = { ...getLocale("es-ES"), id: "pt-PT", textLocale: "pt-PT",
    availability: { schemaVersion: 1, locale: "pt-PT", lessons: [] },
    loadText: () => { loads++; }, loadNarration: () => { loads++; } };
  const registry = createLocaleRegistry([entry]);
  assert.equal(loads, 0);
  assert.equal(registry.get("pt-PT").assetSuffix, ".pt-PT");
  assert.equal(registry.get("constructor"), null);
  assert.equal(registry.get("__proto__"), null);
  assert.throws(() => createLocaleRegistry([entry, entry]), /duplicate/);
  for (const field of ["loadText", "loadNarration", "availability", "ui", "dynamic", "voiceId"])
    assert.throws(() => createLocaleRegistry([{ ...entry, [field]: undefined }]), /Missing|Incomplete/, field);
  assert.throws(() => createLocaleRegistry([{ ...entry, ui: null }]), /Incomplete/);
});
