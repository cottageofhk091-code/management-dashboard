import Link from "next/link";
import { PERIODS, type PeriodKey } from "@/lib/period";
import { PRODUCTS } from "@/lib/products";

export function DashboardFilters({
  app,
  period,
}: {
  app: string;
  period: PeriodKey;
}) {
  const hrefFor = (nextApp: string, nextPeriod: PeriodKey) => {
    const params = new URLSearchParams();
    if (nextApp !== "all") params.set("app", nextApp);
    if (nextPeriod !== "all") params.set("period", nextPeriod);
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  const apps = [{ id: "all", name: "全体" }, ...PRODUCTS];

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2">
        {apps.map((item) => {
          const active = item.id === app;
          return (
            <Link
              key={item.id}
              href={hrefFor(item.id, period)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              <span>{item.name}</span>
              {"id" in item && item.id !== "all" ? (
                <span className={`ml-1.5 font-mono text-[11px] ${active ? "text-indigo-100" : "text-zinc-400"}`}>
                  {item.id}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((item) => {
          const active = item.id === period;
          return (
            <Link
              key={item.id}
              href={hrefFor(app, item.id)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
