import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[]; period?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  const app = Array.isArray(params.app) ? params.app[0] : params.app;
  const period = Array.isArray(params.period) ? params.period[0] : params.period;
  if (app) query.set("app", app);
  if (period) query.set("period", period);
  redirect(query.toString() ? `/?${query.toString()}` : "/");
}
