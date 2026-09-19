"use client";

import { useState } from "react";
import { TeacherWonna, type TeacherWonnaState } from "@/components/character/TeacherWonna";

const STATES: TeacherWonnaState[] = ["welcome", "idle", "thinking", "correct", "incorrect"];

export default function WonnaQaPage() {
  const [state, setState] = useState<TeacherWonnaState>("idle");
  const [key, setKey] = useState(0);

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-lg font-bold">Teacher Wonna QA (temporary)</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Interactive (remount to replay entrance)</h2>
        <div className="flex flex-wrap gap-2">
          {STATES.map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              className="rounded-full border px-3 py-1 text-xs"
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => setKey((k) => k + 1)}
            className="rounded-full border border-neutral-900 bg-neutral-900 px-3 py-1 text-xs text-white"
          >
            remount
          </button>
        </div>
        <div className="rounded-xl border border-dashed p-6" id="interactive-stage">
          <TeacherWonna key={key} state={state} size="lg" />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">All states side by side (sm)</h2>
        <div className="flex flex-wrap gap-6">
          {STATES.map((s) => (
            <div key={s} className="flex flex-col items-center gap-1">
              <TeacherWonna state={s} size="sm" />
              <span className="text-xs text-neutral-500">{s}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
