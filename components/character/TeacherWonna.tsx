"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import styles from "./TeacherWonna.module.css";

export type TeacherWonnaState = "welcome" | "idle" | "thinking" | "correct" | "incorrect";

type Phase = "entering" | "idle" | "thinking" | "celebrating" | "reassuring" | "nudging";

const SIZE_MAP = {
  sm: { w: 72, h: 90 },
  md: { w: 112, h: 140 },
  lg: { w: 176, h: 220 },
} as const;

const EXPRESSION_IMAGE: Record<TeacherWonnaState, string> = {
  welcome: "/wonna/wonna-happy.png",
  idle: "/wonna/wonna-idle.png",
  thinking: "/wonna/wonna-thinking.png",
  correct: "/wonna/wonna-celebrating.png",
  incorrect: "/wonna/wonna-encouraging.png",
};

const SETTLE_PHASE: Partial<Record<Phase, Phase>> = {
  celebrating: "idle",
  reassuring: "idle",
};

function phaseForState(state: TeacherWonnaState): Phase {
  switch (state) {
    case "thinking":
      return "thinking";
    case "correct":
      return "celebrating";
    case "incorrect":
      return "reassuring";
    case "welcome":
      return "entering";
    default:
      return "idle";
  }
}

function glowClassName(state: TeacherWonnaState): string {
  switch (state) {
    case "thinking":
      return styles.glowThinking;
    case "correct":
      return styles.glowCorrect;
    case "incorrect":
      return styles.glowIncorrect;
    default:
      return styles.glowIdle;
  }
}

export function TeacherWonna({
  state,
  size = "md",
  className,
}: {
  state: TeacherWonnaState;
  size?: keyof typeof SIZE_MAP;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("entering");
  const [prevState, setPrevState] = useState(state);
  const resumePhaseRef = useRef<Phase>("idle");

  // Adjust phase when the `state` prop changes, without letting a live
  // prop change interrupt an in-flight one-shot animation (entrance/nudge).
  if (state !== prevState) {
    setPrevState(state);
    if (phase !== "entering" && phase !== "nudging") {
      setPhase(phaseForState(state));
    }
  }

  function handleAnimationEnd() {
    if (phase === "entering") {
      setPhase(phaseForState(state));
      return;
    }
    if (phase === "nudging") {
      setPhase(resumePhaseRef.current);
      return;
    }
    const settled = SETTLE_PHASE[phase];
    if (settled) setPhase(settled);
  }

  function handleActivate() {
    setPhase((current) => {
      if (current !== "idle" && current !== "thinking") return current;
      resumePhaseRef.current = current;
      return "nudging";
    });
  }

  const dims = SIZE_MAP[size];

  return (
    <div
      className={`${styles.stage} ${className ?? ""}`}
      style={{ width: dims.w, height: dims.h }}
      role="img"
      aria-label="Teacher Wonna, your AI study buddy"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      <span className={`${styles.glow} ${glowClassName(state)}`} aria-hidden="true" />
      <div className={`${styles.floatLayer} ${styles[phase]}`} onAnimationEnd={handleAnimationEnd}>
        <Image
          src={EXPRESSION_IMAGE[state]}
          alt=""
          width={dims.w}
          height={dims.h}
          className={styles.image}
        />
        <span className={`${styles.eyelid} ${styles.eyelidLeft}`} aria-hidden="true" />
        <span className={`${styles.eyelid} ${styles.eyelidRight}`} aria-hidden="true" />
      </div>
      {state === "thinking" && (
        <span className={styles.thinkingDots} aria-hidden="true">
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </span>
      )}
      {phase === "celebrating" && (
        <span className={styles.sparkleBurst} aria-hidden="true">
          <span className={styles.sparkle} />
          <span className={styles.sparkle} />
          <span className={styles.sparkle} />
        </span>
      )}
    </div>
  );
}
