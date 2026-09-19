import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BADGES } from "@/lib/gamification/badges";
import { SignOutButton } from "@/components/profile/SignOutButton";
import { FeedbackButton } from "@/components/profile/FeedbackButton";
import { EmptyState } from "@/components/common/EmptyState";
import { Flame, Lock, Inbox } from "lucide-react";

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
    .select("display_name, points, current_streak, longest_streak, is_admin")
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

      <FeedbackButton />

      {profile?.is_admin && (
        <Link
          href="/admin/feedback"
          className="flex items-center gap-2 rounded-xl border border-neutral-200 p-4 text-sm font-medium"
        >
          <Inbox className="size-4" />
          Feedback Inbox
        </Link>
      )}

      <SignOutButton />
    </div>
  );
}
