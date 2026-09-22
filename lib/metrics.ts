import { aliasesForApp, PRODUCTS, PRO_PRICE_YEN } from "@/lib/products";
import {
  enumerateDays,
  jstYmd,
  periodStart,
  startOfTodayJst,
  type PeriodKey,
} from "@/lib/period";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";

export type KpiPair = {
  today: number;
  total: number;
  period: number;
};

export type SourceRow = {
  name: string;
  color: string;
  visits: number;
  share: number;
  conversions: number;
  cvr: number;
};

export type DailyPoint = {
  date: string;
  label: string;
  visits: number;
  analyses: number;
};

export type ProductStatsRow = {
  id: string;
  name: string;
  color: string;
  visits: number;
  analyses: number;
  freeMembers: number;
  proMembers: number;
  revenue: number;
  cvr: number;
};

export type AnalyticsDashboard = {
  configured: boolean;
  error: string | null;
  kpis: {
    visits: KpiPair;
    analyses: KpiPair;
    freeMembers: KpiPair;
    proMembers: KpiPair;
    members: KpiPair;
    revenue: KpiPair;
    topSource: { name: string; share: number };
  };
  daily: DailyPoint[];
  sources: SourceRow[];
  products: ProductStatsRow[];
};

const SOURCE_META: { name: string; color: string; match: string[] }[] = [
  { name: "X", color: "#18181b", match: ["x", "twitter"] },
  { name: "note", color: "#41c9b4", match: ["note"] },
  { name: "Google", color: "#4285f4", match: ["google"] },
  { name: "Yahoo", color: "#ff0033", match: ["yahoo"] },
  { name: "Direct", color: "#71717a", match: ["direct"] },
  { name: "Instagram", color: "#e1306c", match: ["instagram", "ig"] },
];

const OTHER_SOURCE = { name: "他", color: "#a1a1aa" };
const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;

type Row = Record<string, unknown>;

function str(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim()) return String(value);
  }
  return "";
}

function rowDate(row: Row) {
  const raw = str(row, "created_at", "inserted_at", "createdAt");
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rowAppId(row: Row) {
  return str(row, "app_id", "app_name", "app");
}

function matchesApp(row: Row, aliases: string[] | null) {
  if (!aliases) return true;
  const id = rowAppId(row).toLowerCase();
  if (!id) return false;
  return aliases.some((alias) => alias.toLowerCase() === id);
}

function inRange(date: Date | null, start: Date | null, end?: Date) {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function isProPlan(value: string) {
  const plan = value.toLowerCase();
  return plan === "pro" || plan === "paid" || plan === "premium";
}

function isFreePlan(value: string) {
  const plan = value.toLowerCase();
  return plan === "free" || plan === "" || plan === "null" || plan === "undefined";
}

function isAnalysisEvent(row: Row) {
  const type = str(row, "event_type", "action_type", "type").toLowerCase();
  if (!type) return true;
  return /analys|generat|search|diagnos|sold|listing/.test(type);
}

function canonicalizeSource(raw: string) {
  const value = raw.trim() || "Direct";
  const lower = value.toLowerCase();
  const known = SOURCE_META.find((item) =>
    item.match.some((token) =>
      token.length <= 2 ? lower === token : lower === token || lower.includes(token),
    ),
  );
  if (known) return known.name;
  if (lower.includes("other") || lower.includes("referral")) return OTHER_SOURCE.name;
  return OTHER_SOURCE.name;
}

function sourceColor(name: string) {
  return SOURCE_META.find((item) => item.name === name)?.color ?? OTHER_SOURCE.color;
}

function countPair(
  rows: Row[],
  aliases: string[] | null,
  todayStart: Date,
  rangeStart: Date | null,
  predicate: (row: Row) => boolean = () => true,
): KpiPair {
  const matched = rows.filter((row) => matchesApp(row, aliases) && predicate(row));
  return {
    today: matched.filter((row) => inRange(rowDate(row), todayStart)).length,
    total: matched.length,
    period: matched.filter((row) => inRange(rowDate(row), rangeStart)).length,
  };
}

async function fetchAllRows(table: string): Promise<{ rows: Row[]; error: string | null }> {
  const rows: Row[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (/created_at/i.test(error.message)) {
        const fallback = await supabaseAdmin.from(table).select("*").range(from, from + PAGE_SIZE - 1);
        if (fallback.error) return { rows, error: `${table}: ${fallback.error.message}` };
        const chunk = (fallback.data as Row[] | null) ?? [];
        rows.push(...chunk);
        if (chunk.length < PAGE_SIZE || rows.length >= MAX_ROWS) break;
        from += PAGE_SIZE;
        continue;
      }
      return { rows, error: `${table}: ${error.message}` };
    }

    const chunk = (data as Row[] | null) ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE || rows.length >= MAX_ROWS) break;
    from += PAGE_SIZE;
  }

  return { rows, error: null };
}

export async function getAnalyticsDashboard(options: {
  app: string;
  period: PeriodKey;
}): Promise<AnalyticsDashboard> {
  const empty: AnalyticsDashboard = {
    configured: isSupabaseConfigured,
    error: null,
    kpis: {
      visits: { today: 0, total: 0, period: 0 },
      analyses: { today: 0, total: 0, period: 0 },
      freeMembers: { today: 0, total: 0, period: 0 },
      proMembers: { today: 0, total: 0, period: 0 },
      members: { today: 0, total: 0, period: 0 },
      revenue: { today: 0, total: 0, period: 0 },
      topSource: { name: "—", share: 0 },
    },
    daily: [],
    sources: SOURCE_META.map((item) => ({
      name: item.name,
      color: item.color,
      visits: 0,
      share: 0,
      conversions: 0,
      cvr: 0,
    })),
    products: PRODUCTS.map((product) => ({
      id: product.id,
      name: product.name,
      color: product.color,
      visits: 0,
      analyses: 0,
      freeMembers: 0,
      proMembers: 0,
      revenue: 0,
      cvr: 0,
    })),
  };

  if (!isSupabaseConfigured) {
    return {
      ...empty,
      error:
        "NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。.env.local に Publishable / anon キーを設定してください。",
    };
  }

  const aliases = aliasesForApp(options.app === "all" ? "all" : options.app);
  const todayStart = startOfTodayJst();
  const rangeStart = periodStart(options.period);
  const now = new Date();

  const [visitsRes, logsRes, eventsRes, profilesRes, paymentsRes] = await Promise.all([
    fetchAllRows("analytics_visits"),
    fetchAllRows("app_logs"),
    fetchAllRows("analytics_events"),
    fetchAllRows("profiles"),
    fetchAllRows("payments"),
  ]);

  const optionalMissing =
    /schema cache|does not exist|could not find the table|relation .+ does not exist/i;

  const errors = [
    visitsRes.error,
    logsRes.error && !optionalMissing.test(logsRes.error) ? logsRes.error : null,
    eventsRes.error && !optionalMissing.test(eventsRes.error) ? eventsRes.error : null,
    profilesRes.error && !optionalMissing.test(profilesRes.error)
      ? profilesRes.error
      : null,
    paymentsRes.error && !optionalMissing.test(paymentsRes.error)
      ? paymentsRes.error
      : null,
  ].filter(Boolean);

  const visits = visitsRes.rows.filter((row) => matchesApp(row, aliases));
  const allAnalyses = [
    ...logsRes.rows,
    ...eventsRes.rows.filter(isAnalysisEvent),
  ];
  const analyses = allAnalyses.filter((row) => matchesApp(row, aliases));
  const allProfiles = profilesRes.rows;
  const profiles = allProfiles.filter((row) => matchesApp(row, aliases));

  const visitsKpi = countPair(visits, null, todayStart, rangeStart);
  const analysesKpi = countPair(analyses, null, todayStart, rangeStart);
  const freeKpi = countPair(profiles, null, todayStart, rangeStart, (row) =>
    isFreePlan(str(row, "plan_type", "plan")),
  );
  const proKpi = countPair(profiles, null, todayStart, rangeStart, (row) =>
    isProPlan(str(row, "plan_type", "plan")),
  );

  const payments = paymentsRes.rows.filter((row) => {
    if (!matchesApp(row, aliases)) return false;
    const status = str(row, "status", "payment_status").toLowerCase();
    return !status || /success|paid|complete|succeeded/.test(status);
  });

  const paymentAmount = (row: Row) => {
    const amount = Number(row.amount ?? row.amount_yen ?? row.amount_total ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  };

  const hasPayments = payments.length > 0;
  const revenue: KpiPair = hasPayments
    ? {
        today: payments
          .filter((row) => inRange(rowDate(row), todayStart))
          .reduce((sum, row) => sum + paymentAmount(row), 0),
        total: payments.reduce((sum, row) => sum + paymentAmount(row), 0),
        period: payments
          .filter((row) => inRange(rowDate(row), rangeStart))
          .reduce((sum, row) => sum + paymentAmount(row), 0),
      }
    : {
        today: proKpi.today * PRO_PRICE_YEN,
        total: proKpi.total * PRO_PRICE_YEN,
        period: proKpi.period * PRO_PRICE_YEN,
      };

  const periodVisits = visits.filter((row) => inRange(rowDate(row), rangeStart));
  const periodAnalyses = analyses.filter((row) => inRange(rowDate(row), rangeStart));
  const profileIds = new Set(
    profiles
      .map((row) => str(row, "id", "user_id"))
      .filter(Boolean),
  );
  const analysisUserIds = new Set(
    periodAnalyses
      .map((row) => str(row, "user_id", "uid"))
      .filter(Boolean),
  );

  const sourceCounts = new Map<string, { visits: number; conversions: number }>();
  for (const row of periodVisits) {
    const name = canonicalizeSource(str(row, "source_category", "source"));
    const current = sourceCounts.get(name) ?? { visits: 0, conversions: 0 };
    current.visits += 1;
    const userId = str(row, "user_id", "uid");
    if (userId && (profileIds.has(userId) || analysisUserIds.has(userId))) {
      current.conversions += 1;
    }
    sourceCounts.set(name, current);
  }

  const orderedNames = [...SOURCE_META.map((item) => item.name), OTHER_SOURCE.name];
  const sources: SourceRow[] = orderedNames.map((name) => {
    const current = sourceCounts.get(name) ?? { visits: 0, conversions: 0 };
    const share =
      periodVisits.length > 0 ? (current.visits / periodVisits.length) * 100 : 0;
    const hasUserAttribution = periodVisits.some((row) => str(row, "user_id", "uid"));
    const cvr = hasUserAttribution
      ? current.visits > 0
        ? (current.conversions / current.visits) * 100
        : 0
      : periodVisits.length > 0
        ? (periodAnalyses.length / periodVisits.length) * 100
        : 0;

    return {
      name,
      color: sourceColor(name),
      visits: current.visits,
      share,
      conversions: hasUserAttribution
        ? current.conversions
        : Math.round((share / 100) * periodAnalyses.length),
      cvr,
    };
  });

  const topSource = [...sources].sort((a, b) => b.visits - a.visits)[0];

  const members: KpiPair = {
    today: freeKpi.today + proKpi.today,
    total: freeKpi.total + proKpi.total,
    period: freeKpi.period + proKpi.period,
  };

  const products: ProductStatsRow[] = PRODUCTS.map((product) => {
    const ids = [...product.aliases];
    const productVisits = visitsRes.rows.filter(
      (row) => matchesApp(row, ids) && inRange(rowDate(row), rangeStart),
    );
    const productAnalyses = allAnalyses.filter(
      (row) => matchesApp(row, ids) && inRange(rowDate(row), rangeStart),
    );
    const productProfiles = allProfiles.filter(
      (row) => matchesApp(row, ids) && inRange(rowDate(row), rangeStart),
    );
    const freeMembers = productProfiles.filter((row) =>
      isFreePlan(str(row, "plan_type", "plan")),
    ).length;
    const proMembers = productProfiles.filter((row) =>
      isProPlan(str(row, "plan_type", "plan")),
    ).length;
    const productPayments = paymentsRes.rows.filter((row) => {
      if (!matchesApp(row, ids) || !inRange(rowDate(row), rangeStart)) return false;
      const status = str(row, "status", "payment_status").toLowerCase();
      return !status || /success|paid|complete|succeeded/.test(status);
    });
    const visitsCount = productVisits.length;
    const analysesCount = productAnalyses.length;

    return {
      id: product.id,
      name: product.name,
      color: product.color,
      visits: visitsCount,
      analyses: analysesCount,
      freeMembers,
      proMembers,
      revenue:
        productPayments.length > 0
          ? productPayments.reduce((sum, row) => sum + paymentAmount(row), 0)
          : proMembers * PRO_PRICE_YEN,
      cvr: visitsCount > 0 ? (analysesCount / visitsCount) * 100 : 0,
    };
  });

  const chartStart =
    rangeStart ??
    (visits.length
      ? new Date(
          Math.min(
            ...visits
              .map(rowDate)
              .filter((date): date is Date => Boolean(date))
              .map((date) => date.getTime()),
          ),
        )
      : new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000));
  const days = enumerateDays(chartStart, now).slice(-60);
  const visitsByDay = new Map<string, number>();
  const analysesByDay = new Map<string, number>();

  for (const row of visits) {
    const date = rowDate(row);
    if (!date || !inRange(date, chartStart)) continue;
    const key = jstYmd(date);
    visitsByDay.set(key, (visitsByDay.get(key) ?? 0) + 1);
  }
  for (const row of analyses) {
    const date = rowDate(row);
    if (!date || !inRange(date, chartStart)) continue;
    const key = jstYmd(date);
    analysesByDay.set(key, (analysesByDay.get(key) ?? 0) + 1);
  }

  const daily: DailyPoint[] = days.map((date) => ({
    date,
    label: date.slice(5).replace("-", "/"),
    visits: visitsByDay.get(date) ?? 0,
    analyses: analysesByDay.get(date) ?? 0,
  }));

  return {
    configured: true,
    error:
      errors.length > 0
        ? `一部テーブルを読み込めませんでした（RLS または未作成の可能性）: ${errors.join(" / ")}`
        : visitsRes.error && visits.length === 0
          ? visitsRes.error
          : null,
    kpis: {
      visits: visitsKpi,
      analyses: analysesKpi,
      freeMembers: freeKpi,
      proMembers: proKpi,
      members,
      revenue,
      topSource: {
        name: topSource?.visits ? topSource.name : "—",
        share: topSource?.share ?? 0,
      },
    },
    daily,
    sources,
    products,
  };
}

export function formatYen(value: number) {
  return `¥${new Intl.NumberFormat("ja-JP").format(value)}`;
}
