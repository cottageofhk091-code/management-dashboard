"use client";

import { useState } from "react";
import type { ProductStatsRow, SourceRow } from "@/lib/metrics";
import { formatYen } from "@/lib/metrics";

function formatNumber(value: number) {
  return new Intl.NumberFormat("ja-JP").format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function DetailTabs({
  products,
  sources,
}: {
  products: ProductStatsRow[];
  sources: SourceRow[];
}) {
  const [tab, setTab] = useState<"products" | "sources">("products");

  return (
    <div>
      <div className="mb-4 flex gap-2 border-b border-zinc-200">
        <TabButton
          active={tab === "products"}
          onClick={() => setTab("products")}
        >
          プロダクト別実績一覧
        </TabButton>
        <TabButton
          active={tab === "sources"}
          onClick={() => setTab("sources")}
        >
          流入元別詳細
        </TabButton>
      </div>

      {tab === "products" ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="pb-3 font-medium">プロダクト名（app_id）</th>
                <th className="pb-3 text-right font-medium">訪問数</th>
                <th className="pb-3 text-right font-medium">分析実行数</th>
                <th className="pb-3 text-right font-medium">無料会員数</th>
                <th className="pb-3 text-right font-medium">有料会員数</th>
                <th className="pb-3 text-right font-medium">推定売上</th>
                <th className="pb-3 text-right font-medium">CVR</th>
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <div>
                        <p className="font-medium">{row.name}</p>
                        <p className="font-mono text-xs text-zinc-400">{row.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatNumber(row.visits)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatNumber(row.analyses)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatNumber(row.freeMembers)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatNumber(row.proMembers)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatYen(row.revenue)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatPercent(row.cvr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="pb-3 font-medium">流入元（source_category）</th>
                <th className="pb-3 text-right font-medium">訪問数</th>
                <th className="pb-3 text-right font-medium">構成比（%）</th>
                <th className="pb-3 text-right font-medium">CV数</th>
                <th className="pb-3 text-right font-medium">CVR（%）</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((row) => (
                <tr key={row.name} className="border-b border-zinc-100 last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="font-medium">{row.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatNumber(row.visits)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatPercent(row.share)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatNumber(row.conversions)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatPercent(row.cvr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
        active
          ? "border-indigo-600 font-semibold text-indigo-700"
          : "border-transparent text-zinc-500 hover:text-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
