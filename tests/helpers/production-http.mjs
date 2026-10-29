import assert from "node:assert/strict";
import { sha256 } from "../../scripts/release-metadata.mjs";
import { securityHeaders } from "../../config/security.js";

export const commit = "a".repeat(40);
export const document = '<html><script type="module" src="/assets/index-fixture.js"></script></html>';
export const marker = { schemaVersion: 1, revision: commit, dirty: false, indexSha256: sha256(document) };

export function fixtureFetch(change = () => {}) {
  return async (url, options) => {
    assert.equal(options.redirect, "manual");
    const route = new URL(url).pathname;
    const headers = new Headers(securityHeaders);
    let status = 200, body;
    if (route === "/release.json") { body = JSON.stringify(marker); headers.set("Content-Type", "application/json"); }
    else if (route === "/") body = document;
    else if (route.startsWith("/assets/")) { body = "/* fixture */"; headers.set("Content-Type", "application/javascript"); }
    else if (route.startsWith("/narration/")) {
      assert.equal(options.headers.Range, "bytes=0-99");
      status = 206; body = new Uint8Array(100);
      headers.set("Content-Type", "audio/mpeg"); headers.set("Content-Range", "bytes 0-99/1000");
    } else { status = 404; body = "Not found"; }
    const response = { status, headers, body };
    change(route, response);
    return new Response(response.body, { status: response.status, headers: response.headers });
  };
}
