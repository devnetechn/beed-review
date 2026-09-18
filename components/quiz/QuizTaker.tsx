"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { submitQuizAction } from "@/lib/quiz/actions";
import type { QuizQuestionForTaking } from "@/lib/quiz/types";

export function QuizTaker({
  attemptId,
  questions,
}: {
  attemptId: string;
  questions: QuizQuestionForTaking[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = questions[index];
  const isLast = index === questions.length - 1;
  const allAnswered = questions.every((q) => answers[q.id]);

  function selectAnswer(choice: string) {
    setAnswers((prev) => ({ ...prev, [current.id]: choice }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const payload = questions.map((q) => ({ questionId: q.id, selectedAnswer: answers[q.id] }));
    const outcome = await submitQuizAction(attemptId, payload);
    setSubmitting(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Question {index + 1} of {questions.length}
      </p>
      <p className="text-base font-medium">{current.question}</p>
      <div className="space-y-2">
        {current.choices.map((choice, i) => (
          <button
            key={choice}
            onClick={() => selectAnswer(choice)}
            style={{ animationDelay: `${i * 50}ms` }}
            className={`animate-in fade-in slide-in-from-bottom-1 w-full rounded-lg border px-3 py-2 text-left text-sm duration-300 ${
              answers[current.id] === choice
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 text-neutral-700"
            }`}
          >
            {choice}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          Previous
        </Button>
        {isLast ? (
          <Button className="flex-1" disabled={!allAnswered || submitting} onClick={handleSubmit}>
            {submitting ? "Submitting…" : "Submit Quiz"}
          </Button>
        ) : (
          <Button
            className="flex-1"
            disabled={!answers[current.id]}
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
