import assert from "node:assert/strict";
import test from "node:test";
import { CAT_APPEARANCE } from "../src/cat-appearance.js";
import { defineCrayonAppearance } from "../src/crayon-appearance.js";

test("authored outline styles reject values the renderer would silently ignore or replace", () => {
  for (const style of [
    { color: "ginger" }, { fill: "pattern" }, { dash: "dotted" }, { size: "huge" },
    { ink: "red" }, { ink: "url(https://example.invalid/paint)" },
    { width: NaN }, { width: Infinity }, { width: 0.49 }, { width: 20.01 }, { width: "3px" },
    { grainVariant: -1 }, { grainVariant: 3 }, { grainVariant: 0.5 }, { grainVariant: NaN },
  ]) {
    const input = structuredClone(CAT_APPEARANCE);
    input.outlineStyles.default = style;
    assert.throws(() => defineCrayonAppearance(input), /outline style/i, JSON.stringify(style));
  }
});

test("outline overrides retain native widths, grain variants and partial inheritance", () => {
  for (const style of [{}, { width: 0.5 }, { width: 20 }, { grainVariant: 0 }, { grainVariant: 1 },
    { grainVariant: 2 }, { ink: "#Aa00Ff", fill: "fill", dash: "solid", size: "xl", color: "light-violet" }]) {
    const input = structuredClone(CAT_APPEARANCE);
    input.outlineStyles["left-eye"] = style;
    assert.deepEqual(defineCrayonAppearance(input).outlineStyles["left-eye"], style);
  }
});
