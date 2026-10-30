// @ts-check
const colourNotice =
  "Let your child choose colours, leave white spaces or omit details. More time holds any stage open without a deadline.";

/** @type {(id: string, title: string, instruction: string, spoken: string, hint: string, quietMs: number, canSkip?: boolean) => import("./authoring/contracts.ts").NamedPracticeTeaching} */
function colour(id, title, instruction, spoken, hint, quietMs, canSkip = false) {
  return Object.freeze({
    id, title, instruction, spoken, hint, quietMs, canSkip,
    notice: colourNotice,
  });
}

/** @type {import("./authoring/contracts.ts").TeachingPack} */
export const SUN_TEACHING_PACK = Object.freeze({
  version: 1,
  lessonId: "sun",
  story: Object.freeze({
    thread: "A friendly storybook sun brings sunshine to an imaginary garden.",
  }),
  musicId: "sun",
  colouringLabel: "Colour your sunshine",
  observe: Object.freeze({
    id: "notice",
    title: "A little sunshine.",
    instruction: "Look at our picture's round middle and outward rays.",
    spoken:
      "Let's draw a friendly sun for our imaginary garden. The real Sun is a star that gives Earth light and warmth. Notice our picture's rays.",
    hint: "We use our screen picture. Never look directly at the real Sun.",
    quietMs: 1000,
  }),
  draw: Object.freeze({
    "round-sun": Object.freeze({
      instruction: "Draw a round middle, leaving space all around.",
      spoken:
        "Start with a round shape in the middle. Bring one slow curve back towards its start. Leave room outside for our sunshine lines.",
      hint: "A circle can be wobbly. Leave some paper around it.",
      quietMs: 6000,
    }),
    "upward-ray": Object.freeze({
      instruction: "Add a short ray above the circle.",
      spoken:
        "Add a short line above the circle, leaving a little gap. These rays are our picture's way of showing light spreading out.",
      hint: "A little gap can separate the round middle and its ray.",
      quietMs: 3000,
    }),
    "downward-ray": Object.freeze({
      instruction: "Add a ray below the circle.",
      spoken:
        "Now a line below the circle, pointing down. Look at how these two rays reach in opposite directions.",
      hint: "Begin just outside the lower edge, then move down.",
      quietMs: 2000,
    }),
    "left-ray": Object.freeze({
      instruction: "Let one ray reach out to the left.",
      spoken:
        "Let a line reach out on the left. Keep some space around the round middle.",
      hint: "Find the left side of our picture. Sweep your line away from the circle.",
      quietMs: 2000,
    }),
    "right-ray": Object.freeze({
      instruction: "Let a ray reach out to the right.",
      spoken:
        "And one on the right. Our sunshine lines are spreading all around the middle.",
      hint: "Start just outside the circle and move your line outwards.",
      quietMs: 2000,
    }),
    "upper-left-ray": Object.freeze({
      instruction: "Put a slanting ray in the upper-left gap.",
      spoken:
        "Here is a gap between two rays. A slanting line fits into that space. I look for room first, then make my mark.",
      hint: "Find a space between the upper ray and the left ray.",
      quietMs: 3000,
    }),
    "upper-right-ray": Object.freeze({
      instruction: "Add another slanting ray in the upper-right gap.",
      spoken:
        "Another slanting line can fill this gap. It does not need to match the first.",
      hint: "Your rays can be different lengths and still belong in your picture.",
      quietMs: 2000,
    }),
    "lower-left-ray": Object.freeze({
      instruction: "Try a gently bending ray below, if you like.",
      spoken:
        "A gently bending ray can sit down here. Straight or curved lines both belong in our storybook picture. You can leave this one out.",
      hint: "A small bend is enough. This extra ray is optional.",
      quietMs: 2000,
    }),
    "lower-right-ray": Object.freeze({
      instruction: "Add a final ray in a gap, if you like.",
      spoken:
        "One last ray can reach into this space. Choose your own line, or leave the gap as it is.",
      hint: "Your sun does not need a ray in every space.",
      quietMs: 2000,
    }),
    "sun-left-eye": Object.freeze({
      instruction: "Add a small eye for our storybook sun, if you like.",
      spoken:
        "Our real Sun has no face, but this storybook sun can. A small dark dot makes an eye inside the circle, if you like.",
      hint: "A dot or little oval works. You can leave the face out.",
      quietMs: 2000,
    }),
    "sun-right-eye": Object.freeze({
      instruction: "Add a small eye on the right, if you like.",
      spoken:
        "A small eye can sit inside the right side of your circle. Try a dot or little oval, if you like.",
      hint: "Keep your little eye inside the circle, with space around it.",
      quietMs: 2000,
    }),
    "sun-smile": Object.freeze({
      instruction: "Try one soft curve for a smile, if you like.",
      spoken:
        "A soft curve can make our storybook sun smile. Put it in the lower half of the circle, or leave the mouth out.",
      hint: "A little bend is enough. The smile is your choice.",
      quietMs: 4000,
    }),
  }),
  colourSteps: Object.freeze([
    colour(
      "colour-choice", "Choose a little warmth.",
      "Choose yellow and orange, or colours you enjoy.",
      "Let's give our storybook sun a warm yellow glow. I will use yellow and a little orange. Your sun can have colours of its own.",
      "Try one soft mark on spare paper to see your crayon's colour.", 2000,
    ),
    colour(
      "colour-centre-left", "A little crayon colour.",
      "Colour one side with short, gentle crayon strokes.",
      "Watch short, slow crayon strokes colour one side. Move back and forth, then lift before the next patch. Little gaps let the paper sparkle.",
      "Let marks overlap lightly. Stop and lift between small patches.", 8000,
    ),
    colour(
      "colour-centre-right", "Across the sunny middle.",
      "Continue across the other side; keep the face clear.",
      "Now move across the other side with light crayon strokes. I leave the eyes and smile clear so we can still see our friendly face.",
      "Turn your paper if that helps. White spaces can stay.", 8000,
    ),
    colour(
      "colour-rays", "Warm little rays.",
      "Colour a few rays with slow orange strokes.",
      "A little orange makes our picture's rays look warm. Follow each ray with one slow crayon stroke, then lift. Colour a few or all.",
      "Lift your crayon between rays. Choose any rays you want.", 6000,
    ),
    colour(
      "colour-warmth", "A soft second layer.",
      "Try a light orange layer near the edge, if you like.",
      "I add soft orange near the edge, over the yellow. A light second layer changes our colour. Try it, or keep your sun yellow.",
      "A few gentle marks are enough. Your sun can stay yellow.", 4000, true,
    ),
    colour(
      "colour-reflection", "Look at your sunshine.",
      "Notice the shapes and colours in your whole picture.",
      "Look at your round shape, rays and crayon marks together. Which part feels sunny? Our picture can bring sunshine to that imaginary garden.",
      "You do not need to change or explain anything today.", 1000, true,
    ),
  ]),
  explore: Object.freeze({
    id: "explore",
    title: "Your own sunny world.",
    instruction: "Add your own sunny world, keep colouring, or finish here.",
    spoken:
      "Would your sun shine over flowers, a house, or a world you invent? Keep drawing or colouring as long as you like, or finish.",
    hint: "Could lines reaching out from a middle help you draw a flower another day?",
    canSkip: true,
  }),
  phases: Object.freeze([
    Object.freeze({ id: "observe", label: "Look" }),
    Object.freeze({ id: "draw", label: "Draw" }),
    Object.freeze({ id: "colour", label: "Colour" }),
    Object.freeze({ id: "explore", label: "Your own ideas" }),
  ]),
});
