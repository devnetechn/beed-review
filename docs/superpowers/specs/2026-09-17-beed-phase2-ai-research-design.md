# BEEd Exam Prep Platform — Phase 2 Design: AI Research Service

Status: Approved
Date: 2026-09-17

## Context

Phase 1 shipped the app shell, auth, full DB schema, and search/save over a
small set of manually-curated open resources (`docs/superpowers/specs/2026-09-17-beed-exam-prep-phase1-design.md`).
This document specs **Phase 2**: the AI research service that discovers new,
legally-accessible open resources on the web for a given BEEd topic, using
OpenAI's Responses API. Phases 3–5 (summarization/tutor/quizzes, quiz
engine + progress tracking, PWA/offline) remain out of scope here.

## Goals (Phase 2)

- Real `lib/research/researchTopic(query)` implementation (replacing the
  Phase 1 stub) that:
  1. Checks `research_queries` for a recent (30-day) matching search and
     reuses cached `research_results` instead of re-calling OpenAI.
  2. Otherwise calls OpenAI's Responses API with the hosted `web_search`
     tool and a strict JSON schema, using a system prompt that encodes
     this product's legal/ethical research rules.
  3. Upserts discovered resources into `resources` (deduped by
     `original_url`), links them to topics via `resource_topics`, and
     records the query + result links in `research_queries` /
     `research_results`.
- A "Research this topic" action on the Search page that calls this
  service via a server action and renders results as `ResourceCard`s.
- A soft per-user daily cap on AI research calls (cost control).
- `OPENAI_API_KEY` stays server-only (server action / route handler),
  never sent to the browser.

## Non-Goals (Phase 2)

- No summarization, tutor chat, or quiz generation (`lib/ai/` stays
  stubbed for those — Phase 3).
- No background job queue — research runs synchronously on request.
- No second search vendor (Tavily/Bing/etc.) — OpenAI's hosted
  `web_search` tool is the only search mechanism, per explicit user
  direction to keep a single AI provider.
- No changes to the Phase 1 schema — `research_queries` and
  `research_results` already exist and are unused until now.

## Tech Stack Addition

- `openai` npm package (official SDK), server-only usage.
- Env var additions: `OPENAI_API_KEY` (secret, server-only),
  `OPENAI_MODEL` (e.g. a current GPT model name — configurable so it can
  change without a code edit).

## Architecture

```
Search page ("Research this topic" button)
  → researchTopicAction(query, subjectSlug?)   [server action, lib/research/actions.ts]
    → lib/research/index.ts: researchTopic(query, userId)
      1. normalize query text (lowercase, trim)
      2. check research_queries for a match within 30 days
         → if found: join research_results → resources, return them
      3. else: check per-user daily cap (research_queries count, last 24h)
         → if over cap: throw a user-facing "daily limit reached" error
      4. else: call OpenAI Responses API (web_search tool, json_schema output)
      5. parse + validate response against Zod schema
      6. for each candidate resource:
         - upsert into `resources` by `original_url` (insert if new)
         - upsert into `resource_topics` (match/create topic rows as needed)
      7. insert one `research_queries` row (user_id, query_text, topic_id?)
      8. insert `research_results` rows linking the query to each resource
      9. return ResourceHit[] (same shape Search already renders)
  → results rendered via existing ResourceCard component
```

### Query caching / freshness

`research_queries.query_text` is matched case-insensitively after
trimming/lowercasing (`lower(trim(query_text)) = lower(trim($1))`) against
rows from any user (resources are shared, not per-user) created within the
last 30 days. On a hit, join `research_results` for that query to the
current `resources` table and return them — no OpenAI call. This directly
implements the spec's "avoid unnecessarily repeating the same research."

### OpenAI call shape

- Endpoint: OpenAI Responses API (`client.responses.create`).
- `tools: [{ type: "web_search" }]` — the hosted web search tool.
- `text.format`: strict JSON schema requiring an array of objects with:
  `title`, `author` (nullable), `source`, `original_url`, `description`,
  `resource_type` (enum: article/pdf/course_material/study_guide/
  practice_questions), `license` (nullable raw string), `license_status`
  (enum matching the DB enum exactly), `license_evidence`, `topics`
  (array of 1-4 short strings).
- System prompt encodes (verbatim rules, not paraphrased at call time):
  - Search only for Open Educational Resources, open-access materials,
    public-domain resources, official/government educational resources,
    university repositories, and openly-licensed study guides.
  - Never search for or return pirated/leaked copies of named commercial
    reviewer books.
  - Prioritize the original/primary source over aggregators or blogs
    republishing content.
  - Assign `license_status` conservatively: `OPEN_LICENSE` only when the
    source page explicitly states a license; `PUBLIC_DOMAIN` only when
    explicitly stated or the source is a government body; `OPEN_ACCESS`
    when freely readable but reuse terms are unstated; `LICENSE_UNCLEAR`
    whenever uncertain — never guess `OPEN_LICENSE` to look better.
  - `license_evidence` must state what on the page justifies the status.
  - Topic requested is a BEEd/LET subject area (list of 13 subjects
    passed in context) — stay on-topic; do not return unrelated results.

### Rate limiting

Before calling OpenAI, count `research_queries` rows for the current
`user_id` created in the last 24 hours. If ≥ 20, return a friendly error
("You've hit today's research limit — try again tomorrow, or search your
existing library") without calling OpenAI. This is an application-level
soft cap, not a hard infra rate limiter — sufficient for Phase 2.

## UI Changes

**Search page**: after a DB search (Phase 1's `searchAll`) returns, add a
"Research this topic with AI" button below the results (shown always, not
just on empty results — the student may want more than the seed library
has). Tapping it calls `researchTopicAction`, shows a loading state
("Researching… this can take up to 30 seconds"), then appends AI-found
`ResourceCard`s below the DB results, each with a small "AI-found" badge
next to the license badge so it's visually distinct from hand-curated
seed resources. Errors (rate limit, OpenAI failure, zero results) render
via the existing `ErrorBanner` / `EmptyState` components.

**ResourceCard**: gains an optional `aiFound?: boolean` prop that renders
a small neutral "AI-found" tag. `[Summarize]`/`[Generate Quiz]` buttons
are NOT added yet (Phase 3) — cards show `[Open]`/`[Save]` only, same as
Phase 1.

## Error Handling

- OpenAI API errors (network, auth, rate limit from OpenAI itself) are
  caught and surfaced as a single `ErrorBanner` message; never silently
  swallowed.
- A response that fails Zod validation is treated as an error (log
  server-side, show generic "research failed, try again" to the user) —
  never passed through partially-validated.
- Zero valid resources found (after filtering out anything that fails
  schema or duplicates an existing resource with nothing new to add) 
  shows an empty-state message distinct from a hard error.

## Testing (Phase 2)

Manual verification via `npm run dev` against the real Supabase +
OpenAI projects: run 2-3 real research queries for different BEEd
topics, inspect the resulting `resources`/`research_queries`/
`research_results` rows directly in Postgres, re-run the same query to
confirm the cache hit path skips a second OpenAI call, and confirm the
daily cap trips after enough requests. No automated test framework,
consistent with Phase 1.

## Explicitly Deferred

- Any second search API vendor.
- Background/async research jobs.
- Summarize/Generate Quiz actions on AI-found cards (Phase 3).
- Per-topic or per-subject research quotas beyond the flat daily cap.
