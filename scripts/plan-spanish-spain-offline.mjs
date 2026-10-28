// A text inventory for review and budgeting, not a provider request plan.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readDraft, validateDraft } from './validate-spanish-spain-draft.mjs';

const characters = (text) => Array.from(text).length;

export function buildTextInventory(draft) {
  validateDraft(draft);
  const { catalogue, pilot } = draft;
  const entries = [{ key: 'sample', text: pilot.sample }];
  for (const [lessonId, lesson] of Object.entries(catalogue.lessons)) {
    for (const [stepId, step] of Object.entries(lesson.text.steps)) {
      entries.push({ key: `${lessonId}/${stepId}/instruction`, text: step.spoken });
      entries.push({ key: `${lessonId}/${stepId}/hint`, text: step.hint });
    }
  }
  const text = {
    locale: 'es-ES',
    status: 'draft-not-approved-for-generation',
    voiceId: pilot.voice.id,
    baseline: catalogue.baseline,
    entries,
  };
  const uniqueTexts = [...new Set(entries.map((entry) => entry.text))];
  return {
    ...text,
    textInventorySha256: createHash('sha256').update(JSON.stringify(text)).digest('hex'),
    characters: entries.reduce((sum, entry) => sum + characters(entry.text), 0),
    uniqueTexts: uniqueTexts.length,
    uniqueTextCharacters: uniqueTexts.reduce((sum, value) => sum + characters(value), 0),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).some((arg) => arg !== '--full')) {
    throw new Error('Usage: node scripts/plan-spanish-spain-offline.mjs [--full]');
  }
  const inventory = buildTextInventory(readDraft());
  const { entries, ...summary } = inventory;
  console.log(JSON.stringify(process.argv.includes('--full') ? inventory : {
    ...summary, narrationKeys: entries.length,
  }, null, 2));
}
