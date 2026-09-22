"use client";

import dynamic from "next/dynamic";
import { ChartShell } from "@/components/chart-shell";
import type { DailyPoint } from "@/lib/metrics";

const DailyTrendChartInner = dynamic(
  () =>
    import("@/components/daily-trend-chart-inner").then(
      (mod) => mod.DailyTrendChartInner,
    ),
  { ssr: false },
);

export function DailyTrendChart({ data }: { data: DailyPoint[] }) {
  return (
    <ChartShell>
      <DailyTrendChartInner data={data} />
    </ChartShell>
  );
}
