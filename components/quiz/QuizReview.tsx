import { TeacherWonna } from "@/components/character/TeacherWonna";
import type { QuizQuestionReview } from "@/lib/quiz/types";

const PASS_RATIO = 0.6;

export function QuizReview({
  score,
  totalQuestions,
  questions,
}: {
  score: number;
  totalQuestions: number;
  questions: QuizQuestionReview[];
}) {
  const passed = totalQuestions > 0 && score / totalQuestions >= PASS_RATIO;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-neutral-200 p-4 text-center">
        <TeacherWonna state={passed ? "correct" : "incorrect"} size="sm" />
        <p className="text-2xl font-semibold">
          {score} / {totalQuestions}
        </p>
        <p className="text-sm text-neutral-500">
          {totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0}% correct
        </p>
      </div>
      <p className="text-xs font-medium text-amber-600">
        AI Generated — practice questions, not official LET items.
      </p>
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
  );
}
