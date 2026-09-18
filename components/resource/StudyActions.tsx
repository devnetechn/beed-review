"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SummarySheet } from "./SummarySheet";
import { QuizDialog } from "./QuizDialog";
import { summarizeResourceAction, generateQuizAction } from "@/lib/ai/actions";

export function StudyActions({
  resourceId,
  showAskAI,
}: {
  resourceId: string;
  showAskAI?: boolean;
}) {
  const router = useRouter();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryContent, setSummaryContent] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [quizDialogOpen, setQuizDialogOpen] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  async function handleSummarize() {
    setSummaryOpen(true);
    setSummaryLoading(true);
    setSummaryError(null);
    const outcome = await summarizeResourceAction(resourceId);
    setSummaryLoading(false);
    if ("error" in outcome) {
      setSummaryError(outcome.error);
      return;
    }
    setSummaryContent(outcome.content);
  }

  async function handleGenerateQuiz(count: 5 | 10 | 20 | 50, difficulty: "easy" | "medium" | "hard") {
    setQuizLoading(true);
    setQuizError(null);
    const outcome = await generateQuizAction(resourceId, count, difficulty);
    setQuizLoading(false);
    if ("error" in outcome) {
      setQuizError(outcome.error);
      return;
    }
    setQuizDialogOpen(false);
    router.push(`/quiz/${outcome.attemptId}`);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleSummarize}>
        Summarize
      </Button>
      <Button size="sm" variant="outline" onClick={() => setQuizDialogOpen(true)}>
        Generate Quiz
      </Button>
      {showAskAI && (
        <Link href={`/tutor?resourceId=${resourceId}`}>
          <Button size="sm" variant="outline">
            Ask AI
          </Button>
        </Link>
      )}

      <SummarySheet
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        loading={summaryLoading}
        content={summaryContent}
        error={summaryError}
      />
      <QuizDialog
        open={quizDialogOpen}
        onOpenChange={setQuizDialogOpen}
        onGenerate={handleGenerateQuiz}
        loading={quizLoading}
        error={quizError}
      />
    </>
  );
}
