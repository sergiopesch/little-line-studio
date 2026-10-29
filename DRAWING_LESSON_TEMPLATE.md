# Drawing lesson authoring template

Use one reviewed teaching pack for each paper drawing. The current examples are [Curious cat](src/cat-pilot.js), [Friendly sun](src/sun-teaching-pack.js), [Rainbow](src/rainbow-teaching-pack.js) and [Floating balloon](src/balloon-teaching-pack.js). A pack combines a small story, observation, meaningful drawing actions, subject-specific crayon colouring and open exploration. All 30 English drawings now use this contract, with ten complete packs at each level. The remaining Basic, Intermediate and Expert packs live in the corresponding `src/*-complete-packs.js` modules and their native appearances in `src/*-complete-appearance.js`. A pack is fixed teacher content, not a conversational agent or an assessment of the child's paper.

## Start with the picture and teaching intention

Write one sentence describing what the child can explore: for example, “place outward lines around a central shape.” Choose a simple, recognisable finished picture and a palette appropriate to that picture. Plan its large shapes before small details; use natural curves, deliberate joins, enough space for features and a fixed camera that contains every mark. Where another form hides a contour, use `multiMark(id, parts, durationMs)` rather than drawing the construction edge through it. The semantic teaching action remains one stage; `src/outline-marks.js` allocates separate native draw records with explicit 180 ms pencil lifts and a deliberate minimum per contour. `LessonPreview` uses the same disconnected contours. The same native tldraw appearance must supply the teacher demonstration, still reference and catalogue preview.

Give the drawing a small story thread, such as a friendly storybook sun bringing sunshine to an imaginary garden. Mention it in the opening and return to it at a natural colouring or exploration moment. A story is an invitation, not a reward, a test or a reason to keep talking. Clearly distinguish an imagined face or colour from a fact about the real subject.

Select at most one or two short subject facts that help explain a feature being drawn. Check an appropriate primary source, record the exact link and scope in a research note, and avoid trivia that competes with the next mark. Do not ask a child to examine a hazardous real subject; the sun lesson uses the prepared screen reference and explicitly says not to look directly at the real Sun.

## Match the level to the drawing idea

Levels describe the drawing's complexity, not a child's age, ability or achievement. Keep the same warm voice, family controls and permission to make a different picture at every level.

| Level | Teaching focus | Demonstration and colouring |
| --- | --- | --- |
| Basic | Recognisable large shapes, positions, short curves and repeated marks. Introduce one new movement at a time. | Show the whole movement; keep captions concrete. Use short overlapping crayon patches and an optional second colour. |
| Intermediate | Combine familiar shapes; notice relative size, overlap, simple construction and a few meaningful details. | Explain one relationship while drawing it. Group only genuinely repeated actions, keep optional details independent, and demonstrate a simple light/dark layer. |
| Expert | Develop a more involved picture through proportion, structure, depth, texture or light, choosing only the ideas the subject needs. | Model a deliberate decision and a usable technique in small turns. Allow longer practice for construction and layering; avoid unexplained shortcuts or demands for precision. |

These are authoring choices, not experimentally established developmental stages. Define one main learning intention for the selected picture before adding detail. Review actual narration, demonstration and family feedback to set its duration; do not multiply a Basic lesson's time to manufacture an Expert lesson.

## Pack contract

`src/teaching-pack.js` compiles authored data into the existing lesson/controller contract. It validates the version, lesson identity, complete mark coverage, unique stage IDs, nonempty teaching text and finite practice windows. It remaps stroke indexes without changing their geometry, preserves the adult notes, and enables concurrent teaching with both actual audio and demonstration completion gates.

```js
const pack = {
  version: 1,
  lessonId: "sun",
  story: { thread: "A friendly storybook sun brings sunshine to an imaginary garden." },
  musicId: "sun", // an exact prepared asset identity; null preserves the level bed
  colouringLabel: "Colour your sunshine",
  observe: { id: "notice", title, instruction, spoken, hint, quietMs },
  draw: {
    "round-sun": { instruction, spoken, hint, quietMs },
    // Every existing semantic mark ID appears exactly once.
  },
  colourSteps: [
    { id, title, instruction, spoken, hint, quietMs, canSkip, notice },
  ],
  explore: { id: "explore", title, instruction, spoken, hint, canSkip: true },
  phases: [
    { id: "observe", label: "Look" },
    { id: "draw", label: "Draw" },
    { id: "colour", label: "Colour" },
    { id: "explore", label: "Your own ideas" },
  ],
};
```

The example shows field names, not executable lesson content. Register a complete pack and its matching native appearance in `src/lesson-packs.js`. The registry rejects any native painting phase that lacks a matching compiled colouring stage, including misspelled IDs; colouring cannot silently lose its owned demonstration. Every published lesson requires a complete registered teaching pack; no published subject can silently fall back to an unfinished outline lesson. Keep `instruction` as the short visible caption and `spoken` as the reviewed recording transcript. `hint` is a requested explanation, not another automatic speech slot. `notice` is written adult help and is never substituted for a child's instruction. Packs contain no provider keys, generated runtime prompts, microphone permissions or model-issued commands.

For localized captions, spoken scripts, hints and adult notes, use the [localization workflow and locale guides](docs/localization/README.md). Keep the same teaching intention while adapting wording for its audience and locale.

## Script each teaching turn

| Part | Authoring rule | Example |
| --- | --- | --- |
| Opening/observation | A brief story invitation plus one useful noticing cue; no spoken adult setup. | Notice the round middle and rays reaching out. |
| New drawing idea | Name the action, its position and one useful reason or technique while demonstrating it. | Leave room around the circle for rays. |
| Repeated mark | Use a shorter cue instead of repeating a full explanation. | Add the other eye across from the first. |
| Crayon demonstration | Show a comfortable small gesture, light pressure, a visible lift and a nearby new patch. | Move back and forth, then lift before the next patch. |
| Colour explanation | Relate colour to the subject/example and demonstrate one simple technique. | A light orange layer changes the yellow near the edge. |
| Reflection/exploration | Invite noticing and an own idea; allow finishing without an answer. | Keep colouring or invent a place for your sun to shine. |

Aim for visible captions of about 6–15 words. New short packs generally use 15–25 spoken words for a meaningful first explanation and fewer for repeats; this is an editorial guide, not a minimum that justifies padding. Hints should usually be about 8–15 words and simplify the current movement. Existing cat recordings are retained where they remain useful, including its somewhat longer explanations. Avoid talent labels, fabricated praise about unseen work, compulsory realism, exact matching, speed pressure and repeated quizzes. Optional details must remain genuine choices in both wording and controls. Later cues must still make sense when an earlier optional mark was omitted: locate an optional eye in the circle or a mouth in its lower half, rather than relying on an eye the child may not have drawn.

## Draw and colour like a teacher

Use true tldraw native draw gestures, not a colour wipe, a region suddenly filled by code, or a mechanical diagonal hatch pass. The teacher's crayon example should visibly travel back and forth over a small patch, vary pressure slightly, leave paper grain visible, lift, and move to the next patch. Keep the eyes and important outline marks readable. Keep the entire rendered crayon envelope inside its intended region, including grain offsets, pressure, caps and partial strokes. Test the SDK-generated ink geometry against independent subject boundaries; checking path centres alone is insufficient. Use authored insets, appropriate stroke widths and small movements rather than masking overflow. `src/crayon-regions.js` supports deliberately placed small curved patches inside independent subject contours. Its conservative centre-path trimming precedes grain generation; the separate test worker checks the public SDK ink envelope for every new gesture, at six progress prefixes in both pressure and solid zoom modes. Supply actual closed subject contours, never a convenient bounding rectangle around a differently shaped part. Use a coherent subject palette, while explicitly welcoming the child's alternatives and white spaces.

The read-only board omits tldraw's unused bitmap hatch definition. Authored shapes must not use the SDK's `pattern` fill unless the board definitions and content-security policy are reviewed together; the catalogue test enforces this constraint. The separate vector crayon grain remains available.

Author colouring in small stages: choose colours, build the base in one or two areas, colour smaller details, add an optional second layer or pattern, then look at the whole picture. Each painting-stage ID must match an appearance phase with a measured demonstration duration. Choice and reflection add no paint. Keep all previously demonstrated colour visible; Replay repeats the current gesture sequence without losing completed earlier stages. Reduced-motion mode shows the same honest completed state without animated travel.

## Pace the actual lesson, then review it

Teaching runs concurrently. A stage takes `max(actual voice duration / playback rate, actual demonstration duration) + authored practice`, excluding holds, pauses and replay. Both media completions are required. Do not extend a quiet gap simply to meet a target session length or add narration to fill it. A dot, a long outline and a crayon area need different budgets.

Use the current Cat and Sun as timing references, not universal optima: both have 62 seconds of authored practice after teaching. Their current default estimates, using prepared recordings and native demonstrations, are 293.430 seconds for Cat and 262.895 seconds for Sun. Rainbow now has 38 seconds of practice and a 239.873-second guided estimate, removing 39 seconds of waiting while preserving its demonstrations. Balloon has 28 seconds of practice and a 172.761-second guided estimate. The teacher's visible crayon work remains slow enough to follow; unnecessary waiting afterwards is shorter. Standard outline lessons use 12-second Basic, 18-second Intermediate and 24-second Expert drawing windows, plus two practice seconds for each authored demonstration second beyond eight. An explicit pack window overrides this fallback. Set each new window from the actual movement and explanation, then observe families rather than copying a total duration. More time holds indefinitely; Pause, Replay, optional navigation and open final exploration remain essential. Never infer completion or readiness from inactivity, silence or elapsed time.

Music has its own prepared identity for a new subject pack, with original prompts and retained provider/processing provenance. Write a restrained instrumental brief that fits its story without adding competing sound effects: Sun uses warm celesta/acoustic notes; Rainbow uses felt piano, rounded marimba and airy sustained tones after an imaginary shower; Balloon uses gentle guitar, rounded pizzicato strings and felt piano for a pretend paper celebration. Keep the music optional. It defaults on, but lesson playback starts only from the supervising adult's Begin gesture; an explicit sound-check gesture may preview it earlier. Provide a pre-start opt-out and visible in-session mute, protect speech with the shared ducked mix, and reuse the same playing element across ordinary steps. Pause, mute, hidden tabs and dialogs other than Help must still silence immediately. Help keeps music playing softly beneath its requested spoken hint. A warm soundtrack, voice or colour palette is a design preference, not a proven learning treatment.

Before generation, review every caption, spoken transcript, hint, optional dependency and cumulative drawing. Dry-run the complete catalogue, inspect exact cache reuse and reserve a bounded prepaid budget before paid requests. Review recordings, locally prepared loops and provenance; keys stay outside the browser. Run content/geometry/controller/audio tests and the production build. Then complete a real-time automatic browser run of the whole lesson, including colouring, music loops, holds, Replay, Pause/Resume, reduced motion and phone layouts. Browser decoding and screenshots do not establish natural voice delivery, pleasant loop joins or learning benefit; intended-device family listening and educator/child observation remain separate acceptance work.

The [evidence note](research/lesson-template-evidence.md) distinguishes source findings, factual subject material and the design choices in this template.
