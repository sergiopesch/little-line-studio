#!/usr/bin/env node
import {
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { securityHeaders } from "../config/security.js";
import { LESSONS } from "../src/lesson-catalogue.js";
import { localizeLesson } from "../src/spanish-lessons.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");

// A published Spanish lesson must have one coherent, complete set of local
// narration metadata. The activation tool validates the source receipts and
// audio; this check independently validates what the build will actually ship.
function readSpanishMetadata(name) {
  try {
    return JSON.parse(readFileSync(path.join(root, "src", name), "utf8"));
  } catch {
    throw new Error(`Missing or invalid Spanish narration metadata: ${name}`);
  }
}

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const availability = readSpanishMetadata("narration-availability.es-419.json");
const spanishIndex = readSpanishMetadata("narration-index.es-419.json");
const spanishDurations = readSpanishMetadata("narration-durations.es-419.json");
if (!isRecord(availability) || availability.schemaVersion !== 1 || availability.locale !== "es-419" ||
    !Array.isArray(availability.lessons) ||
    !isRecord(spanishIndex) || !isRecord(spanishDurations)) {
  throw new Error("Invalid Spanish narration availability or metadata");
}

const byId = new Map(LESSONS.map((lesson) => [lesson.id, lesson]));
if (byId.size !== LESSONS.length || availability.lessons.some((id, index, ids) =>
  typeof id !== "string" || !byId.has(id) || (index > 0 && ids[index - 1] >= id))) {
  throw new Error("Spanish narration lesson IDs must be known, unique and sorted");
}

const expectedTexts = new Map();
if (availability.lessons.length) {
  const sample = readFileSync(path.join(root, "src", "spanish-narration-sample.txt"), "utf8").trim();
  if (!sample) throw new Error("Missing Spanish narration sample text");
  expectedTexts.set("sample", sample);
}
for (const id of availability.lessons) {
  const lesson = localizeLesson(byId.get(id), "es-419");
  if (!Array.isArray(lesson.steps) || !lesson.steps.length)
    throw new Error(`Spanish narration lesson has no stages: ${id}`);
  for (const step of lesson.steps) {
    if (typeof step.id !== "string" || !step.id || step.id.includes("/"))
      throw new Error(`Invalid narration stage in lesson: ${id}`);
    for (const [kind, text] of [["instruction", step.spoken], ["hint", step.hint]]) {
      const key = `${id}/${step.id}/${kind}`;
      if (expectedTexts.has(key) || typeof text !== "string" || !text.trim())
        throw new Error(`Duplicate or invalid Spanish narration text: ${key}`);
      expectedTexts.set(key, text);
    }
  }
}
const hasExactKeys = (object) => isRecord(object) &&
  Object.keys(object).length === expectedTexts.size &&
  [...expectedTexts.keys()].every((key) => Object.hasOwn(object, key));
if (!hasExactKeys(spanishIndex) || !hasExactKeys(spanishDurations))
  throw new Error("Spanish narration index or durations do not match released lessons");

const manifestPath = path.join(root, "src", "narration-manifest.es-419.json");
const hasManifest = existsSync(manifestPath);
const manifest = hasManifest ? readSpanishMetadata("narration-manifest.es-419.json") : null;
if (hasManifest || expectedTexts.size) {
  if (!isRecord(manifest) || manifest.schemaVersion !== 3 || manifest.locale !== "es-419" ||
      !Array.isArray(manifest.coveredLessons) ||
      JSON.stringify(manifest.coveredLessons) !== JSON.stringify(availability.lessons) ||
      !hasExactKeys(manifest.clips) ||
      (expectedTexts.size && (manifest.provider !== "ElevenLabs" ||
        typeof manifest.selectedVoiceId !== "string" || !/^[A-Za-z0-9_-]+$/.test(manifest.selectedVoiceId)))) {
    throw new Error("Spanish narration manifest does not match released lessons");
  }
}

const checkedAssets = new Map();
for (const [key, expectedText] of expectedTexts) {
  const source = spanishIndex[key];
  const match = typeof source === "string" && /^\/narration\/clip-([a-f0-9]{64})\.mp3$/.exec(source);
  const clip = manifest.clips[key];
  const milliseconds = spanishDurations[key];
  if (!match || !isRecord(clip) || clip.src !== source || clip.sha256 !== match[1] ||
      clip.provider !== manifest.provider || clip.voiceId !== manifest.selectedVoiceId || clip.text !== expectedText ||
      !Number.isSafeInteger(clip.bytes) || clip.bytes <= 0 ||
      !Number.isSafeInteger(milliseconds) || milliseconds <= 0 ||
      typeof clip.duration !== "number" || !Number.isFinite(clip.duration) || clip.duration <= 0 ||
      Math.floor(clip.duration * 1000 + 0.5) !== milliseconds) {
    throw new Error(`Invalid or inconsistent Spanish narration metadata: ${key}`);
  }
  if (!checkedAssets.has(source)) {
    const asset = path.join(dist, "client", source.slice(1));
    if (!existsSync(asset)) throw new Error(`Missing Spanish narration asset: ${source}`);
    const bytes = readFileSync(asset);
    if (createHash("sha256").update(bytes).digest("hex") !== match[1])
      throw new Error(`Mismatched Spanish narration asset: ${source}`);
    checkedAssets.set(source, bytes.length);
  }
  if (checkedAssets.get(source) !== clip.bytes)
    throw new Error(`Inconsistent Spanish narration asset length: ${key}`);
}

// Additional languages must be complete and source-matched before they can
// become selectable. Empty descriptors remain unavailable during preparation.
async function validateAdditionalLocale(locale, voice, sampleFile, translateLesson) {
  const descriptorFile = `narration-availability.${locale}.json`;
  if (!existsSync(path.join(root, "src", descriptorFile))) return { lessons: 0, assets: 0 };
  const descriptor = readSpanishMetadata(descriptorFile);
  const clipIndex = readSpanishMetadata(`narration-index.${locale}.json`);
  const durations = readSpanishMetadata(`narration-durations.${locale}.json`);
  if (!isRecord(descriptor) || descriptor.schemaVersion !== 1 || descriptor.locale !== locale ||
      !Array.isArray(descriptor.lessons) || !isRecord(clipIndex) || !isRecord(durations) ||
      descriptor.lessons.some((id, index, ids) => typeof id !== "string" || !byId.has(id) ||
        (index > 0 && ids[index - 1] >= id))) throw new Error(`Invalid ${locale} availability`);
  if (descriptor.lessons.length && descriptor.lessons.length !== LESSONS.length)
    throw new Error(`${locale} must include the complete catalogue`);
  if (locale === "fr-FR" && descriptor.lessons.length) {
    let source, runtime;
    try {
      source = JSON.parse(execFileSync(process.execPath, [path.join(root, "scripts", "export-reviewed-french.mjs")],
        { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
      runtime = readSpanishMetadata("french-lessons.fr-FR.json");
    } catch {
      throw new Error("French source-linked editorial export could not be verified");
    }
    if (source.locale !== locale || source.count !== LESSONS.length ||
        source.reviewStatus !== "assistant-reviewed-awaiting-native-human-review" ||
        runtime.locale !== locale || runtime.reviewStatus !== source.reviewStatus ||
        JSON.stringify(runtime.lessons) !== JSON.stringify(source.lessons))
      throw new Error("French runtime text does not match the current source-linked export");
  }
  const texts = new Map();
  if (descriptor.lessons.length) {
    const sample = readFileSync(path.join(root, "src", sampleFile), "utf8").trim();
    if (!sample) throw new Error(`Missing ${locale} narration sample`);
    texts.set("sample", sample);
  }
  for (const id of descriptor.lessons) {
    const lesson = await translateLesson(byId.get(id), locale);
    const original = byId.get(id);
    if (!Array.isArray(lesson?.steps) || !lesson.steps.length ||
        JSON.stringify(lesson.steps.map((step) => step.id)) !== JSON.stringify(original.steps.map((step) => step.id)) ||
        lesson.steps.some((step) => typeof step.id !== "string" || !step.id || step.id.includes("/")))
      throw new Error(`Invalid ${locale} stage identities: ${id}`);
    for (const step of lesson.steps) {
      for (const [kind, text] of [["instruction", step.spoken], ["hint", step.hint]]) {
        const key = `${id}/${step.id}/${kind}`;
        if (texts.has(key) || typeof text !== "string" || !text.trim()) throw new Error(`Invalid ${locale} text: ${key}`);
        texts.set(key, text);
      }
    }
  }
  const matches = (value) => isRecord(value) && Object.keys(value).length === texts.size &&
    [...texts.keys()].every((key) => Object.hasOwn(value, key));
  if (!matches(clipIndex) || !matches(durations)) throw new Error(`Incomplete ${locale} narration metadata`);
  if (!texts.size) return { lessons: 0, assets: 0 };
  const manifest = readSpanishMetadata(`narration-manifest.${locale}.json`);
  if (!isRecord(manifest) || manifest.schemaVersion !== 3 || manifest.locale !== locale ||
      manifest.provider !== "ElevenLabs" || manifest.selectedVoiceId !== voice ||
      JSON.stringify(manifest.coveredLessons) !== JSON.stringify(descriptor.lessons) || !matches(manifest.clips))
    throw new Error(`Invalid ${locale} narration manifest`);
  const assets = new Map();
  for (const [key, expected] of texts) {
    const source = clipIndex[key], clip = manifest.clips[key], ms = durations[key];
    const match = typeof source === "string" && /^\/narration\/clip-([a-f0-9]{64})\.mp3$/.exec(source);
    if (!match || !isRecord(clip) || clip.src !== source || clip.sha256 !== match[1] ||
        clip.provider !== manifest.provider || clip.voiceId !== voice || clip.text !== expected ||
        !Number.isSafeInteger(clip.bytes) || clip.bytes <= 0 || !Number.isSafeInteger(ms) || ms <= 0 ||
        typeof clip.duration !== "number" || !Number.isFinite(clip.duration) || clip.duration <= 0 ||
        Math.floor(clip.duration * 1000 + 0.5) !== ms) throw new Error(`Invalid ${locale} audio metadata: ${key}`);
    if (!assets.has(source)) {
      const bytes = readFileSync(path.join(dist, "client", source.slice(1)));
      if (createHash("sha256").update(bytes).digest("hex") !== match[1]) throw new Error(`Mismatched ${locale} audio: ${key}`);
      assets.set(source, bytes.length);
    }
    if (assets.get(source) !== clip.bytes) throw new Error(`Invalid ${locale} audio length: ${key}`);
  }
  return { lessons: descriptor.lessons.length, assets: assets.size };
}

const additionalLocales = {};
for (const [locale, voice, sample] of [
  ["en-IE", "t6WJWTYTryhcQnrBHdCr", "narration-sample.en.txt"],
  ["en-GB-x-scotland", "M6KCOw7VXEJAZwuYFLuz", "narration-sample.en.txt"],
  ["fr-FR", "tKaoyJLW05zqV0tIH9FD", "narration-sample.fr-FR.txt"],
]) {
  const translator = locale === "fr-FR"
    ? async (lesson, id) => (await import("../src/french-lessons.js")).localizeLesson(lesson, id)
    : (lesson) => lesson;
  additionalLocales[locale] = await validateAdditionalLocale(locale, voice, sample, translator);
}

if (!existsSync(index)) throw new Error("Missing Vite document: " + index);

// Fail the build if host-level headers drift from the local preview policy.
const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
const globalHeaders = Object.fromEntries(
  vercel.headers.find((rule) => rule.source === "/(.*)").headers.map(({ key, value }) => [key, value]),
);
for (const [name, value] of Object.entries(securityHeaders)) {
  if (globalHeaders[name] !== value) throw new Error(`Vercel security header mismatch: ${name}`);
  for (const route of vercel.routes ?? []) {
    if (route.status >= 400 && route.headers?.[name] !== value)
      throw new Error(`Vercel rejection header mismatch: ${route.src}: ${name}`);
  }
}

// A completion receipt makes failed validation distinguishable from a usable build.
// Keep it outside the directory published by Vercel.
writeFileSync(path.join(dist, "validated.json"), JSON.stringify({
  schemaVersion: 1,
  spanishLessons: availability.lessons.length,
  verifiedSpanishAssets: checkedAssets.size,
  additionalLocales,
}) + "\n");
console.log(`Validated Vercel build: ${availability.lessons.length} Spanish lessons, ${checkedAssets.size} verified audio assets`);
