#!/usr/bin/env python3
"""Produce an unreviewed offline Italian catalogue from a local CTranslate2 model.

Install ctranslate2 and sentencepiece separately, then pass explicit source,
model and output paths. No credentials or network access are used by this script.
Do not use its output for publication or speech generation without human review.
"""
import argparse
import hashlib
import json
from pathlib import Path
import ctranslate2
import sentencepiece as spm

LESSON_FIELDS = ('title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel')
STEP_FIELDS = ('title', 'instruction', 'spoken', 'hint', 'notice')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit('Refusing to overwrite output')
    records = json.loads(args.source.read_text(encoding='utf-8'))
    records = [r for r in records if r['lessonId'] != 'cat']
    unique = {}
    def add(text):
        if text and text not in unique: unique[text] = None
    for r in records:
        for field in LESSON_FIELDS: add(r[field])
        for phase in r['pilotPhases']: add(phase['label'])
        for stage in r['steps'].values():
            for field in STEP_FIELDS: add(stage[field])
    tokenizer = spm.SentencePieceProcessor(model_file=str(args.model/'source.spm'))
    decoder = spm.SentencePieceProcessor(model_file=str(args.model/'target.spm'))
    translator = ctranslate2.Translator(str(args.model), device='cpu', compute_type='int8', intra_threads=4)
    keys = list(unique)
    for start in range(0, len(keys), 24):
        batch = keys[start:start+24]
        tokens = [tokenizer.encode(s, out_type=str) + ['</s>'] for s in batch]
        if any(len(seq) > 480 for seq in tokens):
            raise ValueError('Source exceeds safe model length')
        results = translator.translate_batch(tokens, beam_size=4, max_decoding_length=512)
        for source, result in zip(batch, results, strict=True):
            translated = decoder.decode([t for t in result.hypotheses[0] if t != '</s>']).strip()
            if not translated: raise ValueError('Empty translation')
            unique[source] = translated
        if start % 240 == 0: print(f'Translated {min(start+24,len(keys))}/{len(keys)} unique strings', flush=True)
    def tr(s): return unique[s] if s else ''
    for r in records:
        for field in LESSON_FIELDS: r[field] = tr(r[field])
        for phase in r['pilotPhases']: phase['label'] = tr(phase['label'])
        for stage in r['steps'].values():
            for field in STEP_FIELDS: stage[field] = tr(stage[field])
        r['status'] = 'machine-translated-unreviewed'
    model_hashes = {name: hashlib.sha256((args.model/name).read_bytes()).hexdigest() for name in ('model.bin','source.spm','target.spm')}
    document = {'locale':'it-IT', 'status':'machine-translated-unreviewed',
      'model':'manancode/opus-mt-en-it-ctranslate2-android',
      'revision':'50d67d1ceac4d3a35746c053a546f07f6eff9976', 'modelSha256':model_hashes,
      'sourceSha256': hashlib.sha256(args.source.read_bytes()).hexdigest(), 'lessons': records}
    with args.output.open('x', encoding='utf-8') as f:
        json.dump(document, f, ensure_ascii=False, indent=2); f.write('\n')
    print(f'Wrote {len(records)} unreviewed lessons to {args.output}', flush=True)

if __name__ == '__main__': main()
