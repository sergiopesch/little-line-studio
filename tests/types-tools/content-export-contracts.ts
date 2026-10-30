import { exportReviewedSpanish } from "../../scripts/export-reviewed-spanish.mjs";
import { exportReviewedFrench } from "../../scripts/export-reviewed-french.mjs";
import { exportSpain } from "../../scripts/export-spain-lessons.mjs";
import { exportGermanItalian } from "../../scripts/export-german-italian.mjs";
import { exportDutchDraft } from "../../scripts/export-dutch-draft.mjs";
import { compileCatalogue } from "../../scripts/localization/export.ts";
import type { NarrationCatalogueExport, RegionalCatalogueExport } from "../../scripts/localization/export.ts";
import type { AuthoredLesson } from "../../src/authoring/contracts.ts";
import type { LocalizedCatalogue } from "../../src/localization/contracts.ts";
import { writeExportFiles } from "../../scripts/localization/write.ts";

const reviewed: readonly NarrationCatalogueExport[] = [exportReviewedSpanish(), exportReviewedFrench()];
const regional: readonly RegionalCatalogueExport[] = [exportSpain(), ...await exportGermanItalian()];
const dutch: LocalizedCatalogue = exportDutchDraft();
declare const sources: readonly AuthoredLesson[];
declare const raw: unknown;
const validated: LocalizedCatalogue = compileCatalogue(raw, 'nl-NL', 'assistant-draft-awaiting-native-human-review', sources);
writeExportFiles([{ destination: new URL('file:///tmp/catalogue.json'), contents: JSON.stringify(validated) }]);

// @ts-expect-error exports cannot silently promote pending human review
compileCatalogue(raw, 'nl-NL', 'approved', sources);
// @ts-expect-error source identity alone cannot validate teaching stages and phases
compileCatalogue(raw, 'nl-NL', 'assistant-draft-awaiting-native-human-review', [{ id: 'cat' }]);
// @ts-expect-error command output stays typed through the actual CLI module
const missingSample: RegionalCatalogueExport = { ...dutch, count: 30, strings: {} };
// @ts-expect-error a UI dictionary carries text, not callbacks
const executableUI: RegionalCatalogueExport = { ...exportSpain(), strings: { Begin: () => 'Begin' } };
// @ts-expect-error filesystem destinations must be explicit URLs
writeExportFiles([{ destination: '/tmp/catalogue.json', contents: '{}' }]);
// @ts-expect-error serialize only after the complete export passes validation
writeExportFiles([{ destination: new URL('file:///tmp/catalogue.json'), contents: validated }]);
// @ts-expect-error exported text cannot control lesson timing
dutch.lessons.cat?.steps.notice?.quietMs;
// @ts-expect-error validated output cannot be mutated between validation and writing
validated.lessons.cat = dutch.lessons.cat;
void reviewed; void regional; void missingSample; void executableUI;
