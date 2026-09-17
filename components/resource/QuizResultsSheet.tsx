"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import type { QuizQuestionResult } from "@/lib/ai/types";

export function QuizResultsSheet({
  open,
  onOpenChange,
  questions,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: QuizQuestionResult[];
  error: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Practice Quiz</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <p className="text-xs font-medium text-amber-600">
            AI Generated — practice questions, not official LET items.
          </p>
          {error && <ErrorBanner message={error} />}
          {questions.map((q, i) => (
            <div key={q.id} className="space-y-1.5 border-b border-neutral-100 pb-3">
              <p className="text-sm font-medium">
                {i + 1}. {q.question}
              </p>
              <ul className="space-y-1">
                {q.choices.map((choice) => (
                  <li
                    key={choice}
                    className={`rounded-md px-2 py-1 text-sm ${
                      choice === q.correct_answer
                        ? "bg-green-50 text-green-800"
                        : "text-neutral-600"
                    }`}
                  >
                    {choice}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-neutral-500">{q.explanation}</p>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
