"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { ChartRow } from "@/components/usage-bar-chart";

const UsageBarChart = dynamic(
  () =>
    import("@/components/usage-bar-chart").then((mod) => mod.UsageBarChart),
  { ssr: false },
);

export function UsageChart({ data }: { data: ChartRow[] }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center text-sm text-zinc-400">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <UsageBarChart data={data} />
    </div>
  );
}
