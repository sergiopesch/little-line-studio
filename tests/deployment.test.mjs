import assert from "node:assert/strict";
import test from "node:test";
import { readFile, access, readdir } from "node:fs/promises";
import config from "../vite.config.mjs";
import { securityHeaders } from "../config/security.js";
import { REVIEW_STAGES } from "../src/review-tour.js";
import { sha256 } from "../scripts/release-metadata.mjs";

test("the public release marker fingerprints the built HTML and exposes only release identity", async () => {
  const document = await readFile(new URL("../dist/client/index.html", import.meta.url));
  const release = JSON.parse(await readFile(new URL("../dist/client/release.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(release).sort(), ["dirty", "indexSha256", "revision", "schemaVersion"]);
  assert.equal(release.schemaVersion, 1);
  assert.equal(release.indexSha256, sha256(document));
  assert.ok(release.revision === null || /^[a-f0-9]{40}$/.test(release.revision));
  assert.ok(release.dirty === null || typeof release.dirty === "boolean");
  if (process.env.VERCEL === "1" && process.env.VERCEL_GIT_COMMIT_SHA) {
    assert.equal(release.revision, process.env.VERCEL_GIT_COMMIT_SHA);
    assert.equal(release.dirty, false, "Vercel must publish the committed source and configuration");
  }
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(vercel.headers.find(h => h.source === "/release.json").headers.some(h => h.key === "Cache-Control" && h.value === "no-cache"));
});

test("Vercel enforces the same headers as the preview", async () => {
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const headers = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value]));
  for (const [name, value] of Object.entries(securityHeaders)) assert.equal(headers[name], value, name);
  assert.equal(vercel.outputDirectory, "dist/client");
  assert.equal(vercel.buildCommand, "npm run check");
  assert.ok(vercel.routes.some((route) => route.status === 405 && route.methods.includes("POST")));
  for (const route of vercel.routes.filter((route) => route.status >= 400)) {
    for (const [name, value] of Object.entries(securityHeaders)) assert.equal(route.headers[name], value, `${route.src}: ${name}`);
    assert.equal(route.headers["Cache-Control"], "no-store");
  }
});

test("sharing metadata points to a real preview while search indexing stays disabled", async () => {
  const document = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
  const robots = await readFile(new URL("../dist/client/robots.txt", import.meta.url), "utf8");
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const meta = (key) => document.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]+)"`))?.[1];
  const site = "https://little-line-studio.vercel.app/";
  assert.match(meta("robots"), /\bnoindex\b/);
  assert.equal(meta("og:url"), site);
  assert.equal(meta("og:title"), meta("twitter:title"));
  assert.equal(meta("og:description"), meta("twitter:description"));
  assert.equal(meta("og:image"), `${site}brand/social-card.png`);
  assert.equal(meta("twitter:image"), meta("og:image"));
  assert.ok(meta("og:image:alt"));
  assert.match(robots, /^Disallow: \/$/m);
  assert.match(robots, /^Allow: \/\$$/m);
  assert.match(robots, /^Allow: \/brand\/social-card\.png\$$/m);
  const card = await readFile(new URL("../dist/client/brand/social-card.png", import.meta.url));
  assert.equal(card.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(card.readUInt32BE(16), Number(meta("og:image:width")));
  assert.equal(card.readUInt32BE(20), Number(meta("og:image:height")));
  const imageHeaders = vercel.headers.find(({ source }) => source === "/brand/social-card.png").headers;
  assert.ok(imageHeaders.some(({ key, value }) => key === "X-Robots-Tag" && value === "noindex"));
});

test("hosted builds without a key select review entry; local and keyed builds retain tldraw", () => {
  const previous = process.env.VITE_TLDRAW_LICENSE_KEY;
  try {
    // An explicit empty process value overrides Vite's .env.local loading.
    process.env.VITE_TLDRAW_LICENSE_KEY = "";
    assert.match(
      config({ command: "build", mode: "production" }).resolve.alias[
        "@site-entry"
      ],
      /LicenceReview\.jsx$/,
    );
    assert.match(
      config({ command: "serve", mode: "development" }).resolve.alias[
        "@site-entry"
      ],
      /LessonEntry\.jsx$/,
    );
    process.env.VITE_TLDRAW_LICENSE_KEY = "   ";
    assert.match(
      config({ command: "build", mode: "production" }).resolve.alias[
        "@site-entry"
      ],
      /LicenceReview\.jsx$/,
    );
    // Presence selects the lesson. The SDK still verifies signatures and allowed hosts.
    process.env.VITE_TLDRAW_LICENSE_KEY = "configuration-branch-test-only";
    assert.match(
      config({ command: "build", mode: "production" }).resolve.alias[
        "@site-entry"
      ],
      /LessonEntry\.jsx$/,
    );
  } finally {
    if (previous === undefined) delete process.env.VITE_TLDRAW_LICENSE_KEY;
    else process.env.VITE_TLDRAW_LICENSE_KEY = previous;
  }
});

test("licence display metadata exposes only evaluation status and expiry from fictitious payloads", () => {
  const previous = process.env.VITE_TLDRAW_LICENSE_KEY;
  const metadata = () =>
    JSON.parse(
      config({ command: "build", mode: "production" }).define
        .__TLDRAW_LICENSE_INFO__,
    );
  const fixtureKey = (payload) =>
    `tldraw/${Buffer.from(JSON.stringify(payload)).toString("base64")}.fictitious-signature`;
  try {
    for (const [flags, evaluation] of [
      [16, true],
      [0, false],
      [17, true],
    ]) {
      process.env.VITE_TLDRAW_LICENSE_KEY = fixtureKey([
        "fixture-license-id",
        ["fixture-host.invalid"],
        flags,
        "2030-04-12",
      ]);
      assert.deepEqual(metadata(), { evaluation, expires: "2030-04-12" });
      assert.ok(!JSON.stringify(metadata()).includes("fixture-license-id"));
      assert.ok(!JSON.stringify(metadata()).includes("fixture-host.invalid"));
    }
    for (const invalid of [
      "",
      "malformed-fixture",
      "tldraw/not-json.fictitious-signature",
      fixtureKey([]),
      fixtureKey(["fixture-license-id", [], "16", "2030-04-12"]),
      fixtureKey(["fixture-license-id", [], 16, "invalid-date"]),
    ]) {
      // Empty overrides local env files, exercising the missing-key branch
      // without reading, printing, or modifying any real key or env file.
      process.env.VITE_TLDRAW_LICENSE_KEY = invalid;
      assert.equal(metadata(), null);
    }
  } finally {
    if (previous === undefined) delete process.env.VITE_TLDRAW_LICENSE_KEY;
    else process.env.VITE_TLDRAW_LICENSE_KEY = previous;
  }
});

test("packaged entry matches production configuration and ships only static public files", async () => {
  const entry = config({ command: "build", mode: "production" }).resolve.alias[
    "@site-entry"
  ];
  const lessonSelected = /LessonEntry\.jsx$/.test(entry);
  assert.ok(lessonSelected || /LicenceReview\.jsx$/.test(entry));
  const document = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
  assert.match(document, /Little Line Studio/);
  await access(new URL("../dist/validated.json", import.meta.url));
  for (const privatePath of [".env.local", ".git/config", "src/main.jsx", "scripts/prepare-build.mjs", "validated.json"]) {
    await assert.rejects(access(new URL(`../dist/client/${privatePath}`, import.meta.url)));
  }
  const files = await readdir(
    new URL("../dist/client/assets/", import.meta.url),
  );
  const scripts = await Promise.all(
    files
      .filter((name) => name.endsWith(".js"))
      .map((name) =>
        readFile(
          new URL(`../dist/client/assets/${name}`, import.meta.url),
          "utf8",
        ),
      ),
  );
  const source = scripts.join("\n");
  // Boolean assertions avoid dumping bundles (which can contain the public
  // SDK licence value) into failure output.
  if (lessonSelected) {
    assert.ok(
      source.includes("Every drawing starts"),
      "keyed build includes the home page",
    );
    assert.ok(
      source.includes("/narration/clip-"),
      "keyed build includes prepared instruction audio",
    );
    await access(
      new URL("../dist/client/narration/NOTICE.md", import.meta.url),
    );
    assert.ok(
      files.some((name) => /DemonstrationBoard.*\.js$/.test(name)),
      "keyed build includes the lazy teacher board",
    );
    assert.ok(
      /tldraw\.com|No tldraw license key provided/.test(source),
      "keyed build includes the genuine tldraw SDK",
    );
    assert.ok(
      source.includes("Paper, pencil, together."),
      "keyed build includes the authored lesson",
    );
    assert.ok(
      source.includes("Draw one second bubble higher up."),
      "keyed build includes the later authored microsteps",
    );
    assert.ok(
      !source.includes("Hobby licence review"),
      "keyed build selects the lesson rather than the review entry",
    );
  } else {
    for (const path of [
      ...REVIEW_STAGES.map((stage) => stage.image),
      "/review/showcase-mobile.jpg",
    ])
      await access(new URL(`../dist/client${path}`, import.meta.url));
    assert.ok(
      source.includes("Hobby licence review"),
      "no-key build includes the review entry",
    );
    assert.ok(
      /lesson will be enabled after a hobby licence/.test(source),
      "no-key review explains that the hosted lesson is disabled",
    );
    assert.ok(
      !/DemonstrationBoard|sanitizeSvg/.test(files.join("\n")),
      "no-key build excludes board and SDK chunks",
    );
    assert.ok(
      !/tldraw\.com\/app|No tldraw license key provided|STEALTH_NO_TLDRAW/.test(
        source,
      ),
      "no-key review excludes the SDK and licence bypasses",
    );
  }
  assert.ok(
    !source.includes("STEALTH_NO_TLDRAW"),
    "no licence bypass is packaged",
  );
});
