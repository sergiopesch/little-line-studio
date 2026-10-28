import test from 'node:test';
import assert from 'node:assert/strict';
import { pilotTexts } from '../scripts/three-language-cat-pilot.mjs';
import { getLesson, narrationKey } from '../src/lesson-catalogue.js';

test('Cat auditions bind the three selected voices to every source stage', () => {
  const pilots = pilotTexts();
  assert.deepEqual(pilots.map(p => [p.locale, p.language, p.voice]), [
    ['es-ES', 'es', 'BkOojM1ZhtSAHgsAkMx2'],
    ['de-DE', 'de', '5bVYvsqKAWO1hDgOO72l'],
    ['it-IT', 'it', 'wOXFTxgu7FQDBb1dsL7I'],
  ]);
  const cat = getLesson('cat');
  const keys = ['sample', ...cat.steps.flatMap((_, i) => [narrationKey(cat, i), narrationKey(cat, i, 'hint')])].sort();
  for (const pilot of pilots) {
    assert.deepEqual(Object.keys(pilot.texts).sort(), keys);
    assert.equal(pilot.reviewStatus, 'assistant-draft-awaiting-native-human-review');
  }
});
