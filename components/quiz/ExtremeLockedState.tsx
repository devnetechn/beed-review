"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

export function ExtremeLockedState({ nextAvailableAt }: { nextAvailableAt: string }) {
  const target = new Date(nextAvailableAt).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const interval = setInterval(() => setRemaining(target - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [target]);

  return (
    <div className="animate-in fade-in flex flex-col items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-6 py-10 text-center duration-300">
      <Lock className="size-8 text-orange-600" />
      <p className="text-base font-semibold text-orange-900">
        You&apos;ve used today&apos;s Extreme Quiz
      </p>
      <p className="text-sm text-orange-700">Come back tomorrow for another shot.</p>
      <p className="font-mono text-2xl font-semibold text-orange-900">
        {remaining > 0 ? formatCountdown(remaining) : "00:00:00"}
      </p>
    </div>
  );
}
