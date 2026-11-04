// Public configuration. The publishable key is designed to be exposed in browsers; data access is
// enforced by Row Level Security and by the interview edge function.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://wujkhnnuptsijtyurnki.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_YyWpWmhmAyWf2aMKyXC5zQ_QKMpjNb3";
export const INTERVIEW_FUNCTION = import.meta.env.VITE_INTERVIEW_FUNCTION || "interview";
export const BASE_PATH = import.meta.env.BASE_URL || "/";
export const APP_NAME = "VocalHire";
