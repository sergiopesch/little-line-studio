export function demonstrationLabel(lesson, stepIndex, locale) {
  const kind = lesson.steps[stepIndex].kind;
  const spanish = locale === "es-419";
  if (kind === "prepare") {
    return spanish
      ? "Tablero de demostración vacío. Dibuja en tu propio papel."
      : "Blank demonstration board. Draw on your own paper.";
  }
  if (kind === "colour") {
    return spanish
      ? `${lesson.title}. Demostración de coloreado. Dibuja en tu propio papel.`
      : `${lesson.title}. Colouring demonstration. Draw on your own paper.`;
  }
  if (["observe", "explore"].includes(kind)) {
    return spanish
      ? `${lesson.title}. Ejemplo completo de la maestra. Dibuja en tu propio papel.`
      : `${lesson.title}. Full teacher reference. Draw on your own paper.`;
  }
  const action = lesson.strokes.findIndex((stroke) => stroke.step === stepIndex) + 1;
  return spanish
    ? `${lesson.title}, trazo ${action}. Dibuja en tu propio papel.`
    : `${lesson.title}, drawing action ${action}. Draw on your own paper.`;
}
