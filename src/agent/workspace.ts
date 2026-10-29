import { rehearseLesson } from "../core/rehearsal.ts";
import { parseRequest, REQUEST_BYTE_LIMIT, REQUEST_SCHEMA, OPERATIONS } from "./protocol.ts";
import type { ContentOperation } from "./protocol.ts";
import type { TimingLesson } from "../core/contracts.ts";

export interface PublicLesson extends TimingLesson {
  readonly title: string;
  readonly invitation: string;
  readonly objective: string;
  readonly parentNote: string;
}
export interface LessonSummary {
  readonly id: string;
  readonly level: string;
  readonly title: string;
  readonly stepCount: number;
}
export interface PublicCatalogue {
  list(locale: string): Promise<readonly LessonSummary[]>;
  load(locale: string, lessonId: string): Promise<{
    lesson: PublicLesson; durations: Readonly<Record<string, number>>;
  } | null>;
}
export interface WorkspaceGrant {
  readonly operations: readonly ContentOperation[];
  readonly locales: readonly string[];
  readonly lessonIds: readonly string[];
}

/** Host-owned scope. A request cannot grant authority; there is no live-session port. */
export function createAgentWorkspace(catalogue: PublicCatalogue, grant: WorkspaceGrant) {
  if (!grant || !Array.isArray(grant.operations) || !Array.isArray(grant.locales) || !Array.isArray(grant.lessonIds) ||
      grant.operations.some(operation => operation === "describe" || !OPERATIONS.includes(operation)) ||
      grant.locales.some(locale => typeof locale !== "string" || !locale) ||
      grant.lessonIds.some(id => typeof id !== "string" || !id))
    throw new TypeError("Explicit operation, locale and lesson grants are required.");
  const operations = new Set<ContentOperation>(grant.operations);
  const locales = new Set(grant.locales);
  const lessonIds = new Set(grant.lessonIds);
  let revoked = false;
  const failure = (code: string, message: string) => ({ version: 1 as const, ok: false as const, error: { code, message } });

  async function request(input: unknown) {
    if (revoked) return failure("REVOKED", "This workspace has been revoked.");
    const command = parseRequest(input);
    if (!command) return failure("INVALID_REQUEST", "Use a complete version 1 request with only documented fields.");
    if (command.operation === "describe") return {
      version: 1 as const, ok: true as const, result: {
        name: "Trazolino local agent workspace", mode: "rehearsal-only", requestByteLimit: REQUEST_BYTE_LIMIT,
        permissions: { operations: [...operations], locales: [...locales], lessonIds: [...lessonIds] },
        requestSchema: JSON.parse(JSON.stringify(REQUEST_SCHEMA)) as typeof REQUEST_SCHEMA,
        limits: ["No live family session", "No personal data", "No media playback or generation", "No publication or network tools"],
      },
    };
    if (!operations.has(command.operation) || !locales.has(command.locale) ||
        ("lessonId" in command && !lessonIds.has(command.lessonId)))
      return failure("NOT_ALLOWED", "This operation or content is outside the workspace grant.");
    try {
      if (command.operation === "list_lessons") {
        const lessons = await catalogue.list(command.locale);
        if (revoked) return failure("REVOKED", "This workspace has been revoked.");
        return { version: 1 as const, ok: true as const, result: {
          locale: command.locale,
          lessons: lessons.filter(lesson => lessonIds.has(lesson.id)).map(({ id, title, level, stepCount }) => ({ id, title, level, stepCount })),
        } };
      }
      const loaded = await catalogue.load(command.locale, command.lessonId);
      if (revoked) return failure("REVOKED", "This workspace has been revoked.");
      if (!loaded || loaded.lesson.id !== command.lessonId)
        return failure("UNAVAILABLE", "The requested authored lesson is unavailable in this locale.");
      const { lesson, durations } = loaded;
      if (command.operation === "rehearse_lesson") return {
        version: 1 as const, ok: true as const,
        result: { locale: command.locale, ...rehearseLesson(lesson, durations, command) },
      };
      // Explicit projection prevents future private/provider fields leaking through a spread.
      return { version: 1 as const, ok: true as const, result: {
        locale: command.locale, id: lesson.id, title: lesson.title, level: lesson.level,
        invitation: lesson.invitation, objective: lesson.objective, parentNote: lesson.parentNote,
        steps: lesson.steps.map(({ id, kind, title, instruction, spoken, hint, notice }) => ({ id, kind, title, instruction, spoken, hint, notice })),
      } };
    } catch {
      return failure("UNAVAILABLE", "The authored catalogue could not complete this request.");
    }
  }
  return Object.freeze({ request, revoke() { revoked = true; } });
}
