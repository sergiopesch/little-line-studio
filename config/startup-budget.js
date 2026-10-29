import { gzipSync } from "node:zlib";

// Count the full static import closure, not only the file named "index". A
// shared/vendor chunk must not make a startup regression invisible.
export function startupChunks(bundle) {
  const seen = new Set();
  function visit(name) {
    if (seen.has(name)) return;
    const chunk = bundle[name];
    if (chunk?.type !== "chunk") throw new Error(`Missing startup chunk: ${name}`);
    seen.add(name);
    chunk.imports.forEach(visit);
  }
  const entries = Object.values(bundle).filter(item => item.type === "chunk" && item.isEntry);
  if (!entries.length) throw new Error("No application entry found.");
  entries.forEach(entry => visit(entry.fileName));
  return [...seen].map(name => bundle[name]);
}

export function checkStartupBudget(bundle) {
  const chunks = startupChunks(bundle);
  const bytes = chunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0);
  const gzipBytes = chunks.reduce((sum, chunk) => sum + gzipSync(chunk.code).length, 0);
  // Current licensed baseline: 337 kB / 97 kB gzip. Leave modest headroom,
  // while rejecting the previous 1.10 MB / 331 kB gzip startup.
  if (bytes > 400_000 || gzipBytes > 115_000)
    throw new Error(`Startup JavaScript exceeds budget: ${bytes} bytes, ${gzipBytes} gzip bytes (limits 400000 / 115000).`);
  const forbidden = /(?:\/src\/(?:App\.jsx|Catalogue\.jsx|lesson-catalogue\.js|lessons\/|curriculum-scripts\.json|narration-(?:index|durations)[^/]*\.json)|\/node_modules\/(?:@tldraw|tldraw)\/)/;
  const leaked = chunks.flatMap(chunk => Object.keys(chunk.modules)).filter(id => forbidden.test(id.replaceAll("\\", "/")));
  if (leaked.length) throw new Error(`Lesson resources loaded at startup: ${leaked.join(", ")}`);
  return { bytes, gzipBytes, chunks: chunks.length };
}

export function startupBudgetPlugin() {
  return {
    name: "startup-budget",
    generateBundle(_options, bundle) {
      const result = checkStartupBudget(bundle);
      console.log(`Startup JavaScript: ${result.bytes} bytes / ${result.gzipBytes} gzip bytes in ${result.chunks} chunk(s).`);
    },
  };
}
