import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "../ui/Button";

const PHASES = [
  { label: "Breathe in", seconds: 4, scale: 1 },
  { label: "Hold", seconds: 4, scale: 1 },
  { label: "Breathe out", seconds: 4, scale: 0.55 },
  { label: "Hold", seconds: 4, scale: 0.55 },
];

/** Box-breathing warm-up (4-4-4-4) for candidates who feel nervous before starting. */
export function Breathing({ onDone, cycles = 3 }: { onDone: () => void; cycles?: number }) {
  const reduce = useReducedMotion();
  const [st, setSt] = useState({ step: 0, left: PHASES[0].seconds });
  const total = cycles * PHASES.length;
  const { step, left } = st;
  const phase = PHASES[step % PHASES.length];

  useEffect(() => {
    if (step >= total) {
      onDone();
      return;
    }
    const t = setTimeout(() => {
      setSt((s) => (s.left <= 1 ? { step: s.step + 1, left: PHASES[(s.step + 1) % PHASES.length].seconds } : { ...s, left: s.left - 1 }));
    }, 1000);
    return () => clearTimeout(t);
  }, [step, left, total, onDone]);

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <div className="relative flex size-52 items-center justify-center">
        <motion.div
          className="absolute size-52 rounded-full bg-primary/15"
          animate={reduce ? undefined : { scale: phase.scale }}
          transition={{ duration: phase.seconds, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute size-36 rounded-full bg-gradient-to-br from-secondary to-primary"
          animate={reduce ? undefined : { scale: phase.scale }}
          transition={{ duration: phase.seconds, ease: "easeInOut" }}
        />
        <div className="relative text-white">
          <p className="text-lg font-bold" aria-live="polite">
            {phase.label}
          </p>
          <p className="text-3xl font-extrabold tabular-nums">{left}</p>
        </div>
      </div>
      <p className="max-w-sm text-sm text-muted-fg">
        Cycle {Math.min(Math.floor(step / PHASES.length) + 1, cycles)} of {cycles}. Slow breathing calms your nervous system — interviewers expect you to be a little nervous, and that's okay.
      </p>
      <Button variant="ghost" onClick={onDone}>
        Skip warm-up
      </Button>
    </div>
  );
}
