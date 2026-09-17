# BEEd Exam Prep Platform — Phase 4 Design: Quiz Engine, Progress Tracking, Weak-Topic Detection, Recommendations

Status: Approved
Date: 2026-09-17

## Context

Phases 1-3 shipped the app shell, resource discovery (manual + AI),
and AI study tools — summarization, tutor, and quiz *generation* (which
stops at an immediate answers-revealed study preview, per Phase 3's
explicit scope boundary). This document specs **Phase 4**, the last
functional phase before PWA/offline work: actually *taking* a scored
quiz, tracking quiz history, detecting weak topics from real
performance data, and replacing the Dashboard's static "Recommended
for You" with something derived from that data.

## Decisions Made Without a Separate Chat Round (flagged for visibility)

Same pattern as Phase 3 — you asked for the spec directly, so here's
what I decided and why:

1. **A schema change is required.** `quiz_questions` has no column to
   record what the user actually picked — only `correct_answer`. Weak-
   topic detection and scoring both need this. Migration
   `0003_quiz_questions_selected_answer.sql` adds a nullable
   `selected_answer text` column. This is the only schema change in
   this phase.
2. **Topic-level quizzes are new.** Phase 3's `generateQuiz` only
   quizzes from a single resource. The Dashboard's "Take a Quiz" entry
   point (present since Phase 1, currently a placeholder) needs to quiz
   a *topic* the student picks, not a specific saved resource. A new
   `generateTopicQuiz(topicId, ...)` pulls light context (title +
   description) from up to 3 resources tagged with that topic — not
   full-page fetches, to keep this generation pass cheap — and falls
   back to the AI's own knowledge of the topic if none exist yet.
   `quiz_attempts.topic_id` (unused since Phase 1) is exactly what this
   was for.
3. **Quiz-taking requires picking a specific topic, not just a
   subject.** The `/quiz` flow is subject → topic → count/difficulty →
   start. A topic is required so weak-topic detection and
   `quiz_attempts.topic_id` have something concrete to attribute to.
4. **No resume-after-refresh mid-quiz.** Answers are held in client
   state and only written to the database on final submit. Refreshing
   mid-quiz restarts that attempt's question flow from the beginning
   (the questions themselves are already persisted and unchanged; only
   in-progress answer selections are lost). Revisit if this turns out
   to matter in practice.
5. **Weak-topic detection runs in application code, not a SQL
   aggregate function.** It joins `quiz_attempts` → `quiz_questions` →
   (`topics` directly, or via `resource_topics` for resource-scoped
   attempts) in a few JS-side queries rather than a new Postgres
   function. Simpler to read and debug; revisit for a real SQL
   aggregate if a user's attempt history grows large enough for this to
   matter (unlikely at this app's expected scale).
6. **Recommendation fallback is two-tier, not three.** "Recommended for
   You" uses weak topics when there's enough quiz history; otherwise it
   falls back straight to the Phase 1 static defaults ("Teaching
   Profession," "Curriculum Development"). I considered a middle tier
   deriving recommendations from saved-resources' subjects, but the
   Supabase nested-select needed for that join added real complexity
   for a fallback-of-a-fallback path — not worth it yet.
7. **Quiz-taking UI is one question at a time** (with a progress
   indicator and a Submit button on the last question), not all
   questions on one long scrollable page — better fit for mobile and
   for up to 50 questions.

## Goals (Phase 4)

- `quiz_questions.selected_answer` column (migration).
- `generateTopicQuiz(topicId, userId, count, difficulty)` in
  `lib/ai/quiz.ts`, alongside Phase 3's resource-scoped `generateQuiz`.
- A real `/quiz` flow: pick subject → pick topic → pick count/difficulty
  → generate → redirect to `/quiz/[attemptId]`.
- `/quiz/[attemptId]`: shows the question-by-question taking UI when
  unscored, or the scored review (correct/incorrect per question +
  explanations) when already submitted.
- `submitQuiz(attemptId, userId, answers)`: scores the attempt, writes
  `selected_answer` per question, sets `quiz_attempts.score`.
- `getWeakTopics(userId)`: topics with the lowest accuracy across
  scored attempts (resource-scoped attempts attributed via
  `resource_topics`, topic-scoped attempts attributed directly).
- Dashboard gets three real sections replacing static/placeholder
  content: **Recent Quizzes** (last few scored attempts), **Weak
  Areas** (from `getWeakTopics`), and a **Recommended for You** that
  now derives from weak topics (falling back to the existing static
  defaults).

## Non-Goals (Phase 4)

- No quiz timer, no question flagging/review-later UX.
- No resume-after-refresh mid-quiz (see decision 4).
- No graphs/trends — "progress tracking" here means a simple recent-
  attempts list, not a charting feature.
- No changes to Phase 3's resource-scoped `[Generate Quiz]` immediate-
  reveal study flow — it stays exactly as it is; this phase adds a
  parallel, separate scored flow.

## Architecture

### Quiz-taking flow

```
/quiz (client wizard)
  1. pick a subject (from lib/sources/subjects.ts's static list)
  2. fetch that subject's topics (GET /api/topics?subject=<slug>)
  3. pick a topic
  4. pick count (5/10/20/50) + difficulty (easy/medium/hard)
  5. startTopicQuizAction(topicId, count, difficulty)
       → generateTopicQuiz(...) → creates quiz_attempts (topic_id set,
         score null) + quiz_questions (selected_answer null)
       → returns { attemptId }
  6. router.push(`/quiz/${attemptId}`)

/quiz/[attemptId] (server component, loads via getQuizAttempt)
  if not yet scored:
    → <QuizTaker> (client): one question at a time, Next/Previous,
      local state for selections, "Submit Quiz" on the last question
      → submitQuizAction(attemptId, answers) → router.refresh()
        (page now re-renders in "scored" mode)
  if scored:
    → <QuizReview> (server-rendered): score summary + each question
      with the user's answer, the correct answer, and the explanation
```

Server-side, `getQuizAttempt` strips `correct_answer` from the payload
sent to `<QuizTaker>` before scoring — the client never receives
answers it could read out of React state/devtools before submitting.

### Weak-topic detection

```
getWeakTopics(userId, limit=3):
  1. load user's scored quiz_attempts (score is not null)
  2. load quiz_questions for those attempts where selected_answer is
     not null, compute per-attempt (correct, total)
  3. for each attempt, resolve its topic(s):
     - topic_id set directly → that topic
     - resource_id set → topics linked via resource_topics
  4. aggregate correct/total per topic across all attempts touching it
  5. keep topics with >= 3 answered questions (enough signal),
     sort by accuracy ascending, return the worst `limit`
```

### Recommendations

```
getRecommendedTopics(userId, limit=2):
  weak = getWeakTopics(userId, limit)
  if weak.length > 0: return weak topic names
  else: return the Phase 1 static defaults
```

## UI Changes

**`/quiz`**: replaces the Phase 1 placeholder with the subject → topic
→ count/difficulty wizard described above.

**`/quiz/[attemptId]`**: new dynamic route. Taking mode shows one
question, 4 choices as selectable buttons, a progress indicator ("Question
3 of 10"), Previous/Next, and "Submit Quiz" only on the final question
(disabled until every question has an answer). Review mode shows the
score prominently, then each question with the user's choice
highlighted (green if correct, red if wrong) alongside the correct
answer and explanation when the user was wrong.

**Dashboard (`/` )**: adds "Recent Quizzes" (last 3 scored attempts —
topic/resource label, score/total, relative date, linking to
`/quiz/[attemptId]` review) and "Weak Areas" (from `getWeakTopics`,
shown only when there's data) sections. "Recommended for You" swaps
its hardcoded array for `getRecommendedTopics(userId)`.

## Error Handling

- Starting a quiz for a topic with zero linked resources still works
  (falls back to AI general knowledge of the topic) — never blocks the
  user with "not enough content."
- Submitting a quiz with unanswered questions is blocked client-side
  (Submit stays disabled) rather than allowed and erroring server-side.
- `getQuizAttempt` returning `null` (wrong user, bad ID) renders a
  simple "Quiz not found" state, not a crash.

## Testing (Phase 4)

Manual verification via `npm run dev` against the real Supabase +
OpenAI projects: take a full quiz end-to-end (subject → topic → count/
difficulty → answer every question → submit), confirm the score and
review render correctly and match a manual correct-count check against
the stored `quiz_questions.selected_answer`/`correct_answer` rows.
Take 2-3 more quizzes on topics answered mostly wrong, confirm
`getWeakTopics` surfaces them and the Dashboard's Weak Areas /
Recommended sections update accordingly. Confirm Recent Quizzes shows
the right attempts in the right order. No automated test framework.

## Explicitly Deferred

- Quiz timer, flag-for-review, resume-after-refresh.
- Trend charts / historical graphs.
- SQL-side weak-topic aggregation (Postgres function).
- Saved-resource-subject-derived recommendation fallback tier.
