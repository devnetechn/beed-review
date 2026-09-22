"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ThinkingWonna } from "@/components/character/ThinkingWonna";
import { ErrorBanner } from "@/components/common/ErrorBanner";

const COUNTS = [50, 150, 200] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export function QuizDialog({
  open,
  onOpenChange,
  onGenerate,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (count: 50 | 150 | 200, difficulty: "easy" | "medium" | "hard") => void;
  loading: boolean;
  error: string | null;
}) {
  const [count, setCount] = useState<50 | 150 | 200>(50);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a quiz</DialogTitle>
        </DialogHeader>
        {loading ? (
          <ThinkingWonna message="Generating your quiz…" />
        ) : (
          <>
            <div className="space-y-4">
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
              {error && <ErrorBanner message={error} />}
            </div>
            <DialogFooter>
              <Button onClick={() => onGenerate(count, difficulty)} className="w-full">
                Generate
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
