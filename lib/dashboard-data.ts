import { PRODUCTS } from "@/lib/products";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase";

export type AppLog = {
  id: number;
  app_name: string;
  action_type: string;
  created_at: string;
};

export type ProductUsage = {
  id: string;
  name: string;
  color: string;
  count: number;
  share: number;
};

export type DashboardData = {
  configured: boolean;
  error: string | null;
  totalCount: number;
  todayCount: number;
  activeProductCount: number;
  productUsage: ProductUsage[];
  recentLogs: AppLog[];
};

function startOfTodayJstIso() {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return `${ymd}T00:00:00+09:00`;
}

export async function getDashboardData(): Promise<DashboardData> {
  const emptyUsage: ProductUsage[] = PRODUCTS.map((product) => ({
    id: product.id,
    name: product.name,
    color: product.color,
    count: 0,
    share: 0,
  }));

  if (!isSupabaseAdminConfigured) {
    return {
      configured: false,
      error:
        "SUPABASE_SERVICE_ROLE_KEY が未設定です。サーバー側の読み取りには service_role キーが必要です。",
      totalCount: 0,
      todayCount: 0,
      activeProductCount: PRODUCTS.length,
      productUsage: emptyUsage,
      recentLogs: [],
    };
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return {
      configured: false,
      error: "SUPABASE_SERVICE_ROLE_KEY が未設定です。",
      totalCount: 0,
      todayCount: 0,
      activeProductCount: PRODUCTS.length,
      productUsage: emptyUsage,
      recentLogs: [],
    };
  }

  const todayStart = startOfTodayJstIso();

  const [totalRes, todayRes, recentRes, ...productResults] = await Promise.all([
    client.from("app_logs").select("*", { count: "exact", head: true }),
    client
      .from("app_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart),
    client
      .from("app_logs")
      .select("id, app_name, action_type, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    ...PRODUCTS.map((product) =>
      client
        .from("app_logs")
        .select("*", { count: "exact", head: true })
        .in("app_name", [...product.aliases]),
    ),
  ]);

  const firstError = [
    totalRes.error,
    todayRes.error,
    recentRes.error,
    productResults.find((result) => result.error)?.error,
  ]
    .filter(Boolean)
    .map((error) =>
      JSON.stringify(
        {
          message: error?.message ?? null,
          details: error?.details ?? null,
          hint: error?.hint ?? null,
          code: error?.code ?? null,
        },
        null,
        2,
      ),
    )
    .join("\n\n") || null;

  const totalCount = totalRes.count ?? 0;
  const productUsage = PRODUCTS.map((product, index) => {
    const count = productResults[index]?.count ?? 0;
    return {
      id: product.id,
      name: product.name,
      color: product.color,
      count,
      share: totalCount > 0 ? (count / totalCount) * 100 : 0,
    };
  });

  return {
    configured: true,
    error: firstError,
    totalCount,
    todayCount: todayRes.count ?? 0,
    activeProductCount: PRODUCTS.length,
    productUsage,
    recentLogs: (recentRes.data as AppLog[] | null) ?? [],
  };
}
