"use client";

import { useCallback, useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Spark = {
  x: number;
  y: number;
  angle: number;
  startTime: number;
};

interface ClickSparkProps {
  children: ReactNode;
  className?: string;
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  extraScale?: number;
}

export default function ClickSpark({
  children,
  className,
  sparkColor = "#3b82f6",
  sparkSize = 8,
  sparkRadius = 18,
  sparkCount = 9,
  duration = 420,
  extraScale = 1,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<Spark[]>([]);
  const frameRef = useRef<number>(0);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const { width, height } = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  useEffect(() => {
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;
    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  useEffect(() => {
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const now = performance.now();
    sparksRef.current.push(
      ...Array.from({ length: sparkCount }, (_, i) => ({
        x,
        y,
        angle: (2 * Math.PI * i) / sparkCount + Math.random() * 0.2,
        startTime: now,
      }))
    );

    const easeOut = (t: number) => t * (2 - t);
    const draw = (timestamp: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= duration) return false;
        const eased = easeOut(elapsed / duration);
        const distance = eased * sparkRadius * extraScale;
        const lineLength = sparkSize * (1 - eased);
        const x1 = spark.x + distance * Math.cos(spark.angle);
        const y1 = spark.y + distance * Math.sin(spark.angle);
        const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
        const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);
        ctx.strokeStyle = sparkColor;
        ctx.globalAlpha = 1 - eased;
        ctx.lineWidth = 1.75;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return true;
      });
      if (sparksRef.current.length) {
        frameRef.current = requestAnimationFrame(draw);
      } else {
        frameRef.current = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(draw);
    }
  };

  return (
    <div className={cn("relative", className)} onClick={handleClick}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-20"
        aria-hidden
      />
      {children}
    </div>
  );
}
