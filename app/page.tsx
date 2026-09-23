import type { ReactNode } from "react";
import { connection } from "next/server";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Crown,
  LayoutDashboard,
  PieChart,
  Share2,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { DailyTrendChart } from "@/components/daily-trend-chart";
import { DashboardFilters } from "@/components/dashboard-filters";
import { DetailTabs } from "@/components/detail-tabs";
import { SourcePieChart } from "@/components/source-pie-chart";
import { formatYen } from "@/lib/format";
import { getAnalyticsDashboard } from "@/lib/metrics";
import { isPeriodKey, PERIODS, type PeriodKey } from "@/lib/period";
import { canonicalAppId } from "@/lib/products";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatNumber(value: number) {
  return new Intl.NumberFormat("ja-JP").format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[]; period?: string | string[] }>;
}) {
  await connection();
  const params = await searchParams;
  const app = canonicalAppId(firstParam(params.app) ?? "all");
  const periodParam = firstParam(params.period) ?? "all";
  const period: PeriodKey = isPeriodKey(periodParam) ? periodParam : "all";
  const periodLabel = PERIODS.find((item) => item.id === period)?.label ?? "全期間";

  let analytics;
  try {
    analytics = await getAnalyticsDashboard({ app, period });
  } catch (err) {
    const record = err as { message?: string; details?: unknown };
    analytics = {
      configured: false,
      error: JSON.stringify(
        {
          message: record?.message ?? String(err),
          details: record?.details ?? null,
          thrown: true,
        },
        null,
        2,
      ),
      kpis: {
        visits: { today: 0, total: 0, period: 0 },
        analyses: { today: 0, total: 0, period: 0 },
        freeMembers: { today: 0, total: 0, period: 0 },
        proMembers: { today: 0, total: 0, period: 0 },
        members: { today: 0, total: 0, period: 0 },
        revenue: { today: 0, total: 0, period: 0 },
        topSource: { name: "—", share: 0, todayShare: 0, totalShare: 0 },
      },
      daily: [],
      sources: [],
      products: [],
    };
  }

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                  中央管理ダッシュボード
                </h1>
                <p className="text-sm text-zinc-500">
                  流入元分析と総合指標を一元管理
                </p>
              </div>
            </div>
            <p className="hidden text-xs text-zinc-400 sm:block">
              タイムゾーン: Asia/Tokyo
            </p>
          </div>
          <DashboardFilters app={app} period={period} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        {analytics.error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-5">
              {analytics.error}
            </pre>
          </div>
        ) : null}

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500">
            上段：総合 KPI
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              icon={<Users className="h-5 w-5" />}
              label="訪問者数"
              value={formatNumber(analytics.kpis.visits.period)}
              today={formatNumber(analytics.kpis.visits.today)}
              total={formatNumber(analytics.kpis.visits.total)}
              hint={`${periodLabel} · analytics_visits`}
            />
            <KpiCard
              icon={<Sparkles className="h-5 w-5" />}
              label="分析実行数"
              value={formatNumber(analytics.kpis.analyses.period)}
              today={formatNumber(analytics.kpis.analyses.today)}
              total={formatNumber(analytics.kpis.analyses.total)}
              hint="app_logs / analytics_events"
            />
            <KpiCard
              icon={<UserPlus className="h-5 w-5" />}
              label="無料会員数"
              value={formatNumber(analytics.kpis.freeMembers.period)}
              today={formatNumber(analytics.kpis.freeMembers.today)}
              total={formatNumber(analytics.kpis.freeMembers.total)}
              hint="profiles（free）"
            />
            <KpiCard
              icon={<Crown className="h-5 w-5" />}
              label="有料会員数"
              value={formatNumber(analytics.kpis.proMembers.period)}
              today={formatNumber(analytics.kpis.proMembers.today)}
              total={formatNumber(analytics.kpis.proMembers.total)}
              hint="profiles（pro / paid）"
            />
            <KpiCard
              icon={<Banknote className="h-5 w-5" />}
              label="推定売上"
              value={formatYen(analytics.kpis.revenue.period)}
              today={formatYen(analytics.kpis.revenue.today)}
              total={formatYen(analytics.kpis.revenue.total)}
              hint="決済履歴または Pro × ¥500"
            />
            <KpiCard
              icon={<Share2 className="h-5 w-5" />}
              label="最多流入元"
              value={analytics.kpis.topSource.name}
              today={formatPercent(analytics.kpis.topSource.todayShare)}
              total={formatPercent(analytics.kpis.topSource.totalShare)}
              hint={`期間内シェア ${formatPercent(analytics.kpis.topSource.share)}`}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500">
            中段：分析（グラフ表示）
          </h2>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm xl:col-span-3">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-600" />
                <h3 className="font-semibold">日次アクセス・分析推移</h3>
              </div>
              <p className="mb-3 text-xs text-zinc-400">訪問数・分析数の推移</p>
              <DailyTrendChart data={analytics.daily} />
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm xl:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <PieChart className="h-5 w-5 text-indigo-600" />
                <h3 className="font-semibold">流入元シェア・分布</h3>
              </div>
              <p className="mb-3 text-xs text-zinc-400">
                X / note / Google / Yahoo / Direct 等
              </p>
              <SourcePieChart data={analytics.sources} />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500">
            下段：各アプリデータ＆詳細（一覧表表示）
          </h2>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <DetailTabs products={analytics.products} sources={analytics.sources} />
          </div>
        </section>
      </main>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  today,
  total,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  today: string;
  total: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-500">{label}</p>
        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>
          本日 <span className="font-medium text-zinc-800">{today}</span>
        </span>
        <span>
          累計 <span className="font-medium text-zinc-800">{total}</span>
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-400">{hint}</p>
    </div>
  );
}
