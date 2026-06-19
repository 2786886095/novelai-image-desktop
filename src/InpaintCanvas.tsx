import { useCallback, useEffect, useRef, useState } from "react";
import { droppedImagePath, hasDraggedFiles } from "./drag-drop";
import { useAppStore } from "./store";

function clampZoom(value: number) {
  return Math.min(8, Math.max(1, value));
}

export function InpaintCanvas() {
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const comparisonBeforeImage = useAppStore((state) => state.comparisonBeforeImage);
  const brushSize = useAppStore((state) => state.brushSize);
  const brushOpacity = useAppStore((state) => state.brushOpacity);
  const brushMode = useAppStore((state) => state.brushMode);
  const maskRevision = useAppStore((state) => state.maskRevision);
  const setInpaintMask = useAppStore((state) => state.setInpaintMask);
  const loadWorkbenchFromPath = useAppStore((state) => state.loadWorkbenchFromPath);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const [cursor, setCursor] = useState({ x: 0, y: 0, size: brushSize, visible: false });
  const [previewMaskUrl, setPreviewMaskUrl] = useState("");
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [stageZoom, setStageZoom] = useState(1);
  const [stagePan, setStagePan] = useState({ x: 0, y: 0 });
  const [compareEnabled, setCompareEnabled] = useState(Boolean(comparisonBeforeImage));
  const [compareX, setCompareX] = useState(50);
  const [compareDragging, setCompareDragging] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const canCompare = Boolean(comparisonBeforeImage?.fileUrl && workbenchImage?.fileUrl);

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

  // NovelAI's official inpaint quantizes the drawn mask to a coarse 64px grid
  // (the visible "blocky" mask on the website) before sending it to the API.
  // Any cell that overlaps a latent block which is only partially painted —
  // or that carries an anti-aliased gray edge — is exactly what produces the
  // dirty color-block artifacts and "ignores the prompt" behavior. We replicate
  // the official behavior: collapse the stroke to whole 64px cells, binarize to
  // pure black/white, and repaint the visible canvas so it is WYSIWYG with what
  // actually gets sent.
  const MASK_CELL = 64;
  const exportMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, w, h).data;
    const cols = Math.ceil(w / MASK_CELL);
    const rows = Math.ceil(h / MASK_CELL);
    const cellOn = new Uint8Array(cols * rows);
    let any = false;
    for (let y = 0; y < h; y += 1) {
      const rowBase = y * w;
      const cellRow = Math.floor(y / MASK_CELL) * cols;
      for (let x = 0; x < w; x += 1) {
        const idx = (rowBase + x) * 4;
        if (data[idx] + data[idx + 1] + data[idx + 2] > 32) {
          cellOn[cellRow + Math.floor(x / MASK_CELL)] = 1;
          any = true;
        }
      }
    }

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    maskCtx.globalCompositeOperation = "source-over";
    maskCtx.fillStyle = "black";
    maskCtx.fillRect(0, 0, w, h);
    if (!any) {
      setInpaintMask(null);
      setPreviewMaskUrl("");
      setShowExportPreview(false);
      return;
    }
    maskCtx.fillStyle = "white";
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (cellOn[r * cols + c]) maskCtx.fillRect(c * MASK_CELL, r * MASK_CELL, MASK_CELL, MASK_CELL);
      }
    }
    const dataUrl = maskCanvas.toDataURL("image/png");
    setPreviewMaskUrl(dataUrl);
    setInpaintMask(dataUrl.split(",")[1] ?? null);
  }, [setInpaintMask]);

  const getPoint = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const updateCursor = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const stageRect = stageRef.current?.getBoundingClientRect() ?? rect;
      const displayScale = rect.width / Math.max(1, canvas.width);
      setCursor({
        x: event.clientX - stageRect.left,
        y: event.clientY - stageRect.top,
        size: Math.max(8, brushSize * displayScale),
        visible: true,
      });
    },
    [brushSize],
  );

  const drawAt = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const canvas = canvasRef.current;
      const point = getPoint(event);
      if (!canvas || !point) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const last = lastPointRef.current ?? point;
      setShowExportPreview(false);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = brushMode === "paint" ? "white" : "black";
      ctx.fillStyle = brushMode === "paint" ? "white" : "black";
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
      lastPointRef.current = point;
    },
    [brushMode, brushSize, getPoint],
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
    setHistoryCount(historyRef.current.length);
    setShowExportPreview(false);
    exportMask();
  }, [exportMask]);

  const redoNextStroke = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const next = redoRef.current.pop();
    if (!canvas || !ctx || !next) return;
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    setHistoryCount(historyRef.current.length);
    ctx.putImageData(next, 0, 0);
    setRedoCount(redoRef.current.length);
    setShowExportPreview(false);
    exportMask();
  }, [exportMask]);

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
            <span>松开以加载图片</span>
          </div>
        )}
        <div className="inpaint-empty">在左侧点击“加载图片”后，即可在这里绘制局部重绘蒙版。</div>
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
          <span>松开以加载图片</span>
        </div>
      )}
      <div className="inpaint-mask-toolbar">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={historyCount === 0}
          onClick={undoLastStroke}
          title="撤回上一步"
        >
          <span className="inpaint-tool-arrow">↶</span> 撤回
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={redoCount === 0}
          onClick={redoNextStroke}
          title="返回下一步"
        >
          <span className="inpaint-tool-arrow">↷</span> 重做
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!previewMaskUrl}
          onClick={() => setShowExportPreview((value) => !value)}
          title="预览实际发送给 NovelAI 的二值遮罩"
        >
          {showExportPreview ? "返回涂抹视图" : "预览发送遮罩"}
        </button>
        {canCompare ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setCompareEnabled((value) => !value)}
            title="拖动中线查看处理前后差异"
          >
            {compareEnabled ? "关闭对比" : "前后对比"}
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
          title="复位缩放"
        >
          复位缩放
        </button>
      </div>
      <div className="inpaint-stage" ref={stageRef} onWheel={handleStageWheel}>
        <img
          className="inpaint-base-img"
          src={workbenchImage.fileUrl}
          alt="局部重绘原图"
          draggable={false}
          style={{ ...imageZoomStyle, opacity: compareEnabled && canCompare ? 0 : 1 }}
        />
        {compareEnabled && canCompare ? (
          <>
            <img
              className="inpaint-compare-img inpaint-compare-before"
              src={comparisonBeforeImage!.fileUrl}
              alt="重绘前图片"
              draggable={false}
              style={imageZoomStyle}
            />
            <div className="inpaint-compare-after-clip" style={{ clipPath: compareClip }}>
              <img
                className="inpaint-compare-img"
                src={workbenchImage.fileUrl}
                alt="重绘后图片"
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
              aria-label="拖动查看重绘前后差异"
              title="拖动查看重绘前后差异"
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
            ...canvasZoomStyle,
          }}
          onMouseDown={(event) => {
            updateCursor(event);
            pushHistory();
            drawingRef.current = true;
            lastPointRef.current = getPoint(event);
            drawAt(event);
          }}
          onMouseMove={(event) => {
            updateCursor(event);
            drawAt(event);
          }}
          onMouseEnter={(event) => updateCursor(event)}
          onMouseUp={() => {
            drawingRef.current = false;
            lastPointRef.current = null;
            exportMask();
          }}
          onMouseLeave={() => {
            if (drawingRef.current) exportMask();
            drawingRef.current = false;
            lastPointRef.current = null;
            setCursor((current) => ({ ...current, visible: false }));
          }}
        />
        {showExportPreview && previewMaskUrl ? (
          <img className="inpaint-export-preview" src={previewMaskUrl} alt="发送给 NovelAI 的二值遮罩预览" draggable={false} style={canvasZoomStyle} />
        ) : null}
        <div
          className="inpaint-cursor"
          style={{
            left: cursor.x,
            top: cursor.y,
            width: cursor.size,
            height: cursor.size,
            opacity: cursor.visible && !showExportPreview ? 1 : 0,
          }}
        />
      </div>
    </main>
  );
}
