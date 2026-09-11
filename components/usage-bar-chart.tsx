"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartRow = {
  name: string;
  count: number;
  color: string;
};

export function UsageBarChart({ data }: { data: ChartRow[] }) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: -8, bottom: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="#e4e4e7"
          />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#71717a", fontSize: 12 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#71717a", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "rgba(24, 24, 27, 0.04)" }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e4e4e7",
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            }}
            formatter={(value) => [`${value} 回`, "利用回数"]}
          />
          <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={56}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
