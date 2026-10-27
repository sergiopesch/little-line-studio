import { test } from "node:test";
import assert from "node:assert/strict";
import { StudioAudio } from "../src/audio.js";
import narrationIndex from "../src/narration-index.json" with { type: "json" };

const [first, second] = [...new Set(Object.values(narrationIndex))];

class Media {
  paused = true;
  plays = 0;
  assignments = 0;
  loads = 0;
  error = null;
  _src = "";

  get src() { return this._src; }
  set src(value) {
    this.assignments++;
    this._src = value;
  }
  play() {
    this.plays++;
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  load() { this.loads++; }
  removeAttribute(name) {
    if (name === "src") this._src = "";
  }
}

test("preparation accepts only an authored clip and never plays it", () => {
  const audio = new StudioAudio();
  const media = new Media();
  audio.attachNarration(media);
  try {
    for (const invalid of [
      "https://example.com/voice.mp3",
      `/narration/clip-${"0".repeat(64)}.mp3`,
      `${first}?extra=1`,
      undefined,
    ]) {
      assert.equal(audio.prepareClip(invalid), false);
      assert.equal(media.src, "");
      assert.equal(media.plays, 0);
    }
    assert.equal(audio.prepareClip(first), true);
    assert.equal(media.src, first);
    assert.equal(media.paused, true);
    assert.equal(media.plays, 0);
    assert.equal(audio.prepareClip(first), true);
    assert.equal(media.assignments, 1);
    assert.equal(media.loads, 0);
  } finally {
    audio.dispose();
  }
});

test("play reuses a prepared clip and cancellation or replacement clears it", async () => {
  const audio = new StudioAudio();
  const media = new Media();
  audio.attachNarration(media);
  try {
    audio.prepareClip(first);
    const assignments = media.assignments;
    const loads = media.loads;
    assert.equal(await audio.playClip(first), true);
    assert.equal(media.assignments, assignments);
    assert.equal(media.loads, loads);
    assert.equal(media.plays, 1);
    audio.stopAll();
    assert.equal(media.src, "");
    assert.equal(media.paused, true);

    audio.prepareClip(first);
    audio.stopAll();
    assert.equal(media.src, "");

    audio.prepareClip(first);
    audio.prepareClip(second);
    assert.equal(media.src, second);
    const before = media.assignments;
    assert.equal(await audio.playClip(first), true);
    assert.equal(media.assignments, before + 1);
    assert.equal(media.src, first);
  } finally {
    audio.dispose();
  }
});
