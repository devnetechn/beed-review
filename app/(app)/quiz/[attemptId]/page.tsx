import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getQuizAttempt } from "@/lib/quiz/attempt";
import { QuizTaker } from "@/components/quiz/QuizTaker";
import { QuizReview } from "@/components/quiz/QuizReview";
import { EmptyState } from "@/components/common/EmptyState";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function QuizAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <EmptyState message="Please sign in to view this quiz." />;
  }

  const attempt = await getQuizAttempt(attemptId, user.id);

  if (!attempt) {
    return <EmptyState message="Quiz not found." />;
  }

  return (
    <div className="space-y-4">
      <Link href="/quiz" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        ← Back to Quiz
      </Link>
      <h1 className="text-xl font-bold">{attempt.label}</h1>
      {attempt.scored ? (
        <QuizReview
          score={attempt.score}
          totalQuestions={attempt.totalQuestions}
          questions={attempt.questions}
        />
      ) : (
        <QuizTaker attemptId={attempt.attemptId} questions={attempt.questions} />
      )}
    </div>
  );
}
