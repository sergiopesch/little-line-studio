import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function sourceIdentity(root, env = process.env) {
  let revision = env.VERCEL_GIT_COMMIT_SHA || null;
  let dirty = null;
  if (revision && !/^[a-f0-9]{40}$/.test(revision)) throw new Error("Invalid Vercel commit identity");
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  let head;
  try { head = git("rev-parse", "HEAD"); } catch { /* Source archives may omit .git. */ }
  if (head) {
    if (revision && revision !== head) throw new Error("Vercel commit differs from checkout");
    revision ??= head;
    try {
      const status = git("status", "--porcelain", "--untracked-files=normal");
      dirty = Boolean(status);
      // Vercel may reserialize its config before invoking the build. Permit only
      // that unstaged, value-identical rewrite, retaining every other dirty check.
      if (env.VERCEL === "1" && status === "M vercel.json" && !git("diff", "--summary", "--", "vercel.json")) {
        dirty = !isDeepStrictEqual(
          JSON.parse(git("show", "HEAD:vercel.json")),
          JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")),
        );
      }
    } catch { /* Unknown stays unknown. */ }
  } else if (env.VERCEL === "1" && revision) {
    // Vercel source archives carry the deployment commit without a Git checkout.
    dirty = false;
  }
  return { revision, dirty };
}

export function releaseMetadata(root, document, env = process.env) {
  return { schemaVersion: 1, ...sourceIdentity(root, env), indexSha256: sha256(document) };
}
