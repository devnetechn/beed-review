"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { SUBJECTS } from "@/lib/sources/subjects";
import { startTopicQuizAction, startSubjectQuizAction } from "@/lib/quiz/actions";

type Topic = { id: string; name: string };
const COUNTS = [5, 10, 20, 50] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export default function QuizPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <QuizPageContent />
    </Suspense>
  );
}

function QuizPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetTopicId = searchParams.get("topicId");
  const presetTopicName = searchParams.get("topicName");
  const [step, setStep] = useState<"subject" | "topic" | "config">(
    presetTopicId ? "config" : "subject"
  );
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState<string | null>(presetTopicId);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [isOverall, setIsOverall] = useState(false);
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
      setSubjectId(data.subjectId ?? null);
      setSubjectName(data.subjectName ?? null);
      setStep("topic");
    } catch {
      setError("Couldn't load topics. Please try again.");
    } finally {
      setTopicsLoading(false);
    }
  }

  function handlePickTopic(id: string) {
    setTopicId(id);
    setIsOverall(false);
    setStep("config");
  }

  function handlePickOverall() {
    setTopicId(null);
    setIsOverall(true);
    setStep("config");
  }

  async function handleStart() {
    setStarting(true);
    setError(null);
    const outcome = isOverall
      ? subjectId
        ? await startSubjectQuizAction(subjectId, count, difficulty)
        : { error: "No subject selected." }
      : topicId
        ? await startTopicQuizAction(topicId, count, difficulty)
        : { error: "No topic selected." };
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
        <h1 className="text-xl font-bold">Take a Quiz</h1>
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
          {subjectId && (
            <Button
              variant="secondary"
              className="w-full justify-start"
              onClick={handlePickOverall}
            >
              Overall: {subjectName}
            </Button>
          )}
        </div>
      )}

      {step === "config" && (
        <div className="space-y-4">
          {presetTopicId ? (
            <Button variant="ghost" size="sm" onClick={() => router.push("/search")}>
              ← Back to search
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setStep("topic")}>
              ← Back to topics
            </Button>
          )}
          {isOverall && subjectName && (
            <p className="text-sm font-medium">Overall: {subjectName}</p>
          )}
          {!isOverall && presetTopicName && (
            <p className="text-sm font-medium">Topic: {presetTopicName}</p>
          )}
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
            {starting ? (
              <span className="flex items-center gap-2">
                <Spinner /> Generating quiz…
              </span>
            ) : (
              "Start Quiz"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
