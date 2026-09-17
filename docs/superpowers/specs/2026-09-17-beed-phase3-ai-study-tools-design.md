# BEEd Exam Prep Platform — Phase 3 Design: AI Summarization, Tutor, Quiz Generation, Study Notes

Status: Approved
Date: 2026-09-17

## Context

Phases 1-2 shipped the app shell, auth, schema, manual + AI-assisted
resource discovery, and a personal library
(`docs/superpowers/specs/2026-09-17-beed-exam-prep-phase1-design.md`,
`docs/superpowers/specs/2026-09-17-beed-phase2-ai-research-design.md`).
This document specs **Phase 3**: the three remaining AI study features
from the original brief — summarization, the AI tutor, and AI-generated
quizzes — plus study notes, which falls out of summarization rather than
being a separate feature (see below). Phase 4 ("Quiz engine, Progress
tracking, Weak-topic detection, Personalized recommendations" per the
original phase breakdown) is explicitly **not** this phase — Phase 3
generates quiz questions; actually *taking* a scored quiz is Phase 4.

This phase is larger than Phase 1 or 2 individually — it bundles three
separable features. The plan will reflect that with proportionally more
tasks, but all three share the same underlying OpenAI client pattern, so
there's real code reuse across them, not three unrelated subsystems.

## Decisions Made Without a Separate Chat Round (flagged for visibility)

You asked me to go straight to the spec this time, so these are the
architecture calls I made unilaterally, each traceable to a principle
you already established in the original brief or earlier phases:

1. **Content depth is gated by `license_status`.** Summarizing well
   requires reading the actual resource content, not just its stored
   title/description. But your own principle — "if license unclear,
   link don't copy" — implies a limit on how deeply we should ingest a
   resource's full text server-side. So: for `OPEN_LICENSE`,
   `PUBLIC_DOMAIN`, and `OPEN_ACCESS` resources, Phase 3 fetches and
   parses the source page and summarizes from real content. For
   `LICENSE_UNCLEAR`, it summarizes from stored metadata only (title,
   description, topics) — a shallower, clearly-labeled summary — rather
   than fetching and processing the full page. `COPYRIGHTED` /
   `NOT_RECOMMENDED` resources never reach this code path since they're
   already excluded everywhere upstream.
2. **PDF resources get metadata-only summaries in Phase 3.** Parsing
   PDF text server-side is a real feature (new dependency, extraction
   edge cases) I'm not pulling in for this phase. `resource_type: pdf`
   resources summarize from stored metadata the same way
   `LICENSE_UNCLEAR` ones do, regardless of license status. HTML pages
   (`article`, `course_material`, `study_guide`) get full-content
   summaries when license allows it.
3. **Study Notes = the persisted summary, not a separate note-taking
   UI.** The `study_notes` table has existed unused since Phase 1. Your
   brief doesn't describe a distinct manual note-taking feature —
   summarization's output (key concepts, definitions, exam-focused
   notes, etc.) *is* naturally what belongs in `study_notes`. So
   generating a summary persists it there (one row per user+resource,
   editable afterward); there's no separate "write your own notes from
   scratch" feature in this phase.
4. **Quiz generation stops at generation.** Phase 3 creates
   `quiz_questions` under a `quiz_attempts` row and shows them
   immediately with answers/explanations revealed (clearly labeled "AI
   Generated," per your explicit requirement) — a study aid, not a
   timed test. Answering, scoring, and `quiz_attempts.score` stay null
   until Phase 4's quiz engine.
5. **No streaming for the tutor chat.** Plain request/response, not
   token-by-token streaming. Simpler to build and verify; revisit if the
   UX feels too slow once it's real.
6. **Reusing `OPENAI_MODEL`** (already configured from Phase 2) for all
   three features — one model config for the whole app.

## Goals (Phase 3)

- Real `lib/ai/summarizeResource`, `lib/ai/generateQuiz`,
  `lib/ai/tutorChat` implementations (replacing the Phase 1 stubs).
- Content fetching + HTML-to-text extraction for eligible resources.
- `[Summarize]` action on `ResourceCard` (Search + Library) → shows key
  concepts, definitions, names/theories, facts, exam-focused notes, and
  a simple explanation; persists to `study_notes`.
- `[Generate Quiz]` action → question-count (5/10/20/50) and difficulty
  (easy/medium/hard) picker → AI-generated multiple-choice questions
  with answers + explanations, clearly labeled "AI Generated."
- `[Ask AI]` action → opens a tutor conversation scoped to that
  resource (pre-seeded with its context) using `ai_conversations` /
  `ai_messages`.
- A general `/tutor` page (not resource-scoped) for open BEEd/LET
  questions, replacing the Phase 1 placeholder.
- The tutor stays on-topic (BEEd/LET education content) and supports
  the example interactions from the brief: "Explain this topic," "Make
  this easier," "Give me examples," "Give me a memory trick," "Quiz
  me," and direct content questions.

## Non-Goals (Phase 3)

- No scored/timed quiz-taking flow, no progress tracking, no
  weak-topic detection (Phase 4).
- No PDF text extraction.
- No streaming chat responses.
- No manual (non-AI-generated) note editing UI beyond editing the
  persisted summary text itself.
- No changes to Phase 1/2 schema beyond what's already unused-but-ready
  (`ai_conversations`, `ai_messages`, `quiz_attempts`, `quiz_questions`,
  `study_notes` all already exist).

## Tech Stack Addition

- `cheerio` (HTML parsing/text extraction) for turning a fetched HTML
  page into clean readable text before summarization.
- Reuses `openai`, `zod`, and the service-role Supabase client from
  Phase 2 — no new API keys or env vars needed.

## Architecture

### Shared: content fetching

`lib/ai/fetchContent.ts` — given a `resource` row, decides how much
content to gather:

```
if resource_type === 'pdf' → return null (metadata-only path)
else if license_status === 'LICENSE_UNCLEAR' → return null (metadata-only path)
else → fetch(original_url) with a timeout (10s) and size cap (~2MB),
       parse with cheerio, strip nav/script/style/footer, extract main
       text, truncate to ~12,000 characters
```

A `null` return means the caller falls back to a metadata-only prompt
(title + description + topics only) instead of failing — fetch
failures (404, timeout, blocked) degrade to metadata-only rather than
erroring the whole summarize/quiz request.

### Summarization

```
User taps [Summarize] on a ResourceCard
  → summarizeResourceAction(resourceId) [server action]
    → check for an existing study_notes row for (user, resource) newer
      than 7 days → if found, return it (avoid re-summarizing unchanged
      content on every click)
    → else: load resource row, fetchContent(resource)
    → call OpenAI (structured JSON: key_concepts[], definitions[],
      names_and_theories[], facts[], exam_notes[], simple_explanation)
    → format into a single markdown-ish content string
    → upsert into study_notes (user_id, resource_id, content)
    → return the note
  → UI shows it in a sheet/panel, with a note that it's AI-generated
    and to verify against the original source
```

### AI Tutor

Two entry points, same underlying chat mechanism:

- **General** (`/tutor`): creates/continues an `ai_conversations` row
  with `resource_id = null`. System prompt: general BEEd/LET tutor,
  stay on-topic, refuse unrelated requests.
- **Resource-scoped** (`[Ask AI]` on a card): creates/continues an
  `ai_conversations` row with `resource_id` set. System prompt includes
  the resource's title/description/topics (and fetched content when
  available, same eligibility rule as summarization) as context.

```
User sends a message
  → tutorChatAction(conversationId | null, resourceId | null, message)
    → if conversationId is null, create a new ai_conversations row
      (title = first ~50 chars of the message)
    → insert the user's ai_messages row
    → load prior messages in this conversation (last 20, for context)
    → call OpenAI with system prompt + message history
    → insert the assistant's ai_messages row
    → return { conversationId, reply }
```

### Quiz Generation

```
User taps [Generate Quiz] → picks count (5/10/20/50) + difficulty
  → generateQuizAction(resourceId, count, difficulty)
    → load resource, fetchContent(resource) (same eligibility rule)
    → call OpenAI (structured JSON: array of {question, choices[4],
      correct_answer, explanation})
    → insert one quiz_attempts row (resource_id, difficulty,
      total_questions = count, score = null)
    → insert quiz_questions rows (is_ai_generated = true)
    → return the questions for immediate display
  → UI shows all questions with choices, the correct answer
    highlighted, and each explanation — labeled "AI Generated —
    practice questions, not official LET items"
```

## UI Changes

**ResourceCard**: gains `[Summarize]` and `[Generate Quiz]` buttons
(alongside existing `[Open]`/`[Save]`), used identically in Search and
Library. Library additionally gets `[Ask AI]` per the original brief's
Library actions list.

**Summarize**: opens a `Sheet` (shadcn) showing the structured summary
sections. A "regenerate" option is NOT included in Phase 3 (YAGNI —
the 7-day freshness reuse is the only caching behavior).

**Generate Quiz**: tapping opens a small `Dialog` to pick count +
difficulty, then navigates to (or renders inline) the generated
question list.

**Tutor**: `/tutor` becomes a real chat UI — message list + input box,
matching the mobile-first patterns from Phase 1 (large touch targets,
readable text). Resource-scoped conversations reuse the same chat
component, opened from a card's `[Ask AI]` button, with a small header
showing which resource the conversation is about.

## Error Handling

- Fetch failures degrade to metadata-only summarization (never a hard
  error to the user) — logged server-side, not surfaced as a failure.
- OpenAI errors for any of the three features surface via the existing
  `ErrorBanner`.
- Tutor messages that fail to send show an inline retry affordance
  rather than losing the user's typed message.

## Testing (Phase 3)

Manual verification via `npm run dev` against the real Supabase +
OpenAI projects, same approach as Phases 1-2: summarize a real
`OPEN_LICENSE` HTML resource and confirm the notes are genuinely
derived from its content (not generic), summarize a `LICENSE_UNCLEAR`
resource and confirm it's metadata-only, generate quizzes at a couple
of question counts/difficulties and inspect the stored rows, and run a
multi-turn tutor conversation (general and resource-scoped) confirming
history is preserved across messages. No automated test framework.

## Explicitly Deferred

- PDF content extraction.
- Scored/interactive quiz-taking (Phase 4).
- Streaming tutor responses.
- Manual note editing beyond the AI-generated summary text.
- Progress tracking / weak-area detection (Phase 4).
