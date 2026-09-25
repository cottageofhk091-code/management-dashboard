import { aliasesForApp, PRODUCTS, PRO_PRICE_YEN } from "@/lib/products";
import {
  enumerateDays,
  jstYmd,
  periodStart,
  startOfTodayJst,
  type PeriodKey,
} from "@/lib/period";
import { connection } from "next/server";
import { getSupabaseAdmin, isSupabaseAdminConfigured, describeSupabaseDebug } from "@/lib/supabase";

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
    topSource: { name: string; share: number; todayShare: number; totalShare: number };
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

/** profiles に app_id が無い場合、同一ユーザーの visits/events からアプリ帰属を推定 */
function matchesProfileApp(
  row: Row,
  aliases: string[] | null,
  attributedUserIds: Set<string>,
) {
  if (!aliases) return true;
  if (matchesApp(row, aliases)) return true;
  const uid = str(row, "id", "user_id");
  return Boolean(uid && attributedUserIds.has(uid));
}

function analysisDedupeKey(row: Row) {
  const app = rowAppId(row).toLowerCase() || "unknown";
  const uid = str(row, "user_id", "uid") || "anon";
  const type = str(row, "event_type", "action_type", "type") || "analysis";
  const at = str(row, "created_at", "inserted_at", "createdAt");
  const id = str(row, "id");
  // id があれば最優先。無ければ秒単位で近似デデュープ
  if (id) return `${app}|${id}`;
  const bucket = at ? at.slice(0, 19) : "na";
  return `${app}|${uid}|${type}|${bucket}`;
}

function dedupeAnalysisRows(rows: Row[]) {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const row of rows) {
    const key = analysisDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** free_credits / has_used_pro_trial から「お試し消費済み」推定回数（ログ欠落時フォールバック） */
function trialConsumedEstimate(row: Row): number {
  if (Boolean(row.has_used_pro_trial)) return 1;
  const creditsRaw = row.free_credits ?? row.free_pro_credits;
  if (typeof creditsRaw === "number" && !Number.isNaN(creditsRaw) && creditsRaw <= 0) {
    return 1;
  }
  return 0;
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

function isSuccessfulPayment(row: Row) {
  const status = str(row, "status").toLowerCase();
  if (!status) return true;
  if (/fail|cancel|refund|void|unpaid|incomplete/.test(status)) return false;
  return /success|paid|complete|succeeded/.test(status);
}

function paymentAmount(row: Row) {
  const amount = Number(row.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
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

function formatRawError(error: unknown) {
  if (error == null) return "null";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return String(error);

  const record = error as Record<string, unknown>;
  try {
    return JSON.stringify(
      {
        message: record.message ?? null,
        details: record.details ?? null,
        hint: record.hint ?? null,
        code: record.code ?? null,
        status: record.status ?? null,
        name: record.name ?? null,
      },
      null,
      2,
    );
  } catch {
    return String(error);
  }
}

async function countExact(
  table: string,
  options?: {
    appColumn?: string;
    aliases?: string[] | null;
    gteCreatedAt?: string | null;
  },
): Promise<{ count: number; error: string | null }> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { count: 0, error: "SUPABASE_SERVICE_ROLE_KEY が未設定です。" };
  }

  try {
    let query = client.from(table).select("*", { count: "exact", head: true });
    if (options?.aliases?.length && options.appColumn) {
      query = query.in(options.appColumn, options.aliases);
    }
    if (options?.gteCreatedAt) {
      query = query.gte("created_at", options.gteCreatedAt);
    }
    const { count, error } = await query;
    if (error) {
      return { count: 0, error: `[${table} count]\n${formatRawError(error)}` };
    }
    return { count: count ?? 0, error: null };
  } catch (err) {
    return { count: 0, error: `[${table} count thrown]\n${formatRawError(err)}` };
  }
}

async function fetchAllRows(table: string): Promise<{ rows: Row[]; error: string | null }> {
  const client = getSupabaseAdmin();
  if (!client) {
    return {
      rows: [],
      error: JSON.stringify(
        {
          table,
          message: "SUPABASE_SERVICE_ROLE_KEY が未設定です。",
          details: describeSupabaseDebug(),
        },
        null,
        2,
      ),
    };
  }

  const rows: Row[] = [];
  let from = 0;

  try {
    for (;;) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        if (/created_at/i.test(error.message ?? "")) {
          const fallback = await client
            .from(table)
            .select("*")
            .range(from, from + PAGE_SIZE - 1);
          if (fallback.error) {
            return {
              rows,
              error: `[${table}]\n${formatRawError(fallback.error)}`,
            };
          }
          const chunk = (fallback.data as Row[] | null) ?? [];
          rows.push(...chunk);
          if (chunk.length < PAGE_SIZE || rows.length >= MAX_ROWS) break;
          from += PAGE_SIZE;
          continue;
        }
        return {
          rows,
          error: `[${table}]\n${formatRawError(error)}`,
        };
      }

      const chunk = (data as Row[] | null) ?? [];
      rows.push(...chunk);
      if (chunk.length < PAGE_SIZE || rows.length >= MAX_ROWS) break;
      from += PAGE_SIZE;
    }
  } catch (err) {
    return {
      rows,
      error: `[${table} thrown]\n${formatRawError(err)}`,
    };
  }

  return { rows, error: null };
}

export async function getAnalyticsDashboard(options: {
  app: string;
  period: PeriodKey;
}): Promise<AnalyticsDashboard> {
  const empty: AnalyticsDashboard = {
    configured: isSupabaseAdminConfigured,
    error: null,
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

  await connection();

  if (!isSupabaseAdminConfigured) {
    return {
      ...empty,
      error: JSON.stringify(
        {
          message: "SUPABASE_SERVICE_ROLE_KEY が未設定です。",
          details: describeSupabaseDebug(),
        },
        null,
        2,
      ),
    };
  }

  const aliases = aliasesForApp(options.app === "all" ? "all" : options.app);
  const todayStart = startOfTodayJst();
  const rangeStart = periodStart(options.period);
  const now = new Date();

  let visitsRes;
  let logsRes;
  let eventsRes;
  let profilesRes;
  let paymentLogsRes;
  try {
    [visitsRes, logsRes, eventsRes, profilesRes, paymentLogsRes] = await Promise.all([
      fetchAllRows("analytics_visits"),
      fetchAllRows("app_logs"),
      fetchAllRows("analytics_events"),
      fetchAllRows("profiles"),
      fetchAllRows("payment_logs"),
    ]);
  } catch (err) {
    return {
      ...empty,
      error: `[Promise.all thrown]\n${formatRawError(err)}\n\n${JSON.stringify(
        { debug: describeSupabaseDebug() },
        null,
        2,
      )}`,
    };
  }

  const debugHeader = JSON.stringify(
    { debug: describeSupabaseDebug(), cache: "no-store", revalidate: 0 },
    null,
    2,
  );

  const fetchErrors = [
    visitsRes.error,
    logsRes.error,
    eventsRes.error,
    profilesRes.error,
    paymentLogsRes.error,
  ].filter(Boolean);

  const visits = visitsRes.rows.filter((row) => matchesApp(row, aliases));
  const rawAnalyses = [
    ...logsRes.rows,
    ...eventsRes.rows.filter(isAnalysisEvent),
  ].filter((row) => matchesApp(row, aliases));
  const analyses = dedupeAnalysisRows(rawAnalyses);

  // アプリに紐づく user_id（profiles に app_id が無くても帰属できるように）
  const attributedUserIds = new Set<string>();
  for (const row of [...visits, ...analyses]) {
    const uid = str(row, "user_id", "uid");
    if (uid) attributedUserIds.add(uid);
  }

  const allProfiles = profilesRes.rows;
  const profiles = allProfiles.filter((row) =>
    matchesProfileApp(row, aliases, attributedUserIds),
  );

  // DB COUNT(*) を優先（過去ログの全件集計）。取得行と突き合わせ、大きい方を採用
  const aliasList = aliases;
  const todayIso = todayStart.toISOString();
  const rangeIso = rangeStart ? rangeStart.toISOString() : null;
  const [eventsTotal, eventsToday, eventsPeriod, logsTotal, logsToday, logsPeriod] =
    await Promise.all([
      countExact("analytics_events", {
        appColumn: "app_id",
        aliases: aliasList,
      }),
      countExact("analytics_events", {
        appColumn: "app_id",
        aliases: aliasList,
        gteCreatedAt: todayIso,
      }),
      countExact("analytics_events", {
        appColumn: "app_id",
        aliases: aliasList,
        gteCreatedAt: rangeIso,
      }),
      countExact("app_logs", {
        appColumn: "app_name",
        aliases: aliasList,
      }),
      countExact("app_logs", {
        appColumn: "app_name",
        aliases: aliasList,
        gteCreatedAt: todayIso,
      }),
      countExact("app_logs", {
        appColumn: "app_name",
        aliases: aliasList,
        gteCreatedAt: rangeIso,
      }),
    ]);

  const countErrors = [
    eventsTotal.error,
    eventsToday.error,
    eventsPeriod.error,
    logsTotal.error,
    logsToday.error,
    logsPeriod.error,
  ].filter(Boolean);

  const errors = [...fetchErrors, ...countErrors];

  const visitsKpi = countPair(visits, null, todayStart, rangeStart);
  const analysesFromRows = countPair(analyses, null, todayStart, rangeStart);

  // ログ欠落時: free_credits 消費 / has_used_pro_trial から最低回数を補完
  const analysisUserIds = new Set(
    analyses.map((row) => str(row, "user_id", "uid")).filter(Boolean),
  );
  let fallbackToday = 0;
  let fallbackTotal = 0;
  let fallbackPeriod = 0;
  for (const row of profiles) {
    const estimate = trialConsumedEstimate(row);
    if (estimate <= 0) continue;
    const uid = str(row, "id", "user_id");
    if (uid && analysisUserIds.has(uid)) continue;
    const date =
      rowDate(row) ||
      (() => {
        const raw = str(row, "updated_at", "updatedAt");
        if (!raw) return null;
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? null : d;
      })();
    fallbackTotal += estimate;
    if (inRange(date, todayStart)) fallbackToday += estimate;
    if (inRange(date, rangeStart)) fallbackPeriod += estimate;
  }

  const analysesKpi: KpiPair = {
    today: Math.max(
      analysesFromRows.today + fallbackToday,
      Math.max(eventsToday.count || 0, logsToday.count || 0),
    ),
    total: Math.max(
      analysesFromRows.total + fallbackTotal,
      Math.max(eventsTotal.count || 0, logsTotal.count || 0),
    ),
    period: Math.max(
      analysesFromRows.period + fallbackPeriod,
      Math.max(eventsPeriod.count || 0, logsPeriod.count || 0),
    ),
  };

  const freeKpi = countPair(profiles, null, todayStart, rangeStart, (row) =>
    isFreePlan(str(row, "plan_type", "plan")),
  );
  const proKpi = countPair(profiles, null, todayStart, rangeStart, (row) =>
    isProPlan(str(row, "plan_type", "plan")),
  );

  const paymentLogs = paymentLogsRes.rows.filter(
    (row) => matchesApp(row, aliases) && isSuccessfulPayment(row),
  );

  const hasPaymentLogs = paymentLogs.length > 0;
  const revenue: KpiPair = hasPaymentLogs
    ? {
        today: paymentLogs
          .filter((row) => inRange(rowDate(row), todayStart))
          .reduce((sum, row) => sum + paymentAmount(row), 0),
        total: paymentLogs.reduce((sum, row) => sum + paymentAmount(row), 0),
        period: paymentLogs
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
  const periodAnalysisUserIds = new Set(
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
    if (userId && (profileIds.has(userId) || periodAnalysisUserIds.has(userId))) {
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
  const todayVisits = visits.filter((row) => inRange(rowDate(row), todayStart));
  const countBySource = (rows: Row[]) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const name = canonicalizeSource(str(row, "source_category", "source"));
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  };
  const todayCounts = countBySource(todayVisits);
  const totalCounts = countBySource(visits);
  const topName = topSource?.visits ? topSource.name : "—";
  const todayShare =
    todayVisits.length > 0
      ? ((todayCounts.get(topName) ?? 0) / todayVisits.length) * 100
      : 0;
  const totalShare =
    visits.length > 0 ? ((totalCounts.get(topName) ?? 0) / visits.length) * 100 : 0;

  const members: KpiPair = {
    today: freeKpi.today + proKpi.today,
    total: freeKpi.total + proKpi.total,
    period: freeKpi.period + proKpi.period,
  };

  const allAnalysesUniverse = dedupeAnalysisRows([
    ...logsRes.rows,
    ...eventsRes.rows.filter(isAnalysisEvent),
  ]);

  const products: ProductStatsRow[] = PRODUCTS.map((product) => {
    const ids = [...product.aliases];
    const productVisits = visitsRes.rows.filter(
      (row) => matchesApp(row, ids) && inRange(rowDate(row), rangeStart),
    );
    const productAnalyses = allAnalysesUniverse.filter(
      (row) => matchesApp(row, ids) && inRange(rowDate(row), rangeStart),
    );
    const productAttributed = new Set<string>();
    for (const row of [...productVisits, ...productAnalyses]) {
      const uid = str(row, "user_id", "uid");
      if (uid) productAttributed.add(uid);
    }
    const productProfiles = allProfiles.filter(
      (row) =>
        matchesProfileApp(row, ids, productAttributed) &&
        inRange(rowDate(row), rangeStart),
    );
    const freeMembers = productProfiles.filter((row) =>
      isFreePlan(str(row, "plan_type", "plan")),
    ).length;
    const proMembers = productProfiles.filter((row) =>
      isProPlan(str(row, "plan_type", "plan")),
    ).length;
    const productPayments = paymentLogsRes.rows.filter(
      (row) =>
        matchesApp(row, ids) &&
        inRange(rowDate(row), rangeStart) &&
        isSuccessfulPayment(row),
    );

    // ログ欠落時フォールバック（お試し消費済み profiles）
    const productAnalysisUsers = new Set(
      productAnalyses.map((row) => str(row, "user_id", "uid")).filter(Boolean),
    );
    let fallback = 0;
    for (const row of allProfiles.filter((r) =>
      matchesProfileApp(r, ids, productAttributed),
    )) {
      const estimate = trialConsumedEstimate(row);
      if (estimate <= 0) continue;
      const uid = str(row, "id", "user_id");
      if (uid && productAnalysisUsers.has(uid)) continue;
      if (!inRange(rowDate(row), rangeStart)) continue;
      fallback += estimate;
    }

    const visitsCount = productVisits.length;
    const analysesCount = productAnalyses.length + fallback;

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
        ? `${debugHeader}\n\n${errors.join("\n\n")}`
        : null,
    kpis: {
      visits: visitsKpi,
      analyses: analysesKpi,
      freeMembers: freeKpi,
      proMembers: proKpi,
      members,
      revenue,
      topSource: {
        name: topName,
        share: topSource?.share ?? 0,
        todayShare,
        totalShare,
      },
    },
    daily,
    sources,
    products,
  };
}
