// @ts-check
import { applyTeachingPack } from "./teaching-pack.js";

// These quiet windows are authored starting points for this pilot, not learning
// deadlines. More time, Pause and Replay remain available throughout the lesson.
const DRAWING_QUIET_MS = Object.freeze({
  "round-head": 6000,
  "left-ear": 4000,
  "right-ear": 3000,
  "left-eye": 2000,
  "right-eye": 2000,
  "little-nose": 3000,
  "curved-mouth": 4000,
  "left-whisker-upper": 3000,
  "left-whisker-middle": 2000,
  "left-whisker-lower": 2000,
  "right-whisker-upper": 3000,
  "right-whisker-middle": 2000,
  "right-whisker-lower": 2000,
});

// Short captions support looking at the board; the recorded teacher explains the
// mark while it is demonstrated. Animal facts are sourced in the research note.
const DRAWING_TEACHING = Object.freeze({
  "round-head": Object.freeze({
    instruction: "Make a wide, round head. Leave room for the face inside.",
    spoken:
      "Let's begin with a wide, round head. Watch my line travel around and back towards its start. This big shape leaves room for the little face inside.",
    hint: "Move your whole hand around the curve. A little gap is fine.",
  }),
  "left-ear": Object.freeze({
    instruction: "Add a small triangle for the left ear.",
    spoken:
      "A small triangle makes our first ear. Up to a point, then down towards the head. Cats can turn their ears towards sounds. Our drawn ear stays still.",
    hint: "Find the top left of the head. Give your triangle a soft point.",
  }),
  "right-ear": Object.freeze({
    instruction: "Add the other triangle at the top right.",
    spoken:
      "Now add a triangle on the other side. Leave a little space between the ears.",
    hint: "Your ears can be different sizes. Look for where each joins the head.",
  }),
  "left-eye": Object.freeze({
    instruction: "Put one small, dark eye inside the head.",
    spoken:
      "Place a small, dark eye inside the head, a little above the middle. A tiny oval is enough. Notice how much space we leave around it.",
    hint: "Make a little dot or oval. Keep some room below for the nose.",
  }),
  "right-eye": Object.freeze({
    instruction: "Add the second eye, with a little space between.",
    spoken:
      "Add the other little eye across from the first. Leave room between them.",
    hint: "Look across from your first eye. The two eyes do not have to match.",
  }),
  "little-nose": Object.freeze({
    instruction: "Draw a tiny triangle below the eyes for the nose.",
    spoken:
      "Below the eyes, draw a tiny triangle with its point facing down. This is our nose. A small shape leaves a little space around it, inside the round face.",
    hint: "A tiny triangle or dot can sit between the eyes, a little lower down.",
  }),
  "curved-mouth": Object.freeze({
    instruction: "Join two little curves below the nose for the mouth.",
    spoken:
      "Watch two little curves meet below the nose, like a soft letter W. These curves make our picture's friendly mouth. You can give your cat a different expression.",
    hint: "Try one bend, then another beside it. One curve is fine too.",
  }),
  "left-whisker-upper": Object.freeze({
    instruction: "Let one whisker reach out from the left cheek.",
    spoken:
      "Let a light line reach out from the left cheek. This is a whisker. Real cats use their whiskers to sense nearby objects. Our lines show those special hairs.",
    hint: "Begin near the cheek and let your line travel outwards.",
  }),
  "left-whisker-middle": Object.freeze({
    instruction: "Add another left whisker, leaving a little space.",
    spoken:
      "Another light line below the first. Leave a little space.",
    hint: "Leave a small gap between your lines. This extra whisker is optional.",
  }),
  "left-whisker-lower": Object.freeze({
    instruction: "Try a third left whisker that slopes gently down.",
    spoken:
      "One more line can slope down, like a little fan. You can leave it out.",
    hint: "A short line works too. You can leave this extra whisker out.",
  }),
  "right-whisker-upper": Object.freeze({
    instruction: "Let a whisker reach out from the right cheek.",
    spoken:
      "Let's visit the other cheek. Start near the face and sweep a line out to the right. Notice how whiskers make our cat look wider than its round head.",
    hint: "Move away from the right cheek. A curved or straight line can work.",
  }),
  "right-whisker-middle": Object.freeze({
    instruction: "Add another right whisker with room beside it.",
    spoken:
      "Add one more light whisker, leaving a little space. It is optional.",
    hint: "Give each line a little space. You can leave this detail out.",
  }),
  "right-whisker-lower": Object.freeze({
    instruction: "Finish with one more right whisker, if you like.",
    spoken:
      "A final whisker can slope down. Your two sides can be different.",
    hint: "The two sides can be different. Keep as many whiskers as you like.",
  }),
});

const COLOUR_CAPTIONS = Object.freeze({
  "colour-choice": "Choose your cat's colours. Our example will be warm ginger, pink and cream.",
  "colour-fur": "Colour the left half of the fur with gentle, overlapping marks.",
  "colour-fur-right": "Carry your colour across the other half of the face and ear.",
  "colour-details": "Try cream around the mouth, with pink inside the ears and nose.",
  "colour-patterns": "Add a few darker stripes or cheek marks, if you like.",
  "colour-reflection": "Look at the whole picture. Which little mark or colour do you enjoy?",
});

/** @type {(id: keyof typeof COLOUR_CAPTIONS, title: string, instruction: string, hint: string, quietMs: number, canSkip?: boolean) => import("./authoring/contracts.ts").NamedPracticeTeaching & { readonly kind: "colour" }} */
function colourStep(id, title, instruction, hint, quietMs, canSkip = false) {
  return Object.freeze({
    id,
    kind: "colour",
    title,
    instruction: COLOUR_CAPTIONS[id],
    spoken: instruction,
    hint,
    notice:
      "Let your child choose the colours and whether to add them. More time holds this moment open for as long as they need.",
    canSkip,
    quietMs,
  });
}

export const CAT_COLOUR_STEPS = Object.freeze([
  colourStep(
    "colour-choice",
    "Choose your colours.",
    "Now let's bring colour to our cat. I am choosing warm ginger, pink and cream, like a picture in a storybook. Choose colours you enjoy. White paper can stay too.",
    "Try a little colour on spare paper first, if you want to see how it looks.",
    2000,
  ),
  colourStep(
    "colour-fur",
    "Soft colour on one side.",
    "Watch gentle marks build colour on the left cheek and ear. Little overlapping strokes make a soft, furry patch. I am leaving the eyes and mouth clear so we can see them.",
    "Light marks can sit beside and over each other. More time gives you as long as you want.",
    6000,
  ),
  colourStep(
    "colour-fur-right",
    "Colour the other side.",
    "Carry your colour across the other cheek and ear. Working on one small area at a time helps us choose where each mark goes. Your white spaces can be part of the fur.",
    "Turn your paper if that feels comfortable. Your colour can be light, dark or patchy.",
    6000,
  ),
  colourStep(
    "colour-details",
    "Colour the little details.",
    "I am adding cream around the mouth, then a little pink inside the ears and nose. Small spaces need only a few small marks. Notice how these lighter patches stand out.",
    "A few gentle marks are enough for a tiny patch. Choose your own colours or leave it as it is.",
    4000,
  ),
  colourStep(
    "colour-patterns",
    "A few finishing patterns.",
    "A few darker ginger marks make a pattern on my cat's forehead and cheeks. These little stripes follow the rounded face. Try your own pattern, or enjoy your cat just as it is.",
    "One stripe or spot can be enough. Your cat does not need a pattern.",
    4000,
    true,
  ),
  colourStep(
    "colour-reflection",
    "Take a little look.",
    "Look at the whole picture. We used big shapes, little details and layers of colour. Which mark do you enjoy? You can keep colouring, add an idea, or finish here.",
    "You do not need to explain or change anything. There is no hurry to finish.",
    1000,
    true,
  ),
]);

/** @type {readonly import("./authoring/contracts.ts").TeachingPhase[]} */
export const CAT_PILOT_PHASES = Object.freeze([
  Object.freeze({ id: "observe", label: "Look" }),
  Object.freeze({ id: "draw", label: "Draw" }),
  Object.freeze({ id: "colour", label: "Colour" }),
  Object.freeze({ id: "explore", label: "Your own ideas" }),
]);

const quietById = new Map(Object.entries(DRAWING_QUIET_MS));

/** @type {import("./authoring/contracts.ts").TeachingPack} */
export const CAT_TEACHING_PACK = Object.freeze({
  version: 1,
  lessonId: "cat",
  story: Object.freeze({
    thread: "Simple shapes become a curious cat with a world of its own.",
  }),
  musicId: "cat",
  colouringLabel: "Colour your cat",
  observe: Object.freeze({
    id: "notice",
    title: "Take a little look.",
    instruction: "Look for one round head, two ears and little features inside.",
    spoken:
      "Let's look at our cat. One big round shape holds the face, and two little ears sit on top. We will build the picture from these simple shapes, one at a time.",
    hint: "Notice where the ears meet the head, then find the little eyes inside.",
    quietMs: 1000,
  }),
  draw: Object.freeze(Object.fromEntries(
    Object.entries(DRAWING_TEACHING).map(([id, teaching]) => {
      const quietMs = quietById.get(id);
      if (quietMs === undefined) throw new TypeError(`Missing practice window for ${id}.`);
      return [id, Object.freeze({ ...teaching, quietMs })];
    }),
  )),
  colourSteps: CAT_COLOUR_STEPS,
  explore: Object.freeze({
    id: "explore",
    title: "Make it your own.",
    instruction: "Keep colouring, invent a home for your cat, or finish here.",
    spoken:
      "Our cat is ready for your own ideas. Perhaps a hat, a cosy home, or more colour. You can keep creating for as long as you like, or finish here.",
    hint: "A little detail can tell a story. What would you like to add?",
    canSkip: true,
  }),
  phases: CAT_PILOT_PHASES,
});

// Compatibility for callers of the original cat-only adapter.
/** @param {import("./authoring/contracts.ts").AuthoredLesson} lesson */
export function applyCatPilot(lesson) {
  return lesson?.id === "cat" ? applyTeachingPack(lesson, CAT_TEACHING_PACK) : lesson;
}
