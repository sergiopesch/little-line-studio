#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createAgentWorkspace } from "../src/agent/workspace.ts";
import { createPublicCatalogue, publicLessonIds } from "../src/agent/catalogue.js";
import { OPERATIONS, REQUEST_BYTE_LIMIT } from "../src/agent/protocol.ts";
import { getLocale } from "../src/locale-registry.js";

const usage = `Trazolino local agent workspace — one JSON request on stdin, one JSON response on stdout.
Usage: node scripts/agent-workspace.mjs [--locale en-GB] [--lesson cat] [--allow list_lessons]
Repeat --locale, --lesson and --allow to grant specific public content and operations.
Only describe is enabled by default. There is no wildcard grant or live-session command.
Grants are chosen by the host launching the process, never by request data.
Allowed operations: list_lessons, inspect_lesson, rehearse_lesson.
Requests are limited to ${REQUEST_BYTE_LIMIT} UTF-8 bytes. See docs/platform.md for examples.
`;

function fail(code, message) {
  process.stdout.write(`${JSON.stringify({ version: 1, ok: false, error: { code, message } })}\n`);
  process.exitCode = 1;
}

try {
  const { values } = parseArgs({ options: {
    locale: { type: "string", multiple: true, default: [] },
    lesson: { type: "string", multiple: true, default: [] },
    allow: { type: "string", multiple: true, default: [] },
    help: { type: "boolean", default: false },
  }, strict: true, allowPositionals: false });
  if (values.help) process.stdout.write(usage);
  else {
    if (values.locale.some(locale => !getLocale(locale)) ||
        values.lesson.some(id => !publicLessonIds.includes(id)) ||
        values.allow.some(operation => operation === "describe" || !OPERATIONS.includes(operation)))
      throw new TypeError("Invalid host grant.");
    const workspace = createAgentWorkspace(createPublicCatalogue(), {
      operations: values.allow, locales: values.locale, lessonIds: values.lesson,
    });
    const chunks = [];
    let bytes = 0;
    // No socket, file-path input, environment access, generation client or browser bridge.
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > REQUEST_BYTE_LIMIT) throw new RangeError("Request too large.");
      chunks.push(chunk);
    }
    let input;
    try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw new SyntaxError("Invalid JSON."); }
    const result = await workspace.request(input);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.ok) process.exitCode = 1;
  }
} catch (error) {
  // Never reflect the untrusted payload, provider messages or filesystem details.
  if (error instanceof RangeError) fail("REQUEST_TOO_LARGE", `Maximum request size is ${REQUEST_BYTE_LIMIT} bytes.`);
  else if (error instanceof SyntaxError) fail("INVALID_JSON", "Provide one valid UTF-8 JSON request.");
  else fail("INVALID_CONFIGURATION", "Use --help for the supported host grants.");
}
