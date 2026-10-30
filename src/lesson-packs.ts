import type { AuthoredLesson, TeachingRegistration } from "./authoring/contracts.ts";
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

export function createTeachingPackRegistry(entries: readonly TeachingRegistration[]) {
  const registry = new Map<string, Omit<TeachingRegistration, "id">>();
  for (const { id, pack, appearance } of entries) {
    if (typeof id !== "string" || !id.trim() || pack?.lessonId !== id ||
        !appearance || typeof appearance !== "object" || Array.isArray(appearance))
      throw new TypeError("Each teaching pack needs a matching lesson identity and appearance.");
    if (registry.has(id)) throw new TypeError(`Duplicate teaching pack: ${id}`);
    registry.set(id, { pack, appearance });
  }
  return registry;
}

const registrations = createTeachingPackRegistry([
  { id: "cat", pack: CAT_TEACHING_PACK, appearance: CAT_APPEARANCE },
  { id: "sun", pack: SUN_TEACHING_PACK, appearance: SUN_APPEARANCE },
  { id: "rainbow", pack: RAINBOW_TEACHING_PACK, appearance: RAINBOW_APPEARANCE },
  { id: "balloon", pack: BALLOON_TEACHING_PACK, appearance: BALLOON_APPEARANCE },
  ...COMPLETE_REGISTRATIONS,
]);

export const TEACHING_PACKS = Object.freeze([...registrations.values()].map(({ pack }) => pack));

export function applyLessonPack(lesson: AuthoredLesson): AuthoredLesson {
  const registration = registrations.get(lesson?.id);
  if (!registration) return lesson;
  const compiled = applyTeachingPack(lesson, registration.pack);
  return attachTeachingAppearance(compiled, registration.appearance);
}
