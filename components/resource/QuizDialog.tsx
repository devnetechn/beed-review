"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const COUNTS = [5, 10, 20, 50] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export function QuizDialog({
  open,
  onOpenChange,
  onGenerate,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (count: 5 | 10 | 20 | 50, difficulty: "easy" | "medium" | "hard") => void;
  loading: boolean;
}) {
  const [count, setCount] = useState<5 | 10 | 20 | 50>(10);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a quiz</DialogTitle>
        </DialogHeader>
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
        </div>
        <DialogFooter>
          <Button disabled={loading} onClick={() => onGenerate(count, difficulty)} className="w-full">
            {loading ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
