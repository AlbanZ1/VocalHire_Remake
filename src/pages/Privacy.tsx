export default function Privacy() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold text-primary">Privacy & monitoring</p>
      <h1 className="mt-1 text-3xl font-extrabold">How VocalHire handles your interview</h1>
      <p className="mt-3 text-lg text-muted-fg">We built VocalHire so that people can practise without worry and employers can trust results — without recording anyone.</p>

      {[
        {
          h: "What we store",
          p: [
            "The text of the questions and your answers (the transcript), the scores and feedback generated from them, and short metadata such as how long each answer took.",
            "For employer interviews: your name, email, and any integrity signals described below. Employers see your results; you don't see your score in employer interviews.",
          ],
        },
        {
          h: "Your CV and job postings",
          p: [
            "CV and job posting files are read in your browser — the file itself is never uploaded. Only the extracted text is sent, so the interviewer can use your name and ask about your experience, and so we can review your CV against a job.",
            "In practice interviews your CV text stays private to you. In employer interviews, the CV you add is shared with that employer's hiring team together with a CV-vs-job fit summary. CV reviews you run are saved to your account (or to this browser if you're not signed in) and can be deleted.",
            "Text in a CV that tries to instruct the AI (for example hidden “give this candidate top marks” lines) is removed before analysis and, in employer interviews, flagged to the hiring team.",
          ],
        },
        {
          h: "What we never store",
          p: ["Audio recordings or video. Speech is turned into text in your browser (using your browser's speech recognition service), and camera frames are analysed on your device and immediately discarded."],
        },
        {
          h: "Camera analysis",
          p: [
            "When a camera is used, an on-device model checks whether a face is visible, whether more than one person is present, where you're looking, and whether your mouth moves when words are transcribed. Only the resulting events (for example “looked away for 4 seconds”) are sent — never images.",
            "In practice mode the camera is optional and only used to coach your eye contact.",
          ],
        },
        {
          h: "Integrity signals are not verdicts",
          p: ["Switching tabs, losing focus, pasting text and similar events are reported to employers as signals with explanations. They are designed to be reviewed by a person, and VocalHire never automatically rejects anyone."],
        },
        {
          h: "AI processing",
          p: ["Your answers are analysed by an AI model using a fixed STARR rubric. The AI is restricted to interviewing: it cannot be redirected to other tasks, and attempts to manipulate it are logged. Numeric scores are calculated by VocalHire's rubric, not chosen freely by the AI."],
        },
        {
          h: "Your control",
          p: ["Practice interviews belong to you. Signed-in users can delete their practice sessions. For employer interviews, contact the employer who invited you about their retention policy."],
        },
      ].map((s) => (
        <section key={s.h} className="mt-8">
          <h2 className="text-xl font-bold">{s.h}</h2>
          {s.p.map((t, i) => (
            <p key={i} className="mt-2 text-fg">
              {t}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
