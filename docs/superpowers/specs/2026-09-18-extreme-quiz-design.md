# BEEd Exam Prep Platform — Extreme Quiz Design

Status: Approved
Date: 2026-09-18

## Context

The app already has a working AI Tutor chat (`app/(app)/tutor`) and a
quiz engine (Phase 4: `quiz_attempts`/`quiz_questions` tables,
`generateTopicQuiz`/`generateQuiz`, a taking flow at
`/quiz/[attemptId]`, scoring, and weak-topic recommendations on the
dashboard). This feature adds an "Extreme Quiz" mini-game: when a
student asks the Tutor for a quiz, the tutor can offer a link into a
separate, harder, timed, game-styled quiz experience — capped at one
attempt per user per day to control OpenAI spend. Alongside this, the
app gets a small global motion/animation system and a real icon set
(`lucide-react`, already installed), replacing any emoji usage.

## Goals

- Tutor chat detects "make me a quiz" — style intent via structured AI
  output (no extra OpenAI call) and offers a CTA into Extreme Quiz.
- A new, separately-styled quiz flow (`/quiz/extreme`,
  `/quiz/extreme/[attemptId]`) reusing the existing quiz engine/tables
  with `difficulty: "extreme"`, fixed at 10 questions, with a
  per-question countdown timer and no going back.
- Server-enforced limit: 1 extreme attempt per user per Asia/Manila
  calendar day, checked both for UI state and (critically) before
  generation to protect OpenAI spend.
- A small global animation/motion system (page fade-ins, button/card
  hover-press, staggered list fade-ins) used consistently app-wide,
  with the Extreme Quiz page using bolder versions of the same
  language (timer ring, score count-up).
- `lucide-react` icons everywhere a symbol is needed; no emoji.
- Exclude `difficulty = "extreme"` attempts from weak-topic
  recommendation aggregation (existing-code fix, see Non-Goals for
  scope boundary).

## Non-Goals

- No configurable question count or difficulty picker on the Extreme
  Quiz page — it's always 10 questions, always "extreme".
- No per-user timezone preference — the daily reset boundary is
  hardcoded to Asia/Manila for everyone.
- No leaderboards, streaks, or persistent "game" meta-progression
  beyond the daily attempt itself.
- No changes to the existing (non-extreme) `/quiz` flow's UI or
  mechanics — it keeps its current picker, counts, difficulties, and
  taking experience untouched.
- No broader redesign of existing pages beyond wiring them into the
  new shared motion utilities (no new layouts, no new information
  architecture).

## Architecture

### 1. Tutor intent detection

`lib/ai/tutor.ts`'s `sendTutorMessage` currently calls
`responses.create` with plain-text output (`response.output_text`).
Change it to use structured JSON output (same `text.format:
json_schema, strict: true` pattern already used in `lib/ai/quiz.ts`):

```
{ reply: string, wants_extreme_quiz: boolean }
```

- The system prompt gains an instruction: set `wants_extreme_quiz:
  true` when the student is asking to be quizzed/tested/challenged
  (any phrasing/language), `false` otherwise.
- `reply` is saved to `ai_messages` and rendered exactly as today.
- `wants_extreme_quiz` is returned from `sendTutorMessageAction` (new
  field on its existing return type) up to `ChatThread`.
- When `true`, `ChatThread` renders a CTA button under that assistant
  message: an outlined/accented button with a `Zap` icon and label
  "Start Extreme Quiz", linking to `/quiz/extreme`. No auto-redirect —
  the user clicks through. The flag does not block or delay the
  normal reply.
- No rate-limit awareness needed in the tutor step — the flag only
  controls whether the CTA appears; the Extreme Quiz page itself is
  the source of truth for whether an attempt is actually allowed
  today (see below), so the CTA can safely appear even if today's
  attempt is already used — clicking it just lands on the locked
  state.

### 2. Extreme Quiz pages

**`app/(app)/quiz/extreme/page.tsx`** (landing/picker, Server
Component):
- On render, calls a new `getExtremeQuizStatus(userId)` (in
  `lib/quiz/extreme.ts`) which checks whether the user already has a
  `quiz_attempts` row with `difficulty = 'extreme'` and `created_at`
  within the current Asia/Manila calendar day.
- If already used: render a locked state — `Lock` icon, message
  ("You've used today's Extreme Quiz — come back tomorrow"), and a
  live countdown (client component) to the next Asia/Manila midnight.
- If not used: render the existing subject → topic picker pattern
  (reusing `/api/topics`, same interaction as `/quiz/page.tsx`'s
  subject/topic steps), ending in a single "Start Extreme Quiz"
  button (no count/difficulty choices — both are fixed). Bold/accented
  styling (red/orange), `Flame` icon on the page header.

**`app/(app)/quiz/extreme/[attemptId]/page.tsx`** (taking flow, Server
Component shell + Client Component for interaction):
- Server Component loads the attempt via the existing
  `getQuizAttempt(attemptId, userId)` (unchanged — attempt shape
  doesn't depend on difficulty) and branches the same way the current
  `/quiz/[attemptId]/page.tsx` does: `scored: false` →
  `ExtremeQuizTaker`, `scored: true` → `ExtremeQuizResult`.
- Guards against a non-extreme `attemptId` being loaded through this
  route (check `attempt.difficulty === "extreme"`, else render
  `EmptyState`) — prevents someone hand-editing the URL to view a
  normal quiz through the extreme skin.

**`components/quiz/ExtremeQuizTaker.tsx`** (new, Client Component):
- One question at a time, like `QuizTaker`, but:
  - 20-second countdown per question, shown as an animated ring
    (green → yellow → red as time runs out).
  - On timeout: that question's answer stays unset (counts wrong at
    scoring time, same as any unanswered question today), auto-
    advances to the next question.
  - No "back" navigation — once advanced (by answering or timing out),
    a question can't be revisited. This pairs with the timer: a timer
    with free backward navigation would be incoherent (nothing to
    re-earn by going back).
  - After the last question (answered or timed out), auto-submits via
    the existing `submitQuizAction` (unchanged — it's already
    difficulty-agnostic) and the page re-renders into
    `ExtremeQuizResult` via `router.refresh()`, same pattern as today.

**`components/quiz/ExtremeQuizResult.tsx`** (new): punchy score reveal
(animated count-up to `score/totalQuestions`), `Trophy` icon on a
passing score, with an expandable per-question review section
(reusing the same question/answer/explanation data `QuizReview`
already renders, but its own presentation — not a re-skin of
`QuizReview` itself, since the reveal moment is a different UX than a
plain review list).

### 3. Rate limiting

`lib/quiz/extreme.ts` (new):
- `getManilaDayBounds(now = new Date())` → `{ start: Date, end: Date
  }` for the current Asia/Manila calendar day, computed via
  `Intl.DateTimeFormat` / manual UTC+8 offset math (no new
  dependency).
- `getExtremeQuizStatus(userId)` → `{ usedToday: boolean;
  nextAvailableAt: string | null }` — queries `quiz_attempts` for
  `user_id = userId AND difficulty = 'extreme' AND created_at >=
  <manila day start, as UTC ISO>`.
- `assertExtremeQuizAllowed(userId)` — same check, throws if already
  used today. Called at the very top of the new server action below,
  *before* any OpenAI call, so a used-up limit never burns tokens
  regardless of what the client believed.

**`lib/quiz/actions.ts`** gains `startExtremeQuizAction(topicId:
string)`:
- Calls `assertExtremeQuizAllowed(user.id)` first.
- Calls `generateTopicQuiz(topicId, user.id, 10, "extreme")` (same
  function as today, just a new difficulty value and fixed count).
- On the rate-limit throw specifically, returns a typed
  `{ error: "already_used_today"; nextAvailableAt: string }` (distinct
  from the generic `{ error: string }` shape) so the client can render
  the locked/countdown state instead of a generic error banner.

### 4. Data model

No migration needed — `quiz_attempts.difficulty` is already a plain
`text` column (not a Postgres enum), so `"extreme"` stores without
schema changes. TypeScript-side, widen the difficulty union type from
`"easy" | "medium" | "hard"` to `"easy" | "medium" | "hard" |
"extreme"` everywhere it's referenced (`lib/ai/quiz.ts`,
`lib/quiz/actions.ts`, and any prop types derived from them).

`buildQuizSystemPrompt`'s difficulty string is passed straight through
to the model today; "extreme" needs its own phrasing addition so the
model understands it's a step above "hard" (e.g. "extreme" →
instruction to write questions at a level that would challenge a
top-performing reviewee: trickier distractors, less forgiving
phrasing, edge-case scenarios) rather than relying on the model to
infer meaning from the bare word.

### 5. Existing-code fix: weak-topic exclusion

`lib/quiz/weakTopics.ts`'s `getWeakTopics()` currently aggregates
every scored `quiz_attempts` row for a user with no difficulty filter.
Add `.neq("difficulty", "extreme")` to that initial `quiz_attempts`
query. Rationale: Extreme questions are deliberately much harder than
normal difficulty by design, so folding their (expectedly lower)
accuracy into the same per-topic average would misrepresent a
student's actual standing on that topic at normal study difficulty —
this would directly undermine the accuracy of the feature we're
shipping right next to it.

### 6. Global animation/motion system

`app/globals.css` gains a small set of reusable primitives:
- CSS custom properties for duration/easing tokens (e.g.
  `--motion-fast: 150ms`, `--motion-base: 250ms`, `--motion-ease:
  cubic-bezier(...)`), so every animated element in the app shares the
  same timing feel.
- A `@keyframes fade-in` (+ `.animate-fade-in` utility class) applied
  to: route-level content on mount (page shells), and staggered onto
  list items (search results, library cards, quiz answer choices) via
  a small `animation-delay` per-index inline style — no new JS
  animation library.
- `components/ui/button.tsx` and `components/ui/card.tsx` gain subtle
  hover/press transitions (`transition-transform`,
  `active:scale-[0.98]`, `hover:shadow-sm`) using the shared duration
  tokens, so every existing button/card in the app (search, library,
  quiz, tutor, dashboard) picks this up automatically without
  per-page changes.
- The Extreme Quiz page builds on top of the same tokens for its
  bespoke pieces (timer ring stroke animation, score count-up) so the
  motion feels like the same design system turned up, not a different
  one bolted on.

### 7. Icons

Replace any emoji usage with `lucide-react` icons (already a
dependency): `Zap` (Extreme Quiz CTA/branding), `Flame` (extreme
difficulty badge), `Trophy` (passing result), `Timer` (countdown),
`Lock` (locked/already-used state).

## Error Handling

- `startExtremeQuizAction`'s rate-limit branch never reaches OpenAI —
  the check happens before `generateTopicQuiz` is called.
- If `generateTopicQuiz` itself fails (OpenAI error, parsing error —
  same failure modes as the existing quiz flow), `ExtremeQuizTaker`'s
  parent page shows the same generic error-banner pattern the existing
  `/quiz` flow uses today; no new error handling design needed there.
- Tutor's structured-output parse failure (malformed JSON from the
  model) falls back to treating `wants_extreme_quiz` as `false` and
  still shows whatever `reply` text was recovered — never blocks the
  chat from functioning if the flag extraction fails.

## Testing

Manual verification via `npm run build && npm run start`, consistent
with every prior phase (no automated test framework in this repo):
- Tutor: ask for a quiz in various phrasings, confirm the CTA appears;
  ask an unrelated question, confirm it doesn't.
- Extreme Quiz: full run (pick subject/topic → 10 timed questions,
  including at least one deliberate timeout → result screen).
- Rate limit: attempt a second extreme quiz same day → confirm locked
  state, confirm `startExtremeQuizAction` itself rejects even if
  called directly (not just the page's picker being hidden).
- Confirm weak-topics on the dashboard are unaffected by an extreme
  attempt's score.
- Visual check of global motion on existing pages (search, library,
  dashboard) — hover/press states and fade-ins present and consistent.

## Explicitly Deferred

- Per-user timezone preference for the daily reset.
- Configurable Extreme Quiz length/difficulty tiers beyond the single
  fixed "extreme" tier.
- Leaderboards, streaks, or other persistent game meta-progression.
