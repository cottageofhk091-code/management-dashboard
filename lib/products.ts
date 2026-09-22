export const PRODUCTS = [
  {
    id: "realestate",
    name: "物件セカンドオピニオン",
    color: "#ec4899",
    aliases: ["realestate"],
  },
  {
    id: "complaint-converter",
    name: "スマートお詫びコンシェルジュ",
    color: "#6366f1",
    aliases: ["complaint-converter", "apology"],
  },
  {
    id: "kuruma-to-mikata",
    name: "クルマとミカタ",
    color: "#10b981",
    aliases: ["kuruma-to-mikata", "car"],
  },
  {
    id: "hojyokin-meister-1",
    name: "補助金マイスター",
    color: "#3b82f6",
    aliases: ["hojyokin-meister-1", "subsidy"],
  },
  {
    id: "fleama-maker",
    name: "フリマアプリ商品説明生成",
    color: "#f59e0b",
    aliases: ["fleama-maker", "furima_sold", "fleamarket", "fleama-sold"],
  },
] as const;

export type ProductId = (typeof PRODUCTS)[number]["id"];

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

export function findProduct(appId: string) {
  const value = appId.toLowerCase();
  return PRODUCTS.find(
    (product) =>
      product.id.toLowerCase() === value ||
      product.aliases.some((alias) => alias.toLowerCase() === value),
  );
}

export function productName(appName: string) {
  return PRODUCT_NAME_MAP[appName] ?? appName;
}

export function actionName(actionType: string) {
  return ACTION_LABELS[actionType] ?? actionType;
}

export function aliasesForApp(appId: string | "all"): string[] | null {
  if (appId === "all") return null;
  const product = findProduct(appId);
  return product ? [...product.aliases] : [appId];
}

export function isKnownProductId(value: string): value is ProductId {
  return Boolean(findProduct(value));
}

export function canonicalAppId(value: string): ProductId | "all" {
  if (value === "all") return "all";
  return findProduct(value)?.id ?? "all";
}
