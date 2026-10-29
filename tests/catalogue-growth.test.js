import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LESSONS } from "../src/lesson-catalogue.js";
import { createTeachingPackRegistry, TEACHING_PACKS } from "../src/lesson-packs.js";
import { drawingCount } from "../src/catalogue-counts.js";

const entries = LESSONS.map(lesson => ({ id: lesson.id, appearance: lesson.appearance,
  pack: TEACHING_PACKS.find(pack => pack.lessonId === lesson.id) }));

test("teaching-pack registration validates identities without limiting catalogue size", () => {
  assert.deepEqual(new Set(TEACHING_PACKS.map(pack => pack.lessonId)), new Set(LESSONS.map(lesson => lesson.id)));
  const extra = { ...entries[0], id: "extra", pack: { ...entries[0].pack, lessonId: "extra" } };
  const expanded = createTeachingPackRegistry([...entries, extra]);
  assert.equal(expanded.size, entries.length + 1);
  assert.equal(expanded.get("extra").pack, extra.pack);
  assert.throws(() => createTeachingPackRegistry([...entries, entries[0]]), /Duplicate/);
  assert.throws(() => createTeachingPackRegistry([{ ...extra, id: "mismatch" }]), /matching lesson identity/);
  assert.throws(() => createTeachingPackRegistry([{ ...extra, appearance: null }]), /appearance/);
});

const counts = [
  ["en-GB", "drawing", "drawings"], ["en-IE", "drawing", "drawings"], ["en-GB-x-scotland", "drawing", "drawings"],
  ["es-419", "dibujo", "dibujos"], ["es-ES", "dibujo", "dibujos"], ["fr-FR", "dessin", "dessins"],
  ["de-DE", "Zeichnung", "Zeichnungen"], ["it-IT", "disegno", "disegni"], ["nl-NL", "tekening", "tekeningen"],
];
test("drawing counts use localized singular and plural forms", () => {
  for (const [locale, one, many] of counts) {
    assert.equal(drawingCount(locale, 1), `1 ${one}`);
    assert.equal(drawingCount(locale, 11), `11 ${many}`);
    assert.equal(drawingCount(locale, 0), `0 ${locale === "fr-FR" ? one : many}`);
  }
});

async function renderFixture(catalogue) {
  const compiled = await build({
    stdin: { contents: 'export { Home, Catalogue } from "./src/Home.jsx"; export { LocaleContext } from "./src/i18n.jsx";', resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", loader: { ".css": "empty" },
    external: ["react", "react/jsx-runtime", "react-dom", "react-dom/server"],
    plugins: [{ name: "catalogue-growth", setup(builder) {
      builder.onResolve({ filter: /lesson-catalogue\.js$/ }, args => args.namespace === "catalogue-fixture" ? undefined : { path: "catalogue", namespace: "catalogue-fixture" });
      builder.onLoad({ filter: /.*/, namespace: "catalogue-fixture" }, () => ({
        contents: `export * from './src/lesson-catalogue.js'; export const LESSONS = ${JSON.stringify(catalogue)};`,
        resolveDir: process.cwd(), loader: "js",
      }));
    } }],
  });
  const fixture = { exports: {} };
  new Function("module", "exports", "require", compiled.outputFiles[0].text)(fixture, fixture.exports, createRequire(import.meta.url));
  return fixture.exports;
}

test("home and catalogue labels follow an eleventh drawing in every language", async () => {
  const { Home, Catalogue, LocaleContext } = await renderFixture([...LESSONS, { ...LESSONS[0], id: "extra" }]);
  for (const [locale, , noun] of counts) {
    const render = child => renderToStaticMarkup(createElement(LocaleContext.Provider, { value: locale }, child));
    const home = render(createElement(Home));
    assert.match(home, new RegExp(`11 ${noun}`), locale);
    const catalogue = render(createElement(Catalogue, {
      levelId: "basic", page: 2, language: { name: "Test", region: "Test" },
      localizeLesson: lesson => lesson, localizedTitle: lesson => lesson.title,
    }));
    assert.match(catalogue, /class="drawing-grid" aria-label="[^"]*9[^"]*11[^"]*11"/, locale);
    assert.equal((catalogue.match(/class="drawing-choice(?: drawing-choice--preparing)?"/g) ?? []).length, 3, locale);
    assert.doesNotMatch(catalogue, /undefined|NaN/);
  }
});

test("an empty catalogue has a bounded range and disabled pagination", async () => {
  const { Home, Catalogue, LocaleContext } = await renderFixture([]);
  const render = child => renderToStaticMarkup(createElement(LocaleContext.Provider, { value: "en-GB" }, child));
  assert.match(render(createElement(Home)), /0 drawings/);
  const catalogue = render(createElement(Catalogue, { levelId: "basic", page: 8, language: { name: "English", region: "British" } }));
  assert.match(catalogue, /drawings 0 to 0 of 0/);
  assert.match(catalogue, /1 of 1/);
  assert.equal((catalogue.match(/disabled=""/g) ?? []).length, 2);
});
