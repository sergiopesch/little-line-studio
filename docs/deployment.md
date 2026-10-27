# Deploying Little Line Studio

The repository is a standalone Vite application. It needs no database, server API or runtime AI credentials.

## Vercel settings

Import `sergiopesch/little-line-studio` into the intended Vercel account/team. Use the repository root and the Vite framework preset. The committed configuration supplies:

| Setting | Value |
| --- | --- |
| Node.js | 24.x |
| Install | `npm ci` |
| Build | `npm run check` |
| Output | `dist/client` |
| Production branch | `main` |

`npm run check` builds the app, verifies Spanish narration metadata and asset hashes, checks hosting-header consistency, then runs all tests. Only `dist/client` is published; source, research, local environment files and build receipts remain outside it. The interface uses local state at `/`, so there is no catch-all rewrite that could disguise missing assets as successful HTML responses.

The host applies the same restrictive Content Security Policy as local preview. Microphone, camera, geolocation and related browser capabilities are disabled. Content-addressed media and bundled assets are cacheable; the entry document is revalidated. The policy blocks tldraw's optional external diagnostics while leaving local licence validation unchanged.

## Production licence

Set `VITE_TLDRAW_LICENSE_KEY` in Vercel's Production and Preview environment settings before deploying the active lesson. This is a browser-readable SDK licence by design, not a private AI-provider credential. Keep it out of Git and documentation. Confirm the signature, expiry and allowed domains; preview deployments may need additional domain coverage.

The initial deployment uses the existing any-domain evaluation key, expiring **2026-11-08**. Replace it with an appropriate production key and redeploy before that date. With no key, production builds intentionally select the licence-review page. Do not publish a development build or change the SDK to evade its checks.

No `ELEVENLABS_API_KEY`, OpenAI key or generation credentials belong in Vercel. Prepared MP3 playback makes no generation calls.

## Release checks

1. Run `npm ci` and `npm run check` from a clean checkout.
2. Check the preview on desktop and mobile: collection, language, drawing, adult acknowledgement, Begin, narration, demonstration, Pause, More time, Replay and mute.
3. Confirm the actual production URL is accessible without a Vercel login. Keep preview protection enabled as appropriate.
4. Check `/`, a JS asset, an MP3 range request, and a missing asset. Verify security headers and confirm private paths such as `/.env.local` and `/src/main.jsx` return 404.
5. Check an English lesson and an enabled Spanish lesson. Confirm unavailable Spanish drawings remain disabled.

With Git integration, pushes to `main` trigger production builds, and other branches create previews. The build includes the test gate. Native listening, family acceptance and educational review remain separate from automated checks.

## Recovery

In the Vercel deployment history, select the last known-good production deployment and roll back or promote it. Confirm the production alias and repeat the live smoke checks. A rollback does not renew an expired SDK licence: update the environment and rebuild if licensing is the cause.

This repository starts from the reviewed application snapshot `7338c163e3315bd157e6d2d8a5d1acf07d9b872f` and intentionally has fresh public Git history. The previous Sites checkout and deployment remain separate; Vercel does not use the old Sites identity or Worker packaging.

References: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json), [tldraw licences](https://tldraw.dev/community/license).
