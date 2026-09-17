"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { SUBJECTS } from "@/lib/sources/subjects";
import { startTopicQuizAction } from "@/lib/quiz/actions";

type Topic = { id: string; name: string };
const COUNTS = [5, 10, 20, 50] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export default function QuizPage() {
  const router = useRouter();
  const [step, setStep] = useState<"subject" | "topic" | "config">("subject");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [count, setCount] = useState<5 | 10 | 20 | 50>(10);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePickSubject(slug: string) {
    setTopicsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics?subject=${encodeURIComponent(slug)}`);
      const data = await res.json();
      setTopics(data.topics ?? []);
      setStep("topic");
    } catch {
      setError("Couldn't load topics. Please try again.");
    } finally {
      setTopicsLoading(false);
    }
  }

  function handlePickTopic(id: string) {
    setTopicId(id);
    setStep("config");
  }

  async function handleStart() {
    if (!topicId) return;
    setStarting(true);
    setError(null);
    const outcome = await startTopicQuizAction(topicId, count, difficulty);
    setStarting(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    router.push(`/quiz/${outcome.attemptId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Take a Quiz</h1>
        <p className="text-sm text-neutral-500">Test yourself on a BEEd/LET topic.</p>
      </div>

      {error && <ErrorBanner message={error} />}

      {step === "subject" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Pick a subject</p>
          <div className="grid grid-cols-1 gap-2">
            {SUBJECTS.map((s) => (
              <Button
                key={s.slug}
                variant="outline"
                className="justify-start"
                disabled={topicsLoading}
                onClick={() => handlePickSubject(s.slug)}
              >
                {s.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {step === "topic" && (
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setStep("subject")}>
            ← Back to subjects
          </Button>
          <p className="text-sm font-medium">Pick a topic</p>
          {topics.length === 0 ? (
            <p className="text-sm text-neutral-400">No topics found for this subject yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {topics.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  className="justify-start"
                  onClick={() => handlePickTopic(t.id)}
                >
                  {t.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === "config" && (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setStep("topic")}>
            ← Back to topics
          </Button>
          <div>
            <p className="mb-2 text-sm font-medium">Number of questions</p>
            <div className="flex gap-2">
              {COUNTS.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={count === c ? "default" : "outline"}
                  onClick={() => setCount(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Difficulty</p>
            <div className="flex gap-2">
              {DIFFICULTIES.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={difficulty === d ? "default" : "outline"}
                  onClick={() => setDifficulty(d)}
                >
                  {d}
                </Button>
              ))}
            </div>
          </div>
          <Button className="w-full" disabled={starting} onClick={handleStart}>
            {starting ? "Generating quiz…" : "Start Quiz"}
          </Button>
        </div>
      )}
    </div>
  );
}
