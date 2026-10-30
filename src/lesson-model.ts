import type { AuthoredLesson, DrawingFrame, LessonStep } from "./authoring/contracts.ts";
import type { AuthoredMark, AuthoredStroke } from "./drawing/contracts.ts";
import type { StepKind } from "./core/contracts.ts";
import scripts from "./curriculum-scripts.json" with { type: "json" };
import { DEFAULT_FRAME, sampleEvenly } from "./lesson-geometry.js";
import { applyLessonPack } from "./lesson-packs.js";

export const PAPER_PREPARATION =
  "Find your paper and pencil. We will watch a little, then draw a little. Pause whenever you need.";

export const OBSERVATION_CUES = Object.freeze({
  cat: "Look at the cat example. Where do the ears join the head?",
  sun: "Look at the rays. How do they reach out from the middle?",
  rainbow: "Notice how one arch sits inside another.",
  balloon: "Notice where the string meets the balloon.",
  flower: "Look where the petals meet the centre.",
  apple: "Notice the dip where the stalk joins the apple.",
  fish: "Look where the tail joins the body.",
  ladybird: "Notice how the spots sit inside the wing shapes.",
  "ice-cream": "Look where the rounded scoop meets the pointed cone.",
  mushroom: "Notice how the cap is wider than the stalk.",
  dog: "Look at the sitting dog. How does its head sit above its paws?",
  turtle: "Notice which small parts stick out from the shell.",
  butterfly: "Look where the wings meet the narrow body.",
  owl: "Notice where the large eyes sit inside the owl's head.",
  sailboat: "Look where the mast meets the hull.",
  rocket: "Notice where the fins join the long rocket body.",
  house: "Look where the roof meets the walls.",
  train: "Notice how the wheels line up under the train.",
  cactus: "Look where the cactus grows out of its pot.",
  robot: "Notice the small lines joining the bigger shapes.",
  bird: "Look where the bird's feet meet the branch.",
  fox: "Notice how the tail curls in front of the body.",
  elephant: "Look at the legs. Which ones are partly hidden?",
  rabbit: "Notice which eye you can see from the side.",
  cup: "Look at the cup's oval opening. Notice the space inside its handle.",
  "fruit-bowl": "Notice which fruit is partly hidden behind another.",
  "tree-path":
    "Look at the path. Do its edges come closer together in the distance?",
  castle: "Notice how the bridge meets the gate.",
  lighthouse: "Look at where the lighthouse stands beside the sea.",
  coral: "Notice the spaces between the coral branches.",
});

const invitations = {
  cat: "A round face with its own expression.",
  sun: "Lines reaching out from a circle.",
  rainbow: "Curves, colours and room to imagine.",
  balloon: "A round shape and a wiggly string.",
  flower: "Petals, leaves and a little stem.",
  apple: "Two curves become a familiar fruit.",
  fish: "A body, a tail and a tiny smile.",
  ladybird: "Little spots and legs around an oval.",
  "ice-cream": "A scoop on a pointy cone.",
  mushroom: "A wide cap and a little stalk.",
  dog: "Join shapes for a sitting puppy.",
  turtle: "A big shell with small parts.",
  butterfly: "Wings and patterns of your own.",
  owl: "Big eyes and a branch to rest on.",
  sailboat: "A hull, a mast and billowing sails.",
  rocket: "Build a rocket from connected shapes.",
  house: "Make a home with a growing garden.",
  train: "Wheels and shapes that work together.",
  cactus: "Branches growing from a single stem.",
  robot: "Join shapes for a job you invent.",
  bird: "Find where feet meet a perch.",
  fox: "Curves that curl around one another.",
  elephant: "Big shapes and partly hidden legs.",
  rabbit: "Explore a view from the side.",
  cup: "Oval openings and hidden edges.",
  "fruit-bowl": "Fruit in front, fruit behind.",
  "tree-path": "A path that winds into the distance.",
  castle: "Towers, a gate and a bridge.",
  lighthouse: "A tall tower beside a wide sea.",
  coral: "Branching shapes and underwater spaces.",
};

export function defineLesson(id: keyof typeof scripts, marks: readonly AuthoredMark[], frame: DrawingFrame = DEFAULT_FRAME): AuthoredLesson {
  const script = scripts[id];
  if (!script || marks.length !== script.actions.length)
    throw new Error(
      `Geometry/script mismatch for ${id}: ${marks.length}/${script?.actions.length}`,
    );
  if (script.level !== "basic" && script.level !== "intermediate" && script.level !== "expert")
    throw new TypeError(`Unknown lesson level for ${id}.`);
  if (![frame.x, frame.y, frame.w, frame.h].every(Number.isFinite) || frame.w <= 0 || frame.h <= 0)
    throw new TypeError(`Lesson ${id} needs a finite frame with positive dimensions.`);
  const strokes: AuthoredStroke[] = marks.map((mark, index) => {
    if (!Number.isFinite(mark.durationMs) || mark.durationMs <= 0)
      throw new TypeError(`Mark ${id}/${mark.id} needs a positive finite duration.`);
    const parts = mark.parts?.map((part) => Object.freeze(sampleEvenly(part)));
    return {
      ...mark,
      ...(parts ? { parts: Object.freeze(parts) } : {}),
      points: parts ? parts.flat() : sampleEvenly(mark.points),
      step: index + 2,
    };
  });
  const bounds = strokes.reduce(
    (box, stroke) => {
      for (const point of stroke.points) {
        box.left = Math.min(box.left, point.x);
        box.right = Math.max(box.right, point.x);
        box.top = Math.min(box.top, point.y);
        box.bottom = Math.max(box.bottom, point.y);
      }
      return box;
    },
    { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity },
  );
  // Keep a fixed camera for the whole subject while using scarce phone space.
  const viewFrame = {
    x: bounds.left - 18,
    y: bounds.top - 18,
    w: bounds.right - bounds.left + 36,
    h: bounds.bottom - bounds.top + 36,
  };
  const parentNote =
    script.parentNote ||
    "Draw alongside on your own paper if help is wanted. Pause or choose More time whenever your child needs.";
  const stage = (stageId: string, kind: StepKind, title: string, instruction: string, hint: string, canSkip = false): LessonStep => ({
    id: stageId,
    kind,
    title,
    instruction,
    spoken: instruction,
    hint,
    notice: parentNote,
    canSkip,
  });
  const steps: LessonStep[] = [
    {
      ...stage(
        "prepare",
        "prepare",
        "Paper, pencil, together.",
        PAPER_PREPARATION,
        "Settle your paper somewhere comfortable, with room for your drawing hand.",
      ),
      notice: script.prepare,
    },
    {
      ...stage(
        "notice",
        "observe",
        "Take a little look.",
        OBSERVATION_CUES[id],
        "Look at one part of the example together. You can imagine your own version too.",
      ),
      notice: script.observe,
    },
    ...script.actions.map((action, index): LessonStep => {
      const stroke = strokes[index];
      if (!stroke) throw new TypeError(`Missing authored mark for ${id}/${index}.`);
      return {
        ...stage(
          stroke.id,
          "draw",
          stroke.id
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" "),
          action.instruction,
          action.hint,
          action.optional,
        ),
        spoken:
          action.instruction +
          (action.optional && !/skip/i.test(action.instruction)
            ? " This detail is your choice. You can leave it out."
            : ""),
        stroke,
      };
    }),
    stage(
      "explore",
      "explore",
      "Make it your own.",
      script.explore,
      script.transfer ||
        "Try the idea with a different subject another day, if you like.",
      true,
    ),
  ];
  return applyLessonPack(Object.freeze({
    id,
    title: script.title,
    level: script.level,
    invitation: invitations[id],
    objective: script.objective,
    parentNote,
    simplify: script.simplify,
    transfer: script.transfer,
    frame,
    viewFrame,
    strokes,
    steps,
  }));
}
