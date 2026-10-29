const nouns = {
  "es-419": ["dibujo", "dibujos"],
  "es-ES": ["dibujo", "dibujos"],
  "fr-FR": ["dessin", "dessins"],
  "de-DE": ["Zeichnung", "Zeichnungen"],
  "it-IT": ["disegno", "disegni"],
  "nl-NL": ["tekening", "tekeningen"],
};

export function drawingCount(locale, count) {
  const [singular, plural] = nouns[locale] ?? ["drawing", "drawings"];
  const one = new Intl.PluralRules(locale).select(count) === "one";
  return `${count} ${one ? singular : plural}`;
}
