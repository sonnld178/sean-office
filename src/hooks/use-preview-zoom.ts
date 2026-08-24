"use client";

import { useCallback, useEffect, useState } from "react";

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.1;

export function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function usePreviewZoom(containerRef?: React.RefObject<HTMLElement | null>) {
  const [zoom, setZoom] = useState(1);

  const zoomIn = useCallback(
    () => setZoom((z) => clampZoom(z + ZOOM_STEP)),
    []
  );
  const zoomOut = useCallback(
    () => setZoom((z) => clampZoom(z - ZOOM_STEP)),
    []
  );
  const resetZoom = useCallback(() => setZoom(1), []);

  useEffect(() => {
    const root = containerRef?.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const direction = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((z) => clampZoom(z + direction));
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [containerRef]);

  return { zoom, setZoom, zoomIn, zoomOut, resetZoom };
}
