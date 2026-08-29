import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./components/icons";
import { droppedImagePath, hasDraggedFiles } from "./drag-drop";
import {
  INPAINT_BRUSH_DIRECT_MAX,
  INPAINT_BRUSH_SLIDER_MAX,
  INPAINT_BRUSH_SLIDER_MIN,
  INPAINT_MASK_GRID_SIZE,
  inpaintBrushSliderValue,
  rasterizeInpaintGridSegment,
  type InpaintBrushPoint,
} from "./inpaint-brush";
import {
  buildBinaryInpaintMask,
  buildInpaintMaskPreview,
} from "./inpaint-mask";
import { desktopUiText } from "./i18n";
import { useAppStore } from "./store";

function clampZoom(value: number) {
  return Math.min(8, Math.max(1, value));
}

function recolorMaskCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  color: string,
) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  const packed = Number.parseInt(match?.[1] ?? "ffffff", 16);
  const red = (packed >> 16) & 255;
  const green = (packed >> 8) & 255;
  const blue = packed & 255;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    if (image.data[index] + image.data[index + 1] + image.data[index + 2] <= 32) continue;
    image.data[index] = red;
    image.data[index + 1] = green;
    image.data[index + 2] = blue;
  }
  ctx.putImageData(image, 0, 0);
}

export function InpaintCanvas() {
  const language = useAppStore((state) => state.settings?.language);
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const comparisonBeforeImage = useAppStore((state) => state.comparisonBeforeImage);
  const brushSize = useAppStore((state) => state.brushSize);
  const setBrushSize = useAppStore((state) => state.setBrushSize);
  const brushOpacity = useAppStore((state) => state.brushOpacity);
  const brushColor = useAppStore((state) => state.brushColor);
  const brushMode = useAppStore((state) => state.brushMode);
  const setBrushMode = useAppStore((state) => state.setBrushMode);
  const brushShape = useAppStore((state) => state.brushShape);
  const setBrushShape = useAppStore((state) => state.setBrushShape);
  const maskRevision = useAppStore((state) => state.maskRevision);
  const setInpaintMask = useAppStore((state) => state.setInpaintMask);
  const loadWorkbenchFromPath = useAppStore((state) => state.loadWorkbenchFromPath);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const drawingPointerRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const panningRef = useRef(false);
  const panPointerRef = useRef<number | null>(null);
  const panStartRef = useRef({ clientX: 0, clientY: 0, x: 0, y: 0 });
  const spaceHeldRef = useRef(false);
  const historyRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const roundStampCacheRef = useRef(new Map<string, HTMLCanvasElement>());
  const [cursor, setCursor] = useState({ x: 0, y: 0, size: brushSize, visible: false });
  const [previewMaskUrl, setPreviewMaskUrl] = useState("");
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [stageZoom, setStageZoom] = useState(1);
  const [stagePan, setStagePan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [compareEnabled, setCompareEnabled] = useState(Boolean(comparisonBeforeImage));
  const [compareX, setCompareX] = useState(50);
  const [compareDragging, setCompareDragging] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const brushFootprintCells = brushShape === "round"
    ? 2 * Math.round(brushSize / 2) + 1
    : brushSize;
  const brushPixelSize = brushFootprintCells * INPAINT_MASK_GRID_SIZE;
  const sliderBrushSize = inpaintBrushSliderValue(brushSize);
  const canCompare = Boolean(comparisonBeforeImage?.fileUrl && workbenchImage?.fileUrl);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);

  useEffect(() => {
    if (!canvasRef.current || !workbenchImage) return;
    const canvas = canvasRef.current;
    canvas.width = workbenchImage.width || 1;
    canvas.height = workbenchImage.height || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [];
    redoRef.current = [];
    setHistoryCount(0);
    setRedoCount(0);
    setInpaintMask(null);
    setPreviewMaskUrl("");
    setShowExportPreview(false);
  }, [workbenchImage, maskRevision, setInpaintMask]);

  useEffect(() => {
    setStageZoom(1);
    setStagePan({ x: 0, y: 0 });
  }, [workbenchImage?.fileUrl]);

  useEffect(() => {
    setCompareX(50);
    setCompareEnabled(Boolean(comparisonBeforeImage?.fileUrl && workbenchImage?.fileUrl));
  }, [comparisonBeforeImage?.fileUrl, workbenchImage?.fileUrl]);

  useEffect(() => {
    if (!compareDragging) return;
    const move = (event: PointerEvent) => updateComparePosition(event.clientX);
    const up = () => setCompareDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [compareDragging]);

  const exportMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const source = ctx.getImageData(0, 0, w, h);
    const { rgba, any } = buildBinaryInpaintMask(source.data, w, h);
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    if (!any) {
      setInpaintMask(null);
      setPreviewMaskUrl("");
      setShowExportPreview(false);
      return;
    }
    const binaryImage = maskCtx.createImageData(w, h);
    binaryImage.data.set(rgba);
    maskCtx.putImageData(binaryImage, 0, 0);
    const dataUrl = maskCanvas.toDataURL("image/png");
    setInpaintMask(dataUrl.split(",")[1] ?? null);
    const previewImage = maskCtx.createImageData(w, h);
    previewImage.data.set(buildInpaintMaskPreview(rgba, w, h, brushColor));
    maskCtx.putImageData(previewImage, 0, 0);
    setPreviewMaskUrl(maskCanvas.toDataURL("image/png"));
  }, [brushColor, setInpaintMask]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    recolorMaskCanvas(canvas, ctx, brushColor);
    exportMask();
  }, [brushColor, exportMask]);

  const getPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
      y: (clientY - rect.top) * (canvas.height / Math.max(1, rect.height)),
    };
  }, []);

  const updateCursor = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const stageRect = stageRef.current?.getBoundingClientRect() ?? rect;
      const displayScale = rect.width / Math.max(1, canvas.width);
      setCursor({
        x: clientX - stageRect.left,
        y: clientY - stageRect.top,
        size: Math.max(2, brushPixelSize * displayScale),
        visible: true,
      });
    },
    [brushPixelSize],
  );

  const drawSamples = useCallback(
    (events: ArrayLike<Pick<PointerEvent, "clientX" | "clientY">>) => {
      if (!drawingRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      setShowExportPreview(false);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = brushMode === "paint" ? brushColor : "black";
      ctx.imageSmoothingEnabled = false;
      const exactSize = brushSize * INPAINT_MASK_GRID_SIZE;
      const stampColor = brushMode === "paint" ? brushColor : "black";
      const roundStamp = () => {
        const radius = Math.round(brushSize / 2);
        const diameter = radius * 2 + 1;
        const key = `${diameter}-${stampColor}`;
        const cached = roundStampCacheRef.current.get(key);
        if (cached) return cached;
        const stamp = document.createElement("canvas");
        stamp.width = diameter;
        stamp.height = diameter;
        const stampContext = stamp.getContext("2d");
        if (!stampContext) return stamp;
        stampContext.fillStyle = stampColor;
        for (let deltaY = -radius; deltaY <= radius; deltaY += 1) {
          for (let deltaX = -radius; deltaX <= radius; deltaX += 1) {
            const x = Math.abs(deltaX);
            const y = Math.abs(deltaY);
            const edgeDistance = Math.min(
              Math.hypot(x + 0.5, y + 0.5),
              Math.hypot(x - 0.5, y - 0.5),
            );
            if (edgeDistance <= radius) {
              stampContext.fillRect(deltaX + radius, deltaY + radius, 1, 1);
            }
          }
        }
        if (roundStampCacheRef.current.size >= 24) roundStampCacheRef.current.clear();
        roundStampCacheRef.current.set(key, stamp);
        return stamp;
      };
      const stamp = (point: InpaintBrushPoint) => {
        if (brushShape === "square") {
          ctx.fillRect(
            Math.round(point.x - brushSize / 2) * INPAINT_MASK_GRID_SIZE,
            Math.round(point.y - brushSize / 2) * INPAINT_MASK_GRID_SIZE,
            exactSize,
            exactSize,
          );
          return;
        }
        const radius = Math.round(brushSize / 2);
        const diameter = radius * 2 + 1;
        ctx.drawImage(
          roundStamp(),
          (Math.floor(point.x) - radius) * INPAINT_MASK_GRID_SIZE,
          (Math.floor(point.y) - radius) * INPAINT_MASK_GRID_SIZE,
          diameter * INPAINT_MASK_GRID_SIZE,
          diameter * INPAINT_MASK_GRID_SIZE,
        );
      };
      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        const sourcePoint = getPoint(event.clientX, event.clientY);
        if (!sourcePoint) continue;
        if (
          sourcePoint.x < 0 ||
          sourcePoint.y < 0 ||
          sourcePoint.x >= canvas.width ||
          sourcePoint.y >= canvas.height
        ) {
          lastPointRef.current = null;
          continue;
        }
        const point = {
          x: sourcePoint.x / INPAINT_MASK_GRID_SIZE,
          y: sourcePoint.y / INPAINT_MASK_GRID_SIZE,
        };
        const last = lastPointRef.current;
        if (last) {
          for (const sample of rasterizeInpaintGridSegment(last, point)) stamp(sample);
        } else {
          stamp({ x: Math.round(point.x), y: Math.round(point.y) });
        }
        lastPointRef.current = point;
      }
    },
    [brushColor, brushMode, brushShape, brushSize, getPoint],
  );

  // Called once at the start of each new stroke: snapshot the canvas so we can
  // undo back to it, and drop any redo states (a fresh stroke forks history).
  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > 40) historyRef.current.shift();
    setHistoryCount(historyRef.current.length);
    redoRef.current = [];
    setRedoCount(0);
  }, []);

  const undoLastStroke = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const previous = historyRef.current.pop();
    if (!canvas || !ctx || !previous) return;
    redoRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    setRedoCount(redoRef.current.length);
    ctx.putImageData(previous, 0, 0);
    recolorMaskCanvas(canvas, ctx, brushColor);
    setHistoryCount(historyRef.current.length);
    setShowExportPreview(false);
    exportMask();
  }, [brushColor, exportMask]);

  const redoNextStroke = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const next = redoRef.current.pop();
    if (!canvas || !ctx || !next) return;
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    setHistoryCount(historyRef.current.length);
    ctx.putImageData(next, 0, 0);
    recolorMaskCanvas(canvas, ctx, brushColor);
    setRedoCount(redoRef.current.length);
    setShowExportPreview(false);
    exportMask();
  }, [brushColor, exportMask]);

  useEffect(() => {
    const isEditable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    const keyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isEditable(event.target)) {
        event.preventDefault();
        spaceHeldRef.current = true;
        setSpaceHeld(true);
        return;
      }
      if (isEditable(event.target)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redoNextStroke();
        else undoLastStroke();
      } else if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        redoNextStroke();
      } else if (key === "b") {
        setBrushMode("paint");
      } else if (key === "e") {
        setBrushMode("erase");
      } else if (event.key === "[") {
        event.preventDefault();
        setBrushSize(brushSize - (brushShape === "round" ? 2 : 1));
      } else if (event.key === "]") {
        event.preventDefault();
        setBrushSize(brushSize + (brushShape === "round" ? 2 : 1));
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    const blur = () => {
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
    };
  }, [brushShape, brushSize, redoNextStroke, setBrushMode, setBrushSize, undoLastStroke]);

  const finishPointer = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
      if (panPointerRef.current === event.pointerId) {
        panningRef.current = false;
        panPointerRef.current = null;
        setIsPanning(false);
      }
      if (drawingPointerRef.current === event.pointerId) {
        if (!cancelled) {
          const native = event.nativeEvent;
          const samples = native.getCoalescedEvents?.() ?? [native];
          drawSamples(samples);
        }
        drawingRef.current = false;
        drawingPointerRef.current = null;
        lastPointRef.current = null;
        exportMask();
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [drawSamples, exportMask],
  );

  const imageZoomStyle = { transform: `translate(${stagePan.x}px, ${stagePan.y}px) scale(${stageZoom})` };
  const canvasZoomStyle = {
    transform: `translate(-50%, -50%) translate(${stagePan.x}px, ${stagePan.y}px) scale(${stageZoom})`,
  };
  const compareClip = `inset(0 0 0 ${compareX}%)`;

  function handleStageWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    const next = clampZoom(stageZoom * (event.deltaY < 0 ? 1.16 : 1 / 1.16));
    if (!rect || next === 1) {
      setStageZoom(next);
      setStagePan({ x: 0, y: 0 });
      return;
    }
    const baseLeft = rect.left - stagePan.x;
    const baseTop = rect.top - stagePan.y;
    const imageX = Math.min(rect.width / stageZoom, Math.max(0, (event.clientX - rect.left) / stageZoom));
    const imageY = Math.min(rect.height / stageZoom, Math.max(0, (event.clientY - rect.top) / stageZoom));
    setStageZoom(next);
    setStagePan({
      x: event.clientX - baseLeft - imageX * next,
      y: event.clientY - baseTop - imageY * next,
    });
  }

  function updateComparePosition(clientX: number) {
    const rect = canvasRef.current?.getBoundingClientRect() ?? stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    setCompareX(Math.min(100, Math.max(0, next)));
  }

  function handleImageDragOver(event: React.DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDropOver(true);
  }

  async function handleImageDrop(event: React.DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDropOver(false);
    const filePath = await droppedImagePath(event.dataTransfer);
    if (filePath) void loadWorkbenchFromPath(filePath);
  }

  if (!workbenchImage) {
    return (
      <main
        className="canvas-area"
        onDragOver={handleImageDragOver}
        onDragLeave={() => setDropOver(false)}
        onDrop={handleImageDrop}
      >
        {dropOver && (
          <div className="superdrop-overlay">
            <span>{t("inpaint.dropToLoad")}</span>
          </div>
        )}
        <div className="inpaint-empty">{t("inpaint.empty")}</div>
      </main>
    );
  }

  return (
    <main
      className="canvas-area inpaint-canvas-area"
      onDragOver={handleImageDragOver}
      onDragLeave={() => setDropOver(false)}
      onDrop={handleImageDrop}
    >
      {dropOver && (
        <div className="superdrop-overlay">
          <span>{t("inpaint.dropToLoad")}</span>
        </div>
      )}
      <div className="inpaint-mask-toolbar">
        <button
          type="button"
          className={`btn inpaint-icon-tool ${brushMode === "paint" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setBrushMode("paint")}
          title={`${t("inpaint.paintBrush")} · B`}
          aria-label={t("inpaint.paintBrush")}
          aria-pressed={brushMode === "paint"}
        >
          <Icon name="brush" />
        </button>
        <button
          type="button"
          className={`btn inpaint-icon-tool ${brushMode === "erase" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setBrushMode("erase")}
          title={`${t("inpaint.eraser")} · E`}
          aria-label={t("inpaint.eraser")}
          aria-pressed={brushMode === "erase"}
        >
          <Icon name="eraser" />
        </button>
        <label className="inpaint-toolbar-size" title={t("inpaint.brushSize")}>
          <input
            type="number"
            min={brushShape === "round" ? 2 : 1}
            max={INPAINT_BRUSH_DIRECT_MAX}
            step={1}
            value={brushSize}
            aria-label={t("inpaint.brushSize")}
            onChange={(event) => {
              if (event.currentTarget.value !== "") setBrushSize(Number(event.currentTarget.value));
            }}
          />
          <span>{t("inpaint.gridUnit")}</span>
        </label>
        <input
          className="inpaint-toolbar-range"
          type="range"
          min={INPAINT_BRUSH_SLIDER_MIN}
          max={INPAINT_BRUSH_SLIDER_MAX}
          step={1}
          value={sliderBrushSize}
          aria-label={t("inpaint.brushSize")}
          onChange={(event) => setBrushSize(Number(event.currentTarget.value))}
        />
        <div className="inpaint-toolbar-shapes" role="group" aria-label={t("inpaint.brushShape")}>
          <button
            type="button"
            className={brushShape === "round" ? "active" : ""}
            onClick={() => setBrushShape("round")}
            title={t("inpaint.roundBrush")}
            aria-label={t("inpaint.roundBrush")}
            aria-pressed={brushShape === "round"}
          >
            <span className="inpaint-shape-swatch round" />
          </button>
          <button
            type="button"
            className={brushShape === "square" ? "active" : ""}
            onClick={() => setBrushShape("square")}
            title={t("inpaint.squareBrush")}
            aria-label={t("inpaint.squareBrush")}
            aria-pressed={brushShape === "square"}
          >
            <span className="inpaint-shape-swatch square" />
          </button>
        </div>
        <span className="inpaint-toolbar-divider" />
        <button
          type="button"
          className="btn btn-ghost"
          disabled={historyCount === 0}
          onClick={undoLastStroke}
          title={t("inpaint.undoTitle")}
          aria-label={t("inpaint.undoTitle")}
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={redoCount === 0}
          onClick={redoNextStroke}
          title={t("inpaint.redoTitle")}
          aria-label={t("inpaint.redoTitle")}
        >
          <Icon name="redo" />
        </button>
        <button
          type="button"
          className={`btn ${showExportPreview ? "btn-primary" : "btn-ghost"}`}
          disabled={!previewMaskUrl}
          onClick={() => setShowExportPreview((value) => !value)}
          title={t("inpaint.previewMaskTitle")}
          aria-label={showExportPreview ? t("inpaint.backToPaint") : t("inpaint.previewMask")}
          aria-pressed={showExportPreview}
        >
          <Icon name="eye" />
        </button>
        {canCompare ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setCompareEnabled((value) => !value)}
            title={t("inpaint.compareTitle")}
            aria-label={compareEnabled ? t("inpaint.closeCompare") : t("inpaint.beforeAfter")}
          >
            <Icon name="swap" />
          </button>
        ) : null}
        <span className="inpaint-zoom-readout">{Math.round(stageZoom * 100)}%</span>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={stageZoom === 1 && stagePan.x === 0 && stagePan.y === 0}
          onClick={() => {
            setStageZoom(1);
            setStagePan({ x: 0, y: 0 });
          }}
          title={t("inpaint.resetZoom")}
          aria-label={t("inpaint.resetZoom")}
        >
          <Icon name="fitScreen" />
        </button>
      </div>
      <div className="inpaint-stage" ref={stageRef} onWheel={handleStageWheel}>
        <img
          className="inpaint-base-img"
          src={workbenchImage.fileUrl}
          alt={t("inpaint.baseAlt")}
          draggable={false}
          style={{ ...imageZoomStyle, opacity: compareEnabled && canCompare ? 0 : 1 }}
        />
        {compareEnabled && canCompare ? (
          <>
            <img
              className="inpaint-compare-img inpaint-compare-before"
              src={comparisonBeforeImage!.fileUrl}
              alt={t("inpaint.beforeAlt")}
              draggable={false}
              style={imageZoomStyle}
            />
            <div className="inpaint-compare-after-clip" style={{ clipPath: compareClip }}>
              <img
                className="inpaint-compare-img"
                src={workbenchImage.fileUrl}
                alt={t("inpaint.afterAlt")}
                draggable={false}
                style={imageZoomStyle}
              />
            </div>
            <button
              type="button"
              className="compare-divider inpaint-compare-divider"
              style={{ left: `${compareX}%` }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setCompareDragging(true);
                updateComparePosition(event.clientX);
              }}
              aria-label={t("inpaint.dividerLabel")}
              title={t("inpaint.dividerLabel")}
            >
              <span />
            </button>
          </>
        ) : null}
        <canvas
          ref={canvasRef}
          className="inpaint-mask-canvas"
          style={{
            opacity: showExportPreview || (compareEnabled && canCompare) ? 0 : brushOpacity,
            pointerEvents: compareEnabled && canCompare ? "none" : undefined,
            cursor: isPanning ? "grabbing" : spaceHeld ? "grab" : "none",
            ...canvasZoomStyle,
          }}
          onPointerDown={(event) => {
            if (event.button === 1 || spaceHeldRef.current) {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              panningRef.current = true;
              panPointerRef.current = event.pointerId;
              panStartRef.current = {
                clientX: event.clientX,
                clientY: event.clientY,
                x: stagePan.x,
                y: stagePan.y,
              };
              setIsPanning(true);
              setCursor((current) => ({ ...current, visible: false }));
              return;
            }
            if (event.pointerType === "mouse" && event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            updateCursor(event.clientX, event.clientY);
            pushHistory();
            drawingRef.current = true;
            drawingPointerRef.current = event.pointerId;
            lastPointRef.current = null;
            drawSamples([event.nativeEvent]);
          }}
          onPointerMove={(event) => {
            if (panPointerRef.current === event.pointerId && panningRef.current) {
              const start = panStartRef.current;
              setStagePan({
                x: start.x + event.clientX - start.clientX,
                y: start.y + event.clientY - start.clientY,
              });
              return;
            }
            updateCursor(event.clientX, event.clientY);
            if (drawingPointerRef.current !== event.pointerId) return;
            const native = event.nativeEvent;
            drawSamples(native.getCoalescedEvents?.() ?? [native]);
          }}
          onPointerEnter={(event) => updateCursor(event.clientX, event.clientY)}
          onPointerUp={(event) => finishPointer(event)}
          onPointerCancel={(event) => finishPointer(event, true)}
          onPointerLeave={() => {
            setCursor((current) => ({ ...current, visible: false }));
          }}
        />
        {showExportPreview && previewMaskUrl ? (
          <img className="inpaint-export-preview" src={previewMaskUrl} alt={t("inpaint.maskPreviewAlt")} draggable={false} style={canvasZoomStyle} />
        ) : null}
        <div
          className="inpaint-cursor soft"
          style={{
            left: cursor.x,
            top: cursor.y,
            width: cursor.size,
            height: cursor.size,
            borderRadius: brushShape === "round" ? "999px" : "3px",
            borderColor: brushColor,
            opacity: cursor.visible && !showExportPreview && !spaceHeld && !isPanning ? 1 : 0,
          }}
        />
      </div>
    </main>
  );
}
