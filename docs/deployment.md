# Deploying Trazolino

The repository is a standalone Vite application. It needs no database, server API or runtime AI credentials.

## Project identity

The product is **Trazolino**, with canonical origin **https://trazolino.org** and repository **https://github.com/sergiopesch/trazolino**. The existing Vercel project is renamed in place, preserving deployment history, environment settings and Git integration. `www.trazolino.org` redirects to the apex domain. The previous `little-line-studio.vercel.app` address remains attached for existing links.

Existing local checkout paths, drawing metadata keys and the shared narration-generation lock retain their compatibility names. Do not rename a shared lock or recreate the repository/project as part of branding: existing generation processes and specialist checkouts must keep coordinating against the same resources. Historical release records retain their original names and commit identities.

After a repository rename, update existing clone remotes with `git remote set-url origin https://github.com/sergiopesch/trazolino.git`. Verify a fresh branch deployment and the post-merge production workflow against the new repository identity. The production workflow verifies the custom domain directly.

## Vercel settings

Import `sergiopesch/trazolino` into the intended Vercel account/team. Use the repository root and the Vite framework preset. The committed configuration supplies:

| Setting | Value |
| --- | --- |
| Node.js | 24.x |
| Install | `npm ci` |
| Build | `npm run check` |
| Output | `dist/client` |
| Production branch | `main` |

`npm run check` builds the app, verifies released narration metadata and asset hashes for each locale, checks hosting-header consistency, then runs all tests. Only `dist/client` is published; source, research, local environment files and build receipts remain outside it. The interface uses local state at `/`, so there is no catch-all rewrite that could disguise missing assets as successful HTML responses.

The host applies the same restrictive Content Security Policy as local preview. Microphone, camera, geolocation and related browser capabilities are disabled. Content-addressed media and bundled assets are cacheable; the entry document is revalidated. The policy blocks tldraw's optional external diagnostics while leaving local licence validation unchanged.

The homepage and social preview use the production URL in `index.html`. If the production domain changes, update the canonical, Open Graph and Twitter image URLs together. The branded social card is `public/brand/social-card.png` (1200 × 630). Search indexing is disabled: the homepage declares `noindex, nofollow`, and Vercel sends `X-Robots-Tag: noindex` for the social card. `robots.txt` allows crawlers to fetch those resources so they can see the indexing rules and sharing services can read the preview; it disallows other paths. Crawling and indexing are separate, and search services may take time to reflect changes.

The sharing card can be rebuilt with `npm run update:social-card` after installing the pinned Playwright Chromium browser. It uses only the existing local artwork and font; its renderer is in `scripts/render-social-card.mjs`.

## Production licence

Set `VITE_TLDRAW_LICENSE_KEY` in Vercel's Production and Preview environment settings before deploying the active lesson. This is a browser-readable SDK licence by design, not a private AI-provider credential. Keep it out of Git and documentation. Confirm the signature, expiry and allowed domains; preview deployments may need additional domain coverage.

The initial deployment uses the existing any-domain evaluation key, expiring **2026-11-08**. Replace it with an appropriate production key and redeploy before that date. With no key, production builds intentionally select the licence-review page. Do not publish a development build or change the SDK to evade its checks.

No `ELEVENLABS_API_KEY`, OpenAI key or generation credentials belong in Vercel. Prepared MP3 playback makes no generation calls.

## Release checks

1. Run `npm ci` and `npm run check` from a clean checkout.
2. Check the preview on desktop and mobile: collection, language, drawing, adult acknowledgement, Begin, narration, demonstration, Pause, More time, Replay and mute.
3. Confirm the actual production URL is accessible without a Vercel login. Keep preview protection enabled as appropriate.
4. Check `/`, a JS asset, an MP3 range request, and a missing asset. Verify security headers and confirm private paths such as `/.env.local` and `/src/main.jsx` return 404.
5. Check an English lesson and a Spanish lesson, including one of the newly completed drawings.

With Git integration, pushes to `main` trigger production builds, and other branches create previews. The build includes the test gate. Native listening, family acceptance and educational review remain separate from automated checks.

## Repeatable production verification

From the checkout matching the deployed revision, install the pinned browser binaries and run:

```bash
npx playwright install chromium firefox webkit
npm run verify:production -- --url https://trazolino.org --commit <full-40-character-deployed-commit>
```

On a clean Linux runner, use `npx playwright install --with-deps chromium firefox webkit` to install the required system libraries too. The expected commit is explicit: use the merged commit on `main`, not the pre-merge feature-branch SHA. HTTPS is required except for loopback fixture servers. Protected previews fail visibly; the command does not request a bypass, send credentials or follow authentication redirects.

After content validation, the build writes a public `release.json` containing only a schema version, Git revision, dirty-checkout flag and SHA-256 of the built HTML. Vercel source archives use the documented [`VERCEL_GIT_COMMIT_SHA`](https://vercel.com/docs/environment-variables/system-environment-variables) identity; local builds use Git and mark uncommitted changes. Unidentified archives cannot pass production verification. The marker is diagnostic evidence, not a security attestation. No licence key, provider credential, repository path or account information is included.

The command checks the release marker against the expected commit and served HTML, the compiled JavaScript entry, all seven security headers, six private/missing paths and a real 100-byte MP3 range request. It then runs the nine catalogues and voice samples, English family controls, Spanish interruption handling and compiled drawing-download recovery across all five browser configurations. Browser failures, skipped checks and retries fail verification. A second HTTP pass rejects a deployment whose revision or HTML fingerprint changed during the run.

Each invocation creates a unique ignored directory in `output/production-verification/`, with `summary.json`, Playwright's `browser.json`, a lesson screenshot per browser and failure traces. `--output /absolute/directory` chooses a different parent directory; previous reports are retained. Failed runs also write a summary and return a nonzero exit code. Do not commit the generated reports or traces. Run the command after a deployment is Ready, or pass `--wait 600` to wait up to ten minutes for two consecutive complete HTTP checks of the expected revision and identical HTML fingerprint, ten seconds apart. An old marker, mismatched HTML, or temporary release/HTML/entry request failure resets that streak. The successful readiness check becomes the recorded pre-browser HTTP pass; there is no separate marker-only handoff. Redirects, protected deployments, dirty/invalid markers (including older revisions), missing headers, exposed private paths and media failures fail immediately; an older revision is never counted as a pass. The command does not promote or roll back releases.

The public-site checks require a properly licensed active lesson. A restricted no-key build may pass content validation but will fail the lesson browser checks as expected. Headless browser playback and volume-state evidence do not replace real iPhone/iPad listening, device locking, native-language review or family testing.

Vercel may reserialize `vercel.json` before the build. The release identity accepts that unstaged rewrite only when its parsed configuration is identical to the committed file and there are no other checkout changes or file-mode changes. Actual configuration changes, staged edits, other source changes and untracked files still mark the release dirty. The Vercel build also checks this identity before publishing.

Dynamic module entries load through `import()` rather than also being module-preloaded. This prevents a failed preload from blocking an explicit retry in WebKit when the module imports shared code from its importer. CSS and shared dependency preloads remain enabled. The production suite interrupts both compiled drawing and language downloads, then verifies recovery without bypassing supervision or changing language early.

The console gate records the known tldraw 5.5.2 optional diagnostic as expected only when the browser also reports an enforced `connect-src` policy violation for that CDN. Its report omits URL queries. Licence/runtime errors, other endpoints and other SDK versions still fail. No diagnostic request is permitted, and the application's privacy policy is unchanged.

## Release protection and automatic verification

The repository's `main` protection requires a pull request and the successful, current `verify` check from the GitHub Actions app (ID 15368), including for administrators. Force pushes and branch deletion are disabled; history must remain linear and review conversations must be resolved. No independent approving reviewer is required for this single-owner workflow. These are repository settings, not settings applied by a clone or a Vercel build. Verify them after moving or recreating the repository; do not bypass a failed check to release.

`.github/workflows/production.yml` runs after a successful push-to-main `App regression checks` run from this repository. It checks out that exact commit with read-only permissions and no persisted Git credential, starts the virtual audio device, waits for two matching HTTP passes on the public alias for that commit, then runs the strict production browser suite. It retains evidence for 14 days. A manual dispatch is allowed on `main` for environment-only redeployments or a repeat check. This follows GitHub's [workflow_run trigger](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run); preview/PR runs do not qualify.

The workflow uses the fixed public demo origin, needs no Vercel token or protection bypass, and adds no client telemetry. Vercel still deploys through Git integration. Production verification is an after-deployment check, not a pre-promotion Vercel Deployment Check; a failure requires investigation and, when appropriate, the documented rollback. Concurrent verification runs cancel the older run. A manual environment change or rollback does not itself trigger the push-based workflow; dispatch it explicitly. An expired licence will fail the active-lesson checks and is never bypassed.

## Recovery

In the Vercel deployment history, select the last known-good production deployment and roll back or promote it. Confirm the production alias and repeat the live smoke checks. A rollback does not renew an expired SDK licence: update the environment and rebuild if licensing is the cause.

Releases predating `release.json` cannot pass the new commit-bound command. For those rollback targets, verify the revision through Vercel and perform the original release checklist above; do not fabricate a marker or label an unidentified build verified.

This repository starts from the reviewed application snapshot `7338c163e3315bd157e6d2d8a5d1acf07d9b872f` and intentionally has fresh public Git history. The previous Sites checkout and deployment remain separate; Vercel does not use the old Sites identity or Worker packaging.

References: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json), [tldraw licences](https://tldraw.dev/community/license).
