export const PRODUCTS = [
  {
    id: "apology",
    name: "お詫びコンシェルジュ",
    color: "#6366f1",
  },
  {
    id: "fleamarket",
    name: "フリマ出品文",
    color: "#f59e0b",
  },
  {
    id: "car",
    name: "クルマとミカタ",
    color: "#10b981",
  },
  {
    id: "subsidy",
    name: "補助金マイスター",
    color: "#3b82f6",
  },
  {
    id: "realestate",
    name: "物件セカンドオピニオン",
    color: "#ec4899",
  },
] as const;

export type ProductId = (typeof PRODUCTS)[number]["id"];

export const PRODUCT_NAME_MAP: Record<string, string> = Object.fromEntries(
  PRODUCTS.map((product) => [product.id, product.name]),
);

export const ACTION_LABELS: Record<string, string> = {
  generate_apology: "お詫び文生成",
  analyze_item: "商品分析",
  analyze_car: "車両診断",
  search_subsidy: "補助金検索",
  analyze_property: "物件分析",
};

export function productName(appName: string) {
  return PRODUCT_NAME_MAP[appName] ?? appName;
}

export function actionName(actionType: string) {
  return ACTION_LABELS[actionType] ?? actionType;
}
