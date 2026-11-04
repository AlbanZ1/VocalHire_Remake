// On-device camera analysis with MediaPipe Face Landmarker.
// No video or images ever leave the browser — only event metadata (type + duration).
//
// Signals:
//  - face_missing       no face for ≥ 3 s
//  - multiple_faces     a second face for ≥ 1 s
//  - gaze_away          head/eyes turned away for ≥ 2.5 s while answering
//  - reading_pattern    repeated slow horizontal eye drift + fast return sweep (reading lines of text)
//  - lip_sync_mismatch  words are being transcribed while the mouth isn't moving (another speaker / audio)
//  - camera_stopped     the camera track ended mid-interview
// Plus eye-contact statistics used for delivery coaching in practice mode.

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { BASE_PATH } from "@/config";

export type FaceSignalType = "face_missing" | "multiple_faces" | "gaze_away" | "reading_pattern" | "lip_sync_mismatch" | "camera_stopped";

export interface FaceSignal {
  type: FaceSignalType;
  detail: Record<string, unknown>;
}

export interface FaceStatus {
  ready: boolean;
  faces: number;
  facing: boolean;
  lookingAway: boolean;
}

interface Sample {
  t: number;
  x: number;
}

const FRAME_MS = 100;

function blend(categories: { categoryName: string; score: number }[] | undefined, name: string): number {
  return categories?.find((c) => c.categoryName === name)?.score ?? 0;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function loadLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(`${BASE_PATH}mediapipe/wasm`);
      const common = {
        runningMode: "VIDEO" as const,
        numFaces: 2,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };
      const model = `${BASE_PATH}models/face_landmarker.task`;
      try {
        return await FaceLandmarker.createFromOptions(fileset, { ...common, baseOptions: { modelAssetPath: model, delegate: "GPU" } });
      } catch {
        return await FaceLandmarker.createFromOptions(fileset, { ...common, baseOptions: { modelAssetPath: model, delegate: "CPU" } });
      }
    })();
    landmarkerPromise.catch(() => {
      landmarkerPromise = null;
    });
  }
  return landmarkerPromise;
}

export class FaceWatcher {
  private landmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastVideoTime = -1;
  private answering = false;
  private lastSpeechAt = 0;
  private trackEndedHandler: (() => void) | null = null;

  // Episodes
  private noFaceSince: number | null = null;
  private multiSince: number | null = null;
  private multiMax = 0;
  private awaySince: number | null = null;
  private awayDir = "";
  private stillMouthSince: number | null = null;
  private lastLipFlag = 0;
  private lastReadingFlag = 0;

  // Reading detection
  private gazeX: Sample[] = [];
  private smoothX: number | null = null;
  private sweeps: { t: number; dir: number }[] = [];
  private lastSweepAt = 0;

  // Mouth activity
  private jaw: Sample[] = [];

  // Eye-contact statistics
  private answerFrames = 0;
  private answerFacing = 0;
  private totalFrames = 0;
  private totalFacing = 0;

  status: FaceStatus = { ready: false, faces: 0, facing: false, lookingAway: false };

  constructor(private onSignal: (s: FaceSignal) => void, private onStatus?: (s: FaceStatus) => void) {}

  static preload(): Promise<unknown> {
    return loadLandmarker();
  }

  async attach(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
    this.video = video;
    this.landmarker = await loadLandmarker();
    const track = stream.getVideoTracks()[0];
    if (track) {
      this.trackEndedHandler = () => this.onSignal({ type: "camera_stopped", detail: {} });
      track.addEventListener("ended", this.trackEndedHandler);
    }
    this.status = { ...this.status, ready: true };
    this.onStatus?.(this.status);
    this.loop();
  }

  /** Point analysis at a different <video> element showing the same stream (e.g. after a re-render). */
  setVideo(video: HTMLVideoElement | null) {
    if (video) {
      this.video = video;
      this.lastVideoTime = -1;
    }
  }

  setAnswering(on: boolean) {
    if (this.answering && !on) this.closeAwayEpisode(performance.now());
    this.answering = on;
    if (on) {
      this.answerFrames = 0;
      this.answerFacing = 0;
      this.gazeX = [];
      this.sweeps = [];
      this.smoothX = null;
    }
  }

  notifySpeech() {
    this.lastSpeechAt = performance.now();
  }

  /** Eye contact during the current/last answer (0..1), or null if not enough frames. */
  answerEyeContact(): number | null {
    return this.answerFrames >= 20 ? this.answerFacing / this.answerFrames : null;
  }

  takeTotals(): { frames: number; facing: number } {
    const r = { frames: this.totalFrames, facing: this.totalFacing };
    this.totalFrames = 0;
    this.totalFacing = 0;
    return r;
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const now = performance.now();
    this.closeNoFace(now, true);
    this.closeMulti(now);
    this.closeAwayEpisode(now);
    const track = (this.video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (track && this.trackEndedHandler) track.removeEventListener("ended", this.trackEndedHandler);
    this.video = null;
  }

  private loop = () => {
    this.timer = setTimeout(this.loop, FRAME_MS);
    const v = this.video;
    const lm = this.landmarker;
    if (!v || !lm || v.readyState < 2 || v.videoWidth === 0) return;
    if (document.hidden) return;
    if (v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    let result;
    try {
      result = lm.detectForVideo(v, performance.now());
    } catch {
      return;
    }
    this.process(result.faceLandmarks.length, result.faceBlendshapes?.[0]?.categories, result.facialTransformationMatrixes?.[0]?.data);
  };

  private process(faces: number, bs: { categoryName: string; score: number }[] | undefined, matrix: number[] | undefined) {
    const now = performance.now();

    // Presence
    if (faces === 0) {
      this.noFaceSince ??= now;
    } else this.closeNoFace(now, false);

    // Multiple faces
    if (faces >= 2) {
      this.multiSince ??= now;
      this.multiMax = Math.max(this.multiMax, faces);
    } else this.closeMulti(now);

    let facing = false;
    let away = false;
    if (faces >= 1 && bs) {
      // Head pose from the facial transformation matrix (column-major 4x4).
      let yaw = 0;
      let pitch = 0;
      if (matrix && matrix.length >= 11) {
        yaw = (Math.asin(Math.max(-1, Math.min(1, -matrix[2]))) * 180) / Math.PI;
        pitch = (Math.atan2(matrix[6], matrix[10]) * 180) / Math.PI;
      }
      // Eye gaze from blendshapes. Left/right refer to the subject's face.
      const gx = (blend(bs, "eyeLookOutLeft") - blend(bs, "eyeLookInLeft") + blend(bs, "eyeLookInRight") - blend(bs, "eyeLookOutRight")) / 2;
      const gy = (blend(bs, "eyeLookUpLeft") + blend(bs, "eyeLookUpRight") - blend(bs, "eyeLookDownLeft") - blend(bs, "eyeLookDownRight")) / 2;
      facing = Math.abs(yaw) < 16 && Math.abs(pitch) < 18 && Math.abs(gx) < 0.35 && Math.abs(gy) < 0.4;
      away = Math.abs(yaw) > 28 || Math.abs(pitch) > 25 || Math.abs(gx) > 0.6 || gy < -0.55;
      if (away) this.awayDir = Math.abs(yaw) > 28 || Math.abs(gx) > 0.6 ? "side" : "down";

      if (this.answering) {
        this.trackReading(now, gx);
        this.trackMouth(now, blend(bs, "jawOpen"));
      }
    }

    this.totalFrames++;
    if (facing) this.totalFacing++;
    if (this.answering) {
      this.answerFrames++;
      if (facing) this.answerFacing++;
      if (away || faces === 0) this.awaySince ??= now;
      else this.closeAwayEpisode(now);
    }

    const next: FaceStatus = { ready: true, faces, facing, lookingAway: away };
    if (next.faces !== this.status.faces || next.facing !== this.status.facing || next.lookingAway !== this.status.lookingAway) {
      this.status = next;
      this.onStatus?.(next);
    }
  }

  private closeNoFace(now: number, force: boolean) {
    if (this.noFaceSince !== null) {
      const d = now - this.noFaceSince;
      if (d >= 3000 || (force && d >= 3000)) this.onSignal({ type: "face_missing", detail: { durationMs: Math.round(d) } });
      this.noFaceSince = null;
    }
  }

  private closeMulti(now: number) {
    if (this.multiSince !== null) {
      const d = now - this.multiSince;
      if (d >= 1000) this.onSignal({ type: "multiple_faces", detail: { durationMs: Math.round(d), maxFaces: this.multiMax } });
      this.multiSince = null;
      this.multiMax = 0;
    }
  }

  private closeAwayEpisode(now: number) {
    if (this.awaySince !== null) {
      const d = now - this.awaySince;
      if (d >= 2500) this.onSignal({ type: "gaze_away", detail: { durationMs: Math.round(d), direction: this.awayDir || "unknown" } });
      this.awaySince = null;
    }
  }

  /**
   * Reading leaves a characteristic signature: the eyes drift slowly along a line, then snap back
   * quickly to the start of the next line. Count fast "return sweeps" that follow a slow drift in
   * the opposite direction; several in a short window, all in the same direction, = reading.
   */
  private trackReading(now: number, rawX: number) {
    this.smoothX = this.smoothX === null ? rawX : this.smoothX * 0.5 + rawX * 0.5;
    const x = this.smoothX;
    this.gazeX.push({ t: now, x });
    while (this.gazeX.length && now - this.gazeX[0].t > 3000) this.gazeX.shift();
    if (now - this.lastSweepAt < 400) return;
    const recent = this.gazeX.filter((s) => now - s.t <= 260);
    if (recent.length < 2) return;
    const jump = x - recent[0].x;
    if (Math.abs(jump) < 0.16) return;
    const dir = Math.sign(jump);
    const jumpStart = recent[0];
    const before = this.gazeX.filter((s) => s.t < jumpStart.t && jumpStart.t - s.t <= 2500);
    if (before.length < 6) return;
    const drift = jumpStart.x - before[0].x;
    const span = jumpStart.t - before[0].t;
    if (Math.sign(drift) !== -dir || Math.abs(drift) < 0.1 || span < 700) return;
    this.lastSweepAt = now;
    this.sweeps.push({ t: now, dir });
    this.sweeps = this.sweeps.filter((s) => now - s.t <= 15_000);
    const sameDir = this.sweeps.filter((s) => s.dir === dir).length;
    if (sameDir >= 4 && now - this.lastReadingFlag > 25_000) {
      this.lastReadingFlag = now;
      this.onSignal({ type: "reading_pattern", detail: { sweeps: sameDir, windowMs: 15_000 } });
      this.sweeps = [];
    }
  }

  private trackMouth(now: number, jawOpen: number) {
    this.jaw.push({ t: now, x: jawOpen });
    while (this.jaw.length && now - this.jaw[0].t > 2000) this.jaw.shift();
    const speaking = now - this.lastSpeechAt < 1200;
    const still = this.jaw.length >= 12 && std(this.jaw.map((s) => s.x)) < 0.012;
    if (speaking && still) {
      this.stillMouthSince ??= now;
      if (now - this.stillMouthSince >= 4000 && now - this.lastLipFlag > 30_000) {
        this.lastLipFlag = now;
        this.onSignal({ type: "lip_sync_mismatch", detail: { durationMs: Math.round(now - this.stillMouthSince) } });
      }
    } else this.stillMouthSince = null;
  }
}
