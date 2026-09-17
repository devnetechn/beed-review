# BEEd Exam Prep Platform — Phase 1 Design

Status: Approved
Date: 2026-09-17

## Context

Long-term product: an AI-powered research assistant that helps BEEd/LET
students discover legally accessible study resources on the web
(OERs, open-access materials, public-domain resources), organize them
in a personal library, and study from them via AI summarization,
quizzes, and tutoring. Full concept, statuses, and legal principles are
defined in the original product brief (see conversation history / repo
README once written).

The product ships in 5 phases. This document specs **Phase 1 only**:
project scaffolding, mobile-first UI shell, Supabase auth, full
database schema, and a working (non-AI) search over subjects/topics/
seeded resources. Phases 2–5 (AI research, summarization/tutor/quiz
generation, quiz engine + progress tracking, PWA/offline) get their
own specs when we get there.

The repository (`C:\Users\admin\Videos\web2print\Reviewer`) was empty
at the start of this work — this is a greenfield project, not a
migration of existing code.

## Goals (Phase 1)

- Working Next.js + TypeScript + Tailwind app, npm-managed.
- Mobile-first UI (360–430px target) with bottom navigation
  (Home/Search/Library/Quiz/Tutor); desktop gets the same content,
  wider column, bottom nav becomes a left sidebar at `md:`.
- Supabase Auth: email/password + Google OAuth.
- Full 13-table database schema created now (even though several
  tables are unused until later phases), with RLS.
- Real (non-AI) full-text search across subjects, topics, and a small
  set of manually curated, hand-verified seed resources.
- Personal resource library: save/unsave, list, open original URL.
- No AI calls in this phase. `lib/ai/` and `lib/research/` exist as
  stub modules with defined interfaces so Phase 2 can be added without
  touching UI code.

## Non-Goals (Phase 1)

- No OpenAI integration, no web search/AI researcher.
- No summarization, tutor, or quiz generation logic.
- No PWA manifest/service worker (Phase 5).
- No automated test framework setup (ask before Phase 2 if desired).
- No git init/commit — left to the user to decide when to initialize
  and commit.

## Tech Stack

- Next.js 14 (App Router), TypeScript
- Tailwind CSS
- shadcn/ui components (Radix primitives), restyled away from default
  shadcn look to a plain, focused study-app aesthetic — no generic AI
  SaaS gradients/glassmorphism/hero sections.
- Supabase (Postgres + Auth), `@supabase/ssr` for server/client helpers
- npm

## Folder Structure

```
app/
  (auth)/login/page.tsx
  (auth)/signup/page.tsx
  (app)/page.tsx                 # Study Dashboard, auth-gated
  (app)/search/page.tsx
  (app)/library/page.tsx
  (app)/quiz/page.tsx            # placeholder
  (app)/tutor/page.tsx           # placeholder
  (app)/subjects/[slug]/page.tsx
  (app)/topics/[slug]/page.tsx
  layout.tsx
  globals.css
components/
  ui/                            # shadcn primitives, restyled
  nav/BottomNav.tsx
  nav/SideNav.tsx
  resource/ResourceCard.tsx
  resource/LicenseBadge.tsx
lib/
  ai/                            # STUB — Phase 2/3
  research/                      # STUB — Phase 2
  sources/                       # seed data + source-of-record helpers
  supabase/
    client.ts                    # browser client
    server.ts                    # server client (RSC/server actions)
    middleware.ts                # session refresh
  search/
    searchResources.ts           # server action, Postgres FTS RPC call
types/
  database.ts                    # generated Supabase types
supabase/
  migrations/
    0001_init_schema.sql
  seed.sql
```

`lib/ai/` and `lib/research/` each get a single `index.ts` this phase
exporting typed function signatures that throw
`Error("Not implemented — Phase 2/3")`, so imports elsewhere compile
but nothing pretends to work.

## Database Schema

All tables: `id uuid primary key default gen_random_uuid()`,
`created_at timestamptz default now()`. Tables that are user-mutable
also get `updated_at timestamptz default now()` maintained by a
trigger.

Enum:
```sql
create type license_status as enum (
  'OPEN_LICENSE', 'PUBLIC_DOMAIN', 'OPEN_ACCESS',
  'LICENSE_UNCLEAR', 'COPYRIGHTED', 'NOT_RECOMMENDED'
);
```

**profiles** — mirrors `auth.users`, one row per user (created via
trigger on signup). `id uuid references auth.users primary key`,
`display_name text`, `created_at`.

**subjects** — `id`, `slug text unique`, `name text`, `description
text`, `sort_order int`, `created_at`. Seeded with the 13 BEEd/LET
subjects from the brief.

**topics** — `id`, `subject_id uuid references subjects`, `slug text`,
`name text`, `description text`, `created_at`. Unique on
`(subject_id, slug)`.

**resources** — `id`, `title text`, `author text`, `source text`
(publisher/institution name), `original_url text not null`,
`description text`, `resource_type text` (e.g. `article`, `pdf`,
`course_material`, `study_guide`, `practice_questions`), `license
text` (raw license string, e.g. "CC BY 4.0"), `license_status
license_status not null`, `license_evidence text` (why this status was
assigned — url/quote/reasoning), `content_location text` (where the
actual content lives — usually same as original_url), `date_found
timestamptz default now()`, `last_checked timestamptz default now()`,
`created_by uuid references auth.users` (null for system-seeded),
`created_at`, `updated_at`.

**resource_topics** — join table, `resource_id`, `topic_id`, unique on
the pair.

**saved_resources** — `id`, `user_id uuid references auth.users`,
`resource_id uuid references resources`, `created_at`. Unique on
`(user_id, resource_id)`.

**research_queries** *(dormant until Phase 2)* — `id`, `user_id`,
`query_text text`, `topic_id uuid nullable`, `created_at`.

**research_results** *(dormant until Phase 2)* — `id`,
`research_query_id`, `resource_id`, `created_at`.

**quiz_attempts** *(dormant until Phase 4)* — `id`, `user_id`,
`resource_id nullable`, `topic_id nullable`, `score int`,
`total_questions int`, `difficulty text`, `created_at`.

**quiz_questions** *(dormant until Phase 3/4)* — `id`,
`quiz_attempt_id`, `question_text text`, `choices jsonb`,
`correct_answer text`, `explanation text`, `is_ai_generated boolean
default true`, `created_at`.

**ai_conversations** *(dormant until Phase 3)* — `id`, `user_id`,
`resource_id nullable`, `title text`, `created_at`.

**ai_messages** *(dormant until Phase 3)* — `id`, `conversation_id`,
`role text` (`user`/`assistant`), `content text`, `created_at`.

**study_notes** *(dormant until Phase 3/4)* — `id`, `user_id`,
`resource_id nullable`, `topic_id nullable`, `content text`,
`created_at`, `updated_at`.

### RLS

- `subjects`, `topics`, `resources`, `resource_topics`: public
  `select`; `insert`/`update`/`delete` restricted to service role only
  (no client-side writes — prevents user-submitted resource spam;
  Phase 2's AI pipeline writes via service role from a server-only
  context).
- `profiles`, `saved_resources`, `research_queries`,
  `research_results`, `quiz_attempts`, `quiz_questions`,
  `ai_conversations`, `ai_messages`, `study_notes`: all CRUD scoped to
  `auth.uid() = user_id` (or via join to owning row for child tables
  like `quiz_questions`/`ai_messages`).

## Search (Phase 1 scope)

Postgres full-text search using a generated `tsvector` column on
`resources` (title + description + author) and simple `ilike`/FTS
matching on `subjects.name`/`topics.name`. Exposed via a Postgres
function `search_resources(query text)` called through a Supabase RPC
from a server action in `lib/search/searchResources.ts`. Returns
merged, ranked results from all three sources with a `result_kind`
discriminator (`subject | topic | resource`) so the UI can render
appropriately.

No external web calls. This is intentionally simple — Phase 2 replaces
"search finds nothing" with a live "Research this topic" AI action,
not by making Phase 1's search fancier.

## UI

**Resource Card** shows: title, short description, source, resource
type, a `LicenseBadge` (green "Open License" for
`OPEN_LICENSE`/`PUBLIC_DOMAIN`/`OPEN_ACCESS`, amber "License Unclear"
for `LICENSE_UNCLEAR`, neutral/red hidden-by-default for
`COPYRIGHTED`/`NOT_RECOMMENDED` — these statuses are excluded from
seed data and Phase 1 search results entirely, since Phase 1 has no
mechanism to surface them responsibly), topics as small chips, and
`[Open]`/`[Save]` actions. `LICENSE_UNCLEAR` never implies
redistributable — badge copy and color must not read as "free to use."

**Dashboard** sections: greeting, search entry point, Recently Saved
(from `saved_resources`), Recommended Topics (static list for Phase 1,
personalization is Phase 4), and disabled-looking "AI Research" /
"Take a Quiz" / "Ask AI Tutor" entries that route to the Phase 1
placeholder pages.

**Bottom nav**: Home / Search / Library / Quiz / Tutor, 5 large touch
targets, active state clearly indicated. Becomes a left sidebar at
`md:` breakpoint, same routes.

## Error Handling

- Supabase errors (auth, query) surface via an inline banner/toast
  component, never swallowed silently.
- Auth forms show field-level validation errors.
- Empty search results show a friendly empty state (not blank),
  distinct from a loading state.
- Unauthenticated access to `(app)/*` routes redirects to `/login`.

## Testing (Phase 1)

Manual verification via `npm run dev`: signup/login (both methods),
search returns seeded results, save/unsave persists and appears in
Library, unauthenticated redirect works, mobile viewport (360–430px)
and desktop both render correctly. No automated test framework is
added in this phase — will confirm with the user before Phase 2
whether to introduce Vitest/Playwright.

## Explicitly Deferred

- git init / first commit — left for the user to trigger.
- PWA manifest, service worker, offline shell — Phase 5.
- Any `OPENAI_API_KEY` usage — Phase 2+, and even then server-only,
  never exposed to the browser.
