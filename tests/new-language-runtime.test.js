import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { LESSONS } from "../src/lesson-catalogue.js";

test("each additional language loads and authorizes its own complete audio", async () => {
  const locales = ["en-IE", "en-GB-x-scotland", "fr-FR"];
  const paths = Object.fromEntries(locales.map((id, i) => [id, `/narration/clip-${String(i + 1).repeat(64)}.mp3`]));
  const names = Object.keys(paths);
  const plugin = { name: "locale-fixtures", setup(builder) {
    builder.onResolve({ filter: /narration-(availability|index|durations)\.(en-IE|en-GB-x-scotland|fr-FR)\.json$/ }, (args) => ({ path: args.path, namespace: "locales" }));
    builder.onLoad({ filter: /.*/, namespace: "locales" }, ({ path }) => {
      const [, kind, id] = /narration-(availability|index|durations)\.(en-IE|en-GB-x-scotland|fr-FR)\.json$/.exec(path);
      const keys = ["sample", ...LESSONS.flatMap((lesson) => lesson.steps.flatMap((step) =>
        ["instruction", "hint"].map((type) => `${lesson.id}/${step.id}/${type}`)))];
      const value = kind === "availability" ? { schemaVersion: 1, locale: id, lessons: LESSONS.map((l) => l.id).sort() }
        : Object.fromEntries(keys.map((key) => [key, kind === "index" ? paths[id] : 1000]));
      return { contents: JSON.stringify(value), loader: "json" };
    });
  }};
  const compiled = await build({ stdin: {
    contents: 'export * from "./src/narration-locales.js"; export * from "./src/narration-registry.js"; export * from "./src/language-loading.js"; export * from "./src/languages.js";',
    resolveDir: process.cwd(), sourcefile: "locales-fixture.js",
  }, bundle: true, write: false, platform: "node", format: "cjs", plugins: [plugin] });
  const fixture = { exports: {} };
  new Function("module", "exports", "require", compiled.outputFiles[0].text)(fixture, fixture.exports, createRequire(import.meta.url));
  const { loadLocaleLanguage, authorizeLocaleNarration, isLocalizedAuthoredClip, releasedLessons, getLanguage, languageAvailableForLevel } = fixture.exports;
  for (const locale of names) {
    const lessons = releasedLessons(locale);
    assert.equal(lessons.length, 30);
    assert.equal(getLanguage(locale).ready, true);
    assert.equal(languageAvailableForLevel(locale, "basic"), true);
    const result = await loadLocaleLanguage(locale, lessons, {
      loadText: async () => ({ localizeLesson: (l) => l, localizedLessonTitle: (l) => l.title }),
    });
    assert.equal(result.narration.index.sample, paths[locale]);
    assert.equal(authorizeLocaleNarration(locale, { ...result.narration }), false);
    assert.equal(authorizeLocaleNarration(locale, result.narration), true);
    assert.equal(isLocalizedAuthoredClip(paths[locale]), true);
  }
  assert.equal(isLocalizedAuthoredClip(`/narration/clip-${"a".repeat(64)}.mp3`), false);
});
