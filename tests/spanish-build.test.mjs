import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const lessons = [
  { id: "cat", steps: [
    { id: "head", spoken: "Dibuja la cabeza.", hint: "Haz una curva." },
    { id: "ears", spoken: "Dibuja las orejas.", hint: "Haz dos puntas." },
  ] },
  { id: "dog", steps: [
    { id: "face", spoken: "Dibuja la cara.", hint: "Haz una forma redonda." },
  ] },
];
const sample = "Hola, vamos a dibujar.";
const bytes = Buffer.from("A fixture for a content-addressed audio asset.");
const digest = createHash("sha256").update(bytes).digest("hex");
const source = `/narration/clip-${digest}.mp3`;

// Run the actual packaging entry point in a disposable miniature project. This
// exercises its file reads, validation and packaging order without touching
// real release assets or invoking any generation or activation command.
function fixture(t, selected = ["cat"]) {
  const root = mkdtempSync(path.join(tmpdir(), "drawingteacher-spanish-build-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ["scripts", "src", "config", "dist/client/narration"])
    mkdirSync(path.join(root, dir), { recursive: true });
  copyFileSync(new URL("../scripts/prepare-build.mjs", import.meta.url), path.join(root, "scripts/prepare-build.mjs"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(path.join(root, "src/lesson-catalogue.js"), `export const LESSONS = ${JSON.stringify(lessons)};\n`);
  writeFileSync(path.join(root, "src/spanish-lessons.js"), "export const localizeLesson = (lesson) => lesson;\n");
  writeFileSync(path.join(root, "src/spanish-narration-sample.txt"), `${sample}\n`);
  writeFileSync(path.join(root, "config/security.js"), 'export const securityHeaders = {"X-Fixture": "yes"};\n');
  writeFileSync(path.join(root, "vercel.json"), JSON.stringify({ headers: [{ source: "/(.*)", headers: [{key: "X-Fixture", value: "yes"}] }] }));
  writeFileSync(path.join(root, "dist/client/index.html"), "<html>fixture</html>\n");
  writeFileSync(path.join(root, "dist/client", source.slice(1)), bytes);

  const data = {
    root,
    availability: { schemaVersion: 1, locale: "es-419", lessons: [...selected] },
    index: {},
    durations: {},
    manifest: selected.length ? {
      schemaVersion: 3, locale: "es-419", provider: "ElevenLabs", selectedVoiceId: "fixture-voice",
      coveredLessons: [...selected], clips: {},
    } : undefined,
  };
  if (selected.length) {
    const texts = new Map([["sample", sample]]);
    for (const lesson of lessons.filter((item) => selected.includes(item.id))) {
      for (const step of lesson.steps) {
        texts.set(`${lesson.id}/${step.id}/instruction`, step.spoken);
        texts.set(`${lesson.id}/${step.id}/hint`, step.hint);
      }
    }
    for (const [key, text] of texts) {
      data.index[key] = source;
      data.durations[key] = 1235;
      data.manifest.clips[key] = {
        src: source, sha256: digest, bytes: bytes.length, duration: 1.2345,
        provider: "ElevenLabs", voiceId: "fixture-voice", text,
      };
    }
  }
  data.save = () => {
    for (const [name, value] of [
      ["narration-availability.es-419.json", data.availability],
      ["narration-index.es-419.json", data.index],
      ["narration-durations.es-419.json", data.durations],
      ["narration-manifest.es-419.json", data.manifest],
    ]) {
      if (value !== undefined) writeFileSync(path.join(root, "src", name), `${JSON.stringify(value)}\n`);
    }
  };
  data.file = (relative) => path.join(root, relative);
  data.run = () => spawnSync(process.execPath, ["scripts/prepare-build.mjs"], {
    cwd: root, encoding: "utf8",
  });
  return data;
}

test("Static packaging supports an empty English-only release", (t) => {
  const f = fixture(t, []);
  f.save();
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(f.file("dist/validated.json")));
  assert.ok(existsSync(f.file("dist/client/index.html")));
});

test("Static packaging accepts complete partial Spanish metadata and shared assets", (t) => {
  const f = fixture(t, ["cat", "dog"]);
  f.save();
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(f.file("dist/validated.json")));
  assert.ok(existsSync(f.file(`dist/client${source}`)));
});

test("Additional locales validate voice, source text and complete audio independently", (t) => {
  const f = fixture(t, ["cat", "dog"]);
  f.save();
  const locale = "en-IE", voice = "t6WJWTYTryhcQnrBHdCr";
  writeFileSync(f.file("src/narration-sample.en.txt"), `${sample}\n`);
  const files = {
    [`narration-availability.${locale}.json`]: { schemaVersion: 1, locale, lessons: ["cat", "dog"] },
    [`narration-index.${locale}.json`]: f.index,
    [`narration-durations.${locale}.json`]: f.durations,
    [`narration-manifest.${locale}.json`]: { ...f.manifest, locale, selectedVoiceId: voice,
      clips: Object.fromEntries(Object.entries(f.manifest.clips).map(([key, clip]) => [key, { ...clip, voiceId: voice }])) },
  };
  const save = () => Object.entries(files).forEach(([name, value]) => writeFileSync(f.file(`src/${name}`), JSON.stringify(value)));
  save();
  assert.equal(f.run().status, 0);
  files[`narration-availability.${locale}.json`].lessons = ["cat"]; save();
  assert.notEqual(f.run().status, 0, "a partial catalogue must not be released");
  files[`narration-availability.${locale}.json`].lessons = ["cat", "dog"];
  const manifest = files[`narration-manifest.${locale}.json`];
  manifest.clips["cat/head/instruction"].voiceId = "other-voice"; save();
  assert.notEqual(f.run().status, 0, "wrong locale voice must fail the build");
  manifest.clips["cat/head/instruction"].voiceId = voice;
  manifest.clips["cat/head/instruction"].text = "stale text"; save();
  assert.notEqual(f.run().status, 0, "stale transcript must fail the build");
  manifest.clips["cat/head/instruction"].text = lessons[0].steps[0].spoken;
  delete files[`narration-index.${locale}.json`]["cat/head/hint"]; save();
  assert.notEqual(f.run().status, 0, "missing clips must fail the build");
});

test("French release requires the current source-linked editorial export", (t) => {
  const f = fixture(t, ["cat", "dog"]);
  f.save();
  const locale = "fr-FR", voice = "tKaoyJLW05zqV0tIH9FD", reviewStatus = "assistant-reviewed-awaiting-native-human-review";
  const reviewed = { cat: { title: "Chat" }, dog: { title: "Chien" } };
  writeFileSync(f.file("src/narration-sample.fr-FR.txt"), `${sample}\n`);
  writeFileSync(f.file("src/french-lessons.js"), "export const localizeLesson = (lesson) => lesson;\n");
  writeFileSync(f.file("src/french-lessons.fr-FR.json"), JSON.stringify({ locale, reviewStatus, lessons: reviewed }));
  writeFileSync(f.file("scripts/export-reviewed-french.mjs"), `console.log(${JSON.stringify(JSON.stringify({locale, count:2, reviewStatus, lessons:reviewed}))});\n`);
  const files = {
    [`narration-availability.${locale}.json`]: { schemaVersion: 1, locale, lessons: ["cat", "dog"] },
    [`narration-index.${locale}.json`]: f.index,
    [`narration-durations.${locale}.json`]: f.durations,
    [`narration-manifest.${locale}.json`]: { ...f.manifest, locale, selectedVoiceId: voice,
      clips: Object.fromEntries(Object.entries(f.manifest.clips).map(([key, clip]) => [key, { ...clip, voiceId: voice }])) },
  };
  for (const [name, value] of Object.entries(files)) writeFileSync(f.file(`src/${name}`), JSON.stringify(value));
  assert.equal(f.run().status, 0);
  writeFileSync(f.file("src/french-lessons.fr-FR.json"), JSON.stringify({ locale, reviewStatus, lessons: {} }));
  assert.notEqual(f.run().status, 0, "stale French source must fail the build");
});

test("Spain release requires its exact current text, UI, voice and complete audio", (t) => {
  const f = fixture(t, ["cat", "dog"]); f.save();
  const locale = "es-ES", voice = "BkOojM1ZhtSAHgsAkMx2", reviewStatus = "assistant-draft-awaiting-native-human-review";
  const reviewed = { cat: { title: "Gato" }, dog: { title: "Perro" } }, strings = { "Help": "Ayuda" };
  writeFileSync(f.file("src/narration-sample.es-ES.txt"), `${sample}\n`);
  writeFileSync(f.file("src/spanish-spain-lessons.js"), "export const localizeLesson = (lesson) => lesson;\n");
  writeFileSync(f.file("src/spanish-lessons.es-ES.json"), JSON.stringify({ locale, reviewStatus, lessons: reviewed }));
  writeFileSync(f.file("src/spanish-ui.es-ES.json"), JSON.stringify(strings));
  mkdirSync(f.file("research/spanish-spain-draft"), { recursive: true });
  writeFileSync(f.file("research/spanish-spain-draft/dynamic.es-ES.js"), "export const copy = 'draft';\n");
  writeFileSync(f.file("src/spanish-spain-dynamic.js"), "export const copy = 'draft';\n");
  const exported = { locale, count: 2, reviewStatus, lessons: reviewed, strings, sample };
  writeFileSync(f.file("scripts/export-spain-lessons.mjs"), `console.log(${JSON.stringify(JSON.stringify(exported))});\n`);
  const files = {
    [`narration-availability.${locale}.json`]: { schemaVersion: 1, locale, lessons: ["cat", "dog"] },
    [`narration-index.${locale}.json`]: f.index,
    [`narration-durations.${locale}.json`]: f.durations,
    [`narration-manifest.${locale}.json`]: { ...f.manifest, locale, selectedVoiceId: voice,
      clips: Object.fromEntries(Object.entries(f.manifest.clips).map(([key, clip]) => [key, { ...clip, voiceId: voice }])) },
  };
  for (const [name, value] of Object.entries(files)) writeFileSync(f.file(`src/${name}`), JSON.stringify(value));
  assert.equal(f.run().status, 0);
  writeFileSync(f.file("src/spanish-ui.es-ES.json"), JSON.stringify({ Help: "Cambiada" }));
  assert.notEqual(f.run().status, 0, "stale Spain UI must fail the build");
  writeFileSync(f.file("src/spanish-ui.es-ES.json"), JSON.stringify(strings));
  writeFileSync(f.file("src/spanish-spain-dynamic.js"), "export const copy = 'changed';\n");
  assert.notEqual(f.run().status, 0, "stale Spain accessibility labels must fail the build");
  writeFileSync(f.file("src/spanish-spain-dynamic.js"), "export const copy = 'draft';\n");
  const manifest = { ...files[`narration-manifest.${locale}.json`], selectedVoiceId: "another-voice" };
  writeFileSync(f.file(`src/narration-manifest.${locale}.json`), JSON.stringify(manifest));
  assert.notEqual(f.run().status, 0, "a different voice must fail the build");
});

for (const [locale, prefix, voice] of [
  ["de-DE", "german", "5bVYvsqKAWO1hDgOO72l"],
  ["it-IT", "italian", "wOXFTxgu7FQDBb1dsL7I"],
]) test(`${locale} release requires source-matched text, UI and selected voice`, (t) => {
  const f = fixture(t, ["cat", "dog"]); f.save();
  const reviewStatus = "assistant-draft-awaiting-native-human-review", reviewed = { cat: { title: "Cat" }, dog: { title: "Dog" } };
  const strings = { Help: "Localised" };
  writeFileSync(f.file(`src/narration-sample.${locale}.txt`), `${sample}\n`);
  writeFileSync(f.file(`src/${prefix}-lessons.js`), "export const localizeLesson = (lesson) => lesson;\n");
  writeFileSync(f.file(`src/${prefix}-lessons.${locale}.json`), JSON.stringify({ locale, reviewStatus, lessons: reviewed }));
  writeFileSync(f.file(`src/${prefix}-ui.${locale}.json`), JSON.stringify(strings));
  const dynamicDir = locale === "de-DE" ? "research/german-draft" : "research/italian-pilot";
  const dynamicFile = locale === "de-DE" ? "dynamic.de-DE.js" : "dynamic.it-IT.mjs";
  mkdirSync(f.file(dynamicDir), { recursive: true });
  writeFileSync(f.file(`${dynamicDir}/${dynamicFile}`), "export const copy = 'draft';\n");
  writeFileSync(f.file(`src/${prefix}-dynamic.js`), "export const copy = 'draft';\n");
  if (locale === "it-IT") {
    writeFileSync(f.file(`${dynamicDir}/dynamic.it-IT.json`), JSON.stringify({ templates: {} }));
    writeFileSync(f.file("src/dynamic.it-IT.json"), JSON.stringify({ templates: {} }));
  }
  const exported = [{ locale, count: 2, reviewStatus, lessons: reviewed, strings, sample }];
  writeFileSync(f.file("scripts/export-german-italian.mjs"), `console.log(${JSON.stringify(JSON.stringify(exported))});\n`);
  const files = {
    [`narration-availability.${locale}.json`]: { schemaVersion: 1, locale, lessons: ["cat", "dog"] },
    [`narration-index.${locale}.json`]: f.index,
    [`narration-durations.${locale}.json`]: f.durations,
    [`narration-manifest.${locale}.json`]: { ...f.manifest, locale, selectedVoiceId: voice,
      clips: Object.fromEntries(Object.entries(f.manifest.clips).map(([key, clip]) => [key, { ...clip, voiceId: voice }])) },
  };
  for (const [name, value] of Object.entries(files)) writeFileSync(f.file(`src/${name}`), JSON.stringify(value));
  assert.equal(f.run().status, 0);
  writeFileSync(f.file(`src/${prefix}-ui.${locale}.json`), JSON.stringify({ Help: "Changed" }));
  assert.notEqual(f.run().status, 0, "stale UI must fail the build");
});

const failures = [
  ["unknown lesson", (f) => { f.availability.lessons = ["cat", "unknown"]; }],
  ["duplicate lesson", (f) => { f.availability.lessons = ["cat", "cat"]; }],
  ["unsorted lessons", (f) => { f.availability.lessons = ["dog", "cat"]; }],
  ["non-string lesson", (f) => { f.availability.lessons = [null]; }],
  ["bad descriptor schema", (f) => { f.availability.schemaVersion = 2; }],
  ["bad descriptor locale", (f) => { f.availability.locale = "en-GB"; }],
  ["malformed descriptor", (f) => { f.availability = []; }],
  ["malformed index", (f) => { f.index = null; }],
  ["malformed durations", (f) => { f.durations = []; }],
  ["missing sample", (f) => { delete f.index.sample; }],
  ["missing instruction", (f) => { delete f.index["cat/head/instruction"]; }],
  ["missing hint duration", (f) => { delete f.durations["cat/head/hint"]; }],
  ["extra unlisted lesson", (f) => { f.index["dog/face/instruction"] = source; }],
  ["extra duration", (f) => { f.durations.extra = 1235; }],
  ["missing manifest clip", (f) => { delete f.manifest.clips["cat/head/hint"]; }],
  ["extra manifest clip", (f) => { f.manifest.clips.extra = f.manifest.clips.sample; }],
  ["manifest lesson mismatch", (f) => { f.manifest.coveredLessons = ["dog"]; }],
  ["manifest schema mismatch", (f) => { f.manifest.schemaVersion = 1; }],
  ["manifest locale mismatch", (f) => { f.manifest.locale = "en-GB"; }],
  ["null manifest", (f) => { f.manifest = null; }],
  ["bad asset path", (f) => { f.index.sample = "/narration/../bad.mp3"; }],
  ["manifest source mismatch", (f) => { f.manifest.clips.sample.src = "/narration/other.mp3"; }],
  ["manifest hash mismatch", (f) => { f.manifest.clips.sample.sha256 = "0".repeat(64); }],
  ["manifest length mismatch", (f) => { f.manifest.clips.sample.bytes += 1; }],
  ["manifest text differs from current Spanish", (f) => { f.manifest.clips.sample.text = "Outdated sample"; }],
  ["manifest lesson text is stale", (f) => { f.manifest.clips["cat/head/instruction"].text = "Outdated instruction"; }],
  ["manifest voice mismatch", (f) => { f.manifest.clips.sample.voiceId = "another-voice"; }],
  ["manifest provider mismatch", (f) => { f.manifest.clips.sample.provider = "other"; }],
  ["duration disagrees with manifest", (f) => { f.durations.sample += 1; }],
  ["zero duration", (f) => { f.durations.sample = 0; }],
  ["fractional duration", (f) => { f.durations.sample = 1234.5; }],
  ["string duration", (f) => { f.durations.sample = "1235"; }],
  ["missing descriptor file", () => {}, (f) => unlinkSync(f.file("src/narration-availability.es-419.json"))],
  ["missing index file", () => {}, (f) => unlinkSync(f.file("src/narration-index.es-419.json"))],
  ["missing duration file", () => {}, (f) => unlinkSync(f.file("src/narration-durations.es-419.json"))],
  ["missing manifest file", () => {}, (f) => unlinkSync(f.file("src/narration-manifest.es-419.json"))],
  ["invalid JSON", () => {}, (f) => writeFileSync(f.file("src/narration-index.es-419.json"), "{")],
  ["missing audio", () => {}, (f) => unlinkSync(f.file(`dist/client${source}`))],
  ["modified audio", () => {}, (f) => writeFileSync(f.file(`dist/client${source}`), "different bytes")],
];

for (const [name, mutate, afterSave] of failures) {
  test(`Static packaging rejects ${name}`, (t) => {
    const f = fixture(t);
    mutate(f);
    f.save();
    afterSave?.(f);
    const result = f.run();
    assert.notEqual(result.status, 0, `unexpected success: ${result.stdout}`);
    assert.ok(existsSync(f.file("dist/client/index.html")), "validation must run before packaging");
    assert.ok(!existsSync(f.file("dist/validated.json")));
  });
}

test("Static packaging rejects a malformed manifest even for an empty release", (t) => {
  const f = fixture(t, []);
  f.manifest = null;
  f.save();
  const result = f.run();
  assert.notEqual(result.status, 0, "a present null manifest is malformed");
});

test("Static packaging rejects narration left behind in an empty release", (t) => {
  const f = fixture(t, []);
  f.index.sample = source;
  f.durations.sample = 1235;
  f.save();
  const result = f.run();
  assert.notEqual(result.status, 0, "empty availability must not ship extra indexed narration");
});
