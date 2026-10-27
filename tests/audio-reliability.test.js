import test from "node:test";
import assert from "node:assert/strict";
import { StudioAudio } from "../src/audio.js";

async function withSpeechEngine(run, implementation = {}) {
  const previousSynth = globalThis.speechSynthesis;
  const previousUtterance = globalThis.SpeechSynthesisUtterance;
  const utterances = [];
  let canceled = 0;
  globalThis.speechSynthesis = {
    getVoices: () => [{ localService: true, lang: "en-GB" }],
    speak(utterance) { utterances.push(utterance); implementation.speak?.(utterance); },
    cancel() { canceled++; implementation.cancel?.(utterances.at(-1)); },
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; }
  };
  const audio = new StudioAudio();
  try {
    await run({ audio, utterances, canceled: () => canceled });
  } finally {
    audio.dispose();
    globalThis.speechSynthesis = previousSynth;
    globalThis.SpeechSynthesisUtterance = previousUtterance;
  }
}

test("an asynchronous engine error reports unavailable and completes only once", async () => {
  await withSpeechEngine(async ({ audio, utterances }) => {
    let ended = 0;
    const failures = [];
    assert.equal(await audio.speak("One little line.", () => ended++, (reason) => failures.push(reason)), true);
    const lateError = utterances[0].onerror;
    lateError();
    lateError();
    assert.deepEqual(failures, ["engine-error"]);
    assert.equal(ended, 1);
    assert.equal(audio._speech, null);
  });
});

test("a synchronous engine error also returns unavailable", async () => {
  await withSpeechEngine(async ({ audio }) => {
    const failures = [];
    assert.equal(await audio.speak("A small circle.", undefined, (reason) => failures.push(reason)), false);
    assert.deepEqual(failures, ["engine-error"]);
  }, { speak(utterance) { utterance.onerror(); } });
});

test("the speech watchdog reports timeout before cancellation and ignores late errors", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await withSpeechEngine(async ({ audio, utterances, canceled }) => {
    let ended = 0;
    const failures = [];
    await audio.speak("Take your time.", () => ended++, (reason) => failures.push(reason));
    const lateError = utterances[0].onerror;
    t.mock.timers.tick(15001);
    lateError();
    assert.deepEqual(failures, ["engine-timeout"]);
    assert.equal(canceled(), 1);
    assert.equal(ended, 1);
    assert.equal(audio._speech, null);
  }, { cancel(utterance) { utterance?.onerror?.(); throw new Error("failed engine cancellation"); } });
});

test("explicit cancellation and replaced utterances cannot report playback failure", async () => {
  await withSpeechEngine(async ({ audio, utterances }) => {
    const failures = [];
    let ended = 0;
    await audio.speak("First step.", () => ended++, (reason) => failures.push(reason));
    const staleError = utterances[0].onerror;
    await audio.speak("Next step.", () => ended++, (reason) => failures.push(reason));
    staleError();
    assert.equal(audio._speech.utterance, utterances[1]);
    audio.stopSpeech();
    assert.deepEqual(failures, []);
    assert.equal(ended, 2);
  });
});
