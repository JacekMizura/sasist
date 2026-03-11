/**
 * Preview card using the shared layout engine. Same layout as designer and PDF.
 * Card maintains label aspect ratio; scale = cardWidthPx / labelWidthMm.
 */
import { useRef, useEffect, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import {
  computeLayoutFromTemplate,
  scaleToPx,
  type LayoutItem,
} from "../../utils/labelLayoutEngine";
import type { LabelTemplate, LabelRecord } from "../../types/labelSystem";
import type { StatusIconType } from "../../types/labelSystem";

const PREVIEW_CARD_WIDTH_PX = 120;

function renderLayoutItem(
  item: LayoutItem,
  scalePxPerMm: number,
  StatusIcon: React.FC<{ icon: StatusIconType; size: number; color?: string }>
): React.ReactNode {
  const px = scaleToPx(item, scalePxPerMm);
  const bg = item.backgroundColor ?? "transparent";
  const fg = item.textColor ?? "#000000";
  const border = item.borderColor ?? fg;

  if (item.type === "text") {
    const fontSizePx = (item.fontSize ?? 10) * scalePxPerMm * 0.35;
    const justifyContent =
      item.horizontalAlign === "center" ? "center" : item.horizontalAlign === "right" ? "flex-end" : "flex-start";
    const alignItems =
      item.verticalAlign === "top" ? "flex-start" : item.verticalAlign === "bottom" ? "flex-end" : "center";
    return (
      <div
        key={item.id}
        style={{
          position: "absolute",
          left: px.left,
          top: px.top,
          width: px.width,
          height: px.height,
          display: "flex",
          alignItems,
          justifyContent,
          overflow: "hidden",
          fontSize: fontSizePx,
          fontFamily: item.fontFamily ?? "sans-serif",
          fontWeight: item.bold ? "bold" : "normal",
          textAlign: item.horizontalAlign ?? "left",
          color: fg,
          backgroundColor: bg,
        }}
      >
        {item.verticalText && item.text
          ? item.text.split("").map((c, i) => <span key={i}>{c}</span>)
          : (item.text ?? "")}
      </div>
    );
  }

  if (item.type === "barcode") {
    return (
      <div
        key={item.id}
        style={{
          position: "absolute",
          left: px.left,
          top: px.top,
          width: px.width,
          height: px.height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <BarcodeBlock
          value={item.barcodeValue ?? "SAMPLE"}
          format={item.barcodeFormat ?? "Code128"}
          widthPx={px.width}
          heightPx={px.height}
          textColor={fg}
        />
      </div>
    );
  }

  if (item.type === "line") {
    const sw = (item.strokeWidth ?? 0.5) * scalePxPerMm;
    return (
      <svg
        key={item.id}
        width={px.width}
        height={px.height}
        style={{ position: "absolute", left: px.left, top: px.top }}
      >
        <line x1={0} y1={px.height / 2} x2={px.width} y2={px.height / 2} stroke={fg} strokeWidth={sw} />
      </svg>
    );
  }

  if (item.type === "rect") {
    const sw = (item.strokeWidth ?? 0.5) * scalePxPerMm;
    const fill = item.fill ?? item.backgroundColor ?? "none";
    return (
      <svg
        key={item.id}
        width={px.width}
        height={px.height}
        style={{ position: "absolute", left: px.left, top: px.top }}
      >
        <rect x={0} y={0} width={px.width} height={px.height} fill={fill} stroke={border} strokeWidth={sw} />
      </svg>
    );
  }

  if (item.type === "section") {
    const sw = (item.borderWidth ?? 0.5) * scalePxPerMm;
    return (
      <svg
        key={item.id}
        width={px.width}
        height={px.height}
        style={{ position: "absolute", left: px.left, top: px.top }}
      >
        <rect x={0} y={0} width={px.width} height={px.height} fill={bg} stroke={border} strokeWidth={sw} />
      </svg>
    );
  }

  if (item.type === "icon") {
    return (
      <div
        key={item.id}
        style={{
          position: "absolute",
          left: px.left,
          top: px.top,
          width: px.width,
          height: px.height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: fg,
        }}
      >
        <StatusIcon icon={(item.icon as StatusIconType) ?? "none"} size={Math.min(px.width, px.height)} color={fg} />
      </div>
    );
  }

  if (item.type === "image" && item.src) {
    return (
      <div key={item.id} style={{ position: "absolute", left: px.left, top: px.top, width: px.width, height: px.height }}>
        <img src={item.src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    );
  }

  if (item.type === "arrow") {
    const dir = (item.direction ?? "right").toLowerCase();
    const w = px.width;
    const h = px.height;
    const cx = w / 2;
    const cy = h / 2;
    const head = Math.min(w, h) * 0.4;
    const sw = Math.max(0.5, (item.strokeWidth ?? 1) * scalePxPerMm);
    const fill = item.backgroundColor ?? fg;
    const line = (x1: number, y1: number, x2: number, y2: number) => (
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={border} strokeWidth={sw} />
    );
    const triangle = (pts: string) => <polygon points={pts} fill={fill} stroke={border} strokeWidth={sw} />;
    let content: React.ReactNode;
    if (dir === "right") {
      content = (
        <>
          {line(0, cy, w - head, cy)}
          {triangle(`${w},${cy} ${w - head},${cy - head * 0.7} ${w - head},${cy + head * 0.7}`)}
        </>
      );
    } else if (dir === "left") {
      content = (
        <>
          {line(head, cy, w, cy)}
          {triangle(`0,${cy} ${head},${cy - head * 0.7} ${head},${cy + head * 0.7}`)}
        </>
      );
    } else if (dir === "up") {
      content = (
        <>
          {line(cx, head, cx, h - head)}
          {triangle(`${cx},${h} ${cx - head * 0.7},${h - head} ${cx + head * 0.7},${h - head}`)}
        </>
      );
    } else {
      content = (
        <>
          {line(cx, h - head, cx, head)}
          {triangle(`${cx},0 ${cx - head * 0.7},${head} ${cx + head * 0.7},${head}`)}
        </>
      );
    }
    return (
      <svg key={item.id} width={w} height={h} style={{ position: "absolute", left: px.left, top: px.top }}>
        {content}
      </svg>
    );
  }

  return (
    <div
      key={item.id}
      style={{
        position: "absolute",
        left: px.left,
        top: px.top,
        width: px.width,
        height: px.height,
        backgroundColor: bg,
        border: `1px solid ${border}`,
      }}
    />
  );
}

function QRBlock({ value, widthPx, heightPx }: { value: string; widthPx: number; heightPx: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value || "SAMPLE", { width: Math.min(widthPx, heightPx), margin: 0 })
      .then(setUrl)
      .catch(() => setUrl(""));
  }, [value, widthPx, heightPx]);
  return (
    <div
      style={{
        width: widthPx,
        height: heightPx,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff",
      }}
    >
      {url ? (
        <img src={url} alt="" width={Math.min(widthPx, heightPx)} height={Math.min(widthPx, heightPx)} />
      ) : (
        <span style={{ fontSize: 8 }}>QR</span>
      )}
    </div>
  );
}

function BarcodeBlock({
  value,
  format,
  widthPx,
  heightPx,
  textColor: _textColor,
}: {
  value: string;
  format: string;
  widthPx: number;
  heightPx: number;
  textColor?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [scaleX, setScaleX] = useState(1);

  useEffect(() => {
    if (format !== "Code128" || !svgRef.current) return;
    try {
      JsBarcode(svgRef.current, value || "SAMPLE", {
        format: "CODE128",
        width: 1,
        height: heightPx,
        margin: 0,
        displayValue: false,
      });
      const el = svgRef.current as SVGElement & { getBBox?: () => DOMRect };
      const w = el.getBBox?.()?.width ?? widthPx;
      setScaleX(w > 0 ? widthPx / w : 1);
    } catch {
      setScaleX(1);
    }
  }, [format, value, heightPx, widthPx]);

  if (format === "QR" || format === "DataMatrix") {
    return (
      <QRBlock value={value} widthPx={widthPx} heightPx={heightPx} />
    );
  }

  return (
    <div
      style={{
        width: widthPx,
        height: heightPx,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        ref={svgRef}
        style={{
          height: heightPx,
          transform: `scaleX(${scaleX})`,
          transformOrigin: "center center",
        }}
      />
    </div>
  );
}

function StatusIconPreview({ icon, size, color }: { icon: StatusIconType; size: number; color?: string }) {
  const c = color ?? "#000";
  if (icon === "none") return null;
  const s = Math.max(8, size);
  const arrow = (deg: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="2"
      style={{ transform: `rotate(${deg}deg)` }}
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
  if (icon === "arrow_up") return arrow(0);
  if (icon === "arrow_down") return arrow(180);
  if (icon === "arrow_left") return arrow(-90);
  if (icon === "arrow_right") return arrow(90);
  if (icon === "lock")
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    );
  if (icon === "heavy_load")
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
        <path d="M12 3v18M9 6l3-3 3 3M9 12l3 3 3-3M5 9l2 6h10l2-6" />
      </svg>
    );
  if (icon === "hazard")
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
        <path d="M12 2L2 22h20L12 2z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    );
  return null;
}

export type LabelPreviewCardTemplate = Pick<LabelTemplate, "widthMm" | "heightMm" | "elements"> & {
  id?: string;
  name?: string;
  dpi?: number;
  template_type?: LabelTemplate["template_type"];
};

type Props = {
  template: LabelPreviewCardTemplate;
  record: LabelRecord | Record<string, unknown>;
  cardWidthPx?: number;
};

/**
 * Renders one label preview card using the shared layout engine.
 * Card size preserves label aspect ratio: height = cardWidth * (heightMm/widthMm).
 */
export function LabelPreviewCard({ template, record, cardWidthPx = PREVIEW_CARD_WIDTH_PX }: Props) {
  const labelW = template.widthMm;
  const labelH = template.heightMm;
  const scalePxPerMm = cardWidthPx / labelW;
  const cardHeightPx = cardWidthPx * (labelH / labelW);

  const layoutItems = computeLayoutFromTemplate(
    { ...template, id: template.id ?? "", name: template.name ?? "", dpi: template.dpi ?? 96, elements: template.elements },
    record as Record<string, unknown>
  );

  return (
    <div
      style={{
        position: "relative",
        width: cardWidthPx,
        height: cardHeightPx,
        flexShrink: 0,
        overflow: "hidden",
        backgroundColor: "#fff",
        border: "1px solid #e2e8f0",
      }}
    >
      {layoutItems.map((item) =>
        renderLayoutItem(item, scalePxPerMm, StatusIconPreview)
      )}
    </div>
  );
}
