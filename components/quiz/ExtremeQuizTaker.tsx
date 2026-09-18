"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { submitQuizAction } from "@/lib/quiz/actions";
import type { QuizQuestionForTaking } from "@/lib/quiz/types";

const SECONDS_PER_QUESTION = 20;
const RING_RADIUS = 18;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ringColor(secondsLeft: number): string {
  if (secondsLeft > 10) return "stroke-green-500";
  if (secondsLeft > 5) return "stroke-yellow-500";
  return "stroke-red-500";
}

export function ExtremeQuizTaker({
  attemptId,
  questions,
}: {
  attemptId: string;
  questions: QuizQuestionForTaking[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prevIndex, setPrevIndex] = useState(index);

  const current = questions[index];
  const isLast = index === questions.length - 1;

  if (index !== prevIndex) {
    setPrevIndex(index);
    setSecondsLeft(SECONDS_PER_QUESTION);
  }

  useEffect(() => {
    if (submitting) return;
    if (secondsLeft <= 0) {
      advance();
      return;
    }
    const timeout = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, submitting]);

  function selectAnswer(choice: string) {
    setAnswers((prev) => ({ ...prev, [current.id]: choice }));
  }

  function advance() {
    if (isLast) {
      void handleSubmit();
      return;
    }
    setIndex((i) => i + 1);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const payload = questions.map((q) => ({
      questionId: q.id,
      selectedAnswer: answers[q.id] ?? "",
    }));
    const outcome = await submitQuizAction(attemptId, payload);
    setSubmitting(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="animate-in fade-in space-y-4 duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-orange-700">
          <Zap className="size-4" />
          Question {index + 1} of {questions.length}
        </div>
        <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
          <circle
            cx="22"
            cy="22"
            r={RING_RADIUS}
            className="fill-none stroke-neutral-200"
            strokeWidth="4"
          />
          <circle
            cx="22"
            cy="22"
            r={RING_RADIUS}
            className={`fill-none transition-all duration-1000 ease-linear ${ringColor(secondsLeft)}`}
            strokeWidth="4"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - secondsLeft / SECONDS_PER_QUESTION)}
            strokeLinecap="round"
          />
        </svg>
      </div>

      <p className="text-base font-medium">{current.question}</p>
      <div className="space-y-2">
        {current.choices.map((choice, i) => (
          <button
            key={choice}
            onClick={() => selectAnswer(choice)}
            disabled={submitting}
            style={{ animationDelay: `${i * 50}ms` }}
            className={`animate-in fade-in slide-in-from-bottom-1 w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-300 ${
              answers[current.id] === choice
                ? "border-orange-600 bg-orange-600 text-white"
                : "border-neutral-200 text-neutral-700 hover:border-orange-300"
            }`}
          >
            {choice}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}

      <Button className="w-full" disabled={!answers[current.id] || submitting} onClick={advance}>
        {submitting ? "Submitting…" : isLast ? "Submit" : "Next"}
      </Button>
    </div>
  );
}
