import { test } from "node:test";
import assert from "node:assert/strict";
import { StudioAudio } from "../src/audio.js";

test("music requires opt-in, blocks scheduling during safety interruptions, and disposes", async () => {
  const previous = globalThis.AudioContext;
  let created = 0,
    notes = 0,
    stopped = 0,
    closed = 0;
  class Context {
    state = "running";
    currentTime = 0;
    constructor() {
      created++;
    }
    createGain() {
      return {
        gain: {
          value: 0,
          cancelScheduledValues() {},
          setTargetAtTime() {},
          setValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
      };
    }
    createOscillator() {
      notes++;
      return {
        frequency: { value: 0 },
        connect() {},
        disconnect() {},
        start() {},
        stop() {
          stopped++;
        },
      };
    }
    async resume() {}
    async close() {
      closed++;
      this.state = "closed";
    }
  }
  globalThis.AudioContext = Context;
  const audio = new StudioAudio();
  try {
    assert.equal(audio.musicEnabled, false);
    assert.equal(created, 0);
    audio.setBlocked(true);
    await audio.enableMusic();
    assert.equal(created, 1);
    assert.equal(notes, 0);
    audio.setBlocked(false);
    assert.equal(notes, 1);
    audio.setBlocked(true);
    assert.ok(stopped > 0);
    audio.setMusicEnabled(false);
    assert.equal(audio.musicEnabled, false);
    audio.dispose();
    assert.equal(closed, 1);
  } finally {
    audio.dispose();
    globalThis.AudioContext = previous;
  }
});

test("remote or unavailable voices never receive instruction text", async () => {
  const oldSynth = globalThis.speechSynthesis,
    oldUtterance = globalThis.SpeechSynthesisUtterance;
  let sent = 0,
    finished = 0;
  globalThis.speechSynthesis = {
    getVoices: () => [{ localService: false, lang: "en-GB" }],
    speak() {
      sent++;
    },
    cancel() {},
  };
  globalThis.SpeechSynthesisUtterance = class {};
  const audio = new StudioAudio();
  try {
    assert.equal(
      await audio.speak("Reviewed instruction", () => finished++),
      false,
    );
    assert.equal(sent, 0);
    assert.equal(finished, 1);
  } finally {
    audio.dispose();
    globalThis.speechSynthesis = oldSynth;
    globalThis.SpeechSynthesisUtterance = oldUtterance;
  }
});

test("canceling local speech finishes exactly once and ignores a late completion", async () => {
  const oldSynth = globalThis.speechSynthesis,
    oldUtterance = globalThis.SpeechSynthesisUtterance;
  let utterance,
    finished = 0;
  globalThis.speechSynthesis = {
    getVoices: () => [{ localService: true, lang: "en-GB" }],
    speak(u) {
      utterance = u;
    },
    cancel() {},
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  const audio = new StudioAudio();
  try {
    assert.equal(await audio.speak("Take your time.", () => finished++), true);
    const late = utterance.onend;
    audio.stopSpeech();
    late();
    assert.equal(finished, 1);
  } finally {
    audio.dispose();
    globalThis.speechSynthesis = oldSynth;
    globalThis.SpeechSynthesisUtterance = oldUtterance;
  }
});

test("a broken local speech inventory gracefully falls back to written instructions", async () => {
  const oldSynth = globalThis.speechSynthesis,
    oldUtterance = globalThis.SpeechSynthesisUtterance;
  globalThis.speechSynthesis = {
    getVoices() {
      throw new Error("voice inventory failed");
    },
  };
  globalThis.SpeechSynthesisUtterance = class {};
  const audio = new StudioAudio();
  let ended = 0;
  try {
    assert.equal(await audio.speak("Try a little line.", () => ended++), false);
    assert.equal(ended, 1);
  } finally {
    audio.dispose();
    globalThis.speechSynthesis = oldSynth;
    globalThis.SpeechSynthesisUtterance = oldUtterance;
  }
});

test("a failing cancel operation cannot strand the narration lifecycle", async () => {
  const oldSynth = globalThis.speechSynthesis,
    oldUtterance = globalThis.SpeechSynthesisUtterance;
  globalThis.speechSynthesis = {
    getVoices: () => [{ localService: true, lang: "en-GB" }],
    speak() {},
    cancel() {
      throw new Error("cancel failed");
    },
  };
  globalThis.SpeechSynthesisUtterance = class {};
  const audio = new StudioAudio();
  let ended = 0;
  try {
    assert.equal(await audio.speak("Take your time.", () => ended++), true);
    assert.doesNotThrow(() => audio.stopSpeech());
    assert.equal(ended, 1);
    assert.equal(audio._speech, null);
  } finally {
    audio.dispose();
    globalThis.speechSynthesis = oldSynth;
    globalThis.SpeechSynthesisUtterance = oldUtterance;
  }
});
