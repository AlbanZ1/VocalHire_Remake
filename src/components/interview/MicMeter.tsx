import { useEffect, useRef } from "react";
import { createLevelMeter } from "@/lib/speech/media";

/** Live microphone level bars, drawn on a canvas (no React re-render per frame). */
export function MicMeter({ stream, active, label = "Microphone level" }: { stream: MediaStream | null; active: boolean; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!stream || !canvas.current || stream.getAudioTracks().length === 0) return;
    const meter = createLevelMeter(stream);
    const c = canvas.current;
    const ctx = c.getContext("2d")!;
    const bars = 24;
    const history: number[] = Array(bars).fill(0);
    let raf = 0;
    const color = () => getComputedStyle(document.documentElement).getPropertyValue(active ? "--vh-accent" : "--vh-muted-fg").trim() || "#16a34a";
    let fill = color();
    let frame = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (++frame % 2) return;
      if (frame % 60 === 0) fill = color();
      history.shift();
      history.push(meter.read());
      const w = c.width;
      const h = c.height;
      ctx.clearRect(0, 0, w, h);
      const bw = w / bars;
      ctx.fillStyle = fill;
      history.forEach((v, i) => {
        const bh = Math.max(3, v * h);
        ctx.globalAlpha = 0.35 + 0.65 * (i / bars);
        ctx.beginPath();
        ctx.roundRect(i * bw + 1.5, (h - bh) / 2, bw - 3, bh, 2);
        ctx.fill();
      });
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      meter.close();
    };
  }, [stream, active]);
  return <canvas ref={canvas} width={240} height={40} className="h-10 w-full max-w-60" role="img" aria-label={label} />;
}
