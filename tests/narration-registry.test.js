import test from "node:test";
import assert from "node:assert/strict";
import { StudioAudio } from "../src/audio.js";
import { createLatestLanguageRequest, loadSpanishLanguage } from "../src/language-loading.js";
import {
  authorizeSpanishNarration,
  createNarrationRegistry,
  createSpanishNarrationRegistry,
  isSpanishAuthoredClip,
  loadSpanishNarration,
} from "../src/narration-registry.js";

const SAMPLE = `/narration/clip-${"a".repeat(64)}.mp3`;
const UNRELATED = `/narration/clip-${"b".repeat(64)}.mp3`;

test("overlapping same-locale loads do not invalidate a newer verified result", async () => {
  const callbacks = [];
  const registry = createNarrationRegistry(() => new Promise((resolve) => callbacks.push(resolve)));
  const old = registry.load();
  const current = registry.load();
  const selected = { index: { sample: SAMPLE }, durations: {} };
  callbacks[1](selected);
  assert.equal(await current, selected);
  callbacks[0]({ index: { sample: UNRELATED }, durations: {} });
  await old;
  assert.equal(registry.authorize(selected), true);
  assert.equal(registry.contains(SAMPLE), true);
  assert.equal(registry.contains(UNRELATED), false);
});

test("failed and superseded Spanish loads cannot authorize clips", async () => {
  const module = { index: { sample: SAMPLE, invalid: "https://example.com/voice.mp3" }, durations: {} };
  const registry = createSpanishNarrationRegistry(async () => module);
  const request = createLatestLanguageRequest();
  const handlers = {
    onStart() {},
    onSuccess: (result) => assert.equal(registry.authorize(result.narration), true),
    onError() {},
  };
  const failed = await request.run(() => loadSpanishLanguage([{ id: "cat" }], {
    loadText: async () => { throw new Error("offline"); },
    loadNarration: () => registry.load(),
  }), handlers);
  assert.equal(failed, false);
  assert.equal(registry.contains(SAMPLE), false);

  let finishText;
  const pending = request.run(() => loadSpanishLanguage([{ id: "cat" }], {
    loadText: () => new Promise((resolve) => { finishText = resolve; }),
    loadNarration: () => registry.load(),
    validate: () => ({ ready: true }),
  }), handlers);
  request.cancel();
  finishText({ localizeLesson: (lesson) => lesson, localizedLessonTitle: () => "Gato" });
  assert.equal(await pending, false);
  assert.equal(registry.contains(SAMPLE), false);

  assert.equal(registry.authorize({ ...module }), false, "A lookalike cannot register caller-supplied paths");
  assert.equal(registry.authorize(module), true);
  assert.equal(registry.contains(SAMPLE), true);
  assert.equal(registry.contains(UNRELATED), false);
  assert.equal(registry.contains("https://example.com/voice.mp3"), false);
});

test("the verified bundled sample and first instruction can play immediately after authorization", async (context) => {
  const narration = await loadSpanishNarration();
  const instruction = Object.entries(narration.index).find(([key]) => key.endsWith("/instruction"))?.[1];
  if (!narration.index.sample || !instruction) {
    context.skip("No Spanish narration is active in this checkout");
    return;
  }
  const media = {
    paused: true, src: "", plays: 0,
    play() { this.paused = false; this.plays++; return Promise.resolve(); },
    pause() { this.paused = true; },
    removeAttribute(name) { if (name === "src") this.src = ""; },
    load() {},
  };
  const audio = new StudioAudio();
  audio.attachNarration(media);
  try {
    assert.equal(isSpanishAuthoredClip(narration.index.sample), false);
    assert.equal(audio.prepareClip(narration.index.sample), false);
    assert.equal(authorizeSpanishNarration(narration), true);
    for (const source of [narration.index.sample, instruction]) {
      assert.equal(audio.prepareClip(source), true);
      assert.equal(await audio.playClip(source), true);
      assert.equal(media.src, source);
      audio.stopSpeech();
    }
    assert.equal(media.plays, 2);
    assert.equal(await audio.playClip(UNRELATED), false);
  } finally {
    audio.dispose();
  }
});
