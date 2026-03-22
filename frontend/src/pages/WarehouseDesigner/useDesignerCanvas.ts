import { useState } from "react";

export function useDesignerCanvas() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cursorCm, setCursorCm] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  return {
    zoom,
    setZoom,
    pan,
    setPan,
    cursorCm,
    setCursorCm,
    isPanning,
    setIsPanning,
  };
}
