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
