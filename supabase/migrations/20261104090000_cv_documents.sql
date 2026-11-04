-- CV & job-posting features: CV text and profiles on interviews, saved CV reviews, a cache for
-- (costly) document analyses, and a generic rate-limit log.

alter table public.interview_sessions
  add column candidate_cv text check (char_length(candidate_cv) <= 20000),
  add column cv_profile jsonb,
  add column job_profile jsonb,
  add column cv_review jsonb;

-- Saved CV reviews. Guests reopen theirs with a secret token (only its hash is stored);
-- signed-in users read their own through RLS.
create table public.cv_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  role_title text check (char_length(role_title) <= 160),
  company text check (char_length(company) <= 160),
  match_score numeric(5, 2),
  quality_score numeric(5, 2),
  result jsonb not null,
  engine text,
  access_token_hash text not null,
  client_ip_hash text,
  created_at timestamptz not null default now()
);
create index cv_reviews_user_idx on public.cv_reviews (user_id, created_at desc);

alter table public.cv_reviews enable row level security;
revoke all on public.cv_reviews from anon, authenticated;
-- Column-level read access: the token and IP hashes are never readable through the API.
grant select (id, user_id, role_title, company, match_score, quality_score, result, engine, created_at) on public.cv_reviews to authenticated;
grant delete on public.cv_reviews to authenticated;
create policy "cv_reviews: owner reads" on public.cv_reviews
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cv_reviews: owner deletes" on public.cv_reviews
  for delete to authenticated using (user_id = (select auth.uid()));

-- Cache of model-generated document analyses, keyed by a hash of the inputs. Service role only.
create table public.document_analyses (
  hash text primary key,
  kind text not null check (kind in ('documents', 'review', 'job')),
  result jsonb not null,
  engine text not null,
  created_at timestamptz not null default now()
);
create index document_analyses_created_idx on public.document_analyses (created_at);
alter table public.document_analyses enable row level security;
revoke all on public.document_analyses from anon, authenticated;

-- Generic per-key, per-action rate-limit log (keys are user ids or salted IP hashes). Service role only.
create table public.api_rate_events (
  id bigint generated always as identity primary key,
  key text not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index api_rate_events_lookup_idx on public.api_rate_events (key, action, created_at desc);
create index api_rate_events_created_idx on public.api_rate_events (created_at);
alter table public.api_rate_events enable row level security;
revoke all on public.api_rate_events from anon, authenticated;
