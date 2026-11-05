// Natural interviewer voices (Amazon Polly). Shared by the edge function (validation, synthesis)
// and the web app (voice picker). Every voice here has a neural variant (the default engine) and a
// generative variant (optional, more human-sounding, about twice the price).

export type PollyEngine = "generative" | "neural";

export interface VoiceOption {
  id: string;
  accent: string;
  gender: "female" | "male";
  languageCode: string;
}

export const POLLY_VOICES: VoiceOption[] = [
  { id: "Ruth", accent: "American", gender: "female", languageCode: "en-US" },
  { id: "Matthew", accent: "American", gender: "male", languageCode: "en-US" },
  { id: "Danielle", accent: "American", gender: "female", languageCode: "en-US" },
  { id: "Stephen", accent: "American", gender: "male", languageCode: "en-US" },
  { id: "Amy", accent: "British", gender: "female", languageCode: "en-GB" },
  { id: "Brian", accent: "British", gender: "male", languageCode: "en-GB" },
  { id: "Olivia", accent: "Australian", gender: "female", languageCode: "en-AU" },
  { id: "Kajal", accent: "Indian", gender: "female", languageCode: "en-IN" },
  { id: "Niamh", accent: "Irish", gender: "female", languageCode: "en-IE" },
  { id: "Ayanda", accent: "South African", gender: "female", languageCode: "en-ZA" },
];

export const DEFAULT_POLLY_VOICE = "Ruth";

/** What the "Test voice" button says. The server only ever synthesises this fixed text for samples. */
export const VOICE_SAMPLE_TEXT = "Hi, I'll be your interviewer today. Take your time with each answer — there's no rush.";

export function pollyVoice(id: unknown): VoiceOption | null {
  return POLLY_VOICES.find((v) => v.id === id) ?? null;
}

export function isPollyVoice(id: unknown): id is string {
  return pollyVoice(id) !== null;
}

export function voiceLabel(v: VoiceOption): string {
  return `${v.id} — ${v.accent}, ${v.gender}`;
}
