import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "./store";

export function InpaintCanvas() {
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const brushSize = useAppStore((state) => state.brushSize);
  const brushMode = useAppStore((state) => state.brushMode);
  const maskRevision = useAppStore((state) => state.maskRevision);
  const setInpaintMask = useAppStore((state) => state.setInpaintMask);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

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
    setInpaintMask(null);
  }, [workbenchImage, maskRevision, setInpaintMask]);

  const exportMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setInpaintMask(canvas.toDataURL("image/png").split(",")[1] ?? null);
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

  const drawAt = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const canvas = canvasRef.current;
      const point = getPoint(event);
      if (!canvas || !point) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const last = lastPointRef.current ?? point;
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

  if (!workbenchImage) {
    return (
      <main className="canvas-area">
        <div className="inpaint-empty">在左侧点击“加载图片”后，即可在这里绘制局部重绘蒙版。</div>
      </main>
    );
  }

  return (
    <main className="canvas-area">
      <div className="inpaint-stage">
        <img className="inpaint-base-img" src={workbenchImage.fileUrl} alt="局部重绘原图" draggable={false} />
        <canvas
          ref={canvasRef}
          className="inpaint-mask-canvas"
          onMouseDown={(event) => {
            drawingRef.current = true;
            lastPointRef.current = getPoint(event);
            drawAt(event);
          }}
          onMouseMove={drawAt}
          onMouseUp={() => {
            drawingRef.current = false;
            lastPointRef.current = null;
            exportMask();
          }}
          onMouseLeave={() => {
            if (drawingRef.current) exportMask();
            drawingRef.current = false;
            lastPointRef.current = null;
          }}
        />
      </div>
    </main>
  );
}
