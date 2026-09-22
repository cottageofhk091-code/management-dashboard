"use client";

import dynamic from "next/dynamic";
import { ChartShell } from "@/components/chart-shell";
import type { SourceRow } from "@/lib/metrics";

const SourcePieChartInner = dynamic(
  () =>
    import("@/components/source-pie-chart-inner").then(
      (mod) => mod.SourcePieChartInner,
    ),
  { ssr: false },
);

export function SourcePieChart({ data }: { data: SourceRow[] }) {
  return (
    <ChartShell>
      <SourcePieChartInner data={data} />
    </ChartShell>
  );
}
