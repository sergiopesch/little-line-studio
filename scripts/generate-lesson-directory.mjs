import { readFileSync, writeFileSync } from "node:fs";
import { LESSONS } from "../src/lesson-catalogue.js";

const path = new URL("../src/lesson-directory.json", import.meta.url);
const output = `${JSON.stringify(LESSONS.map(({ id, level }) => ({ id, level })), null, 2)}\n`;
if (process.argv.includes("--write")) {
  writeFileSync(path, output);
} else if (process.argv.includes("--check")) {
  let existing = "";
  try { existing = readFileSync(path, "utf8"); } catch { /* Missing is stale. */ }
  if (existing !== output) {
    console.error("Lesson directory is stale. Run npm run update:directory.");
    process.exit(1);
  }
  console.log(`Verified ${LESSONS.length} lesson directory entries.`);
} else {
  console.error("Use --check or --write.");
  process.exit(2);
}
