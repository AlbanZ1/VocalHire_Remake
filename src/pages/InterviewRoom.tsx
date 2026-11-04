import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowClockwise,
  Camera,
  CameraSlash,
  ChatText,
  CheckCircle,
  CornersOut,
  Keyboard,
  Microphone,
  MicrophoneSlash,
  Pause,
  Play,
  ShieldCheck,
  SpeakerHigh,
  SpeakerSlash,
  Stop,
  Warning,
  Wind,
} from "@phosphor-icons/react";
import { clsx } from "clsx";
import { api, ApiError, type PublicSession, type QuestionView, type SubmitResult } from "@/lib/api";
import { sessionTokens } from "@/lib/sessionTokens";
import { createSpeaker, englishVoices, loadVoices, pickDefaultVoice, ttsSupported, type Speaker } from "@/lib/speech/tts";
import { SpeechRecognizer, sttSupported, type TranscriptState } from "@/lib/speech/stt";
import { requestMedia, stopStream } from "@/lib/speech/media";
import { FaceWatcher, type FaceStatus } from "@/lib/integrity/face";
import { IntegrityMonitor, type FlagNotice } from "@/lib/integrity/monitor";
import { clock } from "@/lib/format";
import { Brand } from "@/components/layout/Brand";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert, Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Select, Textarea } from "@/components/ui/Field";
import { PageLoader, Spinner } from "@/components/ui/Spinner";
import { Orb, type OrbState } from "@/components/interview/Orb";
import { MicMeter } from "@/components/interview/MicMeter";
import { StarrChecklist } from "@/components/interview/StarrChecklist";
import { Breathing } from "@/components/interview/Breathing";
import type { StarrKey } from "../../supabase/functions/_shared/types.ts";

type Phase = "loading" | "precheck" | "starting" | "asking" | "answering" | "thinking" | "closing" | "done" | "error";
type AnswerMode = "voice" | "text";

const PHASE_LABEL: Record<Phase, string> = {
  loading: "Loading",
  precheck: "Getting ready",
  starting: "Starting",
  asking: "Interviewer is speaking",
  answering: "Your turn — answer when you're ready",
  thinking: "Considering your answer",
  closing: "Wrapping up",
  done: "Interview complete",
  error: "Something went wrong",
};

export default function InterviewRoom() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const token = useMemo(() => sessionTokens.token(sessionId), [sessionId]);

  const [session, setSession] = useState<PublicSession | null>(null);
  const [question, setQuestion] = useState<QuestionView | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [spokenLine, setSpokenLine] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);

  // Devices
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [camWanted, setCamWanted] = useState(false);
  const [faceStatus, setFaceStatus] = useState<FaceStatus | null>(null);
  const [faceLoading, setFaceLoading] = useState(false);
  const [faceSeen, setFaceSeen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Voice
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string>("");
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(!ttsSupported());
  const [speaking, setSpeaking] = useState(false);
  const [answerMode, setAnswerMode] = useState<AnswerMode>(sttSupported() ? "voice" : "text");

  // Answer state
  const [transcript, setTranscript] = useState<TranscriptState>({ finalText: "", interim: "" });
  const [listening, setListening] = useState(false);
  const [paused, setPaused] = useState(false);
  const [typed, setTyped] = useState("");
  const [silenceHint, setSilenceHint] = useState(false);
  const [liveFeedback, setLiveFeedback] = useState<{ text: string | null; check: Record<StarrKey, boolean> | null } | null>(null);
  const [notice, setNotice] = useState<FlagNotice | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [breathing, setBreathing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [fsNeeded, setFsNeeded] = useState(false);

  const speakerRef = useRef<Speaker | null>(null);
  const recRef = useRef<SpeechRecognizer | null>(null);
  const monitorRef = useRef<IntegrityMonitor | null>(null);
  const faceRef = useRef<FaceWatcher | null>(null);
  const questionRef = useRef<QuestionView | null>(null);
  const listenStartRef = useRef<number>(0);
  const typedStartRef = useRef<number | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const rateRef = useRef(1);
  const mutedRef = useRef(muted);
  const startedAtRef = useRef<number | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Speech kept across a pause/resume, and the timing of the first segment.
  const carryRef = useRef("");
  const firstTimingRef = useRef<{ latencyMs: number | null; firstSpeechAt: number | null } | null>(null);
  const unmounted = useRef(false);

  questionRef.current = question;
  rateRef.current = rate;
  mutedRef.current = muted;
  voiceRef.current = voices.find((v) => v.name === voiceName) ?? null;

  const isBusiness = session?.mode === "business";
  const integrity = session?.config.integrity;
  const voiceOnly = !!integrity?.voiceOnly;
  const cameraRequired = !!integrity?.requireCamera;
  const fullscreenRequired = !!integrity?.requireFullscreen;

  // ---------------------------------------------------------------- load
  useEffect(() => {
    unmounted.current = false;
    (async () => {
      try {
        const r = await api.state(sessionId, token);
        setSession(r.session);
        if (r.session.status === "completed") {
          if (r.session.mode === "practice") navigate(`/report/${sessionId}`, { replace: true });
          else setPhase("done");
          return;
        }
        if (r.session.startedAt) startedAtRef.current = Date.parse(r.session.startedAt);
        setPhase("precheck");
      } catch (e) {
        setError(e instanceof ApiError && e.status === 403 ? "You don't have access to this interview from this browser. If you started it on another device, continue there — or sign in to the account that created it." : e instanceof Error ? e.message : "Couldn't load the interview.");
        setPhase("error");
      }
    })();
    loadVoices().then((vs) => {
      if (unmounted.current) return;
      const en = englishVoices(vs);
      setVoices(en.length ? en : vs);
      const def = pickDefaultVoice(vs);
      if (def) setVoiceName(def.name);
    });
    speakerRef.current = createSpeaker({
      voice: () => voiceRef.current,
      rate: () => rateRef.current,
      muted: () => mutedRef.current,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
    return () => {
      unmounted.current = true;
      speakerRef.current?.cancel();
      recRef.current?.abort();
      faceRef.current?.stop();
      void monitorRef.current?.stop();
    };
  }, [sessionId, token, navigate]);

  useEffect(() => {
    if (session?.config.persona === "supportive") setRate(0.96);
  }, [session?.config.persona]);

  // Release devices on unmount.
  useEffect(() => () => stopStream(micStream), [micStream]);
  useEffect(() => () => stopStream(camStream), [camStream]);

  // Clock
  useEffect(() => {
    if (!["asking", "answering", "thinking"].includes(phase)) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Warn before leaving mid-interview.
  useEffect(() => {
    if (!["asking", "answering", "thinking"].includes(phase)) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  // Attach camera to the preview element.
  useEffect(() => {
    if (videoRef.current && camStream) {
      if (videoRef.current.srcObject !== camStream) videoRef.current.srcObject = camStream;
      videoRef.current.play().catch(() => undefined);
      faceRef.current?.setVideo(videoRef.current);
    }
  }, [camStream, phase]);

  // ---------------------------------------------------------------- devices
  const enableMic = useCallback(async () => {
    setMicError(null);
    const r = await requestMedia({ audio: true, video: false });
    if (r.stream) setMicStream(r.stream);
    else setMicError(r.error);
  }, []);

  const enableCamera = useCallback(async () => {
    setCamError(null);
    setCamWanted(true);
    const r = await requestMedia({ audio: false, video: true });
    if (!r.stream) {
      setCamError(r.error);
      return;
    }
    setCamStream(r.stream);
    setFaceLoading(true);
    const watcher = new FaceWatcher(
      (sig) => {
        monitorRef.current?.record(sig.type, sig.detail);
      },
      (st) => {
        setFaceStatus(st);
        if (st.faces > 0) setFaceSeen(true);
      },
    );
    faceRef.current = watcher;
    // Wait for the video element to receive the stream.
    setTimeout(async () => {
      try {
        if (videoRef.current) await watcher.attach(videoRef.current, r.stream!);
      } catch {
        setCamError("On-device face analysis couldn't start on this browser. Try the latest Chrome or Edge.");
      } finally {
        setFaceLoading(false);
      }
    }, 300);
  }, []);

  const disableCamera = useCallback(() => {
    faceRef.current?.stop();
    faceRef.current = null;
    stopStream(camStream);
    setCamStream(null);
    setCamWanted(false);
    setFaceStatus(null);
  }, [camStream]);

  // ---------------------------------------------------------------- speech
  const clearSilence = () => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    setSilenceHint(false);
  };

  const startListening = useCallback((resume = false) => {
    if (unmounted.current) return;
    clearSilence();
    if (!resume) {
      carryRef.current = "";
      firstTimingRef.current = null;
      listenStartRef.current = performance.now();
    }
    setTranscript({ finalText: carryRef.current, interim: "" });
    setPaused(false);
    faceRef.current?.setAnswering(true);
    const rec = new SpeechRecognizer({
      onTranscript: (t) => {
        setTranscript({ finalText: [carryRef.current, t.finalText].filter(Boolean).join(" "), interim: t.interim });
        if (t.finalText || t.interim) clearSilence();
      },
      onSpeechActivity: () => faceRef.current?.notifySpeech(),
      onError: (code) => {
        if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
          setListening(false);
          if (!voiceOnly) {
            setAnswerMode("text");
            setError("We couldn't use speech recognition, so you can type your answer instead.");
          } else setError("Microphone access was blocked. Allow the microphone for this site, then reload the page to continue.");
        } else if (code === "network") {
          setError("Speech recognition lost its connection. It will keep retrying — you can also type your answer if allowed.");
        }
      },
    });
    recRef.current = rec;
    rec.start();
    setListening(true);
    silenceTimer.current = setTimeout(() => setSilenceHint(true), 25_000);
  }, [voiceOnly]);

  const beginAnswering = useCallback(() => {
    setPhase("answering");
    typedStartRef.current = null;
    if (answerMode === "voice") startListening();
    else {
      faceRef.current?.setAnswering(true);
      listenStartRef.current = performance.now();
      setTimeout(() => textRef.current?.focus(), 50);
    }
  }, [answerMode, startListening]);

  const say = useCallback(
    async (text: string) => {
      setPhase("asking");
      await speakerRef.current?.speak(text);
    },
    [],
  );

  const presentQuestion = useCallback(
    async (q: QuestionView, lead?: string | null) => {
      setQuestion(q);
      setSpokenLine(lead ?? q.preface ?? null);
      setTyped("");
      const text = [lead ?? q.preface, q.text].filter(Boolean).join(" ");
      await say(text);
      if (!unmounted.current) beginAnswering();
    },
    [say, beginAnswering],
  );

  // ---------------------------------------------------------------- start
  const start = useCallback(async () => {
    if (!session) return;
    setError(null);
    setPhase("starting");
    try {
      if (fullscreenRequired && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen().catch(() => undefined);
      }
      if (integrity && integrity.level !== "off") {
        const mon = new IntegrityMonitor({
          settings: integrity,
          send: async (events, keepalive) => {
            await api.events(sessionId, token, events, keepalive);
          },
          turnSeq: () => questionRef.current?.seq ?? null,
          onNotice: (n) => {
            setNotice(n);
            if (n.type === "fullscreen_exit") setFsNeeded(true);
          },
        });
        monitorRef.current = mon;
        mon.start();
        if (cameraRequired && !camStream) mon.record("camera_denied");
      }
      // Presence stats for eye-contact coaching.
      const r = await api.begin(sessionId, token);
      setSession(r.session);
      if (r.session.startedAt) startedAtRef.current = Date.parse(r.session.startedAt);
      if (r.done || !r.question) {
        finish();
        return;
      }
      await presentQuestion(r.question);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the interview.");
      setPhase("precheck");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, fullscreenRequired, integrity, sessionId, token, cameraRequired, camStream, presentQuestion]);

  // ---------------------------------------------------------------- submit
  const finish = useCallback(async () => {
    faceRef.current?.setAnswering(false);
    const totals = faceRef.current?.takeTotals();
    if (totals && totals.frames > 0) monitorRef.current?.record("presence_stats", totals);
    await monitorRef.current?.stop();
    faceRef.current?.stop();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    setPhase("done");
  }, []);

  const handleResult = useCallback(
    async (res: SubmitResult) => {
      if (res.type === "done") {
        setPhase("closing");
        setClosing(res.closing);
        setSpokenLine(null);
        await speakerRef.current?.speak(res.closing);
        await finish();
        if (session?.mode === "practice") navigate(`/report/${sessionId}`);
        return;
      }
      if (res.type === "question") {
        if (res.liveFeedback || res.starrCheck) setLiveFeedback({ text: res.liveFeedback, check: res.starrCheck });
        await presentQuestion(res.question);
        return;
      }
      // clarify / redirect: same question stays pending.
      setQuestion(res.question);
      setSpokenLine(res.line);
      await say(res.line);
      if (!unmounted.current) beginAnswering();
    },
    [finish, navigate, presentQuestion, say, beginAnswering, session?.mode, sessionId],
  );

  const submit = useCallback(
    async (overrideText?: string) => {
      const q = questionRef.current;
      if (!q) return;
      clearSilence();
      let text = "";
      let metrics: Record<string, unknown> = {};
      faceRef.current?.setAnswering(false);
      const eye = faceRef.current?.answerEyeContact() ?? null;
      if (answerMode === "voice" && overrideText === undefined) {
        const rec = recRef.current;
        setListening(false);
        const out = rec && !paused ? await rec.stop() : { text: "", timing: null };
        text = [carryRef.current, out.text].filter(Boolean).join(" ");
        const tm = out.timing;
        const first = firstTimingRef.current;
        const firstSpeechAt = first?.firstSpeechAt ?? tm?.firstSpeechAt ?? null;
        metrics = {
          latencyMs: first?.latencyMs ?? (tm && tm.firstSpeechAt !== null ? Math.round(tm.firstSpeechAt - listenStartRef.current) : null),
          durationMs: firstSpeechAt !== null && tm?.lastSpeechAt != null ? Math.round(tm.lastSpeechAt - firstSpeechAt + 800) : null,
          longestPauseMs: tm ? Math.round(tm.longestPauseMs) : null,
        };
        carryRef.current = "";
        if (!text.trim()) {
          setError("We didn't catch anything. Check your microphone and try again" + (voiceOnly ? "." : ", or switch to typing."));
          faceRef.current?.setAnswering(true);
          startListening();
          return;
        }
      } else {
        text = (overrideText ?? typed).trim();
        if (!text) return;
        const startT = typedStartRef.current;
        metrics = {
          latencyMs: startT ? Math.round(startT - listenStartRef.current) : null,
          durationMs: startT ? Math.round(performance.now() - startT) : null,
        };
      }
      metrics.eyeContact = eye;
      setError(null);
      setPhase("thinking");
      try {
        // Make sure the server has every integrity signal before it may finalise the interview.
        await monitorRef.current?.flush();
        const res = await api.answer(sessionId, token, q.seq, text, overrideText !== undefined ? "text" : answerMode, metrics);
        await handleResult(res);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          // Out of sync (e.g. double submit): resync with the server.
          const r = await api.state(sessionId, token).catch(() => null);
          if (r?.question) {
            await presentQuestion(r.question);
            return;
          }
        }
        setError(e instanceof Error ? e.message : "Couldn't send your answer.");
        setTyped(text);
        setAnswerMode((m) => (voiceOnly ? m : "text"));
        setPhase("answering");
      }
    },
    [answerMode, typed, paused, sessionId, token, handleResult, presentQuestion, startListening, voiceOnly],
  );

  const repeatQuestion = useCallback(async () => {
    const q = questionRef.current;
    if (!q) return;
    recRef.current?.abort();
    setListening(false);
    faceRef.current?.setAnswering(false);
    await say(q.text);
    if (!unmounted.current) beginAnswering();
  }, [say, beginAnswering]);

  const togglePause = useCallback(async () => {
    if (paused) {
      startListening(true);
      return;
    }
    const out = await recRef.current?.stop();
    setListening(false);
    setPaused(true);
    if (out) {
      if (!firstTimingRef.current && out.timing.firstSpeechAt !== null) {
        firstTimingRef.current = { latencyMs: Math.round(out.timing.firstSpeechAt - listenStartRef.current), firstSpeechAt: out.timing.firstSpeechAt };
      }
      carryRef.current = [carryRef.current, out.text].filter(Boolean).join(" ");
      setTranscript({ finalText: carryRef.current, interim: "" });
    }
  }, [paused, startListening]);

  const endEarly = useCallback(async () => {
    setEndOpen(false);
    speakerRef.current?.cancel();
    recRef.current?.abort();
    setPhase("thinking");
    try {
      await monitorRef.current?.flush();
      const res = await api.end(sessionId, token);
      await handleResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't end the interview.");
      setPhase("answering");
    }
  }, [sessionId, token, handleResult]);

  // Time limit
  const elapsed = startedAtRef.current ? now - startedAtRef.current : 0;
  const limitMs = session?.config.timeLimitMinutes ? session.config.timeLimitMinutes * 60_000 : null;
  useEffect(() => {
    if (!limitMs || !startedAtRef.current) return;
    if (elapsed >= limitMs && ["answering", "asking"].includes(phase)) {
      speakerRef.current?.cancel();
      recRef.current?.abort();
      setPhase("thinking");
      api.end(sessionId, token, "time_limit").then(handleResult).catch(() => setPhase("answering"));
    }
  }, [elapsed, limitMs, phase, sessionId, token, handleResult]);

  // ---------------------------------------------------------------- derived
  const orbState: OrbState = speaking ? "speaking" : phase === "thinking" || phase === "starting" ? "thinking" : phase === "answering" && listening ? "listening" : "idle";
  const checks = {
    mic: answerMode === "text" || !!micStream,
    stt: !voiceOnly || sttSupported(),
    camera: !cameraRequired || (!!camStream && faceSeen),
  };
  const canStart = checks.mic && checks.stt && checks.camera;

  if (phase === "loading") return <PageLoader label="Loading interview" />;
  if (phase === "error" || !session)
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <Alert tone="danger" title="We couldn't open this interview" icon={<Warning size={20} />}>
          {error}
        </Alert>
        <ButtonLink to="/" variant="outline" className="mt-6">
          Go to homepage
        </ButtonLink>
      </div>
    );

  const companyName = session.config.companyName;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {/* Top bar */}
      <header className="border-b border-border-soft bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Brand to={isBusiness ? "#" : "/app"} className="shrink-0" />
          <div className="hidden min-w-0 border-l border-border-soft pl-3 sm:block">
            <p className="truncate text-sm font-bold text-fg-strong">{session.roleTitle}</p>
            <p className="truncate text-xs text-muted-fg">{companyName ? `${companyName} · ` : ""}{isBusiness ? "Screening interview" : "Practice interview"}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {question && ["asking", "answering", "thinking"].includes(phase) && (
              <span className="hidden sm:inline-flex">
              <Badge tone="info">
                {question.kind === "intro" ? "Warm-up" : question.kind === "follow_up" ? `Question ${question.progress.mainAsked} · follow-up` : `Question ${question.progress.mainAsked}`}
                {question.progress.phase === "extension" ? " · extra round" : ""}
              </Badge>
              </span>
            )}
            {startedAtRef.current && ["asking", "answering", "thinking"].includes(phase) && (
              <span className="rounded-lg bg-muted px-2.5 py-1 text-sm font-semibold tabular-nums text-fg-strong" aria-label="Elapsed time">
                {limitMs ? `${clock(Math.max(0, limitMs - elapsed))} left` : clock(elapsed)}
              </span>
            )}
            {["asking", "answering", "thinking"].includes(phase) && (
              <Button variant="ghost" size="sm" onClick={() => setEndOpen(true)} icon={<Stop size={18} />}>
                End
              </Button>
            )}
          </div>
        </div>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {PHASE_LABEL[phase]}
      </p>

      {notice && isBusiness && ["asking", "answering", "thinking"].includes(phase) && (
        <div className="mx-auto mt-4 w-full max-w-6xl px-4 sm:px-6">
          <Alert tone="warning" icon={<ShieldCheck size={20} />} title="Integrity notice">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{notice.message}</span>
              <span className="flex gap-2">
                {fsNeeded && (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<CornersOut size={16} />}
                    onClick={() => {
                      document.documentElement.requestFullscreen().catch(() => undefined);
                      setFsNeeded(false);
                    }}
                  >
                    Return to full screen
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>
                  Dismiss
                </Button>
              </span>
            </div>
          </Alert>
        </div>
      )}

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {phase === "precheck" || phase === "starting" ? (
          <Precheck
            session={session}
            starting={phase === "starting"}
            canStart={canStart}
            checks={checks}
            micStream={micStream}
            micError={micError}
            onEnableMic={enableMic}
            camStream={camStream}
            camError={camError}
            camWanted={camWanted}
            onEnableCamera={enableCamera}
            onDisableCamera={disableCamera}
            faceStatus={faceStatus}
            faceLoading={faceLoading}
            videoRef={videoRef}
            voices={voices}
            voiceName={voiceName}
            setVoiceName={setVoiceName}
            rate={rate}
            setRate={setRate}
            muted={muted}
            setMuted={setMuted}
            answerMode={answerMode}
            setAnswerMode={setAnswerMode}
            onTestVoice={() => speakerRef.current?.speak("Hi, I'll be your interviewer today. Take your time with each answer.")}
            onStart={start}
            onBreathe={() => setBreathing(true)}
            error={error}
            resuming={session.status === "in_progress"}
          />
        ) : phase === "done" || phase === "closing" ? (
          <DoneScreen session={session} closing={closing} generating={phase === "closing" || !isBusiness} sessionId={sessionId} />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            {/* Interviewer */}
            <Card className="flex flex-col items-center p-6 text-center">
              <Orb state={orbState} />
              <p className="mt-4 text-sm font-semibold text-muted-fg">{phase === "thinking" ? "Considering your answer…" : speaking ? "Interviewer is speaking" : "Interviewer"}</p>
              <div className="mt-4 w-full rounded-xl bg-surface-2 p-5 text-left" aria-live="polite">
                {phase === "thinking" ? (
                  <div className="space-y-2" aria-busy="true">
                    <div className="vh-pulse h-4 w-3/4 rounded bg-muted" />
                    <div className="vh-pulse h-4 w-1/2 rounded bg-muted" />
                  </div>
                ) : (
                  <>
                    {spokenLine && spokenLine !== question?.text && <p className="mb-2 text-sm text-muted-fg">{spokenLine}</p>}
                    <p className="text-lg font-semibold leading-relaxed text-fg-strong sm:text-xl">{question?.text}</p>
                  </>
                )}
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  variant="subtle"
                  size="sm"
                  icon={<ArrowClockwise size={16} />}
                  onClick={repeatQuestion}
                  disabled={phase !== "answering" || !!transcript.finalText || !!transcript.interim || speaking}
                >
                  Repeat question
                </Button>
                <Button
                  variant="subtle"
                  size="sm"
                  icon={muted ? <SpeakerSlash size={16} /> : <SpeakerHigh size={16} />}
                  onClick={() => {
                    if (!muted) speakerRef.current?.cancel();
                    setMuted((m) => !m);
                  }}
                  aria-pressed={muted}
                >
                  {muted ? "Voice off" : "Voice on"}
                </Button>
              </div>
            </Card>

            {/* Candidate */}
            <Card className="flex flex-col p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold">Your answer</h2>
                <div className="flex items-center gap-2">
                  {isBusiness && integrity?.level !== "off" && (
                    <Badge tone="success" icon={<ShieldCheck size={14} />}>
                      Monitored
                    </Badge>
                  )}
                  {!voiceOnly && sttSupported() && phase === "answering" && !listening && !transcript.finalText && (
                    <Button variant="ghost" size="sm" icon={answerMode === "voice" ? <Keyboard size={16} /> : <Microphone size={16} />} onClick={() => setAnswerMode((m) => (m === "voice" ? "text" : "voice"))}>
                      {answerMode === "voice" ? "Type instead" : "Speak instead"}
                    </Button>
                  )}
                </div>
              </div>

              {camStream && (
                <div className="relative mt-4 overflow-hidden rounded-xl bg-slate-900">
                  <video ref={videoRef} muted playsInline className="aspect-video w-full -scale-x-100 object-cover" aria-label="Your camera preview" />
                  {faceStatus && (
                    <span className={clsx("absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold", faceStatus.faces === 1 && faceStatus.facing ? "bg-success-bg text-success" : "bg-warning-bg text-warning")}>
                      {faceStatus.faces === 0 ? "Face not visible" : faceStatus.faces > 1 ? "More than one face" : faceStatus.facing ? "Good eye contact" : "Look toward the camera"}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-4 flex-1">
                {answerMode === "voice" ? (
                  <div className="flex h-full flex-col">
                    <div className="flex items-center gap-3">
                      {listening ? <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" /> : <span className="size-2.5 shrink-0 rounded-full bg-muted-fg/40" aria-hidden="true" />}
                      <MicMeter stream={micStream} active={listening} />
                    </div>
                    <div className="mt-3 min-h-36 flex-1 rounded-xl border border-border-soft bg-surface-2 p-4 text-[15px] leading-relaxed" aria-live="off">
                      {transcript.finalText || transcript.interim ? (
                        <p className="text-fg-strong">
                          {transcript.finalText} <span className="text-muted-fg">{transcript.interim}</span>
                        </p>
                      ) : (
                        <p className="text-muted-fg">
                          {phase === "answering" ? (paused ? "Paused. Resume when you're ready." : "Listening… take a breath, then answer in your own words. Your words will appear here.") : phase === "asking" ? "The interviewer is asking the question." : ""}
                        </p>
                      )}
                    </div>
                    {silenceHint && phase === "answering" && !transcript.finalText && (
                      <p className="mt-2 text-sm text-muted-fg">Take your time. Whenever you're ready, just start talking — or press “Repeat question”.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label htmlFor="typed-answer" className="sr-only">
                      Type your answer
                    </label>
                    <Textarea
                      id="typed-answer"
                      ref={(el) => {
                        textRef.current = el;
                      }}
                      value={typed}
                      onChange={(e) => {
                        if (typedStartRef.current === null) typedStartRef.current = performance.now();
                        setTyped(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit(typed);
                      }}
                      onFocus={() => {
                        if (textRef.current && monitorRef.current) {
                          const off = monitorRef.current.watchTextInput(textRef.current);
                          textRef.current.addEventListener("blur", off, { once: true });
                        }
                      }}
                      disabled={phase !== "answering"}
                      rows={8}
                      placeholder="Type your answer… (Ctrl/⌘ + Enter to send)"
                      className="min-h-44"
                    />
                    {integrity?.blockPaste && <p className="mt-1.5 text-xs text-muted-fg">Pasting is disabled for this interview.</p>}
                  </div>
                )}
              </div>

              {error && phase === "answering" && (
                <Alert tone="warning" className="mt-3">
                  {error}
                </Alert>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {answerMode === "voice" ? (
                  <>
                    <Button
                      variant="cta"
                      size="lg"
                      className="flex-1"
                      icon={phase === "thinking" ? <Spinner className="size-5" /> : <CheckCircle size={20} />}
                      onClick={() => void submit()}
                      disabled={phase !== "answering" || (!transcript.finalText && !transcript.interim)}
                    >
                      {phase === "thinking" ? "Sending…" : "I'm done answering"}
                    </Button>
                    {!isBusiness && (
                      <Button variant="outline" size="lg" icon={paused ? <Play size={18} /> : <Pause size={18} />} onClick={togglePause} disabled={phase !== "answering"}>
                        {paused ? "Resume" : "Pause"}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button variant="cta" size="lg" className="flex-1" icon={phase === "thinking" ? <Spinner className="size-5" /> : <ChatText size={20} />} onClick={() => void submit(typed)} disabled={phase !== "answering" || !typed.trim()}>
                    {phase === "thinking" ? "Sending…" : "Send answer"}
                  </Button>
                )}
              </div>
            </Card>

            {liveFeedback && !isBusiness && (
              <Card className="p-5 lg:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-primary">Coach's note on your last story</h2>
                    {liveFeedback.text && <p className="mt-1 text-[15px] text-fg-strong">{liveFeedback.text}</p>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setLiveFeedback(null)}>
                    Hide
                  </Button>
                </div>
                {liveFeedback.check && (
                  <div className="mt-3">
                    <StarrChecklist check={liveFeedback.check} />
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </main>

      <Dialog
        open={endOpen}
        onClose={() => setEndOpen(false)}
        title="End the interview now?"
        description={isBusiness ? "Your answers so far will be submitted to the hiring team. You won't be able to restart this interview." : "You'll get feedback on the answers you've given so far."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEndOpen(false)}>
              Keep going
            </Button>
            <Button variant="danger" onClick={endEarly}>
              End interview
            </Button>
          </>
        }
      />
      <Dialog open={breathing} onClose={() => setBreathing(false)} title="One-minute calm">
        {breathing && <Breathing onDone={() => setBreathing(false)} />}
      </Dialog>
    </div>
  );
}

function CheckRow({ ok, label, children }: { ok: boolean; label: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-soft p-4">
      <div className="flex items-center gap-3">
        <span className={clsx("flex size-8 items-center justify-center rounded-full", ok ? "bg-success-bg text-success" : "bg-muted text-muted-fg")}>
          {ok ? <CheckCircle size={20} weight="fill" /> : <span className="size-2 rounded-full bg-current" />}
        </span>
        <span className="font-semibold text-fg-strong">{label}</span>
      </div>
      {children}
    </div>
  );
}

interface PrecheckProps {
  session: PublicSession;
  starting: boolean;
  canStart: boolean;
  checks: { mic: boolean; stt: boolean; camera: boolean };
  micStream: MediaStream | null;
  micError: string | null;
  onEnableMic: () => void;
  camStream: MediaStream | null;
  camError: string | null;
  camWanted: boolean;
  onEnableCamera: () => void;
  onDisableCamera: () => void;
  faceStatus: FaceStatus | null;
  faceLoading: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  voices: SpeechSynthesisVoice[];
  voiceName: string;
  setVoiceName: (v: string) => void;
  rate: number;
  setRate: (v: number) => void;
  muted: boolean;
  setMuted: (v: boolean) => void;
  answerMode: AnswerMode;
  setAnswerMode: (m: AnswerMode) => void;
  onTestVoice: () => void;
  onStart: () => void;
  onBreathe: () => void;
  error: string | null;
  resuming: boolean;
}

function Precheck(p: PrecheckProps) {
  const s = p.session;
  const integ = s.config.integrity;
  const business = s.mode === "business";
  const sttOk = sttSupported();
  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1.3fr_1fr]">
      <Card className="p-6">
        <p className="text-sm font-semibold text-primary">{business ? `${s.config.companyName ?? "Screening"} interview` : "Practice interview"}</p>
        <h1 className="mt-1 text-2xl font-extrabold">{p.resuming ? "Welcome back — let's continue" : "Let's get you set up"}</h1>
        <p className="mt-1 text-muted-fg">
          {s.roleTitle} · about {s.config.minMainQuestions}–{s.config.maxMainQuestions} questions{s.config.timeLimitMinutes ? ` · ${s.config.timeLimitMinutes}-minute limit` : ""}. The interviewer adapts each question to your previous answers.
        </p>

        <div className="mt-6 space-y-3">
          {!p.checks.stt && (
            <Alert tone="danger" icon={<Warning size={20} />} title="This browser can't transcribe speech">
              This interview must be answered by voice. Please open the link in Chrome, Edge or Safari.
            </Alert>
          )}
          <CheckRow ok={!!p.micStream || p.answerMode === "text"} label="Microphone">
            {p.micStream ? (
              <MicMeter stream={p.micStream} active />
            ) : p.answerMode === "text" ? (
              <span className="text-sm text-muted-fg">Typing mode</span>
            ) : (
              <Button size="sm" variant="primary" icon={<Microphone size={16} />} onClick={p.onEnableMic}>
                Allow microphone
              </Button>
            )}
          </CheckRow>
          {p.micError && <Alert tone="danger">{p.micError}</Alert>}
          {!integ.voiceOnly && (
            <div className="flex items-center justify-between gap-3 px-1 text-sm">
              <span className="text-muted-fg">{sttOk ? "Prefer typing? You can switch at any time." : "Speech recognition isn't available in this browser, so you'll type your answers."}</span>
              {sttOk && (
                <Button size="sm" variant="ghost" icon={p.answerMode === "voice" ? <Keyboard size={16} /> : <MicrophoneSlash size={16} />} onClick={() => p.setAnswerMode(p.answerMode === "voice" ? "text" : "voice")}>
                  {p.answerMode === "voice" ? "Type instead" : "Use voice"}
                </Button>
              )}
            </div>
          )}

          <CheckRow ok={integ.requireCamera ? !!p.camStream && !!p.faceStatus && p.faceStatus.faces > 0 : !!p.camStream} label={integ.requireCamera ? "Camera (required)" : "Camera (optional)"}>
            {p.camStream ? (
              <Button size="sm" variant="ghost" icon={<CameraSlash size={16} />} onClick={p.onDisableCamera} disabled={integ.requireCamera}>
                Turn off
              </Button>
            ) : (
              <Button size="sm" variant={integ.requireCamera ? "primary" : "outline"} icon={<Camera size={16} />} onClick={p.onEnableCamera}>
                {integ.requireCamera ? "Allow camera" : "Practise eye contact"}
              </Button>
            )}
          </CheckRow>
          {p.camError && <Alert tone="danger">{p.camError}</Alert>}
          {(p.camStream || p.camWanted) && (
            <div className="relative overflow-hidden rounded-xl bg-slate-900">
              <video ref={p.videoRef} muted playsInline className="aspect-video w-full -scale-x-100 object-cover" aria-label="Camera preview" />
              <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
                {p.faceLoading ? "Starting on-device analysis…" : !p.faceStatus ? "Waiting for camera…" : p.faceStatus.faces === 0 ? "Move into view" : p.faceStatus.faces > 1 ? "Only you should be in view" : "Face detected"}
              </span>
            </div>
          )}
          {!integ.requireCamera && !business && <p className="px-1 text-xs text-muted-fg">Your camera stays on your device. We only measure how often you look toward the screen, to coach your eye contact.</p>}
        </div>

        {p.error && (
          <Alert tone="danger" className="mt-4">
            {p.error}
          </Alert>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="cta" size="lg" onClick={p.onStart} disabled={!p.canStart} loading={p.starting} icon={integ.requireFullscreen ? <CornersOut size={20} /> : <Play size={20} weight="fill" />}>
            {p.resuming ? "Continue interview" : integ.requireFullscreen ? "Enter full screen & start" : "Start interview"}
          </Button>
          {!business && (
            <Button variant="outline" size="lg" icon={<Wind size={20} />} onClick={p.onBreathe}>
              Calm warm-up
            </Button>
          )}
        </div>
        {!p.canStart && <p className="mt-2 text-sm text-muted-fg">Complete the checks above to begin.</p>}
      </Card>

      <div className="space-y-5">
        <Card className="p-6">
          <h2 className="text-base font-bold">Interviewer voice</h2>
          {ttsSupported() ? (
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="voice" className="text-sm font-semibold text-fg-strong">
                  Voice
                </label>
                <Select id="voice" value={p.voiceName} onChange={(e) => p.setVoiceName(e.target.value)} disabled={p.muted || p.voices.length === 0}>
                  {p.voices.length === 0 && <option value="">System default voice</option>}
                  {p.voices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="rate" className="flex justify-between text-sm font-semibold text-fg-strong">
                  Speaking speed <span className="tabular-nums text-muted-fg">{p.rate.toFixed(2)}×</span>
                </label>
                <input id="rate" type="range" min={0.8} max={1.25} step={0.05} value={p.rate} onChange={(e) => p.setRate(Number(e.target.value))} className="w-full accent-[var(--vh-primary)]" disabled={p.muted} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" icon={<SpeakerHigh size={16} />} onClick={p.onTestVoice} disabled={p.muted}>
                  Test voice
                </Button>
                <Button size="sm" variant="ghost" icon={p.muted ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} />} onClick={() => p.setMuted(!p.muted)}>
                  {p.muted ? "Turn voice on" : "Captions only"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-fg">This browser can't speak aloud, so questions will appear as captions.</p>
          )}
        </Card>

        {business ? (
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <ShieldCheck size={20} className="text-primary" /> What's monitored
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm text-fg">
              {s.monitored.map((m) => (
                <li key={m} className="flex gap-2">
                  <CheckCircle size={18} className="mt-0.5 shrink-0 text-success" /> {m}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-fg">No audio or video is recorded or uploaded. Camera analysis runs only on your device. Signals are reviewed by people, never used as an automatic verdict.</p>
          </Card>
        ) : (
          <Card className="p-6">
            <h2 className="text-base font-bold">Tips for a great answer</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {[
                ["Situation", "Set the scene in a sentence or two."],
                ["Task", "What were you responsible for?"],
                ["Action", "What did you do — use “I”, not “we”."],
                ["Result", "What happened? Use a number if you can."],
                ["Reflection", "What did you learn or change since?"],
              ].map(([k, v]) => (
                <li key={k} className="flex gap-2">
                  <span className="w-20 shrink-0 font-bold text-primary">{k}</span>
                  <span className="text-fg">{v}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted-fg">It's okay to pause and think. Nervousness is normal — you can pause or repeat any question.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function DoneScreen({ session, closing, generating, sessionId }: { session: PublicSession; closing: string | null; generating: boolean; sessionId: string }) {
  if (session.mode === "practice") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
        <Orb state="thinking" size={120} />
        <h1 className="mt-6 text-2xl font-extrabold">Great work — interview complete</h1>
        <p className="mt-2 text-muted-fg">{closing ?? "We're preparing your STARR feedback report."}</p>
        {generating && <Spinner className="mt-6 size-6 text-primary" label="Preparing report" />}
        <ButtonLink to={`/report/${sessionId}`} variant="primary" className="mt-6">
          View my report
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-bg text-success">
        <CheckCircle size={36} weight="fill" />
      </div>
      <h1 className="mt-6 text-2xl font-extrabold">Thank you{session.candidateName ? `, ${session.candidateName.split(" ")[0]}` : ""}!</h1>
      <p className="mt-2 text-muted-fg">
        Your interview for <strong className="text-fg-strong">{session.roleTitle}</strong>
        {session.config.companyName ? ` at ${session.config.companyName}` : ""} has been submitted. The hiring team will review it and contact you about next steps.
      </p>
      <p className="mt-6 text-sm text-muted-fg">You can close this tab now. Want to keep sharpening your skills?</p>
      <Link to="/practice/new" className="mt-2 inline-block font-semibold text-primary underline-offset-4 hover:underline">
        Try a free practice interview
      </Link>
    </div>
  );
}
