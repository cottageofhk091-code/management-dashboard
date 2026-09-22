export function formatNumber(value: number) {
  return new Intl.NumberFormat("ja-JP").format(value);
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function formatYen(value: number) {
  return `¥${new Intl.NumberFormat("ja-JP").format(value)}`;
}
