const colourNotice =
  "Use the crayons you have. White spaces and your own colours belong here. More time keeps any stage open without a deadline.";

const colour = (id, title, instruction, spoken, hint, quietMs, canSkip = false) => Object.freeze({
  id, title, instruction, spoken, hint, quietMs, notice: colourNotice, canSkip,
});

export const BALLOON_TEACHING_PACK = Object.freeze({
  version: 1,
  lessonId: "balloon",
  story: Object.freeze({ thread: "A floating balloon brings a little colour to a pretend paper celebration." }),
  musicId: "balloon",
  colouringLabel: "A little colour, a little shine",
  observe: Object.freeze({
    id: "notice",
    title: "A little paper celebration.",
    instruction: "Notice the big rounded shape above its little knot.",
    spoken: "Let's draw a balloon for a pretend paper celebration. Notice its big rounded shape, little knot and bending string.",
    hint: "We only need a picture, paper, pencil and colours.",
    quietMs: 1000,
  }),
  draw: Object.freeze({
    "balloon-outline": Object.freeze({
      instruction: "Draw one tall, rounded shape with room below.",
      spoken: "Curve around a big rounded shape and return to the start. I leave room below for the knot and string.",
      hint: "A wide or wobbly balloon belongs in your picture too.",
      quietMs: 4000,
    }),
    "balloon-knot": Object.freeze({
      instruction: "Join a tiny triangle to the bottom.",
      spoken: "A tiny triangle touches the bottom of our balloon. Down, across, then back to the same point makes our little knot.",
      hint: "Let the triangle touch the bottom of your rounded shape.",
      quietMs: 2000,
    }),
    "flowing-string": Object.freeze({
      instruction: "Let a bending string travel down from the knot.",
      spoken: "Start at the knot and let a line wander down. I gently change direction to make a flowing string.",
      hint: "Look at the knot before beginning your long bending line.",
      quietMs: 3000,
    }),
    "left-bow-loop": Object.freeze({
      instruction: "Try a small bow loop beside the knot, if you like.",
      spoken: "A curve loops out beside the knot and comes back. This little bow is your choice.",
      hint: "Bring one curved loop back to where it began.",
      quietMs: 1000,
    }),
    "right-bow-loop": Object.freeze({
      instruction: "Try a bow loop on the other side, if you like.",
      spoken: "Another loop can curl out to the right and return to the knot. The loops can have different sizes.",
      hint: "Each loop joins the knot; either loop can stand alone.",
      quietMs: 1000,
    }),
    "balloon-shine": Object.freeze({
      instruction: "Add a little shine curve inside, if you like.",
      spoken: "A small curve follows part of the upper edge. Later, I leave paper white here to suggest a little shine.",
      hint: "Keep this small curve inside your big rounded outline.",
      quietMs: 1000,
    }),
    "upper-dot": Object.freeze({
      instruction: "Add a dot inside your balloon, if you like.",
      spoken: "A little dot can begin a pattern inside the balloon. You can leave the pattern out.",
      hint: "Find a spot inside the outline, away from its edge.",
      quietMs: 1000,
    }),
    "middle-dot": Object.freeze({
      instruction: "Choose another place for a dot, if you like.",
      spoken: "Another dot can sit in the middle. I lift my pencil before moving to a new place.",
      hint: "Leave a little room around each dot you choose.",
      quietMs: 1000,
    }),
    "lower-dot": Object.freeze({
      instruction: "Add a last dot, or keep your spaces.",
      spoken: "One last dot can sit lower down. A few marks are enough for our paper celebration.",
      hint: "Your pattern can have one dot, many dots or none.",
      quietMs: 1000,
    }),
  }),
  colourSteps: Object.freeze([
    colour("colour-choice", "A cheerful colour.",
      "Choose red, or a colour you enjoy.",
      "I choose a warm red for our balloon and yellow for its bow. Your celebration can use your own colours.",
      "Choose the crayons you already have within easy reach.", 1000),
    colour("colour-body-left", "Little red patches.",
      "Colour one side with short, gentle strokes.",
      "Short red strokes colour one side. I lift between patches and leave the little shine white. Light marks let our paper show through.",
      "Move closer to an edge with smaller, gentler marks.", 4000),
    colour("colour-body-right", "Across our rounded shape.",
      "Continue across the balloon, staying inside the outline.",
      "Now the other side. I slow near the edge and lift before going outside. Little white gaps can stay between our crayon marks.",
      "Your outline helps show where to stop and lift.", 4000),
    colour("colour-bow", "A little yellow bow.",
      "Colour your bow loops yellow, if you added them.",
      "If you added a bow, try tiny yellow strokes inside its loops. The little knot can stay white. You can skip this colour.",
      "Small spaces need small strokes; leaving them white works too.", 2000, true),
    colour("colour-reflection", "Notice your little celebration.",
      "Look at the round shape, bending string and colour.",
      "Look how our big rounded shape joins a tiny knot and bending line. Your colours and white spaces make this balloon your own.",
      "You can enjoy your picture without changing or explaining it.", 1000, true),
  ]),
  explore: Object.freeze({
    id: "explore",
    title: "Your celebration, your idea.",
    instruction: "Add your own ideas, keep colouring, or finish here.",
    spoken: "What could join your paper celebration? Try another balloon or something you invent. Keep drawing as long as you like, or finish.",
    hint: "Could a bending line become a kite's tail another day?",
    canSkip: true,
  }),
  phases: Object.freeze([
    Object.freeze({ id: "observe", label: "Look" }),
    Object.freeze({ id: "draw", label: "Draw" }),
    Object.freeze({ id: "colour", label: "Colour" }),
    Object.freeze({ id: "explore", label: "Your own ideas" }),
  ]),
});
