#!/usr/bin/env node
import {
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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

if (!existsSync(index)) throw new Error("Missing Vite document: " + index);

// Fail the build if host-level headers drift from the local preview policy.
const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
const globalHeaders = Object.fromEntries(
  vercel.headers.find((rule) => rule.source === "/(.*)").headers.map(({ key, value }) => [key, value]),
);
for (const [name, value] of Object.entries(securityHeaders)) {
  if (globalHeaders[name] !== value) throw new Error(`Vercel security header mismatch: ${name}`);
}

// A completion receipt makes failed validation distinguishable from a usable build.
// Keep it outside the directory published by Vercel.
writeFileSync(path.join(dist, "validated.json"), JSON.stringify({
  schemaVersion: 1,
  spanishLessons: availability.lessons.length,
  verifiedSpanishAssets: checkedAssets.size,
}) + "\n");
console.log(`Validated Vercel build: ${availability.lessons.length} Spanish lessons, ${checkedAssets.size} verified audio assets`);
