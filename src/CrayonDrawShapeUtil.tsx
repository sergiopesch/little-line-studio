import type { Editor, SvgExportContext, TLDrawShape, TLShapeUtilCanvasSvgDef } from "tldraw";

import { ArrowShapeUtil, DefaultFontStyle, DrawShapeUtil, GeoShapeUtil, useEditor, useValue } from "tldraw";
import { CRAYON_GRAIN_SIZE, crayonGrainHoles, crayonPaintIds } from "./crayon-grain.js";
import { nativeAppearanceDisplayValues, readCrayonAppearance } from "./crayon-appearance.js";

function GrainMask({ variant, namespace }: { variant: number; namespace: string }) {
  const ids = crayonPaintIds("#000000", variant, namespace);
  if (!ids) return null;
  return <mask id={ids.mask} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse"
    x="0" y="0" width={CRAYON_GRAIN_SIZE} height={CRAYON_GRAIN_SIZE}
    style={{ maskType: "luminance" }}>
    <rect width={CRAYON_GRAIN_SIZE} height={CRAYON_GRAIN_SIZE} fill="white" />
    {crayonGrainHoles(variant).map((hole, index) => <ellipse key={index}
      cx={hole.x} cy={hole.y} rx={hole.rx} ry={hole.ry} fill="black"
      transform={`rotate(${hole.angle * 180 / Math.PI} ${hole.x} ${hole.y})`} />)}
  </mask>;
}

function InkPattern({ ink, variant, namespace }: { ink: string; variant: number; namespace: string }) {
  const ids = crayonPaintIds(ink, variant, namespace);
  if (!ids) return null;
  return <pattern id={ids.pattern} width={CRAYON_GRAIN_SIZE} height={CRAYON_GRAIN_SIZE}
    patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse">
    <rect width={CRAYON_GRAIN_SIZE} height={CRAYON_GRAIN_SIZE} fill={ink} mask={`url(#${ids.mask})`} />
  </pattern>;
}

function CanvasGrainDefinitions() {
  const editor = useEditor();
  const inks = useValue("authored crayon inks", () => JSON.stringify([...new Set(
    editor.getCurrentPageShapes().flatMap((shape) => {
      const style = readCrayonAppearance(shape.meta?.littleLineAppearance);
      return style && crayonPaintIds(style.ink, style.grainVariant, editor.id)
        ? [`${style.ink}:${style.grainVariant}`] : [];
    }),
  )].sort()), [editor]);
  const keys: unknown = JSON.parse(inks);
  const paints = Array.isArray(keys) ? keys.flatMap((key: unknown) => {
    if (typeof key !== "string") return [];
    const [ink, value] = key.split(":");
    const variant = Number(value);
    return ink && crayonPaintIds(ink, variant, editor.id) ? [{ ink, variant }] : [];
  }) : [];
  return <>
    {[...new Set(paints.map((paint) => paint.variant))].map((variant) =>
      <GrainMask key={`mask-${variant}`} variant={variant} namespace={editor.id} />)}
    {paints.map((paint) => <InkPattern key={`${paint.ink}-${paint.variant}`}
      {...paint} namespace={editor.id} />)}
  </>;
}

// The read-only lessons use solid/no fill, not the SDK's bitmap hatch fill.
// DefaultCanvas collects definitions for every registered shape utility even
// when a shape type is unused, so filter only that shared definition from all
// three built-in utilities which register it. Other SDK definitions are kept.
const SDK_HATCH_KEY = `${DefaultFontStyle.id}:pattern`;
const withoutUnusedHatch = (defs: TLShapeUtilCanvasSvgDef[]) => defs.filter(({ key }) => key !== SDK_HATCH_KEY);

export class NoHatchGeoShapeUtil extends GeoShapeUtil {
  override getCanvasSvgDefs() {
    return withoutUnusedHatch(super.getCanvasSvgDefs());
  }
}

export class NoHatchArrowShapeUtil extends ArrowShapeUtil {
  override getCanvasSvgDefs() {
    return withoutUnusedHatch(super.getCanvasSvgDefs());
  }
}

// Official patterns/masks extension; native draw geometry, pressure, component,
// bounds, migrations and licensing are inherited without replacement.
// https://tldraw.dev/reference/editor/ShapeUtil#getCanvasSvgDefs
// https://tldraw.dev/reference/editor/SvgExportContext#addExportDef
export class CrayonDrawShapeUtil extends DrawShapeUtil {
  constructor(editor: Editor) {
    super(editor);
    this.options = {
      ...this.options,
      getCustomDisplayValues: (editor, shape) => nativeAppearanceDisplayValues(shape, editor.id),
    };
  }

  override getCanvasSvgDefs() {
    return [...withoutUnusedHatch(super.getCanvasSvgDefs()), {
      key: "little-line-crayon-paper", component: CanvasGrainDefinitions,
    }];
  }

  override toSvg(shape: TLDrawShape, context: SvgExportContext) {
    const style = readCrayonAppearance(shape.meta?.littleLineAppearance);
    const ids = style && crayonPaintIds(style.ink, style.grainVariant, this.editor.id);
    if (ids && style && style.grainVariant !== undefined) {
      const { ink, grainVariant } = style;
      context.addExportDef({ key: ids.mask,
        getElement: () => <GrainMask variant={grainVariant} namespace={this.editor.id} /> });
      context.addExportDef({ key: ids.pattern,
        getElement: () => <InkPattern ink={ink} variant={grainVariant} namespace={this.editor.id} /> });
    }
    return super.toSvg(shape, context);
  }
}
