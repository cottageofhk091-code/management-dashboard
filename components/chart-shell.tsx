"use client";

import { useEffect, useState, type ReactNode } from "react";

export function ChartShell({
  children,
  className = "h-[300px] w-full",
}: {
  children: ReactNode;
  className?: string;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-zinc-400 ${className}`}
      >
        読み込み中...
      </div>
    );
  }

  return <div className={className}>{children}</div>;
}
