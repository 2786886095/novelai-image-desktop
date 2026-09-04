import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { FiHelpCircle } from "react-icons/fi";
import type { AppLanguage } from "../types";
import { buildWeightDistributionPreview, controlledWeightPdf, type WeightControlMode } from "../weight-distribution";

type DraftNumberProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number;
  onCommit: (value: number) => void;
};

function DraftNumber({ value, onCommit, min, max, ...props }: DraftNumberProps) {
  const [draft, setDraft] = useState(String(value));
  const cancelRef = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    let next = Number.isFinite(parsed) ? parsed : value;
    if (typeof min === "number") next = Math.max(min, next);
    if (typeof max === "number") next = Math.min(max, next);
    next = Math.round(next * 100) / 100;
    onCommit(next);
    setDraft(String(next));
  };
  return <input {...props} type="number" min={min} max={max} value={draft}
    onChange={(event) => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") {
        cancelRef.current = true;
        setDraft(String(value));
        event.currentTarget.blur();
      }
    }} />;
}

const COPY = {
  "zh-CN": {
    novice: "新手版", advanced: "进阶版", hint: "新手版沿用稳定默认分布；进阶版可精确控制权重峰值与两侧扩散。",
    mode: "众数", modeHelp: "权重最容易出现的位置，也是分布曲线的峰值。会自动限制在权重上下界内。",
    left: "左侧离散", leftHelp: "控制低于众数一侧的分散程度。0 更集中在众数附近，1 更均匀地铺开。",
    right: "右侧离散", rightHelp: "控制高于众数一侧的分散程度。0 更集中在众数附近，1 更均匀地铺开。",
    balance: "软平衡强度", balanceHelp: "对整条画师串做同向平移，使平均权重靠近众数。0 不修正，1 尽量对齐；画师之间的相对差距保持不变，触及上下界时除外。",
    preview: "权重概率预览", previewHelp: "按当前众数和左右离散度精确计算，不使用随机模拟。柱越高，附近权重越容易出现。",
    xAxis: "权重", yAxis: "相对概率密度", likely: "80% 高概率区间", peak: "峰值", balanceState: "整串平衡",
  },
  "zh-TW": {
    novice: "新手版", advanced: "進階版", hint: "新手版沿用穩定預設分布；進階版可精確控制權重峰值與兩側擴散。",
    mode: "眾數", modeHelp: "權重最容易出現的位置，也是分布曲線峰值，會限制在上下界內。",
    left: "左側離散", leftHelp: "控制低於眾數一側的分散程度。0 更集中，1 更均勻。",
    right: "右側離散", rightHelp: "控制高於眾數一側的分散程度。0 更集中，1 更均勻。",
    balance: "軟平衡強度", balanceHelp: "整串同向平移，使平均權重靠近眾數。0 不修正，1 儘量對齊；觸及上下界時除外。",
    preview: "權重機率預覽", previewHelp: "依目前參數精確計算，不使用隨機模擬。柱越高，附近權重越容易出現。",
    xAxis: "權重", yAxis: "相對機率密度", likely: "80% 高機率區間", peak: "峰值", balanceState: "整串平衡",
  },
  "en-US": {
    novice: "Novice", advanced: "Advanced", hint: "Novice keeps the established distribution. Advanced controls the peak and each side independently.",
    mode: "Mode", modeHelp: "The most likely weight and the peak of the distribution. It is clamped to the selected bounds.",
    left: "Left dispersion", leftHelp: "Spread below the mode. 0 stays near the mode; 1 spreads more evenly.",
    right: "Right dispersion", rightHelp: "Spread above the mode. 0 stays near the mode; 1 spreads more evenly.",
    balance: "Soft balance", balanceHelp: "Shifts the complete artist string so its mean approaches the mode. 0 disables correction; 1 fully applies it unless bounds clip a value.",
    preview: "Probability preview", previewHelp: "Calculated exactly from the current split distribution without random simulation. Taller bars are more likely.",
    xAxis: "Weight", yAxis: "Relative probability", likely: "80% likely range", peak: "Peak", balanceState: "String balance",
  },
  "ja-JP": {
    novice: "初心者", advanced: "詳細", hint: "初心者は既定分布を使用し、詳細ではピークと左右の広がりを個別に調整します。",
    mode: "最頻値", modeHelp: "最も出やすいウェイトです。上下限の範囲内に自動調整されます。",
    left: "左側分散", leftHelp: "最頻値より低い側の広がり。0 は集中、1 は均等に近づきます。",
    right: "右側分散", rightHelp: "最頻値より高い側の広がり。0 は集中、1 は均等に近づきます。",
    balance: "ソフト均衡", balanceHelp: "文字列全体を同じ量だけ移動し、平均を最頻値へ近づけます。0 は無効、1 は最大です。",
    preview: "確率プレビュー", previewHelp: "乱数シミュレーションを使わず、現在の分布から正確に計算します。",
    xAxis: "ウェイト", yAxis: "相対確率", likely: "80% 高確率範囲", peak: "ピーク", balanceState: "文字列均衡",
  },
  "ko-KR": {
    novice: "초보", advanced: "고급", hint: "초보는 기존 분포를 사용하고, 고급은 최빈값과 좌우 분산을 따로 조절합니다.",
    mode: "최빈값", modeHelp: "가장 자주 나오는 가중치이며 선택한 범위 안으로 자동 제한됩니다.",
    left: "왼쪽 분산", leftHelp: "최빈값보다 낮은 쪽의 분산입니다. 0은 집중, 1은 균등에 가깝습니다.",
    right: "오른쪽 분산", rightHelp: "최빈값보다 높은 쪽의 분산입니다. 0은 집중, 1은 균등에 가깝습니다.",
    balance: "소프트 균형", balanceHelp: "전체 문자열을 같은 양만큼 이동해 평균을 최빈값에 가깝게 합니다. 0은 끔, 1은 최대입니다.",
    preview: "확률 미리보기", previewHelp: "무작위 시뮬레이션 없이 현재 분포에서 정확히 계산합니다.",
    xAxis: "가중치", yAxis: "상대 확률", likely: "80% 확률 구간", peak: "최빈값", balanceState: "문자열 균형",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

function FieldTitle({ label, help }: { label: string; help: string }) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, placement: "bottom" as "top" | "bottom" });
  const placeTooltip = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;
    const anchor = trigger.getBoundingClientRect();
    const bounds = tooltip.getBoundingClientRect();
    const gutter = 10;
    const left = Math.max(12, Math.min(window.innerWidth - bounds.width - 12, anchor.left + anchor.width / 2 - bounds.width / 2));
    const fitsAbove = anchor.top - gutter - bounds.height >= 12;
    const fitsBelow = anchor.bottom + gutter + bounds.height <= window.innerHeight - 12;
    // The controls and sliders sit directly below the label row. Prefer the
    // empty space above so help never masks the value being adjusted.
    const placement = fitsAbove || !fitsBelow ? "top" : "bottom";
    setPosition({
      left,
      top: placement === "top" ? Math.max(12, anchor.top - bounds.height - gutter) : anchor.bottom + gutter,
      placement,
    });
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(placeTooltip);
    window.addEventListener("resize", placeTooltip);
    window.addEventListener("scroll", placeTooltip, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", placeTooltip);
      window.removeEventListener("scroll", placeTooltip, true);
    };
  }, [open, placeTooltip]);
  return <span className="weight-control-label">{label}<button
    ref={triggerRef}
    type="button"
    className="weight-help"
    aria-label={`${label}: ${help}`}
    aria-describedby={open ? tooltipId : undefined}
    aria-expanded={open}
    onPointerEnter={() => setOpen(true)}
    onPointerLeave={() => setOpen(false)}
    onFocus={() => setOpen(true)}
    onBlur={() => setOpen(false)}
    onClick={() => setOpen((current) => !current)}
    onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
  ><FiHelpCircle aria-hidden="true" /></button>{open && createPortal(<div
    ref={tooltipRef}
    id={tooltipId}
    role="tooltip"
    className={`weight-help-popover ${position.placement}`}
    style={{ left: position.left, top: position.top }}
  >{help}</div>, document.body)}</span>;
}

function smoothCurvePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const middleX = (previous.x + current.x) / 2;
    path += ` C ${middleX} ${previous.y}, ${middleX} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

function WeightDistributionPreview({
  label, help, xAxis, yAxis, likely, peak, balanceState, min, max, mode, leftDispersion, rightDispersion, softBalance,
}: {
  label: string; help: string; xAxis: string; yAxis: string; likely: string; peak: string; balanceState: string; min: number; max: number; mode: number;
  leftDispersion: number; rightDispersion: number; softBalance: number;
}) {
  const bins = useMemo(() => buildWeightDistributionPreview({
    min, max, mode, leftDispersion, rightDispersion, softBalance,
  }, 32), [min, max, mode, leftDispersion, rightDispersion, softBalance]);
  const config = useMemo(() => ({ min, max, mode, leftDispersion, rightDispersion, softBalance }), [min, max, mode, leftDispersion, rightDispersion, softBalance]);
  const cumulativeRange = useMemo(() => {
    let cumulative = 0;
    let low = min;
    let high = max;
    for (const bin of bins) {
      const next = cumulative + bin.probability;
      if (cumulative < 0.1 && next >= 0.1) low = bin.center;
      if (cumulative < 0.9 && next >= 0.9) { high = bin.center; break; }
      cumulative = next;
    }
    return [low, high] as const;
  }, [bins, min, max]);
  const width = 840;
  const height = 188;
  const chartLeft = 68;
  const chartRight = 822;
  const chartTop = 16;
  const chartBottom = 132;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const barWidth = chartWidth / bins.length;
  const modeX = max === min ? chartLeft + chartWidth / 2 : chartLeft + (Math.max(min, Math.min(max, mode)) - min) / (max - min) * chartWidth;
  const curveSamples = Array.from({ length: 161 }, (_, index) => min + (max - min) * index / 160);
  const peakDensity = Math.max(
    controlledWeightPdf(config, mode, "left"),
    controlledWeightPdf(config, mode, "right"),
    ...curveSamples.map((value) => controlledWeightPdf(config, value)),
    Number.EPSILON,
  );
  const toPoint = (value: number, density: number) => ({
    x: chartLeft + (value - min) / Math.max(Number.EPSILON, max - min) * chartWidth,
    y: chartBottom - density / peakDensity * chartHeight,
  });
  const leftCurve = curveSamples.filter((value) => value <= mode).map((value) => toPoint(value, controlledWeightPdf(config, value, "left")));
  const rightCurve = curveSamples.filter((value) => value >= mode).map((value) => toPoint(value, controlledWeightPdf(config, value, "right")));
  const highestBin = Math.max(...bins.map((bin) => bin.probability), Number.EPSILON);
  const xTicks = Array.from(new Set([min, min + (max - min) * 0.25, mode, min + (max - min) * 0.75, max].map((value) => Number(value.toFixed(2))))).sort((a, b) => a - b);
  const likelyLeftX = chartLeft + (cumulativeRange[0] - min) / Math.max(Number.EPSILON, max - min) * chartWidth;
  const likelyRightX = chartLeft + (cumulativeRange[1] - min) / Math.max(Number.EPSILON, max - min) * chartWidth;
  return <figure className="weight-distribution-preview">
    <figcaption><FieldTitle label={label} help={help} /><div className="weight-preview-summary"><span><b>{peak}</b> {mode.toFixed(1)}</span><span><b>{likely}</b> {cumulativeRange[0].toFixed(1)}–{cumulativeRange[1].toFixed(1)}</span><span><b>{balanceState}</b> {Math.round(softBalance * 100)}%</span></div></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${min} - ${mode} - ${max}`} preserveAspectRatio="xMidYMid meet">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = chartBottom - ratio * chartHeight;
        return <g key={ratio}>
          <line className="weight-preview-grid" x1={chartLeft} y1={y} x2={chartRight} y2={y} />
          <text className="weight-preview-y-label" x={chartLeft - 8} y={y + 3} textAnchor="end">{ratio.toFixed(2)}</text>
        </g>;
      })}
      <line className="weight-preview-axis weight-preview-y-axis" x1={chartLeft} y1={chartTop} x2={chartLeft} y2={chartBottom} />
      <line className="weight-preview-axis" x1={chartLeft} y1={chartBottom} x2={chartRight} y2={chartBottom} />
      <rect className="weight-preview-likely-band" x={likelyLeftX} y={chartTop} width={Math.max(0, likelyRightX - likelyLeftX)} height={chartHeight} rx="4" />
      {bins.map((bin, index) => {
        const barHeight = Math.max(1, bin.probability / highestBin * chartHeight);
        return <rect key={index} className="weight-preview-bar" x={chartLeft + index * barWidth + 1} y={chartBottom - barHeight} width={Math.max(1, barWidth - 2)} height={barHeight} rx="2" />;
      })}
      <path className="weight-preview-curve" d={smoothCurvePath(leftCurve)} />
      <path className="weight-preview-curve" d={smoothCurvePath(rightCurve)} />
      <line className="weight-preview-mode" x1={modeX} y1="7" x2={modeX} y2={chartBottom + 4} />
      {xTicks.map((value) => {
        const x = chartLeft + (value - min) / Math.max(Number.EPSILON, max - min) * chartWidth;
        return <g key={value}><line className="weight-preview-tick" x1={x} y1={chartBottom} x2={x} y2={chartBottom + 5} /><text className={Math.abs(value - mode) < 0.001 ? "weight-preview-mode-label" : ""} x={x} y="151" textAnchor="middle">{value.toFixed(1)}</text></g>;
      })}
      <text className="weight-preview-axis-title" x={(chartLeft + chartRight) / 2} y="178" textAnchor="middle">{xAxis}</text>
      <text className="weight-preview-axis-title" x="16" y={(chartTop + chartBottom) / 2} textAnchor="middle" transform={`rotate(-90 16 ${(chartTop + chartBottom) / 2})`}>{yAxis}</text>
    </svg>
  </figure>;
}

export function WeightDistributionControls({
  language,
  controlMode,
  min,
  max,
  mode,
  leftDispersion,
  rightDispersion,
  softBalance,
  onModeChange,
  onChange,
}: {
  language: AppLanguage;
  controlMode: WeightControlMode;
  min: number;
  max: number;
  mode: number;
  leftDispersion: number;
  rightDispersion: number;
  softBalance: number;
  onModeChange: (value: WeightControlMode) => void;
  onChange: (value: Partial<{ mode: number; leftDispersion: number; rightDispersion: number; softBalance: number }>) => void;
}) {
  const text = COPY[language];
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  return <section className="weight-distribution-controls">
    <div className="weight-mode-switch" role="group" aria-label={text.hint}>
      <button type="button" className={controlMode === "novice" ? "active" : ""} onClick={() => onModeChange("novice")}>{text.novice}</button>
      <button type="button" className={controlMode === "advanced" ? "active" : ""} onClick={() => onModeChange("advanced")}>{text.advanced}</button>
      <small>{text.hint}</small>
    </div>
    {controlMode === "advanced" && <div className="weight-advanced-grid">
      <label><FieldTitle label={text.mode} help={text.modeHelp} /><DraftNumber min={safeMin} max={safeMax} step={0.1} value={Math.max(safeMin, Math.min(safeMax, mode))} onCommit={(value) => onChange({ mode: value })} /><input aria-label={`${text.mode} slider`} type="range" min={safeMin} max={safeMax} step={0.1} value={Math.max(safeMin, Math.min(safeMax, mode))} onChange={(event) => onChange({ mode: Number(event.target.value) })} /></label>
      <label><FieldTitle label={text.left} help={text.leftHelp} /><DraftNumber min={0} max={1} step={0.1} value={leftDispersion} onCommit={(value) => onChange({ leftDispersion: value })} /><input aria-label={`${text.left} slider`} type="range" min={0} max={1} step={0.1} value={leftDispersion} onChange={(event) => onChange({ leftDispersion: Number(event.target.value) })} /></label>
      <label><FieldTitle label={text.right} help={text.rightHelp} /><DraftNumber min={0} max={1} step={0.1} value={rightDispersion} onCommit={(value) => onChange({ rightDispersion: value })} /><input aria-label={`${text.right} slider`} type="range" min={0} max={1} step={0.1} value={rightDispersion} onChange={(event) => onChange({ rightDispersion: Number(event.target.value) })} /></label>
      <label><FieldTitle label={text.balance} help={text.balanceHelp} /><DraftNumber min={0} max={1} step={0.1} value={softBalance} onCommit={(value) => onChange({ softBalance: value })} /><input aria-label={`${text.balance} slider`} type="range" min={0} max={1} step={0.1} value={softBalance} onChange={(event) => onChange({ softBalance: Number(event.target.value) })} /></label>
      <WeightDistributionPreview label={text.preview} help={text.previewHelp} xAxis={text.xAxis} yAxis={text.yAxis} likely={text.likely} peak={text.peak} balanceState={text.balanceState} min={safeMin} max={safeMax} mode={Math.max(safeMin, Math.min(safeMax, mode))} leftDispersion={leftDispersion} rightDispersion={rightDispersion} softBalance={softBalance} />
    </div>}
  </section>;
}
