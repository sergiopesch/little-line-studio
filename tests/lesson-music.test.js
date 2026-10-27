import { test } from "node:test";
import assert from "node:assert/strict";
import musicIndex from "../src/music-index.json" with { type: "json" };
import lessonMusicIndex from "../src/lesson-music-index.json" with { type: "json" };
import narrationIndex from "../src/narration-index.json" with { type: "json" };
import { StudioAudio } from "../src/audio.js";

const BED = `/music/clip-${"a".repeat(64)}.mp3`;
const OTHER = `/music/clip-${"b".repeat(64)}.mp3`;

class Media {
  source = null;
  currentTime = 0;
  volume = 1;
  plays = 0;
  pauses = 0;
  pending = [];
  paused = true;
  set src(value) { this.source = value; }
  getAttribute() { return this.source; }
  removeAttribute() { this.source = null; }
  load() {}
  pause() { this.pauses++; this.paused = true; }
  play() {
    this.plays++;
    this.paused = false;
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
  }
}

function fixture(entries = { basic: BED, intermediate: OTHER }, lessonEntries = {}) {
  const original = { ...musicIndex };
  const originalLessons = { ...lessonMusicIndex };
  let audio;
  try {
    for (const key of Object.keys(musicIndex)) delete musicIndex[key];
    Object.assign(musicIndex, entries);
    for (const key of Object.keys(lessonMusicIndex)) delete lessonMusicIndex[key];
    Object.assign(lessonMusicIndex, lessonEntries);
    audio = new StudioAudio();
  } finally {
    for (const key of Object.keys(musicIndex)) delete musicIndex[key];
    Object.assign(musicIndex, original);
    for (const key of Object.keys(lessonMusicIndex)) delete lessonMusicIndex[key];
    Object.assign(lessonMusicIndex, originalLessons);
  }
  const media = new Media();
  let failures = 0;
  audio.attachMusic(media, () => failures++);
  return { audio, media, failures: () => failures };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
function envelopeClock(context) {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  return (milliseconds = 1300) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 20)
      context.mock.timers.tick(20);
  };
}

test("music fixtures preserve a populated production index and isolate omitted levels", () => {
  const original = { ...musicIndex };
  const populated = {
    basic: OTHER,
    intermediate: BED,
    expert: `/music/clip-${"c".repeat(64)}.mp3`,
    fixtureSentinel: "preserve-all-original-keys",
  };
  let audio;
  try {
    for (const key of Object.keys(musicIndex)) delete musicIndex[key];
    Object.assign(musicIndex, populated);
    ({ audio } = fixture({ basic: BED }));
    assert.deepEqual(musicIndex, populated);
    assert.deepEqual([...audio._musicAssets], [["basic", BED]],
      "An omitted production level cannot leak into fixture playback");
    audio.dispose();
    ({ audio } = fixture({ basic: "https://example.com/untrusted.mp3" }));
    assert.deepEqual(musicIndex, populated);
    assert.equal(audio._musicAssets.size, 0,
      "An invalid fixture cannot inherit valid production music");
  } finally {
    audio?.dispose();
    for (const key of Object.keys(musicIndex)) delete musicIndex[key];
    Object.assign(musicIndex, original);
  }
  assert.deepEqual(musicIndex, original);
});

test("authored lesson beds stay distinct and stale playback cannot replace the next selection", async (context) => {
  const advance = envelopeClock(context);
  const originalLessons = { ...lessonMusicIndex };
  const rainbow = `/music/clip-${"d".repeat(64)}.mp3`;
  const balloon = `/music/clip-${"c".repeat(64)}.mp3`;
  const { audio, media, failures } = fixture(undefined, { sun: OTHER, rainbow, balloon, cat: BED, unknown: OTHER });
  try {
    assert.deepEqual(lessonMusicIndex, originalLessons, "Override fixtures restore production metadata");
    assert.deepEqual([...audio._lessonMusicAssets.keys()].sort(), ["balloon", "cat", "rainbow", "sun"]);
    audio.selectMusic("basic", "sun");
    assert.equal(audio.musicEnabled, false);
    assert.equal(media.plays, 0);
    await audio.enableMusic();
    advance();
    assert.equal(media.source, OTHER);
    media.currentTime = 31;
    const staleSunError = media.onerror;
    audio.selectMusic("basic", "rainbow");
    assert.equal(media.source, rainbow);
    assert.equal(media.currentTime, 0);
    media.pending[0].reject(new Error("old Sun request"));
    staleSunError();
    await flush();
    assert.equal(media.source, rainbow);
    media.currentTime = 12;
    const staleRainbowError = media.onerror;
    audio.selectMusic("basic", "balloon");
    assert.equal(media.source, balloon);
    assert.equal(media.currentTime, 0);
    media.pending[1].reject(new Error("old Rainbow request"));
    staleRainbowError();
    await flush();
    assert.equal(media.source, balloon);
    assert.equal(audio.musicEnabled, true);
    const staleBalloonError = media.onerror;
    audio.selectMusic("basic", "cat");
    assert.equal(media.currentTime, 0);
    assert.equal(media.source, BED);
    media.pending[2].reject(new Error("old Balloon request"));
    staleBalloonError();
    await flush();
    assert.equal(audio.musicEnabled, true);
    assert.equal(failures(), 0);
    assert.equal(media.source, BED);
    assert.equal(media.loop, true);
  } finally { audio.dispose(); }
});

test("unknown IDs, wrong levels and unreviewed lesson paths cannot grant arbitrary playback", async () => {
  const intermediate = `/music/clip-${"c".repeat(64)}.mp3`;
  const { audio, media } = fixture({ basic: BED, intermediate }, { sun: OTHER, unknown: OTHER });
  try {
    audio.selectMusic("basic");
    await audio.enableMusic();
    for (const musicId of ["cat", "unknown", "__proto__", "constructor", OTHER, "https://example.com/music.mp3", {}, null]) {
      audio.selectMusic("basic", musicId);
      assert.equal(media.source, BED, "Only a valid authored override can replace the level bed");
    }
    audio.selectMusic("intermediate", "sun");
    assert.equal(media.source, intermediate, "A level mismatch uses its own reviewed level fallback");
    audio.selectMusic("unknown", "sun");
    assert.equal(media.source, null);
    assert.equal(audio.musicEnabled, false);
    for (const level of [undefined, null, {}, "unknown"]) {
      assert.doesNotThrow(() => audio.selectMusic(level));
      assert.equal(media.source, null);
      assert.equal(audio.musicEnabled, false);
    }
  } finally { audio.dispose(); }
  const malformed = fixture(undefined, { sun: "https://example.com/bed.mp3" });
  try {
    malformed.audio.selectMusic("basic", "sun");
    await malformed.audio.enableMusic();
    assert.equal(malformed.media.source, BED);
    assert.equal(malformed.audio._lessonMusicAssets.size, 0);
  } finally { malformed.audio.dispose(); }
});

test("reviewed beds require opt-in, exact selection, bounded volume and looping", async (context) => {
  const advance = envelopeClock(context);
  const { audio, media } = fixture();
  try {
    audio.selectMusic("basic");
    assert.equal(media.plays, 0);
    assert.equal(audio.musicEnabled, false);
    assert.equal(await audio.enableMusic(), true);
    assert.equal(media.source, BED);
    assert.equal(media.plays, 1);
    assert.equal(media.loop, true);
    assert.equal(media.volume, 0, "Opt-in starts from silence and fades in");
    audio.setVolume(20);
    advance();
    assert.equal(media.volume, 0.12);
    media.pending[0].resolve();
    await flush();
  } finally { audio.dispose(); }
});

test("the cat pilot has a higher optional music gain without changing the standard lesson mix", async (context) => {
  const advance = envelopeClock(context);
  const { audio, media } = fixture();
  try {
    audio.selectMusic("basic");
    assert.equal(media.volume, 0);
    assert.equal(audio.setMusicProfile("cat-pilot"), true);
    audio.setVolume(0.6);
    assert.equal(media.volume, 0, "Changing a preference cannot make disabled music audible");
    assert.equal(media.plays, 0, "Changing mix is not music opt-in");
    assert.equal(audio.musicEnabled, false);

    await audio.enableMusic();
    advance();
    assert.equal(media.volume, 0.3);
    media.pending[0].resolve();
    await flush();
    media.currentTime = 17;
    audio.setBlocked(true);
    assert.equal(audio._musicPlay, null);
    assert.equal(media.currentTime, 17);
    audio.setBlocked(false);
    advance();
    assert.equal(media.volume, 0.3);
    assert.equal(media.currentTime, 17);

    audio.selectMusic("basic");
    advance();
    assert.equal(media.currentTime, 0);
    assert.equal(media.volume, 0.3, "Lesson selection retains the chosen mix");
    assert.equal(audio.setMusicProfile("standard"), true);
    advance();
    assert.equal(media.volume, 0.6 * 0.12);
    audio.setVolume(0.35);
    advance();
    assert.equal(media.volume, 0.35 * 0.12, "Other lessons retain the existing gain");
  } finally { audio.dispose(); }
});

test("cat pilot volume and profile remain bounded, including silence at zero volume", async (context) => {
  const advance = envelopeClock(context);
  const { audio, media } = fixture();
  try {
    audio.selectMusic("basic");
    audio.setMusicProfile("cat-pilot");
    audio.setVolume(20);
    assert.equal(media.volume, 0);
    await audio.enableMusic();
    advance();
    assert.equal(media.volume, 0.5);
    audio.setVolume(-1);
    assert.equal(media.volume, 0);
    audio.setVolume(Number.NaN);
    assert.equal(media.volume, 0);
    audio.setVolume(0.6);
    advance();
    for (const profile of ["expert", "__proto__", "constructor", {}, null]) {
      assert.equal(audio.setMusicProfile(profile), false);
      assert.equal(media.volume, 0.3);
    }
    assert.equal(media.plays, 2, "Zero volume pauses and a later positive volume resumes");
    assert.equal(audio.musicEnabled, true);
    audio.dispose();
    assert.equal(audio.setMusicProfile("cat-pilot"), false);
  } finally { audio.dispose(); }
});

test("blocked gesture unlock is silent; pauses freeze and resume the same position", async () => {
  const { audio, media } = fixture();
  try {
    audio.selectMusic("basic");
    audio.setBlocked(true);
    await audio.enableMusic();
    assert.equal(media.plays, 1);
    assert.ok(media.pauses > 0);
    media.pending[0].reject(Object.assign(new Error("paused"), { name: "AbortError" }));
    await flush();
    assert.equal(audio.musicEnabled, true);
    audio.setBlocked(false);
    assert.equal(media.plays, 2);
    media.currentTime = 17;
    audio.setBlocked(true);
    assert.equal(media.currentTime, 17);
    audio.setBlocked(false);
    assert.equal(media.currentTime, 17);
    assert.equal(media.plays, 3);
  } finally { audio.dispose(); }
});

test("same-level lesson change resets position and ignores stale rejection/error", async () => {
  const { audio, media, failures } = fixture();
  try {
    audio.selectMusic("basic");
    await audio.enableMusic();
    const lateError = media.onerror;
    media.currentTime = 30;
    audio.selectMusic("basic");
    assert.equal(media.currentTime, 0);
    assert.equal(media.plays, 2);
    media.pending[0].reject(new Error("old request"));
    lateError();
    await flush();
    assert.equal(audio.musicEnabled, true);
    assert.equal(failures(), 0);
  } finally { audio.dispose(); }
});

test("active media rejection disables only music and reports once", async () => {
  const { audio, media, failures } = fixture();
  try {
    audio.selectMusic("basic");
    await audio.enableMusic();
    const error = media.onerror;
    media.pending[0].reject(new Error("decode/network failure"));
    await flush();
    error();
    assert.equal(audio.musicEnabled, false);
    assert.equal(audio._blocked, false);
    assert.equal(failures(), 1);
    assert.equal(media.plays, 1);
  } finally { audio.dispose(); }
});

test("immediate playback rejection settles authoritative music state before the opt-in continuation", async () => {
  const { audio, media, failures } = fixture();
  try {
    audio.selectMusic("basic");
    media.play = () => Promise.reject(new Error("playback unavailable"));
    await audio.enableMusic();
    // UI consumers must read the current state here: an earlier return value
    // can precede this rejection and must not overwrite the failure callback.
    assert.equal(audio.musicEnabled, false);
    assert.equal(failures(), 1);
    assert.equal(media.paused, true);
    assert.equal(media.volume, 0);
    assert.equal(audio._volumeRamps.size, 0);
  } finally { audio.dispose(); }
});

test("real blocked unlock rejection disables optional music, including stale-safe retries", async () => {
  const { audio, media, failures } = fixture();
  try {
    audio.selectMusic("basic");
    audio.setBlocked(true);
    await audio.enableMusic();
    media.pending[0].reject(Object.assign(new Error("permission"), { name: "NotAllowedError" }));
    await flush();
    assert.equal(audio.musicEnabled, false);
    assert.equal(failures(), 1);
  } finally { audio.dispose(); }
});

test("hidden pages and finish silence music while narration only ducks it", async (context) => {
  const advance = envelopeClock(context);
  const previous = globalThis.document;
  let visibility;
  globalThis.document = {
    hidden: false,
    addEventListener(_, listener) { visibility = listener; },
    removeEventListener(_, listener) { assert.equal(listener, visibility); },
  };
  const { audio, media } = fixture();
  try {
    audio.selectMusic("basic");
    await audio.enableMusic();
    advance();
    globalThis.document.hidden = true;
    visibility();
    const count = media.plays;
    assert.equal(audio._musicPlay, null);
    globalThis.document.hidden = false;
    visibility();
    assert.equal(media.plays, count + 1);
    advance();
    media.currentTime = 23;
    const pauses = media.pauses;
    const voice = new Media();
    audio.attachNarration(voice);
    const playback = audio.playClip(Object.values(narrationIndex)[0]);
    assert.ok(audio._musicPlay);
    assert.equal(media.pauses, pauses);
    assert.equal(media.currentTime, 23);
    advance(200);
    assert.equal(media.volume, 0.35 * 0.12 * 0.32);
    voice.pending[0].resolve();
    await playback;
    audio.stopAll();
    assert.equal(audio.musicEnabled, false);
    assert.equal(media.currentTime, 0);
    assert.equal(media.source, null);
    media.pending[0].reject(new Error("late after finish"));
    await flush();
    assert.equal(audio.musicEnabled, false);
  } finally { audio.dispose(); globalThis.document = previous; }
});

test("teaching and repeated clips keep one music playback with smooth duck and recovery", async (context) => {
  const advance = envelopeClock(context);
  const { audio, media } = fixture();
  const voice = new Media();
  audio.attachNarration(voice);
  try {
    audio.selectMusic("basic");
    audio.setMusicProfile("cat-pilot");
    audio.setVolume(0.6);
    await audio.enableMusic();
    advance();
    media.pending[0].resolve();
    await flush();
    media.currentTime = 41;
    const pauses = media.pauses;
    assert.equal(media.volume, 0.3);

    audio.setTeaching(true);
    assert.equal(media.volume, 0.3, "Ducking has no abrupt level change");
    advance(80);
    assert.ok(media.volume > 0.3 * 0.32 && media.volume < 0.3);
    advance(120);
    assert.equal(media.volume, 0.3 * 0.32);
    for (let clip = 0; clip < 3; clip++) {
      const playback = audio.playClip(Object.values(narrationIndex)[clip]);
      voice.pending[clip].resolve();
      assert.equal(await playback, true);
      advance(80);
      voice.onended();
      advance(200);
      assert.equal(media.volume, 0.3 * 0.32,
        "Narration completion cannot swell the bed during a demonstration");
    }
    audio.setTeaching(false);
    assert.equal(media.volume, 0.3 * 0.32);
    advance(300);
    assert.ok(media.volume > 0.3 * 0.32 && media.volume < 0.3);
    advance(1000);
    assert.equal(media.volume, 0.3);
    assert.equal(media.currentTime, 41);
    assert.equal(media.plays, 1);
    assert.equal(media.pauses, pauses);
  } finally { audio.dispose(); }
});

test("mute, safety block and disposal preempt volume ramps and stale completions", async (context) => {
  const advance = envelopeClock(context);
  const { audio, media } = fixture();
  try {
    audio.selectMusic("basic");
    await audio.enableMusic();
    advance(200);
    assert.ok(media.volume > 0);
    audio.setMusicEnabled(false);
    assert.equal(media.volume, 0);
    assert.equal(media.paused, true);
    advance();
    media.pending[0].resolve();
    await flush();
    assert.equal(media.volume, 0, "An old play resolution cannot revive muted audio");

    await audio.enableMusic();
    advance();
    audio.setTeaching(true);
    advance(80);
    audio.setBlocked(true);
    assert.equal(media.volume, 0);
    assert.equal(media.paused, true);
    advance();
    assert.equal(media.volume, 0, "A duck ramp cannot revive a paused session");
    audio.setBlocked(false);
    advance(200);
    assert.ok(media.volume > 0);
    audio.dispose();
    assert.equal(media.volume, 0);
    advance();
    assert.equal(media.volume, 0);
    assert.equal(audio._volumeRamps.size, 0);
  } finally { audio.dispose(); }
});

test("external, malformed and unknown assets never reach the media element", async () => {
  const { audio, media } = fixture({ basic: "https://example.com/bed.mp3", expert: "/music/unreviewed.mp3" });
  try {
    audio.selectMusic("basic");
    audio.selectMusic("expert");
    audio.selectMusic("/music/clip-" + "c".repeat(64) + ".mp3");
    assert.equal(media.source, null);
    assert.equal(media.plays, 0);
  } finally { audio.dispose(); }
});

test("explicit deselection stops music and late blocked unlock cannot disable a new lesson", async () => {
  const { audio, media, failures } = fixture();
  try {
    audio.selectMusic("basic");
    audio.setBlocked(true);
    await audio.enableMusic();
    audio.selectMusic("intermediate");
    audio.setBlocked(false);
    assert.equal(media.source, OTHER);
    media.pending[0].reject(new Error("old blocked unlock failed"));
    await flush();
    assert.equal(audio.musicEnabled, true);
    assert.equal(failures(), 0);
    audio.selectMusic(null);
    assert.equal(audio.musicEnabled, false);
    assert.equal(media.source, null);
    assert.equal(media.currentTime, 0);
  } finally { audio.dispose(); }
});

test("a synchronous media failure is contained and cannot start a delayed volume ramp", async (context) => {
  const advance = envelopeClock(context);
  const { audio, media, failures } = fixture();
  try {
    audio.selectMusic("basic");
    media.play = () => { throw new Error("media engine failed"); };
    assert.equal(await audio.enableMusic(), false);
    assert.equal(audio.musicEnabled, false);
    assert.equal(failures(), 1);
    assert.equal(audio._blocked, false);
    advance();
    assert.equal(media.volume, 0);
    assert.equal(media.paused, true);
    assert.equal(audio._volumeRamps.size, 0);
  } finally { audio.dispose(); }
});
