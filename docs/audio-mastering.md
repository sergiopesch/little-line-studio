# Short narration mastering

The original speech pipeline uses `loudnorm=I=-20:TP=-2:LRA=7` and produces mono 44.1 kHz, 128 kb/s MP3 files. A full catalogue audit found 26 French recordings shorter than three seconds whose sharp speech peaks kept the integrated level below −23 LUFS. The lowest measured −26.93 LUFS. The other six complete catalogues checked at that point had no short clips below that threshold.

`scripts/master-short-narration.py` stages an offline correction from the original, hash-verified provider response. It makes no provider requests and does not change paid request identities, generation receipts, or cached recordings. It only considers released clips shorter than three seconds and below −23 LUFS.

The recipe adds temporary look-ahead silence so FFmpeg's loudness filter can handle short speech dynamically, applies normalization, then removes the padding at the exact original decoded sample count. Up to three renders from the original response may adjust the target using the measured, encoded result. Accepted files must measure −20 LUFS ±0.5 LU and at most −2 dBTP. Every render starts from the original response, never from an earlier derivative. The selected voice, words, and playback length remain unchanged.

The staged manifest keeps the original clip under `source` and records the local filter, tool version, raw response hash, processing identity, loudness measurements, and decoded sample count. Original public assets are retained for provenance and clients using older releases. Production builds verify both source and derivative hashes, unchanged teaching text and voice identity, and the declared processing bounds. Human listening and native-speaker review remain separate, pending checks.

To prepare a correction in an isolated checkout:

```sh
python3 scripts/master-short-narration.py \
  --locale fr-FR \
  --shared-root /absolute/path/to/generation-checkout \
  --output media/elevenlabs/short-speech/french-review
```

The command creates a fresh staging folder containing `report.json`, changed `public/narration` assets, and the complete matching `src` metadata. It does not activate the result. Before installing the staged files, verify that the current metadata matches the report's input hashes, retain a backup, and review the measured results. Then run `npm run check` and the production playback checks. Do not install output from an interrupted or failed staging command.

The regression fixture uses the original French owl hint to reproduce the quiet short-input case and checks the corrected loudness, true peak, and exact decoded length. Further tests reject changed source bytes, changed words, incorrect duration, and invalid processing evidence.

Reference: [FFmpeg loudnorm documentation](https://www.ffmpeg.org/ffmpeg-filters.html#loudnorm). The concrete bounds above are this project's tested mastering recipe, not a claim of human perceptual approval.
