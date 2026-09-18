"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import type { QuizQuestionReview } from "@/lib/quiz/types";

const PASS_RATIO = 0.6;
const COUNT_UP_MS = 800;

function useCountUp(target: number, durationMs: number): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let frame: number;
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(progress * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

export function ExtremeQuizResult({
  score,
  totalQuestions,
  questions,
}: {
  score: number;
  totalQuestions: number;
  questions: QuizQuestionReview[];
}) {
  const displayedScore = useCountUp(score, COUNT_UP_MS);
  const [showReview, setShowReview] = useState(false);
  const passed = totalQuestions > 0 && score / totalQuestions >= PASS_RATIO;

  return (
    <div className="animate-in fade-in zoom-in-95 space-y-4 duration-300">
      <div className="flex flex-col items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 py-8 text-center">
        {passed && <Trophy className="size-10 text-orange-600" />}
        <p className="text-4xl font-bold text-orange-900">
          {displayedScore} / {totalQuestions}
        </p>
        <p className="text-sm text-orange-700">
          {passed ? "Extreme Quiz cleared." : "Tough round — try again tomorrow."}
        </p>
      </div>

      <p className="text-xs font-medium text-amber-600">
        AI Generated — practice questions, not official LET items.
      </p>

      <button
        onClick={() => setShowReview((v) => !v)}
        className="text-sm font-medium text-orange-700 underline underline-offset-2"
      >
        {showReview ? "Hide review" : "Show full review"}
      </button>

      {showReview && (
        <div className="animate-in fade-in space-y-4 duration-300">
          {questions.map((q, i) => {
            const isCorrect = q.selected_answer === q.correct_answer;
            return (
              <div key={q.id} className="space-y-1.5 border-b border-neutral-100 pb-3">
                <p className="text-sm font-medium">
                  {i + 1}. {q.question}
                </p>
                <ul className="space-y-1">
                  {q.choices.map((choice) => {
                    const isSelected = choice === q.selected_answer;
                    const isAnswer = choice === q.correct_answer;
                    return (
                      <li
                        key={choice}
                        className={`rounded-md px-2 py-1 text-sm ${
                          isAnswer
                            ? "bg-green-50 text-green-800"
                            : isSelected
                              ? "bg-red-50 text-red-800"
                              : "text-neutral-600"
                        }`}
                      >
                        {choice}
                        {isSelected && !isAnswer ? " (your answer)" : ""}
                      </li>
                    );
                  })}
                </ul>
                {!isCorrect && <p className="text-xs text-neutral-500">{q.explanation}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
