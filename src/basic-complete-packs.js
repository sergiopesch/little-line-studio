// @ts-check
import { BASIC_COMPLETE_ART } from "./basic-complete-appearance.js";

const colourNotice = "Offer the crayons already available. The teacher models contained strokes; the child's colours, white spaces and marks may differ. More time holds without a deadline.";
/** @type {(instruction: string, spoken: string, hint: string, quietMs: number, canSkip?: boolean) => import("./authoring/contracts.ts").PracticeTeaching} */
const turn = (instruction, spoken, hint, quietMs, canSkip) => ({
  instruction, spoken, hint, quietMs, ...(canSkip === undefined ? {} : { canSkip }),
});
/** @type {(id: string, title: string, instruction: string, spoken: string, hint: string, quietMs: number, canSkip?: boolean) => import("./authoring/contracts.ts").NamedPracticeTeaching} */
const colour = (id, title, instruction, spoken, hint, quietMs, canSkip = false) => ({
  id, title, ...turn(instruction, spoken, hint, quietMs, canSkip), notice: colourNotice,
});
/** @type {readonly import("./authoring/contracts.ts").TeachingPhase[]} */
const phases = [
  { id: "observe", label: "Look" }, { id: "draw", label: "Draw" },
  { id: "colour", label: "Colour" }, { id: "explore", label: "Your own ideas" },
];
/** @type {(lessonId: string, content: Omit<import("./authoring/contracts.ts").TeachingPack, "version" | "lessonId" | "musicId" | "phases">) => import("./authoring/contracts.ts").TeachingPack} */
const pack = (lessonId, content) => Object.freeze({
  version: 1, lessonId, musicId: lessonId, phases, ...content,
});

const packs = {
  flower: pack("flower", {
    story: { thread: "One paper flower opens a tiny imaginary garden." },
    colouringLabel: "Petal patches and a golden centre",
    observe: { id: "notice", title: "A tiny paper garden.", ...turn(
      "Notice how each petal touches the little round centre.",
      "Let's begin an imaginary garden with one flower. A small circle holds the petals together, with a bending stem below.",
      "Find the small middle before following its surrounding petals.", 1000) },
    draw: {
      "flower-centre": turn("Draw a small circle with space around it.", "A small circle begins our flower. I leave room around it so the petals have somewhere to grow.", "Bring your curved line back towards its starting place.", 2000),
      "upper-petal": turn("Curve up from the centre and back again.", "Begin beside the circle. Curve up, round the soft tip, then return beside your starting place: one long petal.", "The two ends touch different places on the circle.", 3000),
      "left-petal": turn("Let another rounded petal reach out to the left.", "This petal reaches sideways. Travel out, round its end and return to the circle.", "Turn the same out-and-back movement towards the left.", 2000),
      "lower-petal": turn("Round a petal below the centre, leaving space below.", "Our next petal bends down and returns. I leave room beneath it for a stem.", "Keep a little space between your flower and paper's bottom.", 2000),
      "right-petal": turn("Add a petal reaching towards the other side.", "Reach out to the right and come back. Different-sized petals can belong to the same flower.", "Find the circle's right edge before making your curve.", 2000),
      "upper-right-petal": turn("Try a smaller petal in a gap, if you like.", "A smaller petal can fit in this upper gap. You can leave the gap open.", "Start and finish at the circle, even in a gap.", 1000, true),
      "lower-left-petal": turn("Choose another gap for an extra petal, or skip.", "Another petal can curl into the lower gap. A flower with fewer petals works too.", "Choose the petals you want in your paper garden.", 1000, true),
      "flower-stem": turn("Draw a gently bending stem below the flower.", "From the bottom petal, let a line bend down. This narrow stem joins our flower to its imagined garden.", "A straight stem or a bending stem both work.", 2000),
      "left-leaf": turn("Loop a leaf out from the stem, if you like.", "A leaf curves out from the stem to a point, then curves back to the same place.", "Let both ends of your leaf touch the stem.", 2000, true),
      "right-leaf": turn("Try a leaf on the other side, or leave space.", "Another leaf can point the other way. It can be higher, lower or a different size.", "Choose a new starting place along your stem.", 1000, true),
    },
    colourSteps: [
      colour("colour-choice", "Our garden colours.", "Choose pink, yellow and green, or your own colours.", "I choose pink petals, a yellow middle and green leaves. Your imaginary garden can use different colours.", "Place a few crayons nearby; you can change your mind.", 1000),
      colour("colour-first-petals", "One little petal patch.", "Colour the top and left petals with short strokes.", "Short pink strokes make little patches inside two petals. I lift and move along, slowing down near the curved edges.", "A few small strokes are easier to stop than one long stroke.", 2000),
      colour("colour-other-petals", "Petals around the middle.", "Continue around the lower and right petals.", "The next petals get the same gentle patches. I leave the extra petals white for a different look.", "White spaces can sit beside coloured petals in your flower.", 2000),
      colour("colour-centre", "A golden middle.", "Use tiny yellow strokes inside the round centre.", "Tiny yellow movements fit our small middle. Watch me lift before reaching its edge, keeping the petal colours separate.", "Try a shorter movement when the space becomes small.", 1000),
      colour("colour-leaves", "Green beside our stem.", "Colour any leaves you added with small green strokes.", "If you drew leaves, try green inside them. The narrow stem is already green in my example; leaves may stay white.", "You can skip this colour if you left out the leaves.", 1000, true),
      colour("colour-reflection", "A garden begins.", "Notice the centre, reaching petals and bending stem.", "Our little garden began with a circle. Look how the petals reach around it, each with room for its own colour.", "Look at the whole flower without needing to change it.", 1000, true),
    ],
    explore: { id: "explore", title: "Your garden can grow.", instruction: "Add another flower, keep colouring, or finish your garden here.", spoken: "Your garden can grow another flower, a path or something you invent. Keep drawing, or finish with this one flower.", hint: "Try a tiny flower beside this one another day.", canSkip: true },
  }),
  apple: pack("apple", {
    story: { thread: "A rosy apple becomes the first picture in an imaginary picnic." },
    colouringLabel: "Rosy curves and a little shine",
    observe: { id: "notice", title: "A paper picnic.", ...turn(
      "Notice the apple's two curved sides and little top dip.",
      "Let's draw an apple for an imaginary picnic. Two big curves meet at a little dip, with a stalk above.",
      "Follow one side from the top towards the bottom.", 1000) },
    draw: {
      "apple-left-side": turn("Curve out from the top and round the apple's bottom.", "Start near the top. Curve out to the left, round the side, then turn in towards the bottom.", "Let the side bulge out before curving back in.", 3000),
      "apple-right-side": turn("Bring the other side round to meet the top.", "From the bottom, curve out and up on the other side. The two curves meet to close our apple.", "Follow the outside with one broad, rounded movement.", 3000),
      "apple-stalk": turn("Grow a short bending stalk from the top dip.", "A short line bends up from the dip. I keep it much smaller than the apple.", "Begin where your two big apple curves meet.", 2000),
      "apple-leaf": turn("Try a pointed leaf beside the stalk, if you like.", "Two curves meet at a point to make one leaf. It touches the little stalk.", "Curve out to a point, then back towards the stalk.", 2000, true),
      "leaf-vein": turn("Add a line inside your leaf, if you drew one.", "If you added a leaf, a light line can travel through its middle. Otherwise, leave this detail out.", "Keep the little line inside the leaf's curved edges.", 1000, true),
      "apple-shine": turn("Try a small curved shine mark inside the apple.", "A small curve follows the apple's left side. I will leave paper white here to suggest shine.", "Leave space between your shine curve and outside edge.", 1000, true),
      "apple-dip": turn("Suggest the top dip with a tiny curve, if you like.", "A tiny curve near the stalk can show the dip more clearly. It is an extra detail.", "This little dip belongs near the apple's top.", 1000, true),
      "apple-ground": turn("Try a resting line below your apple, or skip.", "A low curve beneath the apple can become our pretend picnic cloth. Leave a small gap below the fruit.", "The resting line stays below your apple's outline.", 1000, true),
    },
    colourSteps: [
      colour("colour-choice", "Rosy picnic colours.", "Choose red and green, or another apple colour.", "I choose red for the apple and green for its leaf. Yellow or green apples can join a paper picnic too.", "Choose the apple colour you want to explore today.", 1000),
      colour("colour-apple-left", "Leave a little shine.", "Colour in small red patches, leaving a white shine space.", "I build small red patches on one side. The little white space stays uncoloured: paper can help us show shine.", "Keep small gaps instead of pressing harder to cover everything.", 2000),
      colour("colour-apple-right", "Round the other side.", "Continue red patches towards the apple's rounded edge.", "Now across the other side. I make shorter movements near the edge and lift before changing to the next patch.", "Follow your curved outline with small, gentle movements.", 2000),
      colour("colour-apple-leaf", "A little green leaf.", "Colour your leaf green, if you added one.", "A few small green strokes fit inside the leaf. Keep its thin middle line visible, or leave your leaf white.", "No leaf is needed; you can skip this colour.", 1000, true),
      colour("colour-reflection", "Our picnic apple.", "Notice how the white space sits beside your colour.", "Two big curves became a rounded apple. See how the coloured patches and white paper sit together in our picnic picture.", "Your apple can be rounder, taller or a different colour.", 1000, true),
    ],
    explore: { id: "explore", title: "Something for your picnic.", instruction: "Invent another picnic picture, keep colouring, or finish here.", spoken: "What else belongs in your imaginary picnic? Try another fruit, a cup or your own idea. You can finish whenever you like.", hint: "Another rounded shape could become a pear or a peach.", canSkip: true },
  }),
  fish: pack("fish", {
    story: { thread: "A little golden fish swims through an imagined paper pond." },
    colouringLabel: "Golden patches for our paper pond",
    observe: { id: "notice", title: "A little paper pond.", ...turn(
      "Notice the long oval and the tail at one end.",
      "Let's imagine a little fish swimming across our paper. Its rounded body has a tail at one end and a face at the other.",
      "Leave space beside the oval for its tail and face.", 1000) },
    draw: {
      "fish-body": turn("Draw a wide oval with space at both ends.", "A wide oval begins our fish. Curve round its sides and return to the start, leaving room for a tail.", "Make your oval wider across than it is tall.", 3000),
      "fish-tail": turn("Add a triangle tail touching one end of the oval.", "From the oval's left end, travel out, down and back to the same point. A triangle becomes our fish's tail.", "Let the triangle's point touch your oval's end.", 2000),
      "fish-eye": turn("Place a small eye near the other end.", "A tiny round eye goes inside the opposite end. I leave space between the eye and the outside edge.", "The face goes at the end away from the tail.", 1000),
      "fish-mouth": turn("Curve a tiny mouth near the front edge.", "A small curve near the front becomes a mouth in our storybook fish.", "Keep the mouth much smaller than your fish's oval.", 1000),
      "upper-fin": turn("Try a pointed fin above the body, if you like.", "Two slanting lines can rise above the body and return. This upper fin is your choice.", "Begin and finish where the fin meets the oval.", 1000, true),
      "lower-fin": turn("Try a small fin below the body, or skip.", "A second point can face down below the oval. Its size can be different.", "Leave your body outline visible between the two ends.", 1000, true),
      "gill-curve": turn("Try a gill curve behind the face, if you like.", "A bending line behind the face suggests a gill. I leave space around the eye.", "Keep this curve inside the body, near the face.", 1000, true),
      "upper-scale": turn("Add a small scale curve inside, if you like.", "A little sideways curve can begin a scale pattern inside the body.", "One short curve is enough to begin a pattern.", 1000, true),
      "middle-scale": turn("Try another little scale curve, or leave space.", "Another short curve sits nearby. I lift before choosing its place.", "Leave a small space between these curved marks.", 1000, true),
      "lower-scale": turn("Choose one more scale, or keep your open space.", "One more curve can finish our little pattern. You can stop with fewer scales.", "Your fish can have a few marks or none.", 1000, true),
      "near-bubble": turn("Try a round bubble beside your fish, if you like.", "A circle outside the fish can become a bubble in our pretend pond.", "Find some empty paper beyond the fish's face.", 1000, true),
      "higher-bubble": turn("Try a smaller bubble higher up, or skip.", "A smaller circle higher up gives our bubbles different sizes.", "Leave space around each circle instead of joining them.", 1000, true),
    },
    colourSteps: [
      colour("colour-choice", "Warm golden colours.", "Choose orange and yellow, or invent your fish's colours.", "I choose soft orange for our fish and yellow for its tail. Your paper pond can have a different-coloured fish.", "Two colours are enough; one colour works as well.", 1000),
      colour("colour-fish-middle", "Gentle patches across the oval.", "Build orange patches inside the middle of the body.", "Gentle orange strokes colour the wide middle. I lift between little patches so some paper can still show through.", "Start in the roomy middle before moving near an edge.", 2000),
      colour("colour-fish-face", "Small movements near the face.", "Use smaller orange strokes around the fish's face.", "Near the face, I use smaller movements. The dark eye and little curves can stay easy to see beside the colour.", "Slow your crayon as you come close to the outline.", 2000),
      colour("colour-fish-tail", "A little golden tail.", "Colour inside the triangular tail with short yellow strokes.", "Short yellow strokes fit inside the tail. I leave the fins white, giving our fish a few lighter spaces.", "The narrow point needs a tiny movement, or can stay white.", 1000),
      colour("colour-reflection", "Swimming across our paper.", "Look at the oval, tail and little spaces of colour.", "Our oval and triangle now suggest a fish swimming through an imagined pond. The little white spaces can stay.", "Notice how the small tail touches the large body.", 1000, true),
    ],
    explore: { id: "explore", title: "Your pond, your idea.", instruction: "Invent a pond neighbour, keep colouring, or finish here.", spoken: "Our paper pond can hold another fish, a waving plant or your own idea. Keep drawing, or finish with this little fish.", hint: "Try a shorter oval for a different imaginary fish.", canSkip: true },
  }),
  ladybird: pack("ladybird", {
    story: { thread: "A little ladybird pauses beside an imagined garden path." },
    colouringLabel: "Red wings and tiny dark patches",
    observe: { id: "notice", title: "A garden visitor.", ...turn(
      "Notice the oval body, small head and middle line.",
      "Let's draw a ladybird beside an imaginary garden path. Its large oval has a small head above and a line down the middle.",
      "Compare the small head with the larger oval body.", 1000) },
    draw: {
      "ladybird-body": turn("Draw a tall oval, leaving space around its sides.", "A tall oval begins our ladybird. Leave some space around it for a head and little legs.", "Curve around the whole oval and return to your start.", 3000),
      "ladybird-head": turn("Round a small head above the top of the oval.", "A small arch joins the oval near its top. I make this head narrower than the body.", "Let each end of the head meet the body.", 2000),
      "wing-division": turn("Draw a line down the middle of the oval.", "A line travels from the top of the oval to its bottom, showing two wing covers side by side.", "Notice the space on both sides of your line.", 2000),
      "left-feeler": turn("Try a short feeler above the head, if you like.", "A little bending feeler can reach above the head. This detail is your choice.", "Start on the head and curve towards empty paper.", 1000, true),
      "right-feeler": turn("Try another feeler on the other side, or skip.", "Another feeler can bend the other way. Their bends can be different.", "Keep both feelers smaller than the oval body.", 1000, true),
      "left-upper-spot": turn("Place a round spot inside one side, if you like.", "A small round spot sits inside one wing cover, away from its edge.", "Choose a place inside the oval for your spot.", 1000, true),
      "right-spot": turn("Try a spot on the other side, if you like.", "If you like, a second spot can sit on the other wing cover. You choose its place.", "Leave space around each spot you decide to draw.", 1000, true),
      "left-lower-spot": turn("Try a lower spot, or keep your open space.", "Another spot can sit lower down. Your ladybird's pattern can have fewer spots.", "The pattern does not need to match my example.", 1000, true),
      "left-upper-leg": turn("Try a little bent leg at the side, if you like.", "A short line reaches out, then bends. This can begin our ladybird's little legs.", "Begin near the body's edge and keep the leg short.", 1000, true),
      "left-middle-leg": turn("Add a middle leg on this side, or skip.", "Another little bent line reaches from the middle of this side.", "Place this short leg beside the middle of the body.", 1000, true),
      "left-lower-leg": turn("Try a lower leg pointing out, if you like.", "A lower leg points out and bends towards the bottom.", "Each little leg can bend in its own way.", 1000, true),
      "right-upper-leg": turn("Try a leg on the other side, or skip.", "On the other side, a short bent line reaches outwards.", "Look for some empty space beside the oval.", 1000, true),
      "right-middle-leg": turn("Try another little leg beside the middle, if you like.", "Another short leg can bend beside the middle, if you like.", "Lift your pencil before moving to this new place.", 1000, true),
      "right-lower-leg": turn("Choose a last lower leg, or finish your outline.", "One lower leg can complete my example. Your drawing can use fewer details.", "Keep a little paper space around the legs.", 1000, true),
    },
    colourSteps: [
      colour("colour-choice", "A red garden visitor.", "Choose red and a dark crayon, or your own colours.", "I choose red wing covers and soft dark grey details. You can choose the colours for your garden visitor.", "Keep the darker crayon for the smaller parts.", 1000),
      colour("colour-left-wing", "One side at a time.", "Colour one side red with short, lifted strokes.", "I colour one side in short red patches, leaving space near the spots. The middle line helps me see where to stop.", "Smaller strokes help beside a spot or dividing line.", 2000),
      colour("colour-right-wing", "Red on the other side.", "Make little red patches inside the other wing cover.", "Now the other side gets its red patches. I lift between places and keep small white gaps instead of rushing to cover them.", "White gaps can remain between your gentle crayon strokes.", 2000),
      colour("colour-ladybird-head", "A small dark head.", "Use tiny dark strokes inside the little head.", "The head is a small space, so I use tiny dark movements. The thin feelers and legs stay as pencil lines.", "Shorten the movement when the space becomes narrower.", 1000),
      colour("colour-ladybird-spots", "Dark little spots.", "Colour your spots, if you chose to add them.", "If you drew spots, small dark patches fit inside them. You can keep some spots white, or skip this colour.", "Use your own spot shapes as the places to colour.", 1000, true),
      colour("colour-reflection", "Resting beside our path.", "Notice the large oval and its tiny details.", "Look how a big oval holds the smaller marks. Our ladybird can rest here beside its imagined garden path.", "Notice one place where a tiny mark changes your picture.", 1000, true),
    ],
    explore: { id: "explore", title: "A place to pause.", instruction: "Invent a garden path, keep colouring, or finish here.", spoken: "Your garden visitor could rest on a leaf or beside a path you invent. Keep drawing as long as you like, or finish here.", hint: "A long gentle curve could become a garden path.", canSkip: true },
  }),
  "ice-cream": pack("ice-cream", {
    story: { thread: "A pretend ice-cream shop makes one strawberry-coloured paper cone." },
    colouringLabel: "A strawberry scoop and golden cone",
    observe: { id: "notice", title: "A pretend paper shop.", ...turn(
      "Notice the rounded scoop above the cone's narrow point.",
      "Let's open a pretend ice-cream shop on paper. A rounded scoop sits above a cone that narrows to a point.",
      "Look for the wide top and narrow bottom of the cone.", 1000) },
    draw: {
      "pointed-cone": turn("Draw a large V with a point at the bottom.", "Two slanting lines meet at a low point to make a V. Leave room above for our rounded scoop.", "Travel down to the point, then up the other side.", 3000),
      "rounded-scoop": turn("Round a scoop above the V and join across its bottom.", "Curve up and over from one top corner to the other. Join across the bottom so our scoop rests on the cone.", "The two ends of the scoop meet the V's upper corners.", 3000),
      cherry: turn("Try a little round cherry on top, if you like.", "A little circle can sit on the scoop like a cherry. Our pretend shop can leave it out.", "Keep this circle much smaller than the scoop below it.", 1000, true),
      "cherry-stalk": turn("Give your cherry a little stalk, if you added one.", "If you added a cherry, a short curving stalk can rise from it. Otherwise, skip this detail.", "Start at the top of your little cherry circle.", 1000, true),
      "left-sprinkle": turn("Try a small sprinkle inside the scoop, if you like.", "A tiny slanting line can become one sprinkle inside our scoop.", "Keep the little sprinkle inside the rounded scoop.", 1000, true),
      "upper-sprinkle": turn("Add another little sprinkle, or keep your space.", "Another short line can lean a different way. I lift before moving.", "Choose a new place rather than joining the sprinkles together.", 1000, true),
      "right-sprinkle": turn("Choose a last sprinkle, or leave this detail out.", "One more little mark can finish my sprinkle pattern. Yours can have fewer.", "A few small marks leave room for colour later.", 1000, true),
      "upper-cone-diagonal": turn("Try a light slanting line inside the cone, or skip.", "A light slanting line can begin a waffle pattern inside the cone. I stop before the outside edges.", "Keep both ends of this line inside the cone.", 1000, true),
      "lower-cone-diagonal": turn("Try a shorter slanting line lower down, or skip.", "Lower down, the cone is narrower, so this little slanting line is shorter.", "Notice how there is less room near the point.", 1000, true),
      "crossing-cone-line": turn("Try one line leaning the other way, if you like.", "A line leaning the other way can suggest a waffle pattern. It can stand alone if you skipped the earlier lines.", "Stop your line inside the cone's slanting edges.", 1000, true),
    },
    colourSteps: [
      colour("colour-choice", "A pretend flavour.", "Choose pink and golden brown, or invent your own flavour.", "I choose pink for a pretend strawberry scoop and golden brown for the cone. You can invent a different flavour colour.", "Your pretend shop can choose any crayons you have.", 1000),
      colour("colour-strawberry-scoop", "A soft strawberry scoop.", "Use short pink strokes inside the rounded scoop.", "Small pink strokes colour our scoop. I lift between patches and keep the sprinkle marks visible through the gentle colour.", "Light strokes leave the paper and little details showing.", 2000),
      colour("colour-golden-cone", "Wide top, tiny point.", "Colour the cone with smaller strokes near its point.", "Golden patches start in the wide part. Near the point, my movements become tiny, and some white paper stays.", "Small spaces can stay white instead of needing a big stroke.", 2000),
      colour("colour-cherry", "A little cherry colour.", "Colour your cherry red, if you added one.", "If you added a cherry, a few tiny red strokes fit inside it. You can leave the cherry white instead.", "No cherry is needed; skip this colour if you prefer.", 1000, true),
      colour("colour-reflection", "Ready at our paper shop.", "Notice the rounded scoop above its pointed cone.", "Our rounded scoop and pointed cone have different shapes. Their gentle colours make one picture for our pretend paper shop.", "Notice where your wide shape becomes a narrow point.", 1000, true),
    ],
    explore: { id: "explore", title: "Your shop's next idea.", instruction: "Invent another flavour, keep colouring, or finish here.", spoken: "Your pretend shop could draw another flavour, a little bowl or its own sign. Keep creating, or finish with this paper cone.", hint: "A new scoop can use the same curved movement.", canSkip: true },
  }),
  mushroom: pack("mushroom", {
    story: { thread: "A broad storybook mushroom becomes a tiny umbrella in an imagined woodland." },
    colouringLabel: "A brown cap and pale little stalk",
    observe: { id: "notice", title: "A storybook woodland.", ...turn(
      "Notice the broad cap above the narrower little stalk.",
      "Let's draw a storybook mushroom like a tiny woodland umbrella. Its broad cap sits over a narrower stalk, all on our paper.",
      "Compare the width of the cap with the stalk underneath.", 1000) },
    draw: {
      "mushroom-cap": turn("Draw a broad arch with room underneath.", "Travel up and over in one broad arch. I leave plenty of room beneath it for a little stalk.", "Begin low on one side and finish low on the other.", 3000),
      "cap-lower-edge": turn("Join the arch's ends with a shallow curved edge.", "A shallow curve joins the two ends. This closes our mushroom cap, like a little umbrella shape.", "Let this lower curve dip less than the tall arch above.", 2000),
      "stalk-left-side": turn("Start under the cap and curve one stalk side down.", "One gently bending line comes down from beneath the cap. Our stalk stays narrower than the cap above.", "Begin inside the cap's width, away from its outer end.", 2000),
      "stalk-right-side": turn("Draw the other stalk side, leaving space between.", "The other side curves down nearby. I leave a broad space between the two sides.", "Look at the gap while placing your second line.", 2000),
      "stalk-base": turn("Join the two stalk ends with a low curve.", "A low curve joins the bottom ends. Our little stalk is now a closed shape beneath the cap.", "Bring your curve from one bottom end to the other.", 1000),
      "cap-inner-edge": turn("Try a light curve inside the cap's lower edge, or skip.", "A light curve can follow the lower edge inside the cap. This extra line suggests a little rim.", "Leave a small gap between the two curved edges.", 1000, true),
      "cap-left-spot": turn("Try a small spot on the cap, if you like.", "A small oval can begin a pattern on our storybook cap. This decoration is your choice.", "Choose a space inside the cap, away from its edge.", 1000, true),
      "cap-high-spot": turn("Try a higher spot, or leave this space white.", "Another small oval can sit higher up on the cap.", "Leave some paper space between your little spots.", 1000, true),
      "cap-right-spot": turn("Place another spot inside the cap, if you like.", "A spot on the other side can be a different size.", "Each little oval can lean in a different direction.", 1000, true),
      "cap-low-spot": turn("Choose one last little spot, or skip.", "A last small spot can sit lower down. Fewer spots work too.", "Keep this extra detail inside the cap's outline.", 1000, true),
      "left-grass": turn("Try a little bending grass blade beside the stalk.", "A short bending line can become grass beside our paper mushroom.", "Begin near the ground and curve towards empty paper.", 1000, true),
      "right-grass": turn("Try another grass blade, or finish your outline.", "Another little blade can bend on the other side. You can leave the ground open.", "Your woodland picture can use just a few marks.", 1000, true),
    },
    colourSteps: [
      colour("colour-choice", "Soft woodland colours.", "Choose brown and cream, or your own storybook colours.", "I choose a soft brown cap and a pale cream stalk. Your storybook woodland can use the crayons you already have.", "A light brown or yellow can stand in for cream.", 1000),
      colour("colour-mushroom-cap", "Small brown patches.", "Build little brown patches inside the broad cap.", "Little brown patches colour the cap. I leave spaces around the optional spots, keeping some paper white beside the colour.", "Light pressure lets small white spaces remain visible.", 2000),
      colour("colour-mushroom-edge", "Follow the broad curved edge.", "Add shorter brown strokes near the cap's lower edge.", "Near the lower edge, I use shorter strokes and lift before the outline. Our little rim remains easy to see.", "Try a tiny movement when the edge comes close.", 1000),
      colour("colour-mushroom-stalk", "A pale little stalk.", "Use gentle cream strokes inside the stalk.", "Pale cream patches colour the stalk below. A few light strokes are enough; our paper can keep some of its own white.", "Start in the middle and leave space beside the outline.", 2000),
      colour("colour-reflection", "Our woodland umbrella.", "Notice the wide cap sheltering the narrow stalk.", "Our broad cap sits above a narrower stalk like a tiny storybook umbrella. Colour and paper spaces both belong in this woodland picture.", "Compare a wide shape with a narrow shape in your picture.", 1000, true),
    ],
    explore: { id: "explore", title: "A place in your story.", instruction: "Invent a woodland place, keep colouring, or finish here.", spoken: "Who might shelter under this imaginary umbrella? Add a made-up visitor, more grass or your own idea. You can finish here too.", hint: "A smaller arch could begin another storybook mushroom.", canSkip: true },
  }),
};

const appearanceById = new Map(Object.entries(BASIC_COMPLETE_ART));

export const BASIC_COMPLETE_REGISTRATIONS = Object.freeze(Object.entries(packs).map(([id, teaching]) => {
  const art = appearanceById.get(id);
  if (!art) throw new TypeError(`Missing authored appearance for ${id}.`);
  return Object.freeze({ id, pack: teaching, appearance: art.appearance, regions: art.regions });
}));
