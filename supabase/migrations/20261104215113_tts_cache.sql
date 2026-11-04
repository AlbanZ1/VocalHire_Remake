-- Interviewer voice (Amazon Polly): audio for lines that are spoken more than once (greetings,
-- acknowledgements, closings, the voice sample). Keyed by a hash of voice + engine + text; the
-- text itself is never stored. A line's audio is kept only once it has been requested twice, so
-- one-off personalised questions are never stored. Service role only.
create table public.tts_cache (
  hash text primary key,
  voice text not null check (char_length(voice) <= 40),
  engine text not null check (engine in ('generative', 'neural')),
  chars integer not null check (chars between 1 and 2000),
  audio_b64 text check (char_length(audio_b64) <= 600000),
  hits integer not null default 1,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index tts_cache_last_used_idx on public.tts_cache (last_used_at);
alter table public.tts_cache enable row level security;
revoke all on public.tts_cache from anon, authenticated;
