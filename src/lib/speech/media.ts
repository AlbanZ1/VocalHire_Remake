// Microphone / camera access and a lightweight audio level meter.

export interface MediaResult {
  stream: MediaStream | null;
  error: string | null;
}

export async function requestMedia(opts: { audio: boolean; video: boolean }): Promise<MediaResult> {
  if (!navigator.mediaDevices?.getUserMedia) return { stream: null, error: "Your browser doesn't support microphone or camera access." };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: opts.audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
      video: opts.video ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user", frameRate: { ideal: 24, max: 30 } } : false,
    });
    return { stream, error: null };
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") return { stream: null, error: "Permission was denied. Allow access in your browser's address bar, then try again." };
    if (name === "NotFoundError" || name === "OverconstrainedError") return { stream: null, error: opts.video ? "No camera was found." : "No microphone was found." };
    if (name === "NotReadableError") return { stream: null, error: "The device is in use by another application." };
    return { stream: null, error: "We couldn't access your device." };
  }
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Returns a function that reads the current input level (0..1). */
export function createLevelMeter(stream: MediaStream): { read: () => number; close: () => void } {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  return {
    read() {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / buf.length) * 4);
    },
    close() {
      src.disconnect();
      ctx.close().catch(() => undefined);
    },
  };
}
