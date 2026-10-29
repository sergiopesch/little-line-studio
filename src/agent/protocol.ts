import { dataRecord } from "../core/lesson-engine.ts";
import type { Speed } from "../core/contracts.ts";

export const PROTOCOL_VERSION = 1;
export const REQUEST_BYTE_LIMIT = 4096;
export const OPERATIONS = ["describe", "list_lessons", "inspect_lesson", "rehearse_lesson"] as const;
export type Operation = typeof OPERATIONS[number];
export type ContentOperation = Exclude<Operation, "describe">;
export type AgentRequest =
  | { version: 1; operation: "describe" }
  | { version: 1; operation: "list_lessons"; locale: string }
  | { version: 1; operation: "inspect_lesson"; locale: string; lessonId: string }
  | { version: 1; operation: "rehearse_lesson"; locale: string; lessonId: string; speed: Speed; still: boolean; voice: boolean };

const common = { version: { const: 1 } };
const locale = { type: "string", minLength: 2, maxLength: 40, pattern: "^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$" };
const lessonId = { type: "string", minLength: 1, maxLength: 80, pattern: "^[a-z][a-z0-9-]*$" };
const fields = {
  describe: {},
  list_lessons: { locale },
  inspect_lesson: { locale, lessonId },
  rehearse_lesson: { locale, lessonId, speed: { enum: ["slow", "slower", "normal"] }, still: { type: "boolean" }, voice: { type: "boolean" } },
} as const;

/** Discoverable JSON Schema and parser share the exact field allowlist. */
export const REQUEST_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Trazolino local agent request v1",
  oneOf: OPERATIONS.map(operation => ({
    type: "object", additionalProperties: false,
    required: ["version", "operation", ...Object.keys(fields[operation])],
    properties: { ...common, operation: { const: operation }, ...fields[operation] },
  })),
};

export function parseRequest(input: unknown): AgentRequest | null {
  if (input && typeof input === "object" && Object.getOwnPropertySymbols(input).length) return null;
  const request = dataRecord(input);
  if (!request || request.version !== 1 || typeof request.operation !== "string" ||
      !OPERATIONS.includes(request.operation as Operation)) return null;
  const operation = request.operation as Operation;
  const keys = ["version", "operation", ...Object.keys(fields[operation])];
  if (Reflect.ownKeys(request).length !== keys.length || keys.some(key => !Object.hasOwn(request, key))) return null;
  if (operation === "describe") return { version: 1, operation };
  if (typeof request.locale !== "string" || request.locale.length < 2 || request.locale.length > 40 ||
      !/^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/.test(request.locale)) return null;
  if (operation === "list_lessons") return { version: 1, operation, locale: request.locale };
  if (typeof request.lessonId !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(request.lessonId)) return null;
  if (operation === "inspect_lesson") return { version: 1, operation, locale: request.locale, lessonId: request.lessonId };
  if ((request.speed !== "slow" && request.speed !== "slower" && request.speed !== "normal") ||
      typeof request.still !== "boolean" || typeof request.voice !== "boolean") return null;
  return { version: 1, operation, locale: request.locale, lessonId: request.lessonId,
    speed: request.speed, still: request.still, voice: request.voice };
}
