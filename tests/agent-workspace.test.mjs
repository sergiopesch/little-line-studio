import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createAgentWorkspace } from "../src/agent/workspace.ts";
import { createPublicCatalogue } from "../src/agent/catalogue.js";
import { parseRequest, REQUEST_BYTE_LIMIT } from "../src/agent/protocol.ts";
import { createLessonEngine } from "../src/core/lesson-engine.ts";
import { createScriptedSession, getStepTiming, scriptedSessionReducer } from "../src/scripted-session.js";
import { LESSONS } from "../src/lesson-catalogue.js";
import { LOCALES } from "../src/locale-registry.js";

const grant = () => ({ operations: ["list_lessons", "inspect_lesson", "rehearse_lesson"], locales: ["en-GB"], lessonIds: ["cat"] });
const inspect = { version: 1, operation: "inspect_lesson", locale: "en-GB", lessonId: "cat" };
const rehearsal = { ...inspect, operation: "rehearse_lesson", speed: "slow", still: false, voice: true };

test("agent requests reject unknown fields, versions, inherited authority and malformed input", () => {
  for (const input of [null, [], "inspect", 1, {}, { ...inspect, version: 2 },
    { ...inspect, supervised: true }, { ...inspect, role: "parent" }, { ...inspect, operations: ["publish"] },
    { ...inspect, operation: "START" }, { ...inspect, operation: "generate_audio" },
    { ...inspect, locale: "../secrets" }, { ...inspect, lessonId: "../cat" },
    { ...inspect, lessonId: "x".repeat(81) }, { ...inspect, locale: "x".repeat(41) },
    { ...rehearsal, voice: "true" }, { ...rehearsal, speed: "instant" },
    Object.create(inspect), { ...inspect, [Symbol("authority")]: true }, JSON.parse('{"version":1,"operation":"describe","__proto__":{"role":"parent"}}'),
    Object.defineProperty({}, "version", { get() { throw Error("must not execute"); } }),
  ]) assert.equal(parseRequest(input), null);
  assert.deepEqual(parseRequest(inspect), inspect);
  assert.deepEqual(parseRequest(rehearsal), rehearsal);
});

test("closed-by-default grants deny before invoking a catalogue and never echo input", async () => {
  let called = 0;
  const catalogue = { list() { called++; }, load() { called++; } };
  const workspace = createAgentWorkspace(catalogue, { operations: [], locales: [], lessonIds: [] });
  const descriptor = await workspace.request({ version: 1, operation: "describe" });
  assert.equal(descriptor.ok, true);
  assert.deepEqual(descriptor.result.permissions, { operations: [], locales: [], lessonIds: [] });
  for (const command of [inspect, rehearsal, { version: 1, operation: "list_lessons", locale: "en-GB" }])
    assert.equal((await workspace.request(command)).error.code, "NOT_ALLOWED");
  const invalid = await workspace.request({ ...inspect, token: "secret-canary" });
  assert.equal(invalid.error.code, "INVALID_REQUEST");
  assert.doesNotMatch(JSON.stringify(invalid), /secret-canary|token/);
  assert.equal(called, 0);
});

test("host scope is snapshotted, each dimension is enforced, and revocation is permanent", async () => {
  const hostGrant = grant();
  const workspace = createAgentWorkspace(createPublicCatalogue(), hostGrant);
  hostGrant.locales.push("de-DE"); hostGrant.lessonIds.push("sun");
  for (const command of [{ ...inspect, locale: "de-DE" }, { ...inspect, lessonId: "sun" }])
    assert.equal((await workspace.request(command)).error.code, "NOT_ALLOWED");
  const list = await workspace.request({ version: 1, operation: "list_lessons", locale: "en-GB" });
  assert.deepEqual(list.result.lessons.map(lesson => lesson.id), ["cat"]);
  const result = await workspace.request(inspect);
  assert.equal(result.result.steps[0].spoken, LESSONS[0].steps[0].spoken);
  result.result.steps[0].spoken = "changed by caller";
  assert.notEqual((await workspace.request(inspect)).result.steps[0].spoken, "changed by caller");
  workspace.revoke();
  for (const command of [inspect, rehearsal, { version: 1, operation: "describe" }])
    assert.equal((await workspace.request(command)).error.code, "REVOKED");
  const readOnly = createAgentWorkspace(createPublicCatalogue(), { ...grant(), operations: ["list_lessons"] });
  assert.equal((await readOnly.request(inspect)).error.code, "NOT_ALLOWED");
});

test("revocation suppresses in-flight results and failures do not expose internal details", async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const workspace = createAgentWorkspace({ load: () => pending }, grant());
  const request = workspace.request(inspect);
  workspace.revoke(); resolve({ lesson: LESSONS[0], durations: {} });
  assert.equal((await request).error.code, "REVOKED");
  for (const load of [() => { throw Error("provider-secret-canary"); }, () => ({ lesson: LESSONS[1], durations: {} })]) {
    const result = await createAgentWorkspace({ load }, grant()).request(inspect);
    assert.equal(result.error.code, "UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(result), /provider-secret-canary/);
  }
});

test("inspection projects public authored text without future private or provider fields", async () => {
  const lesson = { ...LESSONS[0], privateField: "secret-canary",
    steps: LESSONS[0].steps.map(step => ({ ...step, providerReceipt: "secret-canary" })) };
  const workspace = createAgentWorkspace({ load: () => ({ lesson, durations: {} }) }, grant());
  const result = await workspace.request(inspect);
  assert.equal(result.ok, true);
  assert.doesNotMatch(JSON.stringify(result), /secret-canary|privateField|providerReceipt|voiceId|sampleFile/);
});

test("every released locale and lesson uses the same text and timing as the family catalogue", async () => {
  const catalogue = createPublicCatalogue();
  const workspace = createAgentWorkspace(catalogue, {
    operations: ["list_lessons", "inspect_lesson", "rehearse_lesson"],
    locales: LOCALES.map(locale => locale.id), lessonIds: LESSONS.map(lesson => lesson.id),
  });
  for (const locale of LOCALES) {
    const list = await workspace.request({ version: 1, operation: "list_lessons", locale: locale.id });
    assert.equal(list.ok, true, locale.id);
    assert.equal(list.result.lessons.length, LESSONS.length, locale.id);
    const text = await locale.loadText();
    for (const source of LESSONS) {
      const inspected = await workspace.request({ ...inspect, locale: locale.id, lessonId: source.id });
      assert.equal(inspected.ok, true, `${locale.id}/${source.id}`);
      const localized = text.localizeLesson(source, locale.id);
      assert.equal(inspected.result.title, localized.title);
      assert.deepEqual(inspected.result.steps.map(step => step.spoken), localized.steps.map(step => step.spoken));
      for (const options of [{ speed: "slow", still: false, voice: true }, { speed: "slower", still: true, voice: false }]) {
        const result = await workspace.request({ ...rehearsal, locale: locale.id, lessonId: source.id, ...options });
        assert.equal(result.ok, true, `${locale.id}/${source.id}/${options.voice}`);
        assert.equal(result.result.mode, "rehearsal");
        assert.equal(result.result.supervision, "simulated");
        assert.equal(result.result.mediaPlayback, false);
        assert.equal(result.result.steps.length, localized.steps.length);
        assert.equal(result.result.steps.at(-1).outcome, "practice");
        assert.equal(result.result.steps.at(-1).timing.holdOpen, true);
        assert.equal(result.result.finalSelection.phase, "drawing");
        assert.equal(result.result.finalSelection.step, localized.steps.length - 1);
        const { durations } = await catalogue.load(locale.id, source.id);
        for (const [index, step] of result.result.steps.entries()) {
          assert.deepEqual(step.timing, getStepTiming(localized, index, {
            ...options, voiceDurationMs: options.voice ? durations[`${source.id}/${step.id}/instruction`] : 0,
          }));
        }
      }
    }
  }
});

test("core ignores malformed and inherited commands without executing accessors", () => {
  const engine = createLessonEngine(LESSONS);
  const playback = createScriptedSession({ lessonId: "cat", stepIndex: 0, timing: getStepTiming(LESSONS[0], 0) });
  for (const command of [null, undefined, [], "START", Object.create({ type: "OPEN_CATALOGUE", level: "basic" }),
    Object.defineProperty({}, "type", { get() { throw Error("must not execute"); } })]) {
    assert.equal(engine.reduce(engine.initialState, command), engine.initialState);
    assert.equal(scriptedSessionReducer(playback, command), playback);
  }
  const mutable = [{ ...LESSONS[0], steps: [...LESSONS[0].steps] }];
  const snapshot = createLessonEngine(mutable);
  mutable[0].id = "swapped"; mutable[0].steps.length = 0;
  const selected = snapshot.reduce(snapshot.reduce(snapshot.initialState, { type: "OPEN_CATALOGUE", level: "basic" }), { type: "SELECT_LESSON", lessonId: "cat" });
  assert.equal(selected.phase, "gate");
  assert.throws(() => createLessonEngine([LESSONS[0], LESSONS[0]]), /unique authored/);
});

test("CLI has bounded JSON input, explicit host grants and machine-readable failures", () => {
  function run(input, args = []) {
    const result = spawnSync(process.execPath, ["scripts/agent-workspace.mjs", ...args], {
      input, encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.stderr, "");
    return { ...result, response: JSON.parse(result.stdout) };
  }
  assert.equal(run(JSON.stringify(inspect)).response.error.code, "NOT_ALLOWED");
  assert.equal(run("{broken secret-canary}").response.error.code, "INVALID_JSON");
  assert.equal(run(" ".repeat(REQUEST_BYTE_LIMIT + 1)).response.error.code, "REQUEST_TOO_LARGE");
  assert.equal(run(Buffer.from([0xff, 0xfe])).response.error.code, "INVALID_JSON");
  assert.equal(run(JSON.stringify(inspect), ["--lesson", "../secret"]).response.error.code, "INVALID_CONFIGURATION");
  const allowed = run(JSON.stringify(inspect), ["--locale", "en-GB", "--lesson", "cat", "--allow", "inspect_lesson"]);
  assert.equal(allowed.status, 0);
  assert.equal(allowed.response.result.id, "cat");
  const normal = run(JSON.stringify({ version: 1, operation: "describe" }));
  assert.equal(normal.status, 0);
  assert.equal(normal.response.result.mode, "rehearsal-only");
});
