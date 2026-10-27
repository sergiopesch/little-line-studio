import test from "node:test";
import assert from "node:assert/strict";
import { createLatestLanguageRequest, loadSpanishLanguage } from "../src/language-loading.js";

test("Spanish text and narration load together, reject incomplete data, and can be retried", async () => {
  const lesson = { id: "cat" };
  const calls = [];
  let fail = true;
  const text = {
    localizeLesson: (value, locale) => { calls.push(`validate:${value.id}:${locale}`); return value; },
    localizedLessonTitle: () => "Gato",
  };
  const options = {
    loadText: async () => { calls.push("text"); return text; },
    loadNarration: async () => { calls.push("audio"); if (fail) throw new Error("offline"); return { index: {}, durations: {} }; },
    validate: () => ({ ready: true }),
  };
  await assert.rejects(loadSpanishLanguage([lesson], options), /offline/);
  assert.deepEqual(calls.slice(0, 2), ["text", "audio"]);
  fail = false;
  const loaded = await loadSpanishLanguage([lesson], options);
  assert.equal(loaded.localizeLesson, text.localizeLesson);
  assert.ok(calls.includes("validate:cat:es-419"));
  await assert.rejects(loadSpanishLanguage([lesson], { ...options, validate: () => ({ ready: false }) }), /could not be verified/);
});

test("a newer language selection or closing the picker makes older results inert", async () => {
  const gate = createLatestLanguageRequest();
  const events = [];
  let resolveFirst, rejectLast;
  const handlers = (name) => ({
    onStart: () => events.push(`${name}:start`),
    onSuccess: () => events.push(`${name}:success`),
    onError: () => events.push(`${name}:error`),
  });
  const first = gate.run(() => new Promise((resolve) => { resolveFirst = resolve; }), handlers("spanish"));
  const second = gate.run(() => Promise.resolve("english"), handlers("english"));
  assert.equal(await second, true);
  resolveFirst("spanish");
  assert.equal(await first, false);
  const last = gate.run(() => new Promise((_, reject) => { rejectLast = reject; }), handlers("closed"));
  gate.cancel();
  rejectLast(new Error("offline"));
  assert.equal(await last, false);
  assert.deepEqual(events, ["spanish:start", "english:start", "english:success", "closed:start"]);
});
