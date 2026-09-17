"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SummarySheet } from "./SummarySheet";
import { QuizDialog } from "./QuizDialog";
import { QuizResultsSheet } from "./QuizResultsSheet";
import { summarizeResourceAction, generateQuizAction } from "@/lib/ai/actions";
import type { QuizQuestionResult } from "@/lib/ai/types";

export function StudyActions({
  resourceId,
  showAskAI,
}: {
  resourceId: string;
  showAskAI?: boolean;
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryContent, setSummaryContent] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [quizDialogOpen, setQuizDialogOpen] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizResultsOpen, setQuizResultsOpen] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionResult[]>([]);
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
    setQuizQuestions(outcome.questions);
    setQuizDialogOpen(false);
    setQuizResultsOpen(true);
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
      />
      <QuizResultsSheet
        open={quizResultsOpen}
        onOpenChange={setQuizResultsOpen}
        questions={quizQuestions}
        error={quizError}
      />
    </>
  );
}
