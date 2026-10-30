import { randomUUID } from "node:crypto";
import { closeSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";

export interface ExportFile { readonly destination: URL; readonly contents: string }

// Validate and stage the complete output before replacing any destination.
// Each rename is atomic; multiple renames are not a filesystem transaction.
export function writeExportFiles(files: readonly ExportFile[]): void {
  const seen = new Set<string>();
  const outputs = files.map(({ destination, contents }) => {
    if (!(destination instanceof URL) || destination.protocol !== "file:" || destination.search || destination.hash || typeof contents !== "string")
      throw new TypeError("An export needs a local file URL and serialized text");
    const path = fileURLToPath(destination);
    if (seen.has(path)) throw new TypeError(`Duplicate export destination: ${path}`);
    seen.add(path);
    return { path, contents, temporary: join(dirname(path), `.${basename(path)}-${randomUUID()}.tmp`) };
  });
  const staged = new Set<string>();
  try {
    for (const output of outputs) {
      const fd = openSync(output.temporary, "wx");
      staged.add(output.temporary);
      try { writeFileSync(fd, output.contents, "utf8"); } finally { closeSync(fd); }
    }
    for (const output of outputs) {
      renameSync(output.temporary, output.path);
      staged.delete(output.temporary);
    }
  } finally {
    for (const temporary of staged) rmSync(temporary, { force: true });
  }
}
