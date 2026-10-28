// Deterministic offline text inventory, deliberately not a provider request.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { inspectDraft } from './verify-dutch-draft.mjs';

export function cataloguePlan() {
  const { texts, narrationKeys } = inspectDraft({ complete: true });
  const sample = readFileSync(new URL('../research/dutch-draft/sample.nl-NL.txt', import.meta.url), 'utf8').trim();
  if (!sample || narrationKeys !== 1460) throw new Error('The complete Dutch text inventory is not available.');
  const entries = Object.fromEntries(Object.entries({ sample, ...texts }).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const body = { schemaVersion: 1, locale: 'nl-NL', status: 'text-review-only',
    voice: { name: 'Jolanda — Pleasant & Soothing', id: 'DiUBVrSFwkMaPz4XqWvR', selection: 'voice-library-preview' },
    providerPermission: 'pending', productionPlanApproval: 'pending', budgetApproval: 'pending',
    nativeReview: 'pending', generatedAudioListening: 'not-started', entries };
  const textPlanSha256 = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return { ...body, keyCount: Object.keys(entries).length,
    uniqueTexts: new Set(Object.values(entries)).size,
    unicodeCodePoints: Object.values(entries).reduce((sum, value) => sum + [...value].length, 0), textPlanSha256 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('This offline text inventory takes no arguments.');
  console.log(JSON.stringify(cataloguePlan(), null, 2));
}
