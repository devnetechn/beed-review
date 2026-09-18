# BEEd Exam Prep Platform — Gamification & Profile Design

Status: Approved
Date: 2026-09-18

## Context

The app has no profile/account page and no sign-out button anywhere —
users who sign in have no way to sign out short of clearing cookies.
This feature adds a lightweight gamification layer (points, a daily
streak, and unlockable badges) plus the profile page needed to show
it, reachable via a new user icon in the bottom/side nav. This also
finally gives the app a Sign Out entry point.

## Goals

- Track **points** per user, earned from existing actions (search,
  saving a resource, tutor messages, completing quizzes — more for
  harder/perfect results).
- Track a **daily streak** (Asia/Manila calendar day, consistent with
  the Extreme Quiz's existing daily-reset convention): any qualifying
  activity on a given day extends or maintains the streak; missing a
  day resets it.
- A small **static badge catalog** (11 badges) checked after every
  activity, unlocking permanently once earned.
- A derived **Level** (`1 + floor(points / 100)`) — no new column,
  computed from points.
- A new **`/profile` page**: avatar + display name, level/points
  (with a progress bar to the next level), current/longest streak,
  a badges grid (locked badges shown grayed out), and a **Sign Out**
  button.
- A 6th nav item (user icon) in `BottomNav`/`SideNav` linking to
  `/profile`.

## Non-Goals

- No leaderboards or comparing users against each other.
- No badge catalog editable from the UI — it's a fixed list in code.
- No notifications/toasts when a badge unlocks in this phase (it just
  appears on `/profile` next time the user visits) — a "just unlocked"
  animation/toast is a reasonable future enhancement, not in scope now.
- No retroactive point/badge backfill for activity that happened
  before this feature ships — tracking starts from zero at launch.

## Architecture

### Data model (new migration `supabase/migrations/0004_gamification.sql`)

```sql
alter table profiles
  add column points int not null default 0,
  add column current_streak int not null default 0,
  add column longest_streak int not null default 0,
  add column last_activity_date date;

create table user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

alter table user_badges enable row level security;

create policy "user_badges_owner_all" on user_badges for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Points/streak live directly on `profiles` (1:1 with the user already).
The badge **catalog** (names, descriptions, icons, unlock conditions)
is a static TypeScript array in `lib/gamification/badges.ts`, not a
table — it's fixed, app-defined data, not something users or admins
edit. `user_badges` only records *which* catalog entries a given user
has earned and when.

### Activity recording (`lib/gamification/activity.ts`, new)

A single server-side entry point, called after each qualifying action
— never from the client, so it can't be gamed:

```ts
export type ActivityKind = "search" | "resource_saved" | "tutor_message" | "quiz_completed";
export type QuizCompletedDetails = { difficulty: string; score: number; totalQuestions: number };

export async function recordActivity(
  userId: string,
  kind: ActivityKind,
  quizDetails?: QuizCompletedDetails
): Promise<void>
```

Uses `createServiceClient()` (same pattern as `lib/quiz/attempt.ts` and
`lib/ai/tutor.ts`), since it's a trusted server-side helper operating
on whatever `userId` its caller already authenticated.

**Points table:**

| Kind | Points |
|---|---|
| `search` | 1 |
| `resource_saved` | 2 |
| `tutor_message` | 1 |
| `quiz_completed` (normal difficulty) | 10 |
| `quiz_completed` (perfect score bonus) | +15 |
| `quiz_completed` (extreme difficulty) | 25 |
| `quiz_completed` (extreme + perfect bonus) | +40 |

**Streak logic:** reuses `getManilaDayBounds()` from
`lib/quiz/extreme.ts` (already handles the Asia/Manila day-boundary
math — no need for a second implementation). Compares
`profiles.last_activity_date` against today/yesterday (Manila dates):
same day → streak unchanged; yesterday → `current_streak += 1`;
anything older (or null) → reset to 1. `longest_streak` is the running
max.

**Badge check:** after updating points/streak, `recordActivity` runs
a handful of count queries (quizzes completed, perfect-score exists,
extreme attempts + best ratio, resources saved, tutor messages sent)
and evaluates every catalog entry's `check(stats)` against them,
inserting any newly-earned badge into `user_badges` (existing ones are
skipped via the table's `unique(user_id, badge_id)` constraint).

### Hook points (4 existing files, one call each)

- `lib/quiz/actions.ts` → `submitQuizAction`, after a successful
  `submitQuiz()`: `recordActivity(user.id, "quiz_completed", { difficulty, score, totalQuestions })`.
  (`submitQuiz`'s current signature doesn't return difficulty, so the
  action needs to fetch/pass it — see plan for exact wiring.)
- `app/api/search/route.ts`: `recordActivity(user.id, "search")` after
  a non-empty query (requires this route to check `auth.getUser()`
  first, which it currently doesn't).
- `lib/library/actions.ts` → `toggleSaveResource`: only on the *save*
  branch (not unsave) — `recordActivity(user.id, "resource_saved")`.
- `lib/ai/actions.ts` → `sendTutorMessageAction`, on success:
  `recordActivity(user.id, "tutor_message")`.

### Badge catalog (`lib/gamification/badges.ts`)

Static array, 11 entries, each `{ id, name, description, icon (lucide
component), check: (stats: UserStats) => boolean }`:

| Badge | Condition |
|---|---|
| First Steps | 1st quiz completed |
| Quiz Regular | 10 quizzes completed |
| Quiz Veteran | 50 quizzes completed |
| Perfectionist | Any perfect-score quiz |
| Extreme Survivor | 1st Extreme Quiz completed |
| Extreme Champion | Extreme Quiz scored ≥80% |
| Bookworm | 10 resources saved |
| Curious Mind | 20 Tutor messages sent |
| 3-Day Streak | `current_streak >= 3` |
| 7-Day Streak | `current_streak >= 7` |
| 30-Day Streak | `current_streak >= 30` |

### Profile page (`app/(app)/profile/page.tsx`, new)

Server Component, protected (added to `proxy.ts`'s
`PROTECTED_PREFIXES`). Reads the user's own `profiles` row and
`user_badges` via the regular RLS-respecting `createClient()` (matches
the existing dashboard page's read pattern) — `recordActivity`'s
service-client writes and this page's owner-scoped reads are two
different, already-established patterns in this codebase, not a new
one.

Shows: an initial-letter avatar circle + display name + email, "Level
N" with a progress bar toward the next 100-point threshold, current
streak (flame icon) and longest streak, a grid of all 11 badges
(earned ones in color, locked ones grayed out with a lock overlay),
and a `SignOutButton` (new small Client Component:
`supabase.auth.signOut()` then redirect to `/login`).

### Nav

`BottomNav.tsx` and `SideNav.tsx` each gain a 6th entry — `{ href:
"/profile", label: "Profile", icon: User }` (lucide) — appended to the
existing `ITEMS` array, no structural changes to either component.

## Error Handling

- `recordActivity` failures (DB error, etc.) must never fail the
  parent action — each call site wraps it so a gamification hiccup
  never blocks a search, save, tutor reply, or quiz submission from
  succeeding. Logged, not surfaced to the user.
- If a user's `profiles` row is somehow missing when `recordActivity`
  runs (shouldn't happen given the `handle_new_user` trigger, but
  defensively), it no-ops rather than throwing.

## Testing

Manual verification via `npm run build && npm run dev` (no automated
test framework in this repo, consistent with every prior phase):
confirm each of the 4 hook points awards the right points, confirm
the streak increments/resets correctly across simulated day
boundaries, confirm each badge unlocks under its real condition, and
confirm the profile page renders and Sign Out actually signs out.

## Explicitly Deferred

- Leaderboards / social comparison.
- Badge-unlock toast/animation at the moment of unlock.
- Retroactive backfill of stats from activity before this feature.
- Admin-editable badge catalog.
