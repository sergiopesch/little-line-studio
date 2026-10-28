import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hash = /^[a-f0-9]{64}$/;
const sourcePath = /^\/narration\/clip-([a-f0-9]{64})\.mp3$/;
const canonical = (value) => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;

// A local derivative retains its immutable provider source. Build validation
// must check that provenance as well as the bytes the browser will play.
export function validateNarrationDerivatives(manifest, assetsRoot) {
  for (const [key, clip] of Object.entries(manifest.clips ?? {})) {
    if (clip.provenance !== 'verified-local-derivative') continue;
    const fail = () => { throw new Error(`Invalid local narration derivative: ${key}`); };
    const source = clip.source, processing = clip.processing;
    if (!source || !processing || source.provenance !== 'verified-api-response' ||
        source.provider !== 'ElevenLabs' || processing.sourceSha256 !== source.sha256 ||
        !hash.test(processing.rawSourceSha256 ?? '') || !hash.test(processing.processingKey ?? '') ||
        processing.recipe?.name !== 'short-speech-loudness' || processing.recipe.version !== 1 ||
        !Number.isSafeInteger(processing.decodedSamples) || processing.decodedSamples <= 0 ||
        processing.decodedSamples >= 3 * 44100) fail();
    for (const field of ['provider', 'model', 'voiceId', 'cacheKey', 'text', 'generationSettings']) {
      if (!isDeepStrictEqual(clip[field], source[field])) fail();
    }
    const target = processing.passes?.at(-1)?.targetLufs;
    if (!Number.isFinite(target) || Math.abs(target + 20) > 3 ||
        !Array.isArray(processing.passes) || processing.passes.length < 1 || processing.passes.length > 3) fail();
    const graph = `apad=whole_dur=4,loudnorm=I=${target.toFixed(3)}:TP=-2.5:LRA=7,aresample=44100,atrim=end_sample=${processing.decodedSamples}`;
    const specification = Object.fromEntries(['recipe', 'sourceSha256', 'rawSourceSha256', 'filterGraph', 'ffmpegVersion']
      .map((field) => [field, processing[field]]));
    if (typeof processing.ffmpegVersion !== 'string' ||
        processing.processingKey !== sha(JSON.stringify(canonical(specification)))) fail();
    if (processing.filterGraph !== graph || clip.encoding?.filter !== graph ||
        clip.encoding.rate !== 44100 || clip.encoding.channels !== 1 || clip.encoding.bitrate !== '128k' ||
        source.encoding?.filter !== 'loudnorm=I=-20:TP=-2:LRA=7' ||
        clip.duration !== Math.round(processing.decodedSamples / 44.1) / 1000 ||
        Math.abs(clip.duration - source.duration) > 0.03) fail();
    const measured = processing.decodedVerification;
    if (!Number.isFinite(measured?.integratedLufs) || Math.abs(measured.integratedLufs + 20) > 0.5 ||
        !Number.isFinite(measured?.truePeakDbtp) || measured.truePeakDbtp > -2 ||
        !Number.isFinite(processing.before?.integratedLufs) || processing.before.integratedLufs >= -23) fail();
    for (const record of [source, clip]) {
      const match = sourcePath.exec(record.src ?? '');
      if (!match || match[1] !== record.sha256) fail();
      const bytes = readFileSync(path.join(assetsRoot, record.src.slice(1)));
      if (bytes.length !== record.bytes || sha(bytes) !== record.sha256) fail();
    }
  }
}
