import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("partial Spanish catalogue offers released drawings and labels unavailable drawings", async () => {
  // Use a single released lesson so the result is independent of the active release.
  const compiled = await build({
    stdin: {
      contents: 'export { Catalogue } from "./src/Home.jsx"; export { LanguagePicker } from "./src/LanguagePicker.jsx"; export { LocaleContext } from "./src/i18n.jsx"; export { LESSONS, getLevel } from "./src/lesson-catalogue.js";',
      resolveDir: process.cwd(), sourcefile: "partial-fixture.js",
    },
    bundle: true, write: false, platform: "node", format: "cjs",
    external: ["react", "react/jsx-runtime", "react-dom", "react-dom/server"],
    jsx: "automatic", loader: { ".css": "empty" },
    plugins: [{ name: "availability-fixture", setup(builder) {
      builder.onResolve({ filter: /narration-availability\.es-419\.json$/ }, () => ({ path: "fixture", namespace: "availability-fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "availability-fixture" }, () => ({
        contents: JSON.stringify({ schemaVersion: 1, locale: "es-419", lessons: ["cat"] }), loader: "json",
      }));
    } }],
  });
  const fixture = { exports: {} };
  new Function("module", "exports", "require", compiled.outputFiles[0].text)(fixture, fixture.exports, createRequire(import.meta.url));
  const { Catalogue, LanguagePicker, LocaleContext, LESSONS, getLevel } = fixture.exports;
  const cat = LESSONS.find((lesson) => lesson.id === "cat");
  const source = `/narration/clip-${"a".repeat(64)}.mp3`;
  const index = { sample: source }, durations = { sample: 1000 };
  for (const step of cat.steps) for (const kind of ["instruction", "hint"]) {
    const key = `${cat.id}/${step.id}/${kind}`;
    index[key] = source;
    durations[key] = 1000;
  }
  const render = (locale, child) => renderToStaticMarkup(React.createElement(LocaleContext.Provider, { value: locale }, child));
  const props = {
    levelId: "basic", page: 0, language: { name: "Castellano", region: "Venezuela", flag: "🇻🇪" },
    localizeLesson: (lesson) => lesson, localizedTitle: (lesson) => lesson.title,
    spanishNarration: { index, durations },
  };
  const spanish = render("es-419", React.createElement(Catalogue, props));
  assert.equal((spanish.match(/<button class="drawing-choice"/g) || []).length, 1);
  assert.equal((spanish.match(/<article class="drawing-choice drawing-choice--preparing"/g) || []).length, 3);
  assert.match(spanish, /Esta clase en español está en preparación/);
  const english = render("en-GB", React.createElement(Catalogue, props));
  assert.equal((english.match(/<button class="drawing-choice"/g) || []).length, 4);
  assert.doesNotMatch(english, /drawing-choice--preparing/);
  const emptyLevel = render("es-419", React.createElement(Catalogue, { ...props, levelId: "expert" }));
  assert.equal((emptyLevel.match(/<button class="drawing-choice"/g) || []).length, 0);
  assert.match(emptyLevel, /preparación/);
  const pending = render("en-GB", React.createElement(LanguagePicker, { level: getLevel("basic"), pending: "es-419", error: true }));
  assert.match(pending, /role="status"[^>]*>Loading Spanish lessons/);
  assert.match(pending, /role="alert"[^>]*>Spanish lessons could not load/);
  assert.match(pending, /disabled="" aria-busy="true"/);
});
