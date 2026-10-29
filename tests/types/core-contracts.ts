import type { LessonCommand, PlaybackCommand } from "../../src/core/contracts.ts";
import type { AgentRequest } from "../../src/agent/protocol.ts";
import { createLessonEngine } from "../../src/core/lesson-engine.ts";

const engine = createLessonEngine([]);
// These must stay compiler errors, proving that unsafe call shapes are not typed commands.
// @ts-expect-error supervision is an explicit boolean, never a truthy string
const badStart: LessonCommand = { type: "START", supervised: "true" };
// @ts-expect-error media events require an identity and cannot select lessons
const badMedia: PlaybackCommand = { type: "VOICE_DONE", lessonId: "cat" };
// @ts-expect-error no live-session or publication command exists
const badAgent: AgentRequest = { version: 1, operation: "publish" };
// @ts-expect-error session state is read-only at the interface
engine.initialState.phase = "drawing";
void [badStart, badMedia, badAgent];
