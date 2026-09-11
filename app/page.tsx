import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  LayoutDashboard,
} from "lucide-react";
import { UsageChart } from "@/components/usage-chart";
import { getDashboardData } from "@/lib/dashboard-data";
import { actionName, productName } from "@/lib/products";

export const dynamic = "force-dynamic";

function formatNumber(value: number) {
  return new Intl.NumberFormat("ja-JP").format(value);
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export default async function Home() {
  const data = await getDashboardData();

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                中央管理ダッシュボード
              </h1>
              <p className="text-sm text-zinc-500">
                全プロダクトの利用指標を一元管理
              </p>
            </div>
          </div>
          <p className="hidden text-xs text-zinc-400 sm:block">
            タイムゾーン: Asia/Tokyo
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {data.error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{data.error}</p>
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            icon={<Activity className="h-5 w-5" />}
            label="総利用回数"
            value={formatNumber(data.totalCount)}
            hint="app_logs 全件"
          />
          <SummaryCard
            icon={<CalendarDays className="h-5 w-5" />}
            label="今日の利用回数"
            value={formatNumber(data.todayCount)}
            hint="本日 0:00 以降（JST）"
          />
          <SummaryCard
            icon={<Boxes className="h-5 w-5" />}
            label="稼働中プロダクト数"
            value={formatNumber(data.activeProductCount)}
            hint="apology / fleamarket / car / subsidy / realestate"
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm xl:col-span-3">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              <h2 className="font-semibold">プロダクト別利用状況</h2>
            </div>
            <UsageChart
              data={data.productUsage.map((item) => ({
                name: item.name,
                count: item.count,
                color: item.color,
              }))}
            />
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm xl:col-span-2">
            <h2 className="mb-4 font-semibold">利用数内訳</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[280px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="pb-3 font-medium">プロダクト</th>
                    <th className="pb-3 text-right font-medium">利用回数</th>
                    <th className="pb-3 text-right font-medium">構成比</th>
                  </tr>
                </thead>
                <tbody>
                  {data.productUsage.map((item) => (
                    <tr key={item.id} className="border-b border-zinc-100 last:border-0">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="font-medium">{item.name}</span>
                        </div>
                        <p className="mt-0.5 pl-5 text-xs text-zinc-400">
                          {item.id}
                        </p>
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {formatNumber(item.count)}
                      </td>
                      <td className="py-3 text-right tabular-nums text-zinc-500">
                        {item.share.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">リアルタイムアクティビティログ</h2>
            <p className="text-xs text-zinc-400">直近 10 件</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="pb-3 font-medium">ID</th>
                  <th className="pb-3 font-medium">プロダクト名</th>
                  <th className="pb-3 font-medium">アクション名</th>
                  <th className="pb-3 font-medium">日時</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-zinc-400">
                      まだログがありません
                    </td>
                  </tr>
                ) : (
                  data.recentLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-zinc-100 last:border-0"
                    >
                      <td className="py-3 font-mono text-xs text-zinc-500">
                        {log.id}
                      </td>
                      <td className="py-3">
                        <p className="font-medium">{productName(log.app_name)}</p>
                        <p className="text-xs text-zinc-400">{log.app_name}</p>
                      </td>
                      <td className="py-3">
                        <p>{actionName(log.action_type)}</p>
                        <p className="font-mono text-xs text-zinc-400">
                          {log.action_type}
                        </p>
                      </td>
                      <td className="py-3 tabular-nums text-zinc-600">
                        {formatDateTime(log.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-500">{label}</p>
        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{hint}</p>
    </div>
  );
}
