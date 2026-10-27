import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LESSONS } from "../src/lesson-catalogue.js";
import { localizeLesson } from "../src/spanish-lessons.js";
import { getLanguage } from "../src/languages.js";
import { releasedLessons } from "../src/narration-locales.js";

const cwd = new URL("..", import.meta.url);
const script = "scripts/elevenlabs-audio.py";
const voice = "gBXbHGNePmWl9WrdHoCH";
const args = [script, "--locale", "es-419", "--kind", "speech", "--model-id", "eleven_v4", "--voice-id", voice, "--sample-only"];

function withSampleFixture(run) {
  const root = mkdtempSync(join(tmpdir(), "drawingteacher-spanish-plan-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "src"));
    copyFileSync(new URL("../scripts/elevenlabs-audio.py", import.meta.url), join(root, script));
    copyFileSync(new URL("../scripts/elevenlabs_credit_budget.py", import.meta.url), join(root, "scripts/elevenlabs_credit_budget.py"));
    copyFileSync(new URL("../src/spanish-narration-sample.txt", import.meta.url), join(root, "src/spanish-narration-sample.txt"));
    const env = { ...process.env };
    delete env.ELEVENLABS_API_KEY;
    return run(root, env);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("Spanish audition plan is isolated, identifies the voice and uses its canonical sample", () => {
  withSampleFixture((root, env) => {
    const result = spawnSync("python3", args, { cwd: root, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.mode, "dry-run-no-network");
    const planPath = join(root, "media/elevenlabs/plan-es-419.json");
    assert.equal(output.plan, planPath);
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    assert.equal(plan.locale, "es-419");
    assert.equal(plan.voiceId, voice);
    assert.deepEqual(Object.keys(plan.entries), ["sample"]);
    const request = plan.requests[plan.entries.sample];
    assert.equal(request.payload.inputs[0].text, readFileSync(new URL("../src/spanish-narration-sample.txt", import.meta.url), "utf8").trim());
    assert.equal(request.payload.inputs[0].voice_id, voice);
    assert.equal(request.payload.language_code, "es");
  });
});

test("Spanish generation requires the review assertion before any provider request", () => {
  withSampleFixture((root, env) => {
    const result = spawnSync("python3", [...args, "--generate"], { cwd: root, env, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /reviewed-spanish/);
    assert.equal(existsSync(join(root, "media/elevenlabs/plan-es-419.json")), false);
  });
});

test("full Spanish export uses every source-linked editorial lesson, not the machine draft", () => {
  const result = spawnSync("node", ["scripts/export-reviewed-spanish.mjs"], { cwd, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.count, 30);
  assert.equal(Object.keys(data.lessons).length, 30);
  assert.equal(Object.keys(data.texts).length, 1460);
  const cat = JSON.parse(readFileSync(new URL("../research/spanish-reviewed/basic/cat.es-419.json", import.meta.url), "utf8"));
  assert.equal(data.texts["cat/round-head/instruction"], cat.lesson.steps["round-head"].spoken);
  assert.equal(data.reviewStatus, "assistant-reviewed-awaiting-native-human-review");
  const bundled = JSON.parse(readFileSync(new URL("../src/spanish-lessons.es-419.json", import.meta.url), "utf8"));
  assert.deepEqual(bundled.lessons, data.lessons, "regenerate the Spanish catalogue after reviewed source changes");
  assert.equal(getLanguage("es-419").ready, releasedLessons("es-419").length > 0);
  for (const lesson of LESSONS) {
    const translated = localizeLesson(lesson, "es-419");
    assert.equal(translated.strokes, lesson.strokes);
    assert.equal(translated.appearance, lesson.appearance);
    for (const [index, step] of translated.steps.entries()) {
      assert.equal(step.id, lesson.steps[index].id);
      assert.equal(step.quietMs, lesson.steps[index].quietMs);
      assert.equal(step.canSkip, lesson.steps[index].canSkip);
      assert.equal(step.stroke, lesson.steps[index].stroke);
    }
  }
});
