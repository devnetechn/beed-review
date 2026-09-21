import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getQuizAttempt } from "@/lib/quiz/attempt";
import { ExtremeQuizTaker } from "@/components/quiz/ExtremeQuizTaker";
import { ExtremeQuizResult } from "@/components/quiz/ExtremeQuizResult";
import { EmptyState } from "@/components/common/EmptyState";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ExtremeQuizAttemptPage({
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

  if (!attempt || attempt.difficulty !== "extreme") {
    return <EmptyState message="Extreme quiz not found." />;
  }

  return (
    <div className="space-y-4">
      <Link href="/quiz/extreme" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        ← Back to Extreme Quiz
      </Link>
      <h1 className="text-xl font-bold text-orange-700">{attempt.label}</h1>
      {attempt.scored ? (
        <ExtremeQuizResult
          score={attempt.score}
          totalQuestions={attempt.totalQuestions}
          questions={attempt.questions}
        />
      ) : (
        <ExtremeQuizTaker attemptId={attempt.attemptId} questions={attempt.questions} />
      )}
    </div>
  );
}
