export type ProductId =
  | "realestate"
  | "complaint-converter"
  | "kuruma-to-mikata"
  | "hojyokin-meister-1"
  | "fleama-maker";

/**
 * 送信側の app_id / app_name をダッシュボードの正規 ID へ厳密変換する。
 * 部分一致・ホスト名・パス推論はしない。
 */
export const APP_ALIAS_MAP: Record<string, ProductId> = {
  realestate: "realestate",
  "real-estate-so": "realestate",
  real_estate: "realestate",
  "real-estate": "realestate",
  "complaint-converter": "complaint-converter",
  apology: "complaint-converter",
  complaint_converter: "complaint-converter",
  "fleama-maker": "fleama-maker",
  furima_sold: "fleama-maker",
  fleamarket: "fleama-maker",
  "fleama-sold": "fleama-maker",
  fleama_sold: "fleama-maker",
  fleama_maker: "fleama-maker",
  "hojyokin-meister-1": "hojyokin-meister-1",
  "hojyokin-meister": "hojyokin-meister-1",
  hojyokin_meister: "hojyokin-meister-1",
  hojyokin_meister_1: "hojyokin-meister-1",
  subsidy: "hojyokin-meister-1",
  "kuruma-to-mikata": "kuruma-to-mikata",
  car: "kuruma-to-mikata",
  kuruma_to_mikata: "kuruma-to-mikata",
};

function aliasesOf(id: ProductId): string[] {
  const keys = Object.entries(APP_ALIAS_MAP)
    .filter(([, value]) => value === id)
    .map(([key]) => key);
  return [...new Set([id, ...keys])];
}

export const PRODUCTS = [
  {
    id: "realestate" as const,
    name: "物件セカンドオピニオン",
    color: "#ec4899",
    aliases: aliasesOf("realestate"),
  },
  {
    id: "complaint-converter" as const,
    name: "スマートお詫びコンシェルジュ",
    color: "#6366f1",
    aliases: aliasesOf("complaint-converter"),
  },
  {
    id: "kuruma-to-mikata" as const,
    name: "クルマとミカタ",
    color: "#10b981",
    aliases: aliasesOf("kuruma-to-mikata"),
  },
  {
    id: "hojyokin-meister-1" as const,
    name: "補助金マイスター",
    color: "#3b82f6",
    aliases: aliasesOf("hojyokin-meister-1"),
  },
  {
    id: "fleama-maker" as const,
    name: "フリマアプリ商品説明生成",
    color: "#f59e0b",
    aliases: aliasesOf("fleama-maker"),
  },
];

export const PRODUCT_NAME_MAP: Record<string, string> = Object.fromEntries(
  PRODUCTS.flatMap((product) => [
    [product.id, product.name],
    ...product.aliases.map((alias) => [alias, product.name] as const),
  ]),
);

export const ACTION_LABELS: Record<string, string> = {
  generate_apology: "お詫び文生成",
  analyze_item: "商品分析",
  analyze_car: "車両診断",
  search_subsidy: "補助金検索",
  analyze_property: "物件分析",
  analysis_executed: "分析実行",
};

export const PRO_PRICE_YEN = 500;

export function normalizeAppKey(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** 未知の文字列は null。includes やホスト名では判定しない。 */
export function canonicalizeAppKey(raw: string | null | undefined): ProductId | null {
  const key = normalizeAppKey(raw);
  if (!key) return null;
  return APP_ALIAS_MAP[key] ?? null;
}

export function findProduct(appId: string) {
  const id = canonicalizeAppKey(appId);
  return id ? PRODUCTS.find((product) => product.id === id) : undefined;
}

/**
 * 1行のアプリ帰属。app_id と app_name が別アプリを指すときは app_name を優先する。
 * （お詫びは app_name のみ送り、visits.app_id に物件のデフォルトが残ることがある）
 */
export function resolveRowProductId(row: {
  app_id?: unknown;
  app_name?: unknown;
  app?: unknown;
}): ProductId | null {
  const fromName = canonicalizeAppKey(
    row.app_name == null ? "" : String(row.app_name),
  );
  const fromId = canonicalizeAppKey(row.app_id == null ? "" : String(row.app_id));
  const fromApp = canonicalizeAppKey(row.app == null ? "" : String(row.app));
  if (fromName && fromId && fromName !== fromId) return fromName;
  return fromName ?? fromId ?? fromApp;
}

export function productName(appName: string) {
  return findProduct(appName)?.name ?? PRODUCT_NAME_MAP[appName] ?? appName;
}

export function actionName(actionType: string) {
  return ACTION_LABELS[actionType] ?? actionType;
}

export function aliasesForApp(appId: string | "all"): string[] | null {
  if (appId === "all") return null;
  const product = findProduct(appId);
  return product ? [...product.aliases] : [appId];
}

export function aliasesForReset(scope: string | "all"): string[] | null {
  if (scope === "all") return null;
  const product = findProduct(scope);
  if (!product) return [scope];
  return [...product.aliases];
}

export function isKnownProductId(value: string): value is ProductId {
  return Boolean(findProduct(value));
}

export function canonicalAppId(value: string): ProductId | "all" {
  if (value === "all") return "all";
  return findProduct(value)?.id ?? "all";
}
