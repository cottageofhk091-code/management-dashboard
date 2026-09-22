export type PeriodKey = "today" | "7d" | "30d" | "all";

export const PERIODS: { id: PeriodKey; label: string }[] = [
  { id: "today", label: "本日" },
  { id: "7d", label: "過去7日間" },
  { id: "30d", label: "過去30日間" },
  { id: "all", label: "全期間" },
];

export function isPeriodKey(value: string): value is PeriodKey {
  return PERIODS.some((period) => period.id === value);
}

export function jstYmd(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function startOfTodayJst() {
  return new Date(`${jstYmd(new Date())}T00:00:00+09:00`);
}

export function periodStart(period: PeriodKey) {
  if (period === "all") return null;
  if (period === "today") return startOfTodayJst();

  const days = period === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export function enumerateDays(start: Date, end: Date) {
  const days: string[] = [];
  const cursor = new Date(`${jstYmd(start)}T00:00:00+09:00`);
  const last = new Date(`${jstYmd(end)}T00:00:00+09:00`);

  while (cursor.getTime() <= last.getTime()) {
    days.push(jstYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}
