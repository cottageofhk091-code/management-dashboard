"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { SourceRow } from "@/lib/metrics";

export function SourcePieChartInner({ data }: { data: SourceRow[] }) {
  const chartData = data.filter((item) => item.visits > 0);
  const rows = chartData.length > 0 ? chartData : data;

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="visits"
            nameKey="name"
            cx="50%"
            cy="46%"
            innerRadius={52}
            outerRadius={88}
            paddingAngle={2}
          >
            {rows.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [`${value} 件`, String(name)]}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e4e4e7",
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
