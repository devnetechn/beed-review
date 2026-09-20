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
    description: "Send 20 messages to WonnaAi",
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
