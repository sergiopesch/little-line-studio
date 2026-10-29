import test from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES } from "../src/languages.js";
import { UI_DICTIONARIES, translate } from "../src/ui-translations.js";
import SPANISH_UI from "../src/spanish-ui.es-419.json" with { type: "json" };

test("every selectable language explicitly registers static UI copy", () => {
  assert.deepEqual(Object.keys(UI_DICTIONARIES).sort(), LANGUAGES.map(({ id }) => id).sort());
  assert.ok(Object.isFrozen(UI_DICTIONARIES));
  for (const [locale, dictionary] of Object.entries(UI_DICTIONARIES)) {
    if (locale.startsWith("en-")) {
      assert.equal(dictionary, null, `${locale} uses the source English copy`);
      continue;
    }
    assert.ok(dictionary && Object.isFrozen(dictionary), locale);
    for (const key of Object.keys(SPANISH_UI)) {
      assert.ok(Object.hasOwn(dictionary, key), `${locale}: ${key}`);
    }
    for (const value of Object.values(dictionary)) assert.ok(typeof value === "string" && value.trim(), locale);
  }
});

test("static translation selects regional copy without retaining a previous locale", () => {
  for (const [locale, close] of [
    ["nl-NL", "Venster sluiten"],
    ["es-419", "Cerrar ventana"],
    ["en-GB", "Close dialog"],
    ["it-IT", "Chiudi la finestra"],
    ["en-IE", "Close dialog"],
    ["de-DE", "Dialog schließen"],
    ["fr-FR", "Fermer la boîte de dialogue"],
    ["en-GB-x-scotland", "Close dialog"],
    ["es-ES", "Cerrar ventana"],
  ]) assert.equal(translate(locale, "Close dialog"), close, locale);
  assert.equal(translate("es-419", "Choose a comfortable device volume. Quiet drawing is welcome too."),
    "Elijan un volumen cómodo. También pueden dibujar en silencio.");
  assert.equal(translate("es-ES", "Choose a comfortable device volume. Quiet drawing is welcome too."),
    "Elegid un volumen cómodo. También podéis dibujar en silencio.");
  assert.notEqual(translate("es-ES", "Choose a comfortable device volume. Quiet drawing is welcome too."),
    translate("es-419", "Choose a comfortable device volume. Quiet drawing is welcome too."));
});

test("unknown locales and missing messages retain source copy, including object property names", () => {
  for (const locale of [...Object.keys(UI_DICTIONARIES), "unknown", "constructor", "__proto__", undefined]) {
    for (const text of ["A future instruction", "toString", "constructor", "__proto__", ""]) {
      assert.equal(translate(locale, text), text, `${locale}: ${text}`);
    }
  }
  assert.equal(translate("unknown", "Close dialog"), "Close dialog");
});
