"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

export function ViewportHeightFrame({
  mobileOffsetRem,
  desktopOffsetRem,
  className,
  children,
}: {
  mobileOffsetRem: number;
  desktopOffsetRem: number;
  className?: string;
  children: ReactNode;
}) {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    function update() {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const isDesktop = window.innerWidth >= 768;
      const offsetPx = (isDesktop ? desktopOffsetRem : mobileOffsetRem) * 16;
      setHeight(viewportHeight - offsetPx);
    }
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, [mobileOffsetRem, desktopOffsetRem]);

  const style: CSSProperties | undefined = height !== null ? { height } : undefined;

  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
