# Gamification & Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add points, a daily streak, and an 11-badge catalog earned from existing user activity, surfaced on a new `/profile` page (also the app's first Sign Out entry point) reachable via a new nav icon.

**Architecture:** New `profiles` columns (`points`, `current_streak`, `longest_streak`, `last_activity_date`) plus a new `user_badges` table record what a user has earned. A single server-side `recordActivity(userId, kind)` helper (`lib/gamification/activity.ts`) is called from four existing action/route files after a qualifying action completes; it updates points/streak and checks a static badge catalog (`lib/gamification/badges.ts`) for newly-earned badges. `/profile` reads and displays all of this plus a Sign Out button.

**Tech Stack:** No new dependencies — reuses `lucide-react` (already installed) and the existing Supabase client patterns (`createServiceClient` for the trusted write helper, `createClient` for the profile page's own RLS-respecting read).

**Spec:** `docs/superpowers/specs/2026-09-18-gamification-design.md`

## Global Constraints

- No automated test framework in this repo — every task's "test" step is `npm run build` (type-checks) plus a manual click-through, not a unit test file.
- `recordActivity` must never throw out of its call sites — a gamification failure must not block the search/save/tutor-reply/quiz-submit it's attached to.
- Streak/day-boundary math reuses `getManilaDayBounds()` from `lib/quiz/extreme.ts` — do not write a second implementation of Asia/Manila day math.
- The gamification badge *type* must be named `BadgeDef`, not `Badge` — `components/ui/badge.tsx` already exports a component named `Badge`, and the profile page needs both in the same file.
- Do not run `git commit` unless the user explicitly asks.

---

## File Structure

```
supabase/migrations/0004_gamification.sql   # NEW: profiles columns + user_badges table
lib/gamification/badges.ts                  # NEW: UserStats type, BadgeDef type, BADGES catalog
lib/gamification/activity.ts                # NEW: recordActivity(), checkAndAwardBadges()
lib/quiz/attempt.ts                         # MODIFIED: submitQuiz returns difficulty too
lib/quiz/actions.ts                         # MODIFIED: submitQuizAction calls recordActivity
app/api/search/route.ts                     # MODIFIED: auth check + recordActivity("search")
lib/library/actions.ts                      # MODIFIED: toggleSaveResource calls recordActivity on save
lib/ai/actions.ts                           # MODIFIED: sendTutorMessageAction calls recordActivity
components/profile/SignOutButton.tsx        # NEW: client component, signs out + redirects
app/(app)/profile/page.tsx                  # NEW: profile page
proxy.ts                                    # MODIFIED: add "/profile" to PROTECTED_PREFIXES
components/nav/BottomNav.tsx                # MODIFIED: 6th nav item (Profile)
components/nav/SideNav.tsx                  # MODIFIED: 6th nav item (Profile)
```

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/0004_gamification.sql`

**Interfaces:**
- Produces: `profiles.points/current_streak/longest_streak/last_activity_date` columns, `user_badges` table — consumed by every later task.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_gamification.sql`:

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

- [ ] **Step 2: Apply it**

Run this against the project's Supabase database the same way prior migrations (`0001`-`0003`) were applied (via the Supabase SQL editor or CLI, per this project's existing workflow — there's no migration-runner script in this repo).

- [ ] **Step 3: Verify**

Confirm in the Supabase table editor (or `select column_name from information_schema.columns where table_name = 'profiles';`) that `profiles` now has the four new columns, and that `user_badges` exists with RLS enabled.

---

### Task 2: Badge catalog

**Files:**
- Create: `lib/gamification/badges.ts`

**Interfaces:**
- Produces: `UserStats` type, `BadgeDef` type, `BADGES: BadgeDef[]` — consumed by Task 3 (`lib/gamification/activity.ts`) and Task 9 (`app/(app)/profile/page.tsx`).

- [ ] **Step 1: Write the catalog**

Create `lib/gamification/badges.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import { Footprints, BookOpenCheck, Trophy, Star, Zap, Flame, BookOpen, MessageCircle } from "lucide-react";

export type UserStats = {
  quizzesCompleted: number;
  hasPerfectScore: boolean;
  extremeCompleted: number;
  extremeBestRatio: number;
  resourcesSaved: number;
  tutorMessages: number;
  currentStreak: number;
};

export type BadgeDef = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  check: (stats: UserStats) => boolean;
};

export const BADGES: BadgeDef[] = [
  {
    id: "first_steps",
    name: "First Steps",
    description: "Complete your first quiz",
    icon: Footprints,
    check: (s) => s.quizzesCompleted >= 1,
  },
  {
    id: "quiz_regular",
    name: "Quiz Regular",
    description: "Complete 10 quizzes",
    icon: BookOpenCheck,
    check: (s) => s.quizzesCompleted >= 10,
  },
  {
    id: "quiz_veteran",
    name: "Quiz Veteran",
    description: "Complete 50 quizzes",
    icon: Trophy,
    check: (s) => s.quizzesCompleted >= 50,
  },
  {
    id: "perfectionist",
    name: "Perfectionist",
    description: "Score 100% on any quiz",
    icon: Star,
    check: (s) => s.hasPerfectScore,
  },
  {
    id: "extreme_survivor",
    name: "Extreme Survivor",
    description: "Complete your first Extreme Quiz",
    icon: Zap,
    check: (s) => s.extremeCompleted >= 1,
  },
  {
    id: "extreme_champion",
    name: "Extreme Champion",
    description: "Score 80%+ on an Extreme Quiz",
    icon: Flame,
    check: (s) => s.extremeBestRatio >= 0.8,
  },
  {
    id: "bookworm",
    name: "Bookworm",
    description: "Save 10 resources to your library",
    icon: BookOpen,
    check: (s) => s.resourcesSaved >= 10,
  },
  {
    id: "curious_mind",
    name: "Curious Mind",
    description: "Send 20 messages to the AI Tutor",
    icon: MessageCircle,
    check: (s) => s.tutorMessages >= 20,
  },
  {
    id: "streak_3",
    name: "3-Day Streak",
    description: "Reach a 3-day streak",
    icon: Flame,
    check: (s) => s.currentStreak >= 3,
  },
  {
    id: "streak_7",
    name: "7-Day Streak",
    description: "Reach a 7-day streak",
    icon: Flame,
    check: (s) => s.currentStreak >= 7,
  },
  {
    id: "streak_30",
    name: "30-Day Streak",
    description: "Reach a 30-day streak",
    icon: Flame,
    check: (s) => s.currentStreak >= 30,
  },
];
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 3: Activity recording core

**Files:**
- Create: `lib/gamification/activity.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase/service`, `getManilaDayBounds` from `@/lib/quiz/extreme` (Task 3 of the Extreme Quiz plan — already shipped), `BADGES`/`UserStats` from `./badges` (Task 2)
- Produces: `recordActivity(userId: string, kind: ActivityKind, quizDetails?: QuizCompletedDetails): Promise<void>` — consumed by Tasks 4-7. `ActivityKind = "search" | "resource_saved" | "tutor_message" | "quiz_completed"`.

- [ ] **Step 1: Write the module**

Create `lib/gamification/activity.ts`:

```ts
import { createServiceClient } from "@/lib/supabase/service";
import { getManilaDayBounds } from "@/lib/quiz/extreme";
import { BADGES, type UserStats } from "./badges";

export type ActivityKind = "search" | "resource_saved" | "tutor_message" | "quiz_completed";

export type QuizCompletedDetails = {
  difficulty: string;
  score: number;
  totalQuestions: number;
};

const ACTIVITY_POINTS: Record<ActivityKind, number> = {
  search: 1,
  resource_saved: 2,
  tutor_message: 1,
  quiz_completed: 10,
};

function pointsForActivity(kind: ActivityKind, quizDetails?: QuizCompletedDetails): number {
  if (kind !== "quiz_completed" || !quizDetails) return ACTIVITY_POINTS[kind];

  const isExtreme = quizDetails.difficulty === "extreme";
  const isPerfect =
    quizDetails.totalQuestions > 0 && quizDetails.score === quizDetails.totalQuestions;
  let points = isExtreme ? 25 : ACTIVITY_POINTS.quiz_completed;
  if (isPerfect) points += isExtreme ? 40 : 15;
  return points;
}

function toManilaDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function recordActivity(
  userId: string,
  kind: ActivityKind,
  quizDetails?: QuizCompletedDetails
): Promise<void> {
  try {
    const supabase = createServiceClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("points, current_streak, longest_streak, last_activity_date")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) return;

    const { start } = getManilaDayBounds();
    const todayStr = toManilaDateString(start);
    const yesterdayStr = toManilaDateString(new Date(start.getTime() - 24 * 60 * 60 * 1000));

    let currentStreak = profile.current_streak;
    if (profile.last_activity_date === todayStr) {
      // already active today — streak unchanged
    } else if (profile.last_activity_date === yesterdayStr) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }
    const longestStreak = Math.max(profile.longest_streak, currentStreak);
    const newPoints = profile.points + pointsForActivity(kind, quizDetails);

    await supabase
      .from("profiles")
      .update({
        points: newPoints,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        last_activity_date: todayStr,
      })
      .eq("id", userId);

    await checkAndAwardBadges(userId, currentStreak, supabase);
  } catch (err) {
    console.error("recordActivity failed:", err);
  }
}

async function checkAndAwardBadges(
  userId: string,
  currentStreak: number,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const [{ data: quizAttempts }, { data: savedResources }, { data: conversations }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("difficulty, score, total_questions")
      .eq("user_id", userId)
      .not("score", "is", null),
    supabase.from("saved_resources").select("id").eq("user_id", userId),
    supabase.from("ai_conversations").select("id").eq("user_id", userId),
  ]);

  const conversationIds = (conversations ?? []).map((c) => c.id);
  let tutorMessages = 0;
  if (conversationIds.length > 0) {
    const { count } = await supabase
      .from("ai_messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "user")
      .in("conversation_id", conversationIds);
    tutorMessages = count ?? 0;
  }

  const attempts = quizAttempts ?? [];
  const extremeAttempts = attempts.filter((a) => a.difficulty === "extreme");

  const stats: UserStats = {
    quizzesCompleted: attempts.length,
    hasPerfectScore: attempts.some(
      (a) => (a.total_questions ?? 0) > 0 && a.score === a.total_questions
    ),
    extremeCompleted: extremeAttempts.length,
    extremeBestRatio: extremeAttempts.reduce(
      (max, a) => ((a.total_questions ?? 0) > 0 ? Math.max(max, a.score! / a.total_questions!) : max),
      0
    ),
    resourcesSaved: (savedResources ?? []).length,
    tutorMessages,
    currentStreak,
  };

  const { data: earned } = await supabase.from("user_badges").select("badge_id").eq("user_id", userId);
  const earnedIds = new Set((earned ?? []).map((b) => b.badge_id));

  const newlyEarned = BADGES.filter((b) => !earnedIds.has(b.id) && b.check(stats));
  if (newlyEarned.length === 0) return;

  await supabase.from("user_badges").insert(newlyEarned.map((b) => ({ user_id: userId, badge_id: b.id })));
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds. (Behavioral verification happens once Tasks 4-7 wire this into real call sites — Task 11 exercises it end to end.)

---

### Task 4: Hook — quiz submission

**Files:**
- Modify: `lib/quiz/attempt.ts`
- Modify: `lib/quiz/actions.ts`

**Interfaces:**
- `submitQuiz`'s return type changes from `{ score: number; totalQuestions: number }` to `{ score: number; totalQuestions: number; difficulty: string }` — `submitQuizAction` is the only caller, updated in the same task.

- [ ] **Step 1: Return difficulty from `submitQuiz`**

In `lib/quiz/attempt.ts`, change:

```ts
export async function submitQuiz(
  attemptId: string,
  userId: string,
  answers: { questionId: string; selectedAnswer: string }[]
): Promise<{ score: number; totalQuestions: number }> {
  const supabase = createServiceClient();

  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("user_id, total_questions")
    .eq("id", attemptId)
    .single();
```

to:

```ts
export async function submitQuiz(
  attemptId: string,
  userId: string,
  answers: { questionId: string; selectedAnswer: string }[]
): Promise<{ score: number; totalQuestions: number; difficulty: string }> {
  const supabase = createServiceClient();

  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("user_id, total_questions, difficulty")
    .eq("id", attemptId)
    .single();
```

and change the final return:

```ts
  return { score, totalQuestions: attempt.total_questions ?? answers.length };
```

to:

```ts
  return {
    score,
    totalQuestions: attempt.total_questions ?? answers.length,
    difficulty: attempt.difficulty ?? "medium",
  };
```

- [ ] **Step 2: Call `recordActivity` from `submitQuizAction`**

In `lib/quiz/actions.ts`, add the import:

```ts
import { recordActivity } from "@/lib/gamification/activity";
```

Change:

```ts
export async function submitQuizAction(
  attemptId: string,
  answers: { questionId: string; selectedAnswer: string }[]
): Promise<{ score: number; totalQuestions: number } | { error: string }> {
  try {
    const user = await requireUser();
    return await submitQuiz(attemptId, user.id, answers);
  } catch {
    return { error: "Couldn't submit the quiz. Please try again." };
  }
}
```

to:

```ts
export async function submitQuizAction(
  attemptId: string,
  answers: { questionId: string; selectedAnswer: string }[]
): Promise<{ score: number; totalQuestions: number } | { error: string }> {
  try {
    const user = await requireUser();
    const result = await submitQuiz(attemptId, user.id, answers);
    await recordActivity(user.id, "quiz_completed", {
      difficulty: result.difficulty,
      score: result.score,
      totalQuestions: result.totalQuestions,
    });
    return { score: result.score, totalQuestions: result.totalQuestions };
  } catch {
    return { error: "Couldn't submit the quiz. Please try again." };
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 5: Hook — search

**Files:**
- Modify: `app/api/search/route.ts`

- [ ] **Step 1: Add an auth check and record the activity**

Replace the full contents of `app/api/search/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/search/searchResources";
import { createClient } from "@/lib/supabase/server";
import { recordActivity } from "@/lib/gamification/activity";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const results = await searchAll(q);

  if (q.trim()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await recordActivity(user.id, "search");
  }

  return NextResponse.json(results);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 6: Hook — save resource

**Files:**
- Modify: `lib/library/actions.ts`

- [ ] **Step 1: Record activity on the save branch only**

In `lib/library/actions.ts`, add the import:

```ts
import { recordActivity } from "@/lib/gamification/activity";
```

Change:

```ts
  await supabase.from("saved_resources").insert({ user_id: user.id, resource_id: resourceId });
  revalidatePath("/library");
  revalidatePath("/");
  return { saved: true };
```

to:

```ts
  await supabase.from("saved_resources").insert({ user_id: user.id, resource_id: resourceId });
  await recordActivity(user.id, "resource_saved");
  revalidatePath("/library");
  revalidatePath("/");
  return { saved: true };
```

(The *unsave* branch above it, which deletes and returns `{ saved: false }`, is untouched — only saving earns activity.)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 7: Hook — tutor message

**Files:**
- Modify: `lib/ai/actions.ts`

- [ ] **Step 1: Record activity after a successful reply**

In `lib/ai/actions.ts`, add the import:

```ts
import { recordActivity } from "@/lib/gamification/activity";
```

Change:

```ts
export async function sendTutorMessageAction(
  conversationId: string,
  resourceId: string | null,
  message: string
): Promise<{ reply: string; wantsExtremeQuiz: boolean } | { error: string }> {
  try {
    await requireUser();
    return await sendTutorMessage(conversationId, resourceId, message);
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}
```

to:

```ts
export async function sendTutorMessageAction(
  conversationId: string,
  resourceId: string | null,
  message: string
): Promise<{ reply: string; wantsExtremeQuiz: boolean } | { error: string }> {
  try {
    const user = await requireUser();
    const result = await sendTutorMessage(conversationId, resourceId, message);
    await recordActivity(user.id, "tutor_message");
    return result;
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 8: Sign Out button

**Files:**
- Create: `components/profile/SignOutButton.tsx`

**Interfaces:**
- Produces: `SignOutButton()` — consumed by Task 9 (`app/(app)/profile/page.tsx`).

- [ ] **Step 1: Write the component**

Create `components/profile/SignOutButton.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" className="w-full gap-2" onClick={handleSignOut}>
      <LogOut className="size-4" />
      Sign Out
    </Button>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 9: Profile page

**Files:**
- Create: `app/(app)/profile/page.tsx`
- Modify: `proxy.ts`

**Interfaces:**
- Consumes: `BADGES` from `@/lib/gamification/badges` (Task 2), `SignOutButton` (Task 8)
- Produces: route `/profile` — consumed by Task 10 (nav icons)

- [ ] **Step 1: Protect the route**

In `proxy.ts`, change:

```ts
const PROTECTED_PREFIXES = ["/", "/search", "/library", "/quiz", "/tutor", "/subjects", "/topics"];
```

to:

```ts
const PROTECTED_PREFIXES = ["/", "/search", "/library", "/quiz", "/tutor", "/subjects", "/topics", "/profile"];
```

- [ ] **Step 2: Write the page**

Create `app/(app)/profile/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { BADGES } from "@/lib/gamification/badges";
import { SignOutButton } from "@/components/profile/SignOutButton";
import { EmptyState } from "@/components/common/EmptyState";
import { Flame, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

const POINTS_PER_LEVEL = 100;

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <EmptyState message="Please sign in to view your profile." />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, points, current_streak, longest_streak")
    .eq("id", user.id)
    .maybeSingle();

  const { data: earnedBadges } = await supabase
    .from("user_badges")
    .select("badge_id")
    .eq("user_id", user.id);

  const earnedIds = new Set((earnedBadges ?? []).map((b) => b.badge_id));

  const points = profile?.points ?? 0;
  const level = 1 + Math.floor(points / POINTS_PER_LEVEL);
  const pointsIntoLevel = points % POINTS_PER_LEVEL;
  const progressPercent = (pointsIntoLevel / POINTS_PER_LEVEL) * 100;

  const displayName = profile?.display_name ?? user.email ?? "Reviewer";
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
          {initial}
        </div>
        <div>
          <h1 className="text-xl font-bold">{displayName}</h1>
          <p className="text-sm text-neutral-500">{user.email}</p>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-neutral-200 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Level {level}</span>
          <span className="text-neutral-500">
            {pointsIntoLevel} / {POINTS_PER_LEVEL} pts
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-neutral-400">{points} total points</p>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-200 p-4">
          <Flame className="size-5 text-orange-500" />
          <div>
            <p className="text-lg font-bold">{profile?.current_streak ?? 0}</p>
            <p className="text-xs text-neutral-500">Day streak</p>
          </div>
        </div>
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-200 p-4">
          <Flame className="size-5 text-neutral-400" />
          <div>
            <p className="text-lg font-bold">{profile?.longest_streak ?? 0}</p>
            <p className="text-xs text-neutral-500">Best streak</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500">Badges</h2>
        <div className="grid grid-cols-3 gap-3">
          {BADGES.map((badge) => {
            const earned = earnedIds.has(badge.id);
            const Icon = badge.icon;
            return (
              <div
                key={badge.id}
                title={badge.description}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center ${
                  earned ? "border-primary/30 bg-secondary" : "border-neutral-200 opacity-40"
                }`}
              >
                {earned ? (
                  <Icon className="size-6 text-primary" />
                ) : (
                  <Lock className="size-6 text-neutral-400" />
                )}
                <p className="text-xs font-medium leading-tight">{badge.name}</p>
              </div>
            );
          })}
        </div>
      </div>

      <SignOutButton />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 10: Nav icon

**Files:**
- Modify: `components/nav/BottomNav.tsx`
- Modify: `components/nav/SideNav.tsx`

- [ ] **Step 1: Add the item to `BottomNav`**

In `components/nav/BottomNav.tsx`, change:

```tsx
import { Home, Search, BookOpen, ListChecks, MessageCircle } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/quiz", label: "Quiz", icon: ListChecks },
  { href: "/tutor", label: "Tutor", icon: MessageCircle },
];
```

to:

```tsx
import { Home, Search, BookOpen, ListChecks, MessageCircle, User } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/quiz", label: "Quiz", icon: ListChecks },
  { href: "/tutor", label: "Tutor", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: User },
];
```

- [ ] **Step 2: Add the same item to `SideNav`**

In `components/nav/SideNav.tsx`, apply the identical change (same import line, same `ITEMS` array addition).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. Confirm a 6th "Profile" entry appears in both the desktop side nav and the mobile bottom nav, and that clicking it navigates to `/profile`.

---

### Task 11: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full build and lint**

```bash
npm run build
npm run lint
```

Expected: both succeed with no errors.

- [ ] **Step 2: End-to-end activity + badges**

Using a fresh test user (Supabase Admin API, same approach as prior phases):

1. Sign in, visit `/profile` — expect Level 1, 0 points, 0/0 streak, all 11 badges locked.
2. Run a search — confirm points increase by 1 and the streak becomes 1 (via `/profile`).
3. Save a resource from search — confirm +2 points.
4. Send a Tutor message — confirm +1 point.
5. Complete a normal-difficulty quiz — confirm +10 points, and if it's your first ever scored quiz, confirm the "First Steps" badge unlocks.
6. Complete an Extreme Quiz — confirm +25 points (plus the perfect-score bonus if applicable), and that "Extreme Survivor" unlocks.
7. Confirm none of the above actions (search, save, tutor, quiz) failed or errored even while `recordActivity` was running underneath them.

- [ ] **Step 3: Sign out**

Click Sign Out on `/profile` — confirm it redirects to `/login` and that visiting any protected route afterward redirects back to `/login` (session is actually cleared).

- [ ] **Step 4: Clean up**

Delete the test user via the Supabase Admin API (same approach as prior phases).
