# French source review handoff

Baseline: `de06c612812cc3540c5c2c1203b7645ecfe77b13`. The 30 records and 730 stages have been assistant-reviewed against their English source and associated actions. Source and whole-lesson hashes, stage/phase order and required fields are validated by `scripts/export-reviewed-french.mjs`. These checks are not a claim that a native French speaker, child, educator or family has reviewed the work. The full audio catalogue also requires human listening.

The Basic lessons and intermediate Dog, Turtle, Butterfly, Owl and Sailboat were reviewed in the French task. The Scottish task supplied Bird, Fox, Elephant, Rabbit and Coral in commit `c5635f1`; the Irish task supplied Rocket, House, Train, Cactus, Robot, Cup, Fruit Bowl, Tree Path, Castle and Lighthouse in commit `40c05f15dd9c0e44fd91e33792a1a56340da5418`. The French task checked source/geometry hashes and stage schema and spot-reviewed the independent handoffs before integration.

Two source-geometry ambiguities were identified independently and require visual integration review. The robot antenna circle is about one source-coordinate unit away from the line: French describes it as near the tip rather than requiring contact. The fruit bowl's upper banana stroke is continuous, though the English text describes lifting when hidden: French describes a continuous upper curve. English, Spanish and geometry were not changed. The lower banana edge retains its separate hidden-section instruction.

The approved audition is Gaëlle (`tKaoyJLW05zqV0tIH9FD`); no French catalogue audio has been generated here. The exact sample text is included in `scripts/plan-french-narration.py`. The plan binds `fr` and the voice ID in every v4 dialogue request. The central coordinator owns quota reconciliation, account-wide spending controls, production integration and deployment.

## Offline bundle and staging

Once the shared runner has completed all requests in the integration checkout, copy this task's `scripts/french-narration.py` and reviewed source/exporter/planner into that checkout. It reads only that checkout's ignored `media/elevenlabs/bundles/<canonical-plan-hash>` and its cache receipts. The approved canonical plan SHA-256 is `04801def33b986804dc440b02cf5b9de54c7c3369f8729a12b25c18ffc5ef074` (distinct from the SHA-256 of the formatted plan JSON file). Run:

```sh
python3 scripts/french-narration.py --verify-bundle media/elevenlabs/bundles/04801def33b986804dc440b02cf5b9de54c7c3369f8729a12b25c18ffc5ef074 --plan-hash 04801def33b986804dc440b02cf5b9de54c7c3369f8729a12b25c18ffc5ef074
python3 scripts/french-narration.py --stage-release media/elevenlabs/bundles/04801def33b986804dc440b02cf5b9de54c7c3369f8729a12b25c18ffc5ef074 --plan-hash 04801def33b986804dc440b02cf5b9de54c7c3369f8729a12b25c18ffc5ef074
```

Both commands are offline. Each checks the approved plan hash and exact current source, full lesson and narration-key coverage, locale/voice/model/request identity, complete receipt and raw/normalized audio hashes, MP3 format and durations, and a full decode. The second writes a separate ignored review tree containing four French metadata files and audio; it refuses to replace an existing tree. Neither command changes runtime metadata or public assets, and metadata explicitly records native French review and full human listening as pending. Full decode can take significant time for the 1,459 recordings.

Offline fixtures: `node --test tests/french-bundle.test.mjs tests/french-preparation.test.mjs`. Their synthetic one-clip bundle checks the full staging path and rejects wrong language, altered or unapproved plan, missing receipts, corrupted raw bytes, invalid audio and staging overwrite. Synthetic verification is not evidence that the real provider bundle has passed.
