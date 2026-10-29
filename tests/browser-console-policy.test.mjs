import test from "node:test";
import assert from "node:assert/strict";
import { expectedBlockedDiagnostic } from "./browser/console-policy.js";

const endpoint = "https://cdn.tldraw.com/5.5.2/watermarks/watermark-track.svg";
const event = { origin: "https://cdn.tldraw.com", pathname: "/5.5.2/watermarks/watermark-track.svg", directive: "connect-src", disposition: "enforce" };
const message = `Fetch API cannot load ${endpoint}?license_id=fixture. Refused to connect because it violates the document's Content Security Policy.`;

test("the known optional SDK diagnostic requires an observed enforced policy block", () => {
  assert.equal(expectedBlockedDiagnostic(message, [event]), true);
  assert.equal(expectedBlockedDiagnostic(message, [{ ...event, pathname: "/" }]), true);
  for (const violations of [[], [{ ...event, disposition: "report" }], [{ ...event, directive: "img-src" }], [{ ...event, origin: "https://other.invalid" }]])
    assert.equal(expectedBlockedDiagnostic(message, violations), false);
});

test("Chromium, Firefox and WebKit policy diagnostics share the same strict evidence check", () => {
  for (const text of [
    `Connecting to '${endpoint}' violates the following Content Security Policy directive: "connect-src 'self'". The action has been blocked.`,
    `Content-Security-Policy: The page settings blocked the loading of a resource (connect-src) at ${endpoint} because it violates the following directive: connect-src 'self'`,
    `Refused to connect to ${endpoint} because it does not appear in the connect-src directive of the Content Security Policy.`,
  ]) assert.equal(expectedBlockedDiagnostic(text, [event]), true);
});

test("licence failures, unrelated errors, other endpoints and new SDK versions remain failures", () => {
  for (const text of [
    "Invalid tldraw licence", `Failed to fetch ${endpoint}`, "Uncaught TypeError: rendering failed",
    message.replace("watermark-track.svg", "licence-check.json"),
    message.replace("watermark-track.svg", "watermark-track.svg.other"),
    message.replace("5.5.2", "5.5.3"), message.replace("cdn.tldraw.com", "other.invalid"),
  ]) assert.equal(expectedBlockedDiagnostic(text, [event]), false);
});
