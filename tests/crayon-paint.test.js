import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { crayonGrainHoles, crayonPaintIds, CRAYON_GRAIN_SIZE } from "../src/crayon-grain.js";
import { getColourMarks, getOutlineStyle, nativeAppearanceDisplayValues } from "../src/crayon-appearance.js";
import { getOutlineMarks } from "../src/outline-marks.js";
import { LESSONS } from "../src/lesson-catalogue.js";

test("authored lesson shapes never require the omitted SDK hatch fill", () => {
  for (const lesson of LESSONS) {
    for (const stroke of getOutlineMarks(lesson)) {
      assert.notEqual(getOutlineStyle(lesson, { id: stroke.sourceId }).fill, "pattern",
        `${lesson.id}/${stroke.id} requires the SDK hatch`);
    }
    for (const mark of getColourMarks(lesson)) {
      assert.notEqual(mark.fill, "pattern", `${lesson.id}/${mark.id} requires the SDK hatch`);
    }
  }
});

test("native crayon grain is deterministic vector paper texture with a stable path-local origin", () => {
  const holes = crayonGrainHoles(0);
  assert.deepEqual(crayonGrainHoles(0), holes);
  assert.notDeepEqual(crayonGrainHoles(1), holes);
  assert.equal(holes.length, 30);
  for (const hole of holes) {
    assert.ok(hole.x > 0 && hole.x < CRAYON_GRAIN_SIZE);
    assert.ok(hole.y > 0 && hole.y < CRAYON_GRAIN_SIZE);
    assert.ok(hole.rx > 0 && hole.ry > 0);
  }
  const holeArea = holes.reduce((sum, hole) => sum + Math.PI * hole.rx * hole.ry, 0);
  assert.ok(holeArea / CRAYON_GRAIN_SIZE ** 2 > 0.1);
  assert.ok(holeArea / CRAYON_GRAIN_SIZE ** 2 < 0.35);
  const shape = { meta: { littleLineAppearance: { ink: "#efaa32", width: 3, grainVariant: 1 } } };
  const expected = nativeAppearanceDisplayValues(shape, "editor-one");
  assert.equal(expected.strokeColor, `url(#${crayonPaintIds("#efaa32", 1, "editor-one").pattern})`);
  assert.deepEqual(nativeAppearanceDisplayValues({ ...shape, props: { segments: [] } }, "editor-one"), expected);
  assert.notEqual(nativeAppearanceDisplayValues(shape, "editor-two").strokeColor, expected.strokeColor);
  assert.equal(crayonPaintIds("url(https://invalid.example)", 0), null);
});

test("installed SDK retains native draw rendering and registers matching grain definitions for SVG export", async () => {
  // Compile JSX locally; use the installed SDK itself for the extension contract.
  const compiled = await build({
    entryPoints: [new URL("../src/CrayonDrawShapeUtil.jsx", import.meta.url).pathname],
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
  });
  // The SDK starts browser-oriented runtime handles. Keep this actual-SDK
  // contract test isolated from the main ESM schema fixtures and their lifetime.
  const result = spawnSync(process.execPath, ["-"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 10000,
    input: `
  const assert = require('node:assert/strict');
  const { renderToStaticMarkup } = require('react-dom/server');
  const module = { exports: {} };
  new Function('module','exports','require', ${JSON.stringify(compiled.outputFiles[0].text)})(module,module.exports,require);
  const { CrayonDrawShapeUtil, NoHatchGeoShapeUtil, NoHatchArrowShapeUtil } = module.exports;
  const { ArrowShapeUtil, DefaultFontStyle, DrawShapeUtil, GeoShapeUtil, ShapeUtil, defaultShapeUtils, DEFAULT_THEME } = require("tldraw");
  assert.equal(CrayonDrawShapeUtil.type, DrawShapeUtil.type);
  assert.equal(CrayonDrawShapeUtil.props, DrawShapeUtil.props);
  assert.equal(CrayonDrawShapeUtil.migrations, DrawShapeUtil.migrations);
  assert.equal(CrayonDrawShapeUtil.prototype.component, DrawShapeUtil.prototype.component);
  assert.equal(CrayonDrawShapeUtil.prototype.getGeometry, DrawShapeUtil.prototype.getGeometry);
  const editor = { id: "test-editor", getCurrentTheme: () => DEFAULT_THEME, getColorMode: () => "light" };
  const util = new CrayonDrawShapeUtil(editor);
  const defs = util.getCanvasSvgDefs();
  const hatch = DefaultFontStyle.id + ':pattern';
  const nativeDefs = new DrawShapeUtil(editor).getCanvasSvgDefs();
  assert.ok(nativeDefs.some((def) => def.key === hatch));
  assert.deepEqual(defs.filter((def) => def.key !== 'little-line-crayon-paper').map((def) => def.key),
    nativeDefs.filter((def) => def.key !== hatch).map((def) => def.key));
  assert.ok(defs.some((def) => def.key === "little-line-crayon-paper" && typeof def.component === "function"));
  for (const [custom, native] of [[NoHatchGeoShapeUtil, GeoShapeUtil], [NoHatchArrowShapeUtil, ArrowShapeUtil]]) {
    assert.equal(custom.type, native.type);
    assert.equal(custom.props, native.props);
    assert.equal(custom.migrations, native.migrations);
    assert.equal(custom.prototype.component, native.prototype.component);
    assert.equal(custom.prototype.getGeometry, native.prototype.getGeometry);
    assert.deepEqual(new custom(editor).getCanvasSvgDefs().map((def) => def.key),
      new native(editor).getCanvasSvgDefs().filter((def) => def.key !== hatch).map((def) => def.key));
  }
  const replacements = new Map([["draw", CrayonDrawShapeUtil], ["geo", NoHatchGeoShapeUtil], ["arrow", NoHatchArrowShapeUtil]]);
  assert.equal(NoHatchArrowShapeUtil.prototype.onTranslateStart, ArrowShapeUtil.prototype.onTranslateStart);
  for (const native of defaultShapeUtils) {
    if (native.prototype.getCanvasSvgDefs === ShapeUtil.prototype.getCanvasSvgDefs) continue;
    const selected = replacements.get(native.type) || native;
    assert.ok(new selected(editor).getCanvasSvgDefs().every((def) => def.key !== hatch), native.type);
  }
  const exports = new Map();
  const shape = {
    id: "shape:authored-crayon", type: "draw",
    meta: { littleLineAppearance: { ink: "#efaa32", width: 3, grainVariant: 1 } },
    props: { ...util.getDefaultProps(), scale: 1, color: "orange", fill: "none", dash: "draw", isPen: true },
  };
  const element = util.toSvg(shape, { addExportDef: (definition) => exports.set(definition.key, definition) });
  assert.equal(element.type, "g", "Native DrawShapeUtil.toSvg remains the renderer.");
  const ids = {pattern:'little-line-test-editor-crayon-efaa32-1',mask:'little-line-test-editor-paper-1'};
  assert.ok(exports.has(ids.pattern));
  assert.ok(exports.has(ids.mask));
  const mask = renderToStaticMarkup(exports.get(ids.mask).getElement());
  const pattern = renderToStaticMarkup(exports.get(ids.pattern).getElement());
  assert.match(mask, /maskUnits="userSpaceOnUse"/);
  assert.equal((mask.match(/<ellipse/g) ?? []).length, 30);
  assert.match(pattern, /patternUnits="userSpaceOnUse"/);
  assert.ok(pattern.includes('mask="url(#' + ids.mask + ')"'));
  assert.doesNotMatch(mask + pattern, /<image|<foreignObject|https?:/);
  process.exit(0);
`,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test("unknown native shape metadata cannot supply paint URLs or nonnumeric drawing widths", () => {
  for (const style of [null, false, "#ffaa00", [], { ink: "url(https://invalid.example/paint)" }, { ink: 123 }])
    assert.deepEqual(nativeAppearanceDisplayValues({ meta: { littleLineAppearance: style } }), {});
  for (const width of ["3", NaN, Infinity, -1, 21]) {
    const display = nativeAppearanceDisplayValues({ meta: { littleLineAppearance: { ink: "#ffaa00", width, grainVariant: "1" } } });
    assert.deepEqual(display, { strokeColor: "#ffaa00" });
  }
  assert.equal(crayonPaintIds("#ffaa00", "1"), null);
  assert.equal(crayonPaintIds("#ffaa00", 3), null);
});
