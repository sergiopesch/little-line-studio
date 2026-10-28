import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateNarrationDerivatives } from "../scripts/validate-narration-derivatives.mjs";
import { StudioAudio } from "../src/audio.js";
import { LESSONS, narrationKey } from "../src/lesson-catalogue.js";
import manifest from "../src/narration-manifest.json" with { type: "json" };
import narrationIndex from "../src/narration-index.json" with { type: "json" };
import narrationDurations from "../src/narration-durations.json" with { type: "json" };
import spanishIndex from "../src/narration-index.es-419.json" with { type: "json" };
import frenchIndex from "../src/narration-index.fr-FR.json" with { type: "json" };
import irishIndex from "../src/narration-index.en-IE.json" with { type: "json" };
import scottishIndex from "../src/narration-index.en-GB-x-scotland.json" with { type: "json" };

const [SOURCE, OTHER_SOURCE] = [
  ...new Set(Object.values(manifest.clips).map((clip) => clip.src)),
];
class Media {
  paused = true;
  src = "";
  playResult = Promise.resolve();
  plays = 0;
  play() {
    this.plays++;
    this.paused = false;
    return this.playResult;
  }
  pause() {
    this.paused = true;
  }
  removeAttribute(name) {
    if (name === "src") this.src = "";
  }
  load() {}
}

function assertActivatedProvenance(metadata, channels, provenance = "verified-api-response") {
  assert.equal(metadata.schemaVersion, 3);
  assert.equal(metadata.provider, "ElevenLabs");
  assert.equal(metadata.provenance, provenance);
  assert.match(metadata.sourcePlanHash, /^[a-f0-9]{64}$/);
  assert.ok(Number.isFinite(Date.parse(metadata.activatedAt)));
  assert.equal(metadata.reviewStatus, "operator-reviewed-for-activation");
  assert.equal(metadata.review.operatorConfirmedReviewed, true);
  assert.match(metadata.review.assertion, /did not listen/);
  assert.equal(metadata.audioSettings.normalization, "loudnorm=I=-20:TP=-2:LRA=7");
  assert.equal(metadata.audioSettings.sampleRate, 44100);
  assert.equal(metadata.audioSettings.channels, channels);
  assert.equal(metadata.audioSettings.codec, "mp3");
  assert.equal(metadata.audioSettings.bitrate, "128k");
}

test("fixed narration plays only a same-origin authored clip, and cancellation cleans up once", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const audio = new StudioAudio(),
    media = new Media();
  audio.attachNarration(media);
  let ended = 0,
    failed = 0;
  try {
    assert.equal(
      await audio.playClip(
        SOURCE,
        () => ended++,
        () => failed++,
      ),
      true,
    );
    assert.equal(media.src, SOURCE);
    assert.equal(media.paused, false);
    assert.equal(media.volume, 0, "Narration begins with a short entrance envelope");
    for (let elapsed = 0; elapsed < 80; elapsed += 20)
      context.mock.timers.tick(20);
    assert.equal(media.volume, 0.85);
    assert.equal(media.playbackRate, 0.9);
    assert.equal(media.preservesPitch, true);
    const lateEnd = media.onended;
    audio.stopSpeech();
    lateEnd();
    assert.equal(ended, 1);
    assert.equal(failed, 0);
    assert.equal(media.paused, true);
    assert.equal(media.volume, 0);
    assert.equal(media.src, "");
    assert.equal(audio._clip, null);
  } finally {
    audio.dispose();
  }
});

test("narration tail follows actual playback even without timeupdate and completes only on ended", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const audio = new StudioAudio(), media = new Media();
  audio.attachNarration(media);
  let ended = 0;
  try {
    await audio.playClip(SOURCE, () => ended++);
    for (let elapsed = 0; elapsed < 80; elapsed += 20)
      context.mock.timers.tick(20);
    assert.equal(media.volume, 0.85);
    media.duration = 6;
    media.currentTime = 5.8;
    context.mock.timers.tick(20);
    media.currentTime = 5.95;
    context.mock.timers.tick(20);
    assert.ok(media.volume > 0 && media.volume < 0.85);
    const beforeStall = media.volume;
    media.onwaiting();
    for (let elapsed = 0; elapsed < 1000; elapsed += 20)
      context.mock.timers.tick(20);
    assert.equal(media.volume, beforeStall,
      "Buffering cannot consume the tail envelope before playback progresses");
    media.onplaying();
    media.currentTime = 5.99;
    context.mock.timers.tick(20);
    assert.ok(media.volume > 0 && media.volume < beforeStall);
    assert.equal(ended, 0);
    assert.equal(media.paused, false);
    const staleUpdate = media.ontimeupdate;
    const stalePlaying = media.onplaying;
    const staleWaiting = media.onwaiting;
    media.onended();
    assert.equal(ended, 1);
    assert.equal(media.ontimeupdate, null);
    assert.equal(media.onplaying, null);
    assert.equal(media.onwaiting, null);
    staleUpdate();
    stalePlaying();
    staleWaiting();
    assert.equal(audio._volumeRamps.size, 0);
    await audio.playClip(OTHER_SOURCE);
    context.mock.timers.tick(20);
    audio.stopSpeech();
    for (let elapsed = 0; elapsed < 200; elapsed += 20)
      context.mock.timers.tick(20);
    assert.equal(media.volume, 0, "Cancelled edge envelopes cannot restore sound");
    assert.equal(media.src, "");
  } finally { audio.dispose(); }
});

test("an old rejected playback cannot report failure or stop a newer clip", async () => {
  const audio = new StudioAudio(),
    media = new Media();
  audio.attachNarration(media);
  let rejectOld,
    ended = 0,
    failed = 0;
  media.playResult = new Promise((resolve, reject) => {
    rejectOld = reject;
  });
  const old = audio.playClip(
    SOURCE,
    () => ended++,
    () => failed++,
  );
  const lateOldEnd = media.onended;
  media.playResult = Promise.resolve();
  try {
    assert.equal(
      await audio.playClip(
        OTHER_SOURCE,
        () => ended++,
        () => failed++,
      ),
      true,
    );
    lateOldEnd();
    assert.equal(ended, 1);
    assert.equal(media.src, OTHER_SOURCE);
    rejectOld(new Error("cancelled pending play"));
    assert.equal(await old, false);
    assert.equal(failed, 0);
    assert.equal(ended, 1);
    assert.equal(media.paused, false);
    media.onended();
    assert.equal(ended, 2);
    assert.equal(failed, 0);
  } finally {
    audio.dispose();
  }
});

test("a media error or autoplay rejection leaves written instructions usable", async () => {
  for (const mode of ["error", "rejection"]) {
    const audio = new StudioAudio(),
      media = new Media();
    audio.attachNarration(media);
    let ended = 0,
      failed = 0;
    if (mode === "rejection")
      media.playResult = Promise.reject(new Error("playback blocked"));
    try {
      const result = await audio.playClip(
        SOURCE,
        () => ended++,
        () => failed++,
      );
      if (mode === "error") {
        assert.equal(result, true);
        const lateError = media.onerror;
        media.onerror();
        lateError();
      } else assert.equal(result, false);
      assert.equal(failed, 1);
      assert.equal(ended, 1);
      assert.equal(audio._clip, null);
      assert.equal(media.paused, true);
    } finally {
      audio.dispose();
    }
  }
});

test("a stalled clip is bounded and cannot leave music blocked forever", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const audio = new StudioAudio(),
    media = new Media();
  audio.attachNarration(media);
  let ended = 0,
    failed = 0;
  try {
    await audio.playClip(
      SOURCE,
      () => ended++,
      () => failed++,
    );
    context.mock.timers.tick(45001);
    assert.equal(ended, 1);
    assert.equal(failed, 1);
    assert.equal(audio._clip, null);
    assert.equal(media.src, "");
  } finally {
    audio.dispose();
    context.mock.timers.reset();
  }
});

test("narration rejects external, data, traversal and arbitrary media paths before playback", async () => {
  const audio = new StudioAudio(),
    media = new Media();
  audio.attachNarration(media);
  try {
    for (const source of [
      "https://example.com/voice.mp3",
      "//example.com/voice.mp3",
      "data:audio/mp3;base64,abc",
      "/narration/../other.mp3",
      "/uploads/voice.mp3",
      `/narration/clip-${"0".repeat(64)}.mp3`,
      SOURCE + "?download=1",
      SOURCE + "#audio",
      SOURCE.replace("/narration/", "/narration/./"),
      SOURCE.replace("/narration/", "/narration/%2e%2e/narration/"),
      undefined,
      { toString: () => SOURCE },
    ]) {
      assert.equal(await audio.playClip(source), false);
      assert.equal(media.src, "");
      assert.equal(media.paused, true);
      assert.equal(media.plays, 0);
    }
  } finally {
    audio.dispose();
  }
});

test("all thirty lessons ship matching instruction/hint transcripts and intact referenced audio only", async () => {
  assert.equal(LESSONS.length, 30);
  assertActivatedProvenance(manifest, 1);
  assert.equal(
    manifest.audioSettings.normalization,
    "loudnorm=I=-20:TP=-2:LRA=7",
  );
  const expected = new Set(["sample"]);
  for (const lesson of LESSONS) {
    for (const [index, step] of lesson.steps.entries()) {
      for (const [kind, field] of [
        ["instruction", "spoken"],
        ["hint", "hint"],
      ]) {
        const key = narrationKey(lesson, index, kind);
        expected.add(key);
        assert.ok(manifest.clips[key], `Missing ${key}`);
        assert.equal(
          manifest.clips[key].text,
          step[field],
          `Regenerate changed transcript: ${key}`,
        );
      }
    }
  }
  assert.deepEqual(new Set(Object.keys(manifest.clips)), expected);
  assert.deepEqual(
    narrationIndex,
    Object.fromEntries(
      Object.entries(manifest.clips).map(([key, clip]) => [key, clip.src]),
    ),
    "The runtime index must contain exactly the manifest keys and authored sources",
  );
  assert.deepEqual(
    narrationDurations,
    Object.fromEntries(
      Object.entries(manifest.clips)
        .filter(([key]) => key.endsWith("/instruction"))
        .map(([key, clip]) => [key, Math.round(clip.duration * 1000)]),
    ),
    "Guided timing estimates must use the actual active instruction clips",
  );
  const unique = new Map();
  const generationSources = new Map();
  const voiceIds = new Set();
  for (const clip of Object.values(manifest.clips)) {
    assert.equal(clip.provider, "ElevenLabs");
    assert.equal(clip.provenance, "verified-api-response");
    assert.equal(clip.model, "eleven_v4");
    assert.match(clip.voiceId, /^[A-Za-z0-9_-]{1,100}$/);
    voiceIds.add(clip.voiceId);
    assert.equal(clip.encoding.rate, 44100);
    assert.equal(clip.encoding.channels, 1);
    assert.equal(clip.encoding.bitrate, "128k");
    assert.equal(clip.encoding.filter, manifest.audioSettings.normalization);
    assert.ok(clip.generationSettings && typeof clip.generationSettings === "object" && !Array.isArray(clip.generationSettings));
    assert.equal(clip.generationSettings.model_id, clip.model);
    assert.deepEqual(clip.generationSettings.inputs, [{ text: clip.text, voice_id: clip.voiceId }]);
    assert.match(clip.src, /^\/narration\/clip-[a-f0-9]{64}\.mp3$/);
    assert.match(clip.cacheKey, /^[a-f0-9]{64}$/);
    assert.ok(clip.text.trim());
    assert.ok(
      Number.isFinite(clip.duration) && clip.duration > 0 && clip.duration < 35,
      "Keep reviewed speech below the playback watchdog",
    );
    if (generationSources.has(clip.cacheKey)) {
      const sameGeneration = generationSources.get(clip.cacheKey);
      assert.equal(
        clip.src,
        sameGeneration.src,
        "Identical generation identities must share an authored clip",
      );
      assert.equal(clip.text, sameGeneration.text);
      assert.equal(clip.voiceId, sameGeneration.voiceId);
      assert.equal(clip.model, sameGeneration.model);
      assert.deepEqual(clip.generationSettings, sameGeneration.generationSettings);
      assert.deepEqual(clip.encoding, sameGeneration.encoding);
    }
    generationSources.set(clip.cacheKey, clip);
    unique.set(clip.src, clip);
  }
  assert.equal(voiceIds.size, 1, "The selected Lily voice is consistent across all thirty lessons");
  for (const clip of unique.values()) {
    const bytes = await readFile(
      new URL(`../public${clip.src}`, import.meta.url),
    );
    assert.equal(bytes.length, clip.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), clip.sha256);
    assert.ok(clip.bytes > 1000);
    assert.equal(clip.src, `/narration/clip-${clip.sha256}.mp3`);
  }
  const packaged = (
    await readdir(new URL("../public/narration/", import.meta.url))
  ).filter((name) => name.endsWith(".mp3"));
  const demoIndexes = await Promise.all(["es-ES", "de-DE", "it-IT", "nl-NL"].map(async (locale) =>
    JSON.parse(await readFile(new URL(`../src/narration-index.${locale}.json`, import.meta.url), "utf8"))));
  const retainedSources = [];
  for (const suffix of ['', '.es-419', '.en-IE', '.en-GB-x-scotland', '.fr-FR', '.es-ES', '.de-DE', '.it-IT', '.nl-NL']) {
    const content = await readFile(new URL(`../src/narration-manifest${suffix}.json`, import.meta.url), 'utf8')
      .catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!content) continue;
    const localeManifest = JSON.parse(content);
    validateNarrationDerivatives(localeManifest, fileURLToPath(new URL('../public/', import.meta.url)));
    retainedSources.push(...Object.values(localeManifest.clips).filter((clip) =>
      clip.provenance === 'verified-local-derivative').map((clip) => clip.source.src));
  }
  if (Object.keys(spanishIndex).length) {
    const spanishManifest = JSON.parse(await readFile(
      new URL("../src/narration-manifest.es-419.json", import.meta.url), "utf8",
    ));
    assert.deepEqual(
      spanishIndex,
      Object.fromEntries(Object.entries(spanishManifest.clips).map(([key, clip]) => [key, clip.src])),
      "The Spanish runtime index must match its installed manifest",
    );
  }
  assert.deepEqual(
    new Set(packaged),
    new Set([...unique.keys(), ...retainedSources, ...[spanishIndex, frenchIndex, irishIndex, scottishIndex, ...demoIndexes].flatMap(Object.values)].map((src) => src.split("/").at(-1))),
    "The public narration directory must contain only indexed locale clips and verified derivative sources",
  );
  assert.equal(unique.size, generationSources.size,
    "The current individually scripted requests retain their own matching audio assets");
});

test("all level fallbacks and authored lesson music ship only verified self-hosted loop assets", async () => {
  const music = JSON.parse(await readFile(new URL("../src/music-manifest.json", import.meta.url), "utf8"));
  const index = JSON.parse(await readFile(new URL("../src/music-index.json", import.meta.url), "utf8"));
  const levels = ["basic", "intermediate", "expert"];
  const lessonIndex = JSON.parse(await readFile(new URL("../src/lesson-music-index.json", import.meta.url), "utf8"));
  const authored = JSON.parse(await readFile(new URL("../src/lesson-music-catalogue.json", import.meta.url), "utf8"));
  assertActivatedProvenance(music, 2, "verified-api-sources-with-local-loop-processing");
  assert.deepEqual(Object.keys(music.levels).sort(), [...levels].sort());
  assert.deepEqual(Object.keys(index).sort(), [...levels].sort());
  assert.ok(music.lessons && typeof music.lessons === "object",
    "Activate the complete reviewed bundle including authored lesson music before release.");
  assert.deepEqual(Object.keys(music.lessons).sort(), Object.keys(authored).sort());
  assert.deepEqual(Object.keys(lessonIndex).sort(), Object.keys(authored).sort());
  const { reviewedSourceCrops, reviewedSourceNormalizations, ...defaultRecipe } = music.loopPreparation;
  const reviewedCrops = {
    "37a3fc86b68564eeed6584ebc51d015c1a61628570b1f6a80fddeeb763ff6411": { sourceStartSeconds: 8, sourceEndSeconds: 84 },
    "1917db0daa74bd560dcb2d934eefa5ba9194fce525bfd164a7e25e622e08b096": { sourceStartSeconds: 10, sourceEndSeconds: 86 },
  };
  const reviewedNormalizations = {
    "f9aa89a07a8c2b31106f72ebb97b3db418d4c77f616557ec8256faaf8a06c196": { normalizationMode: "measured-dynamic", decodedLraMaximumLu: 7.5 },
  };
  assert.deepEqual(reviewedSourceCrops, reviewedCrops);
  assert.deepEqual(reviewedSourceNormalizations, reviewedNormalizations);
  assert.equal(defaultRecipe.normalizationMode, "measured-linear");
  assert.equal(defaultRecipe.normalization, "loudnorm=I=-20:TP=-2:LRA=7");
  assert.equal(defaultRecipe.sourceStartSeconds, 4);
  assert.equal(defaultRecipe.sourceEndSeconds, 80);
  const referenced = new Set();
  for (const [level, clip] of [...Object.entries(music.levels), ...Object.entries(music.lessons)]) {
    const source = clip.source;
    assert.equal(clip.provider, "ElevenLabs");
    assert.equal(clip.provenance, "verified-local-derivative");
    assert.equal(source.provider, "ElevenLabs");
    assert.equal(source.provenance, "verified-api-response");
    assert.equal(source.model, clip.model);
    assert.equal(source.cacheKey, clip.cacheKey);
    assert.deepEqual(source.generationSettings, clip.generationSettings);
    assert.equal(source.encoding.filter, "loudnorm=I=-20:TP=-2:LRA=7");
    assert.equal(source.src, `/music/clip-${source.sha256}.mp3`);
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assert.notEqual(clip.sha256, source.sha256);
    assert.ok(source.duration > 88 && source.duration < 92,
      `${level}: the original ninety-second source remains explicitly recorded`);
    assert.equal(clip.model, "music_v2_5");
    assert.equal(clip.instrumentalRequested, true);
    assert.ok(typeof clip.prompt === "string" && clip.prompt.trim().length > 0);
    assert.equal(clip.encoding.rate, 44100);
    assert.equal(clip.encoding.channels, 2);
    assert.equal(clip.encoding.bitrate, "128k");
    assert.equal(clip.encoding.filter, clip.processing.filterGraph);
    assert.match(clip.processing.filterGraph, /acrossfade=d=4:c1=qsin:c2=qsin/);
    assert.match(clip.processing.processingKey, /^[a-f0-9]{64}$/);
    assert.match(clip.processing.receiptSha256, /^[a-f0-9]{64}$/);
    assert.match(clip.processing.ffmpegVersion, /^ffmpeg version /);
    const expectedRecipe = { ...defaultRecipe, ...reviewedCrops[source.sha256], ...reviewedNormalizations[source.sha256] };
    assert.deepEqual(clip.processing.recipe, expectedRecipe);
    assert.equal(clip.processing.recipe.durationSeconds, 72);
    assert.equal(clip.processing.recipe.sourceStartSeconds, reviewedCrops[source.sha256]?.sourceStartSeconds ?? 4);
    assert.equal(clip.processing.recipe.sourceEndSeconds, reviewedCrops[source.sha256]?.sourceEndSeconds ?? 80);
    assert.equal(clip.processing.recipe.crossfadeSeconds, 4);
    const dynamic = Object.hasOwn(reviewedNormalizations, source.sha256);
    assert.equal(clip.processing.loudnessResult.normalization_type, dynamic ? "dynamic" : "linear");
    if (dynamic) assert.ok(Number(clip.processing.decodedVerification.input_lra) <= 7.5);
    assert.ok(Number(clip.processing.decodedVerification.input_tp) <= -2);
    assert.ok(Math.abs(Number(clip.processing.decodedVerification.input_i) + 20) <= 0.5);
    assert.ok(clip.processing.continuityVerification.joinDifferenceDb <= 9);
    assert.equal(clip.processing.continuityVerification.seamWindowsDbfs.length, 2);
    assert.ok(clip.processing.continuityVerification.seamWindowsDbfs.every((value) =>
      value >= clip.processing.continuityVerification.interiorMedianDbfs - 10.002));
    assert.ok(clip.generationSettings && typeof clip.generationSettings === "object" && !Array.isArray(clip.generationSettings));
    assert.equal(clip.generationSettings.model_id, clip.model);
    assert.equal(clip.generationSettings.prompt, clip.prompt);
    assert.equal(clip.generationSettings.force_instrumental, true);
    assert.equal(clip.generationSettings.music_length_ms, 90000);
    assert.match(clip.cacheKey, /^[a-f0-9]{64}$/);
    assert.match(clip.sha256, /^[a-f0-9]{64}$/);
    assert.equal(clip.src, `/music/clip-${clip.sha256}.mp3`);
    assert.equal(Object.hasOwn(authored, level) ? lessonIndex[level] : index[level], clip.src);
    if (Object.hasOwn(authored, level)) {
      assert.equal(clip.prompt, authored[level].prompt);
      assert.equal(clip.generationSettings.music_length_ms, authored[level].seconds * 1000);
      assert.notEqual(clip.src, index[authored[level].level], "A subject-specific bed differs from its fallback");
    }
    assert.ok(Number.isFinite(clip.duration) && clip.duration > 71.9 && clip.duration < 72.2,
      `${level}: the activated cyclic derivative removes the authored ending`);
    assert.ok(Number.isSafeInteger(clip.bytes) && clip.bytes > 1000);
    const bytes = await readFile(new URL(`../public${clip.src}`, import.meta.url));
    assert.equal(bytes.length, clip.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), clip.sha256);
    referenced.add(clip.src.split("/").at(-1));
  }
  const packaged = (await readdir(new URL("../public/music/", import.meta.url)))
    .filter(name => name.endsWith(".mp3"));
  assert.deepEqual(new Set(packaged), referenced, "Only active manifest-owned music is packaged");
});
