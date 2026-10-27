# Initial Vercel migration checks

Checked 27 October 2026 against the standalone public repository.

| Check | Result |
| --- | --- |
| Licensed production build and application suite | 241 passed, 0 failed |
| No-key production build and application suite | 241 passed, 0 failed; SDK excluded from the review bundle |
| Spanish media validation | 19 released lessons; 854 distinct audio assets verified by hash |
| Catalogue preview geometry | 63 precomputed outlines verified |
| npm dependency audit | 0 reported vulnerabilities at verification time |
| Public-source credential scan | No private keys, provider tokens, GitHub tokens or SDK licence values matched the configured patterns |
| Documentation links | All relative Markdown links resolve |
| README media | Both PNG screenshots and the 24-second GIF verified publicly available at the committed revision |
| Local desktop browser | Adult setup, Flower lesson, native teaching board, automatic progression and manual advance checked; no console errors or warnings observed |
| Original source checkout | Preserved at `7338c163e3315bd157e6d2d8a5d1acf07d9b872f`, with no tracked changes |

The deployment runs `npm run check` again on Vercel. Some offline media-production tests include optional ffmpeg/ffprobe exercises; those Python subtests can skip when these tools are absent from a build host. The local verification host had both tools available.

The first remote build identified three activation fixtures that mocked encoding but still queried the real encoder version. Those fixtures now mock the version query too; the production activation code is unchanged. A rejection test preserves the invalid-version boundary, and the fixture suite is checked with ffmpeg absent from `PATH` as well as with the local encoder installed.

The licensed bundle still produces Vite's existing large-chunk warning. The teaching SDK is loaded lazily, and Spanish content loads when selected; further bundle optimisation remains separate work.

These results establish software and content consistency, not educational effectiveness, independent native-language listening, comprehensive accessibility or continuous adult supervision. Live production checks are required after deployment; follow [the deployment checklist](deployment.md#release-checks).
