import { applyTeachingPack, attachTeachingAppearance } from "./teaching-pack.js";
import { CAT_TEACHING_PACK } from "./cat-pilot.js";
import { SUN_TEACHING_PACK } from "./sun-teaching-pack.js";
import { RAINBOW_TEACHING_PACK } from "./rainbow-teaching-pack.js";
import { BALLOON_TEACHING_PACK } from "./balloon-teaching-pack.js";
import { CAT_APPEARANCE } from "./cat-appearance.js";
import { SUN_APPEARANCE } from "./sun-appearance.js";
import { RAINBOW_APPEARANCE } from "./rainbow-appearance.js";
import { BALLOON_APPEARANCE } from "./balloon-appearance.js";
import { BASIC_COMPLETE_REGISTRATIONS } from "./basic-complete-packs.js";
import { INTERMEDIATE_COMPLETE_REGISTRATIONS } from "./intermediate-complete-packs.js";
import { EXPERT_COMPLETE_REGISTRATIONS } from "./expert-complete-packs.js";

export const COMPLETE_REGISTRATIONS = Object.freeze([
  ...BASIC_COMPLETE_REGISTRATIONS,
  ...INTERMEDIATE_COMPLETE_REGISTRATIONS,
  ...EXPERT_COMPLETE_REGISTRATIONS,
]);

export const TEACHING_PACKS = Object.freeze([
  CAT_TEACHING_PACK,
  SUN_TEACHING_PACK,
  RAINBOW_TEACHING_PACK,
  BALLOON_TEACHING_PACK,
  ...COMPLETE_REGISTRATIONS.map((entry) => entry.pack),
]);

const registrations = new Map([
  ["cat", { pack: CAT_TEACHING_PACK, appearance: CAT_APPEARANCE }],
  ["sun", { pack: SUN_TEACHING_PACK, appearance: SUN_APPEARANCE }],
  ["rainbow", { pack: RAINBOW_TEACHING_PACK, appearance: RAINBOW_APPEARANCE }],
  ["balloon", { pack: BALLOON_TEACHING_PACK, appearance: BALLOON_APPEARANCE }],
  ...COMPLETE_REGISTRATIONS.map(({ id, pack, appearance }) => [id, { pack, appearance }]),
]);

if (TEACHING_PACKS.length !== 30 || registrations.size !== 30)
  throw new TypeError("Every drawing must have exactly one complete teaching pack.");

export function applyLessonPack(lesson) {
  const registration = registrations.get(lesson?.id);
  if (!registration) return lesson;
  const compiled = applyTeachingPack(lesson, registration.pack);
  return attachTeachingAppearance(compiled, registration.appearance);
}
