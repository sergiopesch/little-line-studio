# Drawing curriculum: Basic, Intermediate and Expert

Authored 26 October 2026 for the parent-supervised, paper-first drawing studio.

This is the content design for thirty distinct lessons, ten per level. Authored outline scripts supply the catalogue, with subject-specific preparation notes retained in parent help. Cat, Friendly sun and Rainbow also have complete reviewed story-and-crayon packs using [the shared authoring template](../../DRAWING_LESSON_TEMPLATE.md). The other 27 retain outline teaching and colouring invitations pending complete packs. Observation stages use concise, subject-specific feature cues, retaining fuller context in parent help. Publication follows production and browser verification.

## The three collections

| Collection | Teaching focus | Drawings |
| --- | --- | --- |
| Basic drawing | Explore lines, curves, enclosed shapes and small features | Curious cat face; friendly sun; rainbow; floating balloon; garden flower; apple; little fish; ladybird; ice-cream cone; woodland mushroom |
| Intermediate drawing | Connect parts, compare sizes, arrange repeated forms and make purposeful choices | Sitting dog; turtle; butterfly; owl; sailboat; space rocket; house and garden; toy locomotive; potted cactus; friendly robot |
| Expert drawing | Explore viewpoint, overlap, proportion, depth and composition | Bird on a branch; sleeping fox; side-view elephant; rabbit looking sideways; cup and saucer; bowl of fruit; tree beside a winding path; castle with a drawbridge; lighthouse on the coast; underwater coral scene |

The levels describe the available drawing challenges. They do not classify a child, certify mastery or impose an age expectation. Families may select any collection without a test, completing an earlier collection or creating a profile. Expert is the most complex collection within this studio; it does not promise professional expertise.

## Complete scripts

- [Basic drawing](basic-drawing.md)
- [Intermediate drawing](intermediate-drawing.md)
- [Expert drawing](expert-drawing.md)

Each script specifies a goal, a noticing prompt, small individual drawing actions, an optional hint for each action, parent support, creative choices and a later opportunity to use the skill with another subject. Counts describe teaching turns, not a required duration, quota or measure of ability.

| Script | Lessons | Drawing actions, including optional details |
| --- | ---: | ---: |
| Basic | 10 | 110 |
| Intermediate | 10 | 190 |
| Expert | 10 | 200 |
| Total | 30 | 500 |

Teaching packs add their own observation, colouring and exploration stages. Action counts do not determine total duration or imply that a child must copy every mark.

Structural review checked ten lessons per document, sequential action numbering, nonempty instructions and hints, required teaching sections and local link destinations. Content review identified and corrected optional-detail dependencies and unclear hidden outlines. This review is separate from the future geometric, audio and family testing required for the implemented lessons.

## Common teaching contract

1. The family selects a subject together. A grown-up stays alongside at every level.
2. Preparation checks paper and pencil. Observation invites noticing a meaningful feature, without making a quiz compulsory.
3. A short instruction and read-only tldraw demonstration show one small action or relationship.
4. After the instruction and demonstration finish, the trusted scripted controller provides practice matched to the action, then continues automatically. More time holds indefinitely; Pause stops sound, movement and progression. Estimates are not deadlines, and interruption never causes catch-up.
5. Repeat, a requested hint, a simpler variation, optional-detail skipping and stopping remain available. Optional Ready for next and Back controls preserve family choice. If a detail depends on an earlier optional feature, its wording still makes sense when that feature was omitted. Help never assumes confusion or distress from silence.
6. The ending offers a genuine creative decision. A later, optional prompt changes the subject or reference so the same skill can be explored independently.

The child draws on paper. The application cannot see it and must never claim to have checked accuracy, effort, improvement, emotion or readiness. Parents can describe what they actually observe; the voice cannot invent feedback about unseen work. Variations, gaps, asymmetry and omitted details are acceptable choices.

Prepared voice reads the reviewed instruction at an authored boundary or on request. Actual voice and demonstration completion are prerequisites for the trusted controller; a model cannot change progression or settings, and silence never implies readiness. Music remains optional and defaults on, with playback unlocked by the supervising adult's Begin gesture or a separate explicit sound check. Pre-start opt-out, in-session mute, ducking beneath teaching and immediate interruption silence remain available. Music is not presented as a proven learning enhancement.

## Evidence and design judgments

The existing [teaching review](../teaching-methodology-review.md) supports investigating a combination of observation coaching, meaningful demonstrations, supported practice, parent conversation and creative agency. The [drawing evidence](../drawing-instruction-evidence.md) gives a particularly relevant distinction: reproducing a polished sequence is not sufficient evidence of independent transfer. The [feedback review](../feedback-parent-evidence.md) supports restrained, accurate language and preserving parent-child conversation. The [pacing review](../pacing-practice-medium-evidence.md) motivates explicit segmentation and varied later practice, with substantial task and population limits.

These sources do not validate this exact catalogue, subject ordering, step count or interface. The scripts are authored design proposals. Art-educator review, accessibility review and supervised family testing are needed to assess clarity, appropriate challenge, enjoyment and independent application. Completion alone must not become an efficacy claim.

## Implementation contract

- Keep the static registry of thirty authored outline lessons and the shared adapter for complete teaching packs. Preserve stable lesson and step IDs, and co-locate each drawing action with its demonstration geometry.
- Use one reusable, read-only tldraw player. Derive each catalogue preview from the same final geometry as its actual lesson. Preserve SDK licensing and required notices.
- Use the three collection choices and subject catalogue without age fields or age-derived state.
- Keep the existing adult acknowledgement, paper preparation, optional voice check, pause/resume gate and written fallback. Selecting a different lesson resets its progress and cancels the previous sound and demonstration.
- Generate narration locally from reviewed scripts, with content-based caching, stable manifest keys and demand-loaded playback. Accept only exact same-origin manifest assets.
- Keep no microphone, camera, uploads, accounts, stored child profiles, tracking or runtime cloud AI. Retain the existing Worker security policy.

## Release acceptance

The catalogue must contain ten unique, playable lessons per collection. Every drawing action must have bounded finite geometry, matching written/spoken instructions and a usable hint. Every referenced clip must match its transcript and integrity metadata. Unknown selections and navigation beyond a lesson's bounds must be rejected safely.

Review the final drawing and representative intermediate states for all thirty subjects; schema checks cannot establish recognisability or teaching quality. Check home, collection, setup, lesson, help, settings, pause and finish at desktop, small-phone and short-landscape sizes. Essential controls should fit the teaching viewport at ordinary text size; long policy text and enlarged accessibility text must remain reachable through scrolling.

Verify repeat, optional skipping, selecting another subject, restarting, reduced motion, tab hiding, muted audio and unavailable audio. None may skip interrupted teaching, catch up elapsed time, bypass the adult resume boundary or retain stale narration/shapes from the previous subject. Publish to the existing Site only after these checks and the selected brand have been reviewed.
