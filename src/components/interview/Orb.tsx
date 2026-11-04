import { motion, useReducedMotion } from "motion/react";
import { clsx } from "clsx";

export type OrbState = "idle" | "speaking" | "listening" | "thinking";

/** The interviewer's presence. One of only two animated elements in the room (see interview-room.md). */
export function Orb({ state, size = 168 }: { state: OrbState; size?: number }) {
  const reduce = useReducedMotion();
  const animate = !reduce;
  const ring = state === "speaking" ? [1, 1.12, 1] : state === "thinking" ? [1, 1.04, 1] : [1, 1.02, 1];
  const duration = state === "speaking" ? 1.1 : state === "thinking" ? 1.8 : 3.2;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} aria-hidden="true">
      <motion.div
        className={clsx("absolute inset-0 rounded-full", state === "listening" ? "bg-accent/15" : "bg-primary/15")}
        animate={animate ? { scale: ring, opacity: state === "idle" ? 0.6 : 1 } : undefined}
        transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={clsx("absolute rounded-full", state === "listening" ? "bg-accent/25" : "bg-primary/25")}
        style={{ inset: size * 0.1 }}
        animate={animate ? { scale: state === "speaking" ? [1, 1.07, 0.98, 1] : 1 } : undefined}
        transition={{ duration: duration * 0.8, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className={clsx(
          "absolute rounded-full shadow-pop transition-colors duration-300",
          state === "listening" ? "bg-gradient-to-br from-accent to-emerald-700" : "bg-gradient-to-br from-secondary to-primary",
        )}
        style={{ inset: size * 0.2 }}
      >
        <div className="flex h-full items-center justify-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              className="block w-1.5 rounded-full bg-white/90"
              initial={{ height: 10 }}
              animate={animate && state === "speaking" ? { height: [10, 26 - i * 3, 12, 22, 10] } : { height: state === "thinking" ? 8 : 10 }}
              transition={{ duration: 0.9 + i * 0.12, repeat: Infinity, ease: "easeInOut", delay: i * 0.08 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
