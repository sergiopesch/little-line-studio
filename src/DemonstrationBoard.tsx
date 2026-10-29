import type { PointerEvent, SyntheticEvent } from "react";
import type { Editor, TLCameraOptions, TLDrawShape, TLDrawShapeSegment, TLShapePartial, TLUserPreferences, TLAnyShapeUtilConstructor, TldrawOptions } from "tldraw";
import type { DemonstrationBoardProps } from "./browser/ui-contracts.ts";
import type { ColourState, DrawingPoint, OutlineStyle } from "./drawing/contracts.ts";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  b64Vecs,
  createShapeId,
  Tldraw,
  useTldrawCurrentUser,
} from "tldraw";
import { getAssetUrls } from "@tldraw/assets/selfHosted";
import { useLocale } from "./i18n.jsx";
import { demonstrationLabel } from "./demonstration-label.js";
import { pointsAtProgress } from "./lesson-geometry.js";
import { getOutlineMarks, outlineState } from "./outline-marks.js";
import {
  advanceProgress,
  clampStageIndex,
  demonstrationState,
  getDemonstrationForStep,
} from "./demonstration-state.js";
import {
  colouringState,
  getColourMarks,
  getOutlineStyle,
} from "./crayon-appearance.js";
import { CrayonDrawShapeUtil, NoHatchArrowShapeUtil, NoHatchGeoShapeUtil } from "./CrayonDrawShapeUtil.jsx";
import "tldraw/tldraw.css";

const ASSETS = getAssetUrls({ baseUrl: "/tldraw" });
const CAMERA: Partial<TLCameraOptions> = { isLocked: true, wheelBehavior: "none", zoomSteps: [0.1, 4] };
const COMPONENTS = { ContextMenu: null };
const OVERRIDES = { actions: () => ({}), tools: () => ({}) };
const OPTIONS: Partial<TldrawOptions> = { onClipboardPasteRaw: () => false };
// The installed SDK arrow utility declares optional result fields as `T | undefined`,
// unlike its generic registration type under exactOptionalPropertyTypes. Keep
// this SDK-only assertion local; native utility inheritance is tested directly.
const SHAPE_UTILS = [CrayonDrawShapeUtil, NoHatchGeoShapeUtil, NoHatchArrowShapeUtil as TLAnyShapeUtilConstructor];
// These arrays participate in tldraw's asset-util identity and editor lifecycle.
const NO_ACCEPTED_MEDIA: string[] = [];
const PREFERENCES: TLUserPreferences = {
  id: "local-demonstration",
  colorScheme: "light",
  areKeyboardShortcutsEnabled: false,
};
const noPreferenceUpdates = () => {};
const SPEED_MULTIPLIERS = { slow: 1, slower: 1.5, normal: 0.75 };

function segments(stroke: { readonly points: readonly DrawingPoint[] }, progress: number): TLDrawShapeSegment[] {
  const origin = stroke.points[0];
  if (!origin) throw new TypeError("A native drawing needs an authored origin.");
  return [
    {
      type: "free",
      path: b64Vecs.encodePoints(
        pointsAtProgress(stroke, progress).map((point) => ({
          x: point.x - origin.x,
          y: point.y - origin.y,
          z: point.z ?? 0.5,
        })),
      ),
    },
  ];
}

function stopInput(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function appearanceMeta(style: OutlineStyle) {
  return style.ink ? {
    littleLineAppearance: {
      ink: style.ink,
      ...(typeof style.width === "number" && Number.isFinite(style.width) ? { width: style.width } : {}),
      ...(typeof style.grainVariant === "number" && Number.isInteger(style.grainVariant) ? { grainVariant: style.grainVariant } : {}),
    },
  } : {};
}

export default function DemonstrationBoard({
  lesson,
  stepIndex = 0,
  replayKey = 0,
  paused = false,
  speed = "slow",
  still = false,
  onPlayingChange,
  onReady,
  onComplete,
}: DemonstrationBoardProps) {
  const { locale } = useLocale();
  const hostRef = useRef<HTMLDivElement>(null);
  const outlineMarks = useMemo(() => getOutlineMarks(lesson), [lesson]);
  const shapeIds = useMemo(
    () =>
      outlineMarks.map((stroke) =>
        createShapeId(`demo-${lesson.id}-${stroke.id}`),
      ),
    [lesson, outlineMarks],
  );
  const colourMarks = useMemo(() => getColourMarks(lesson), [lesson]);
  const outlineStyles = useMemo(
    () => outlineMarks.map((stroke) => getOutlineStyle(lesson, { id: stroke.sourceId })),
    [lesson, outlineMarks],
  );
  const colourShapeIds = useMemo(
    () => colourMarks.map((mark) => createShapeId(`demo-${lesson.id}-colour-${mark.id}`)),
    [lesson, colourMarks],
  );
  const fullColourSegments = useMemo(
    () => colourMarks.map((mark) => segments(mark, 1)),
    [colourMarks],
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [systemReducedMotion, setReducedMotion] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const reducedMotion = still || systemReducedMotion;
  const progressRef = useRef(0);
  const renderedColours = useRef<readonly ColourState[]>([]);
  const playingCallbackRef = useRef(onPlayingChange);
  playingCallbackRef.current = onPlayingChange;
  const readyCallbackRef = useRef(onReady);
  const completeCallbackRef = useRef(onComplete);
  readyCallbackRef.current = onReady;
  completeCallbackRef.current = onComplete;
  const user = useTldrawCurrentUser({
    userPreferences: PREFERENCES,
    setUserPreferences: noPreferenceUpdates,
  });
  const step = clampStageIndex(lesson, stepIndex);

  const handleMount = useCallback(
    (mountedEditor: Editor) => {
      for (const type of [
        "text",
        "files",
        "file-replace",
        "url",
        "svg-text",
        "embed",
        "tldraw",
        "excalidraw",
      ] as const) {
        mountedEditor.registerExternalContentHandler(type, null);
      }
      mountedEditor.registerExternalAssetHandler("file", null);
      mountedEditor.registerExternalAssetHandler("url", null);
      mountedEditor.createShapes([
        ...colourMarks.map((mark, index): TLShapePartial<TLDrawShape> => {
          const id = colourShapeIds[index], origin = mark.points[0], fullSegments = fullColourSegments[index];
          if (!id || !origin || !fullSegments) throw new TypeError("A colour mark is missing its native drawing data.");
          return {
            id,
            type: "draw",
            x: origin.x,
            y: origin.y,
            opacity: 0,
            isLocked: true,
            meta: appearanceMeta(mark),
            props: {
              segments: fullSegments,
              color: mark.color,
              fill: mark.fill,
              dash: mark.dash,
              size: mark.size,
              isComplete: true,
              isClosed: mark.closed,
              isPen: mark.isPen,
            },
          };
        }),
        ...outlineMarks.map((stroke, index): TLShapePartial<TLDrawShape> => {
          const id = shapeIds[index], origin = stroke.points[0], style = outlineStyles[index];
          if (!id || !origin || !style) throw new TypeError("An outline is missing its native drawing data.");
          return {
            id,
            type: "draw",
            x: origin.x,
            y: origin.y,
            opacity: 0,
            isLocked: true,
            meta: appearanceMeta(style),
            props: {
              segments: segments(stroke, 0),
              color: style.color,
              fill: style.fill,
              dash: style.dash,
              size: style.size,
              isComplete: true,
              isClosed: false,
              isPen: false,
            },
          };
        }),
      ]);
      mountedEditor.updateInstanceState({
        isReadonly: true,
        isGridMode: false,
      });
      mountedEditor.clearHistory();
      setEditor(mountedEditor);
    },
    [lesson, outlineMarks, shapeIds, colourMarks, colourShapeIds, fullColourSegments, outlineStyles],
  );

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!editor || !hostRef.current) return;
    const fit = () => {
      const host = hostRef.current;
      if (!host) return;
      const { width, height } = host.getBoundingClientRect();
      if (width <= 36 || height <= (lesson.pilot ? 16 : 48) || editor.isDisposed) return;
      const frame = lesson.viewFrame;
      const zoom = Math.max(
        0.1,
        Math.min(4, (width - 24) / frame.w, (height - (lesson.pilot ? 12 : 20)) / frame.h),
      );
      editor.setCamera(
        {
          x: width / (2 * zoom) - (frame.x + frame.w / 2),
          y: height / (2 * zoom) - (frame.y + frame.h / 2),
          z: zoom,
        },
        { force: true },
      );
    };
    const observer = new ResizeObserver(fit);
    observer.observe(hostRef.current);
    fit();
    return () => observer.disconnect();
  }, [editor, lesson]);

  useEffect(() => {
    if (!editor) return;
    readyCallbackRef.current?.();
  }, [editor]);

  const applyProgress = useCallback((progress: number, initialise = false) => {
    if (!editor || editor.isDisposed) return;
    const state = demonstrationState(lesson, step, progress);
    const records: TLDrawShape[] = outlineMarks.flatMap((stroke, index) => {
      const authoredState = state[stroke.sourceIndex], id = shapeIds[index];
      if (!authoredState || !id) throw new TypeError("An outline has no authored progression state.");
      const current = outlineState(stroke, authoredState);
      if (!initialise && !current.current) return [];
      const shape = editor.getShape<TLDrawShape>(id);
      if (!shape || shape.type !== "draw") throw new TypeError("An authored native outline is missing.");
      const progress = current.progress;
      return [
        {
          ...shape,
          opacity: current.visible ? 1 : 0,
          props: {
            ...shape.props,
            segments: segments(stroke, progress),
            isClosed: progress === 1 && stroke.closed,
          },
        },
      ];
    });
    const colours = colouringState(lesson, step, progress);
    const currentStep = lesson.steps[step];
    if (!currentStep) throw new TypeError("The drawing needs an authored lesson step.");
    colourMarks.forEach((mark, index) => {
      if (!initialise && mark.phaseId !== currentStep.id) return;
      const colour = colours[index], id = colourShapeIds[index], fullSegments = fullColourSegments[index];
      if (!colour || !id || !fullSegments) throw new TypeError("A colour mark has no native progression data.");
      const previous = renderedColours.current[index];
      if (!initialise && previous?.visible === colour.visible && previous.progress === colour.progress)
        return;
      const shape = editor.getShape<TLDrawShape>(id);
      if (!shape || shape.type !== "draw") throw new TypeError("An authored native colour mark is missing.");
      records.push({
        ...shape,
        opacity: colour.visible ? colour.opacity : 0,
        props: {
          ...shape.props,
          segments:
            colour.progress === 1
              ? fullSegments
              : segments(mark, colour.progress),
          isClosed: colour.progress === 1 && mark.closed,
          isComplete: colour.progress === 1,
        },
      });
    });
    renderedColours.current = colours;
    // Trusted authored records bypass editing commands; the editor stays read-only throughout.
    if (records.length) editor.run(() => editor.store.put(records), { history: "ignore" });
  }, [editor, lesson, outlineMarks, shapeIds, colourMarks, colourShapeIds, fullColourSegments, step]);

  useEffect(() => {
    if (!editor) return;
    progressRef.current = reducedMotion ? 1 : 0;
    applyProgress(progressRef.current, true);
  }, [editor, applyProgress, replayKey, reducedMotion]);

  useEffect(() => {
    const demonstration = getDemonstrationForStep(lesson, step);
    if (
      !editor ||
      paused ||
      reducedMotion ||
      !demonstration ||
      progressRef.current >= 1
    ) {
      playingCallbackRef.current?.(false);
      if (
        editor && !paused && demonstration &&
        (reducedMotion || progressRef.current >= 1)
      )
        completeCallbackRef.current?.(step, replayKey);
      return;
    }
    const duration = demonstration.durationMs * (SPEED_MULTIPLIERS[speed] ?? 1);
    let frame: number;
    let lastTime: number | null = null;
    playingCallbackRef.current?.(true);
    const animate = (time: number) => {
      if (editor.isDisposed) {
        playingCallbackRef.current?.(false);
        return;
      }
      if (lastTime !== null)
        progressRef.current = advanceProgress(
          progressRef.current,
          time - lastTime,
          duration,
        );
      lastTime = time;
      applyProgress(progressRef.current);
      if (progressRef.current < 1) frame = requestAnimationFrame(animate);
      else {
        playingCallbackRef.current?.(false);
        completeCallbackRef.current?.(step, replayKey);
      }
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      playingCallbackRef.current?.(false);
    };
  }, [editor, lesson, step, replayKey, paused, speed, reducedMotion, applyProgress]);

  const blockCanvasPointer = (event: PointerEvent<HTMLDivElement>) => {
    // Preserve the SDK watermark's required interactions.
    if (!(event.target instanceof Element) || !event.target.closest("button, a, [role='button']")) stopInput(event);
  };

  return (
    <div
      ref={hostRef}
      className="demonstration-board"
      role="region"
      aria-label={demonstrationLabel(lesson, step, locale)}
      onPointerDownCapture={blockCanvasPointer}
      onPointerUpCapture={blockCanvasPointer}
      onPasteCapture={stopInput}
      onDropCapture={stopInput}
      onDragOverCapture={stopInput}
      onContextMenuCapture={stopInput}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <Tldraw
        hideUi
        licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
        user={user}
        assetUrls={ASSETS}
        cameraOptions={CAMERA}
        components={COMPONENTS}
        overrides={OVERRIDES}
        options={OPTIONS}
        shapeUtils={SHAPE_UTILS}
        onMount={handleMount}
        acceptedImageMimeTypes={NO_ACCEPTED_MEDIA}
        acceptedVideoMimeTypes={NO_ACCEPTED_MEDIA}
      />
    </div>
  );
}
