# Major-scoped subjects design

## Problem

BEEd and BSED students share the reviewer today: one flat list of 13 subjects
(General Education + Professional Education), visible to everyone regardless
of course/major (captured at signup per the 2026-09-19 course/major signup
work). The user wants BSED majors (English, Mathematics, Filipino, Biological
Science, Physical Education, Social Studies) to eventually get their own
specialization content, distinct per major, while the existing 13 subjects
stay shared across every user (BEEd and BSED, any major).

This phase adds the schema and filtering plumbing only. No major-specific
subject/topic content is authored here — that gets added later via SQL
against the seeded `majors` rows, the same way the existing 13 subjects were
seeded (`supabase/seed.sql`), not through an admin UI (none exists).

## Decisions already made

- **Approach A** (see chat): add a nullable `subjects.major_id` column.
  `NULL` = shared/global, visible to everyone. Non-null = visible only to
  users whose `profiles.major_id` matches.
- All 13 existing subjects keep `major_id = NULL` — zero behavior change for
  current content.
- `topics`, `resource_topics`, `quiz_attempts`, and quiz generation are
  untouched. A topic's visibility is inherited entirely from its parent
  subject's `major_id` via the existing `topics.subject_id` FK — no new
  scoping concept at the topic level.
- Content authoring for majors is out of scope for this phase.

## Data model

```sql
alter table subjects
  add column major_id uuid references majors(id);
```

No RLS change needed: `subjects_public_read` already allows `select using (true)`
for everyone — filtering is an application-level concern (which rows are
*queried*, not which rows are *visible* to the role), consistent with how
`/api/topics` already scopes by slug today.

## Source of truth for the subject list

`lib/sources/subjects.ts`'s static `SUBJECTS` array is the current source for
three UI surfaces (quiz page picker, onboarding picker) and one matching
lookup (`weakTopics.ts` default-recommendation slug lookup). Once
major-scoped subjects can exist, this static list can no longer be correct
for any given user, so all three call sites move to a new DB-backed,
user-scoped query.

**New helper** — `lib/sources/visibleSubjects.ts`:

```ts
export type VisibleSubject = { id: string; slug: string; name: string };

export async function getVisibleSubjects(userId: string): Promise<VisibleSubject[]>
```

Implementation: looks up the caller's `profiles.major_id`, then queries
`subjects` where `major_id is null or major_id = :majorId`, ordered the same
way `topics` already is (`order by name`). Server-only (uses
`createServiceClient`, mirrors the pattern in `lib/quiz/weakTopics.ts`).

`lib/sources/subjects.ts`'s static `SUBJECTS` array is **kept** (not
deleted) — it remains the seed list for the 13 global subjects and is still
useful as a compile-time-checked reference (e.g. `getSubjectInterests`
validating slugs). Nothing here requires removing it; call sites that need
the *live, user-scoped* list switch to `getVisibleSubjects`, call sites that
only need to validate against the known-global set keep using `SUBJECTS`.

## Call-site changes

1. **New route `app/api/subjects/route.ts`** (`GET`, auth required) — calls
   `getVisibleSubjects(user.id)`, returns `{ subjects: VisibleSubject[] }`.
   Mirrors `app/api/topics/route.ts`'s shape/error handling.

2. **`app/(app)/quiz/page.tsx`** — subject-picker step (`step === "subject"`)
   fetches from `/api/subjects` on mount instead of importing static
   `SUBJECTS`. Loading/error states follow the same pattern already used for
   the topic-fetch step (`topicsLoading`/`error`).

3. **`components/onboarding/SubjectInterestsPicker.tsx`** — same swap: fetch
   `/api/subjects` on mount instead of importing static `SUBJECTS`. Card
   shows a lightweight loading state while the list loads (it's the first
   thing rendered on the dashboard, so this should resolve quickly).

4. **`lib/profile/interests.ts` (`saveSubjectInterestsAction`)** — currently
   validates incoming slugs against the static `SUBJECTS` array before
   saving. Switch the validation to `getVisibleSubjects(user.id)` so a major
   student can save a major-scoped subject as an interest too, not just the
   13 globals.

5. **`app/api/topics/route.ts`** — after resolving `subject.id` by slug, add
   a visibility check: if the resolved subject's `major_id` is non-null and
   doesn't match the caller's `profiles.major_id`, respond as if the subject
   doesn't exist (`{ topics: [] }`, same shape as the not-found case today).
   Requires the route to fetch the caller's `major_id` (one extra `auth.getUser()`
   + `profiles` lookup, same pattern as elsewhere).

6. **`lib/search/searchResources.ts` (`searchAll`)** — add a `userId`
   parameter. Resolve the caller's `major_id` once, then add
   `.or(\`major_id.is.null,major_id.eq.${majorId}\`)`-style filtering to the
   `subjects` and `topics` queries (topics needs a join-based filter since
   `major_id` lives on `subjects`, not `topics` — e.g. filter topic rows by
   `subjects!inner(major_id)` with the same or-condition, matching the
   existing `topics(...).select("slug, name, subjects(slug)")` join shape).
   Resource full-text search (`search_resources` RPC) is untouched — it
   doesn't currently expose subject/topic scoping, and gating it would need
   the RPC itself to join through `resource_topics → topics → subjects`,
   which is a larger change; explicitly deferred (resources will simply keep
   surfacing regardless of major, same as today, until a follow-up).
   `app/api/search/route.ts` passes the authenticated `user.id` through.

7. **`lib/quiz/weakTopics.ts` (`getRecommendedTopics` default fallback)** —
   the `SUBJECTS.find((s) => s.name === label)` lookup for the two
   hardcoded `DEFAULT_RECOMMENDATIONS` stays as-is (those two labels,
   "Teaching Profession" and "Curriculum Development", are always global
   subjects — no major-scoping concern here since this path only ever runs
   before a user has weak-topic data *or* subject interests, i.e. right
   after signup, before majors are relevant to recommend against).

## Error handling

- A user with no `major_id` (BEEd, or hasn't set one) behaves exactly like
  today: `major_id is null or major_id = null` — Postgres `eq` against a
  `NULL` variable never matches non-null rows, so the `.or()` filter
  degrades correctly to "global subjects only" (need to build the filter
  string conditionally: when the caller has no major, skip the `major_id.eq`
  branch entirely rather than emitting `major_id.eq.null`, which PostgREST
  would treat as literal-string comparison, not `IS NULL`).
- `/api/topics` and `/api/subjects` both require auth (`supabase.auth.getUser()`);
  unauthenticated requests get the same empty-result shape already used for
  "not found", not a 401 — matches the existing route's style (it doesn't
  currently gate on auth either, since the page itself is already behind
  `proxy.ts`'s protected-route check).

## Testing

- `npx tsc --noEmit`, `npm run lint`.
- Manual, after a follow-up SQL seed adds one test subject with
  `major_id` set to the English major's id:
  1. A BEEd (or no-major) user's `/api/subjects` and quiz picker show only
     the 13 globals.
  2. A BSED/English-major user's list shows the 13 globals **plus** the new
     English-only subject.
  3. A BSED/Mathematics-major user's list shows only the 13 globals (not the
     English-only one).
  4. `/api/topics?subject=<english-only-slug>` returns topics for the
     English-major user, and `{ "topics": [] }` for the Mathematics-major
     user (URL-guessing doesn't bypass scoping).
  5. Searching a term that matches the English-only subject's name surfaces
     it for the English-major user and not for others.
