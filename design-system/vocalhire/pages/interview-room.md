# Interview Room Page Overrides

> **PROJECT:** VocalHire
> **Page Type:** Focused task screen (live voice interview)
>
> Rules here **override** `design-system/vocalhire/MASTER.md`. Only deviations are listed.
>
> Note: the generator's raw output for this page ("grain texture, sharp transitions, no fade") was
> rejected after verification — it does not fit an audience that is anxious about interviews.
> The rules below come from verified `--domain ux` searches (Reduced Motion, Excessive Motion,
> Loading Indicators, Progress Indicators, Contextual Live Updates) and the Master palette.

---

## Intent

Calm, distraction-free, single-task. The candidate should always know: who is speaking, what the
question is, how far along they are, and what will happen next.

## Layout Overrides

- **Max width:** 960px, single column on mobile; two columns (interviewer + you) from `lg`.
- Header reduced to: brand mark, progress ("Question 3 of ~6"), elapsed time, End button.
- No site navigation inside the room (prevents accidental exits).

## Color Overrides

- Surface uses Master `--color-background` with white cards; the interviewer "presence orb"
  uses `--color-primary` → `--color-secondary`.
- Recording state uses `--color-accent` (green = "you're on, it's going well"), **not** red.
  Red (`--color-destructive`) is reserved for errors and the End button only.

## Motion

- Animate at most two elements: the interviewer orb (while speaking) and the mic level meter.
- All motion is disabled under `prefers-reduced-motion: reduce`; state is still shown with text.
- Transitions 200–300ms ease-out for state changes (speaking → listening → thinking).

## Feedback & Accessibility

- A single `role="status"` region announces state changes ("Interviewer is speaking",
  "Listening — answer when ready", "Analysing your answer").
- Captions of every interviewer question are always visible (never voice-only).
- "Thinking" state uses a stable skeleton/pulse with `aria-busy`, never a flashing spinner.
- Step indicator for progress; never a hard countdown during an answer in practice mode.

## Page-Specific Components

- **Presence orb** (interviewer), **Mic level meter**, **Live transcript card**,
  **Integrity status chip** (business mode), **Breathing warm-up** (practice mode, optional).
